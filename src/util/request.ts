import {
	type Bot,
	type Channel,
	type Guild,
	type Interaction,
	type Member,
} from "npm:@discordeno/bot";
import { ObjectId } from "mongodb";

import { catsDb, filtersDb, limitsDb, usersDb } from "$db";

import getLinks from "../util/links.ts";
import isPremium from "../util/isPremium.ts";
import isAdmin from "../util/isAdmin.ts";
import Responder from "../util/Responder.ts";
import { Logger } from "./Logger.ts";
import { getGuildConfig } from "./configManager.ts";
import {
	createDmDescription,
	getFooterIconUrl,
	getFooterText,
} from "./dmHelper.ts";

export default async function (
	bot: Bot,
	interaction: Interaction,
	dmUser: boolean,
	logger: Logger,
	masqrOnly?: boolean,
) {
	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	const userId = interaction.user.id;
	const guildId = interaction.guildId;

	const name = interaction.user.username;

	let admin = false;
	let premium = false;

	if (interaction.member && guildId) {
		admin = await isAdmin(
			interaction.member as Member,
			String(guildId),
			logger,
		);

		const premiumResult = await isPremium(
			interaction.member as Member,
			String(guildId),
		);
		if (premiumResult.isErr()) {
			logger.error("Error checking premium status", {
				error: premiumResult.error,
				userId,
				guildId,
			});
			// Default to false if we can't check premium status
			premium = admin; // Admin users get premium anyway
		} else {
			premium = admin || premiumResult.value;
		}
	}

	if (premium) logger.info(`${name} has premium`);

	const { cat } = (await catsDb.findOne({
		userId: String(userId),
		guildId: String(guildId),
	})) || {};

	if (!cat) {
		await responder.respond("Please choose a category");
		return;
	}

	let user = await usersDb.findOne({
		userId: String(userId),
		guildId: String(guildId),
		cat: cat,
	});

	if (!user) {
		const newUserDoc = {
			_id: new ObjectId(),
			userId: String(userId),
			guildId: String(guildId),
			cat: cat,
			links: [],
			times: 0,
		};
		const insertResult = await usersDb.insertOne(newUserDoc);

		user = await usersDb.findOne({
			_id: insertResult.insertedId,
		});

		logger.info(`Added ${name} for ${cat}`);
	}

	const { filters } = (await filtersDb.findOne({
		userId: String(userId),
		guildId: String(guildId),
	})) || {};

	if (!filters) {
		await responder.respond("Please choose your filters first");
		return;
	}

	logger.info(`${name} uses ${filters.join(", ")}`);

	let { limit, premiumLimit } = (await limitsDb.findOne({
		guildId: String(guildId),
		cat: cat,
	})) || {
		limit: 0,
		premiumLimit: 0,
	};

	limit = premiumLimit || limit;

	const noLimit: boolean = limit === 0;

	logger.info(noLimit ? `There is no limit` : `The limit is ${limit}`);

	const times: number = user?.times || 0;
	const links: Array<string> = user?.links || [];

	if (!noLimit && times >= limit) {
		logger.info(
			`${name} reached the limit for ${cat}! ${user?.times}/${limit}`,
		);
		await responder.respond("You have reached the monthly limit");
		return;
	}

	const linksLeftMsg = (msg: string) =>
		noLimit
			? premium ? `You have premium` : `There is no limits for ${cat}!`
			: msg + `${limit - times} links left`;

	logger.info(
		`${name} requested a ${cat} link. So far ${name} has these links: ${
			links.join(
				", ",
			)
		}; having a total of ${times} links`,
	);

	const linkResult = await getLinks(
		String(guildId),
		links,
		filters,
		cat,
		masqrOnly,
	);

	if (linkResult.isErr()) {
		logger.error("Error retrieving link", {
			error: linkResult.error,
			guildId,
			cat,
			userId,
		});
		await responder.respond("Database error occurred while fetching links");
		return;
	}

	const link = linkResult.value;

	if (
		typeof link === "string" && (
			link.includes("error") ||
			link.includes("Error") ||
			link.includes("blocked") ||
			link.includes("Database error") ||
			link === "There are no links!" ||
			link === "No available links that match your criteria!" ||
			link.includes("There are no regular (non-Masqr) links")
		)
	) {
		return await responder.respond(link);
	}

	await usersDb.updateMany(
		{
			_id: user?._id,
		},
		{
			$set: {
				links: [...links, link],
				times: times + 1,
			},
		},
		{
			upsert: true,
		},
	);

	if (dmUser) {
		const chan = (await bot.helpers.getDmChannel(userId)) as Channel;
		let guild: Guild | null = null;
		let guildName: string | null = null;

		// Get guild config for custom DM message
		let guildConfig;
		try {
			guildConfig = await getGuildConfig(String(guildId));
		} catch (error) {
			logger.error(`Failed to get guild config for ${guildId}:`, error);
			guildConfig = null;
		}

		if (guildId) {
			try {
				guild = (await bot.helpers.getGuild(guildId)) as Guild;
				if (guild?.name) {
					guildName = guild.name;
				}
			} catch (e) {
				logger.error(`Failed to get guild ${guildId}:`, e);
			}
		}

		// Get footer icon and text
		const footerIconUrl = await getFooterIconUrl(
			bot,
			String(guildId),
			guild,
			logger,
		);
		const footerText = getFooterText(String(guildId), guildName);

		// Create description with custom message and remaining links
		const description = createDmDescription(
			link,
			guildConfig?.panel?.dmMessage || null,
			linksLeftMsg("You have "),
			filters || [],
		);

		bot.helpers
			.sendMessage(chan.id, {
				embeds: [
					{
						type: "rich",
						color: 0xe071ac,
						title: cat,
						description,
						footer: {
							text: footerText,
							iconUrl: footerIconUrl,
						},
					},
				],
			})
			.then(async () => {
				await responder.respond("Check dms!");
			})
			.catch(async (error: Error) => {
				logger.error("Failed to send DM:", error);
				await responder.respond(
					"I couldn't send you a DM. Please check your privacy settings to allow DMs from server members",
				);
			});

		return;
	} else {
		return await responder.respondEmbed({
			type: "rich",
			color: 0xe071ac,
			title: cat,
			description: `${link}`,
			footer: {
				text: linksLeftMsg("You have "),
			},
		});
	}
}
