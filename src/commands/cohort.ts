import { type Bot, type Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	InteractionResponseTypes,
	MessageFlags,
} from "@discordeno/bot";

import {
	cohortMembersDb,
	filtersDb,
	userCohortLinksDb,
	usersDb,
} from "../db.ts";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";
import { getGuildConfig } from "../util/configManager.ts";
import {
	allocateLinksToUser,
	ensureCohortLinks,
	ensureCohortMember,
	generateCohortId,
	getCohortLinksForUser,
	getCohortMembers,
	updateCohortLinks,
} from "../util/cohort.ts";

/**
 * Command data for the /cohort command
 */
export const data = {
	name: "cohort",
	description: "Manage your cohort and get unblocked links",
	options: [
		{
			type: ApplicationCommandOptionTypes.SubCommand,
			name: "getunblockedlinks",
			description: "Get the unblocked links for your cohort",
		},
		{
			type: ApplicationCommandOptionTypes.SubCommand,
			name: "listguild",
			description: "List Discord members in your cohort for this guild",
			options: [
				{
					type: ApplicationCommandOptionTypes.String,
					name: "othercohort",
					description:
						"View members of a different cohort (comma-separated filters)",
					required: false,
				},
			],
		},
		{
			type: ApplicationCommandOptionTypes.SubCommand,
			name: "listglobal",
			description: "List Discord members in your cohort globally",
			options: [
				{
					type: ApplicationCommandOptionTypes.String,
					name: "othercohort",
					description:
						"View members of a different cohort (comma-separated filters)",
					required: false,
				},
			],
		},
	],
	dmPermission: false,
};

/**
 * Whether this command can only be run by administrators
 */
export const adminOnly = false;

export async function handle(
	bot: Bot,
	interaction: Interaction,
	logger: PrefixedLogger,
): Promise<void> {
	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	await responder.defer(MessageFlags.Ephemeral);

	const guildId = String(interaction.guildId);
	const userId = String(interaction.user.id);
	const guildConfig = await getGuildConfig(guildId);

	if (!guildConfig.cohort.enable) {
		await responder.editResponse(
			"The cohort system is not enabled in this server",
		);
		return;
	}

	const subcommand = interaction.data?.options?.[0];
	if (!subcommand) {
		await responder.editResponse("No subcommand provided");
		return;
	}

	// Get user's filters
	const userFiltersDoc = await filtersDb.findOne({ guildId, userId });
	const userFilters = userFiltersDoc?.filters || [];

	if (
		userFilters.length === 0 && subcommand.name !== "listguild" &&
		subcommand.name !== "listglobal"
	) {
		await responder.editResponse(
			"You haven't set any filters yet. Please set your filters first to join a cohort",
		);
		return;
	}

	switch (subcommand.name) {
		case "getunblockedlinks": {
			// Ensure user is in cohort system
			await ensureCohortMember(
				guildId,
				userId,
				userFilters,
				guildConfig.cohort.global_system,
				logger,
			);

			const cohortId = generateCohortId(userFilters);

			// Ensure cohort links exist and update if needed
			const cohort = await ensureCohortLinks(
				guildId,
				userFilters,
				false,
				logger,
			);

			await updateCohortLinks(guildId, cohortId, false, logger);

			// Get shared cohort links for user
			const cohortLinks = await getCohortLinksForUser(
				guildId,
				userId,
				userFilters,
				guildConfig.cohort.max_links,
				logger,
			);

			if (cohortLinks.length === 0) {
				await responder.editResponse(
					"No unblocked links are currently available for your cohort. You'll be notified when new links become available",
				);
				return;
			}

			const linksList = cohortLinks.map((link, index) =>
				`${index + 1}. ${link}`
			).join("\n");

			await responder.editResponseWithData({
				embeds: [{
					title: "Your Cohort's Unblocked Links",
					description: linksList,
					color: parseInt(
						guildConfig.theme.main_color.replace("#", ""),
						16,
					),
					footer: {
						text: `Filters: ${userFilters.join(", ")}`,
					},
				}],
			});
			break;
		}

		case "listguild": {
			const otherCohortOption = subcommand.options?.find(
				(opt) => opt.name === "othercohort",
			)?.value as string | undefined;

			const filters = otherCohortOption
				? otherCohortOption.split(",").map((f) => f.trim()).filter(
					Boolean,
				)
				: userFilters;

			if (filters.length === 0) {
				await responder.editResponse(
					"Please specify filters to view a cohort, or set your own filters first",
				);
				return;
			}

			const members = await getCohortMembers(guildId, filters, false);

			if (members.length === 0) {
				await responder.editResponse(
					"No members found in this cohort for this guild",
				);
				return;
			}

			const membersList = await Promise.all(
				members.slice(0, 20).map(async (member) => {
					try {
						const user = await bot.helpers.getUser(
							BigInt(member.userId),
						);
						return user
							? `${user} (${member.userId})`
							: `Unknown User (${member.userId})`;
					} catch {
						return `Unknown User (${member.userId})`;
					}
				}),
			);

			const description = membersList.join("\n");
			const footer = members.length > 20
				? `Showing 20 of ${members.length} members | Filters: ${
					filters.join(", ")
				}`
				: `Total members: ${members.length} | Filters: ${
					filters.join(", ")
				}`;

			await responder.editResponseWithData({
				embeds: [{
					title: "Server Cohort Members",
					description,
					color: parseInt(
						guildConfig.theme.main_color.replace("#", ""),
						16,
					),
					footer: { text: footer },
				}],
			});
			break;
		}

		case "listglobal": {
			if (!guildConfig.cohort.global_system) {
				await responder.editResponse(
					"The global cohort system is not enabled for this server",
				);
				return;
			}

			const otherCohortOption = subcommand.options?.find(
				(opt) => opt.name === "othercohort",
			)?.value as string | undefined;

			const filters = otherCohortOption
				? otherCohortOption.split(",").map((f) => f.trim()).filter(
					Boolean,
				)
				: userFilters;

			if (filters.length === 0) {
				await responder.editResponse(
					"Please specify filters to view a cohort, or set your own filters first",
				);
				return;
			}

			const members = await getCohortMembers(guildId, filters, true);

			if (members.length === 0) {
				await responder.editResponse(
					"No members found in this cohort globally",
				);
				return;
			}

			const membersList = await Promise.all(
				members.slice(0, 20).map(async (member) => {
					try {
						const user = await bot.helpers.getUser(
							BigInt(member.userId),
						);
						return user
							? `${user} (${member.userId})`
							: `Unknown User (${member.userId})`;
					} catch {
						return `Unknown User (${member.userId})`;
					}
				}),
			);

			const description = membersList.join("\n");
			const footer = members.length > 20
				? `Showing 20 of ${members.length} members globally | Filters: ${
					filters.join(", ")
				}`
				: `Total members globally: ${members.length} | Filters: ${
					filters.join(", ")
				}`;

			await responder.editResponseWithData({
				embeds: [{
					title: "Global Cohort Members",
					description,
					color: parseInt(
						guildConfig.theme.main_color.replace("#", ""),
						16,
					),
					footer: { text: footer },
				}],
			});
			break;
		}

		default:
			await responder.editResponse("Unknown subcommand");
	}
}
