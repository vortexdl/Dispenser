/**
 * @name Ryan Wilson
 */
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
import { generateMasqrLicense } from "./masqrIntegration.ts";
import { 
	getFooterIconUrl, 
	getFooterText, 
	createDmDescription,
	createMasqrDmDescription 
} from "./dmHelper.ts";

/**
 * Handles Masqr-protected link requests
 * @param bot The bot instance
 * @param interaction The interaction object
 * @param dmUser Whether to send the response via DM
 * @param logger The logger instance
 * @param masqrOnly Whether to only return Masqr-protected links (true) or exclude them (false)
 */
export default async function masqrRequestHandle(
	bot: Bot,
	interaction: Interaction,
	dmUser: boolean,
	logger: Logger,
	masqrOnly: boolean = true,
): Promise<void> {
	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	const userId = interaction.user.id;
	const guildId = interaction.guildId;

	const name = interaction.user.username;

	if (!guildId) {
		await responder.respond("This feature can only be used in a server");
		return;
	}

	// Check if Masqr is enabled for this guild
	const guildConfig = await getGuildConfig(String(guildId));
	if (!guildConfig.masqr.enabled) {
		await responder.respond("Masqr is not enabled for this server");
		return;
	}

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
			premium = admin;
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

	const requestType = masqrOnly ? "Masqr-protected" : "regular";
	logger.info(
		`${name} requested a ${requestType} ${cat} link. So far ${name} has these links: ${
			links.join(", ")
		}; having a total of ${times} links`,
	);

	// Use the updated getLinks function with Masqr filtering
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
			masqrOnly,
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
			link.includes("No available") ||
			link.includes("There are no Masqr-protected links") ||
			link.includes("There are no regular (non-Masqr) links")
		)
	) {
		return await responder.respond(link);
	}

	// For Masqr-protected links, generate a license
	if (masqrOnly) {
		const licenseResult = await generateMasqrLicense({
			guildId: String(guildId),
			userId: String(userId),
			category: cat,
		});

		if (licenseResult.isErr()) {
			logger.error("Failed to generate Masqr license", {
				error: licenseResult.error,
				guildId,
				userId,
				cat,
			});
			await responder.respond(
				"Failed to generate Masqr license. Please contact an administrator.",
			);
			return;
		}

		const licenseInfo = licenseResult.value;

		// Update user stats
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

		// Send response with Masqr license instructions
		const masqrInstructions = `**Masqr-Protected Link Access**

🔗 **Domain:** ${licenseInfo.domain}
🔑 **License Key:** \`${licenseInfo.licenseKey}\`
⏰ **Expires:** <t:${Math.floor(licenseInfo.expires.getTime() / 1000)}:R>

**How to Access:**
1. Visit the protected domain
2. When prompted for authentication, use:
   - **Username:** \`user\`
   - **Password:** \`${licenseInfo.licenseKey}\`
3. The license is valid until the expiration time above

${linksLeftMsg("You have ")}`;

		if (dmUser) {
			const chan = (await bot.helpers.getDmChannel(userId)) as Channel;
			let guild: Guild | null = null;
			let guildName: string | null = null;

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
			const footerIconUrl = await getFooterIconUrl(bot, String(guildId), guild, logger);
			const footerText = getFooterText(String(guildId), guildName);

			// Create description with custom message
			const description = createMasqrDmDescription(
				masqrInstructions,
				guildConfig?.panel?.dmMessage || null,
				filters || []
			);

			bot.helpers
				.sendMessage(chan.id, {
					embeds: [
						{
							type: "rich",
							color: 0x7c3aed,
							title: `${cat} (Masqr-Protected)`,
							description,
							footer: {
								text: footerText,
								iconUrl: footerIconUrl,
							},
						},
					],
				})
				.then(async () => {
					await responder.respond(
						"Check dms for your Masqr-protected link!",
					);
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
				color: 0x7c3aed,
				title: `${cat} (Masqr-Protected)`,
				description: masqrInstructions,
			});
		}
	} else {
		// Handle regular (non-Masqr) link requests
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
			const footerIconUrl = await getFooterIconUrl(bot, String(guildId), guild, logger);
			const footerText = getFooterText(String(guildId), guildName);

			// Create description with custom message and remaining links
			const description = createDmDescription(
				link,
				guildConfig?.panel?.dmMessage || null,
				linksLeftMsg("You have "),
				filters || []
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
}
