// Ryan Wilson

import {
	type Bot,
	type Channel,
	type Guild,
	type Interaction,
	type Member,
} from "@discordeno/bot";

import { filtersDb } from "$db";
import Responder from "../../util/Responder.ts";
import { Logger } from "../../util/Logger.ts";
import { getGuildConfig } from "../../util/configManager.ts";
import {
	ensureCohortLinks,
	ensureCohortMember,
	generateCohortId,
	getCohortLinksForUser,
	updateCohortLinks,
} from "../../util/cohort.ts";
import {
	formatFilters,
	getFooterIconUrl,
	getFooterText,
} from "../../util/dmHelper.ts";

export default async function cohortRequestHandle(
	bot: Bot,
	interaction: Interaction,
	dmUser: boolean,
	logger: Logger,
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

	if (!guildId) {
		await responder.respond("This feature requires a guild context");
		return;
	}

	const guildIdStr = String(guildId);
	const userIdStr = String(userId);
	const guildConfig = await getGuildConfig(guildIdStr);

	if (!guildConfig.cohort.enable) {
		await responder.respond(
			"The cohort system is not enabled in this server",
		);
		return;
	}

	// Get user's filters
	const userFiltersDoc = await filtersDb.findOne({
		guildId: guildIdStr,
		userId: userIdStr,
	});
	const userFilters = userFiltersDoc?.filters || [];

	if (userFilters.length === 0) {
		await responder.respond(
			"Please select your filters first to join a cohort",
		);
		return;
	}

	logger.info(
		`${name} is requesting cohort links with filters: ${
			userFilters.join(", ")
		}`,
	);

	// Ensure user is in cohort system
	await ensureCohortMember(
		guildIdStr,
		userIdStr,
		userFilters,
		guildConfig.cohort.global_system,
		logger,
	);

	const cohortId = generateCohortId(userFilters);

	// Ensure cohort links exist and update if needed
	await ensureCohortLinks(
		guildIdStr,
		userFilters,
		false,
		logger,
	);

	await updateCohortLinks(guildIdStr, cohortId, false, logger);

	// Get shared cohort links
	const cohortLinks = await getCohortLinksForUser(
		guildIdStr,
		userIdStr,
		userFilters,
		guildConfig.cohort.max_links,
		logger,
	);

	if (cohortLinks.length === 0) {
		await responder.respond(
			"No unblocked links are currently available for your cohort. You'll be notified when new links become available",
		);
		return;
	}

	const linksList = cohortLinks.map((link, index) => `${index + 1}. ${link}`)
		.join("\n");

	if (dmUser) {
		const chan = (await bot.helpers.getDmChannel(userId)) as Channel;
		let guild: Guild | null = null;
		let guildName: string | null = null;

		try {
			guild = (await bot.helpers.getGuild(guildId)) as Guild;
			if (guild?.name) {
				guildName = guild.name;
			}
		} catch (err) {
			await responder.respondErr(
				`Failed to get guild ${guildId}`,
				logger,
				"Sorry, we were unable to get the information about the server you're in! Please try again later.",
				err,
			);
		}

		// Get footer icon and text
		const footerIconUrl = await getFooterIconUrl(
			bot,
			String(guildId),
			guild,
			logger,
		);
		const footerText = getFooterText(String(guildId), guildName);

		// Create description with custom message and filter info
		let description = "";

		if (
			guildConfig?.panel?.dmMessage && guildConfig.panel.dmMessage.trim()
		) {
			description += `${guildConfig.panel.dmMessage}\n`;
		}

		description += `${linksList}\n`;

		if (userFilters.length > 0) {
			const filterText = formatFilters(userFilters);
			description +=
				`These links are unblocked on ${filterText} at this time`;
		}

		try {
			await bot.helpers.sendMessage(chan.id, {
				embeds: [{
					type: "rich",
					color: parseInt(
						guildConfig.theme.main_color.replace("#", ""),
						16,
					),
					title: "Your Cohort's Unblocked Links",
					description,
					footer: {
						text: `${footerText} | Filters: ${
							userFilters.join(", ")
						}`,
						iconUrl: footerIconUrl,
					},
				}],
			});
			await responder.respond("Check DMs!");
		} catch (err: unknown) {
			await responder.respondErr(
				"Could not send DM to user!",
				logger,
				"I couldn't send you a DM! Please check your privacy settings to allow DMs from server members.",
				err,
			);
		}
	} else {
		await responder.respondEmbed({
			type: "rich",
			color: parseInt(guildConfig.theme.main_color.replace("#", ""), 16),
			title: "Your Cohort's Unblocked Links",
			description: linksList,
			footer: {
				text: `Filters: ${userFilters.join(", ")}`,
			},
		});
	}
}
