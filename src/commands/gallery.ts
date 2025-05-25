/**
 * Displays a paginated gallery of servers the bot is in
 */

import type { Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
} from "@discordeno/bot";
import type { BotWithCache } from "../bot.ts";

import type { PrefixedLogger } from "../util/Logger.ts";
import isAdmin from "../util/isAdmin.ts";
import { createGallery } from "../util/galleryCreator.ts";

/**
 * Command data for the `/gallery` command
 */
export const data = {
	name: "gallery",
	description: "Displays a paginated gallery of servers the bot is in",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			name: "type",
			description: "Type of gallery to display",
			type: ApplicationCommandOptionTypes.String,
			required: false,
			choices: [
				{
					name: "All Servers",
					value: "all",
				},
				{
					name: "Banned Servers",
					value: "banned",
				},
				{
					name: "Special Servers",
					value: "special",
				},
			],
		},
		{
			name: "server_id",
			description: "Specific server ID to display details for",
			type: ApplicationCommandOptionTypes.String,
			required: false,
		},
		{
			name: "ephemeral",
			description: "Whether the gallery should be visible only to you",
			type: ApplicationCommandOptionTypes.Boolean,
			required: false,
			choices: [
				{ name: "True", value: true },
				{ name: "False", value: false },
			],
		},
	],
	dmPermission: true,
};

/**
 * Whether this command can only be run by administrators
 */
export const adminOnly = false;

export async function handle(
	bot: BotWithCache,
	interaction: Interaction,
	logger: PrefixedLogger,
	bearerToken: string,
): Promise<void> {

	const typeOption = interaction.data?.options?.find((opt) =>
		opt.name === "type"
	)?.value as
		| "all"
		| "banned"
		| "special"
		| "server_members"
		| "active_bot_users"
		| "ratings"
		| undefined;
	const specificServerId = interaction.data?.options?.find((opt) =>
		opt.name === "server_id"
	)?.value as string | undefined;
	const ephemeralOption = interaction.data?.options?.find((opt) =>
		opt.name === "ephemeral"
	)?.value as boolean | undefined;

	let useEphemeral = true;
	if (ephemeralOption === false && interaction.guildId) {
		try {
			const member = await bot.helpers.getMember(
				interaction.guildId,
				interaction.user.id,
			);
			if (member) {
				const hasAdminPermission = await isAdmin(
					member as any,
					String(interaction.guildId),
					logger,
				);
				if (hasAdminPermission) {
					useEphemeral = false;
				}
			}
		} catch (error: unknown) {
			logger.error("Error checking permissions for ephemeral gallery", {
				error,
			});
		}
	}

	let galleryType: "all" | "banned" | "special" = "all";
	let sortBy: string | undefined = undefined;
	let showBannedOnly = false;
	let galleryTitle = "Server Gallery";

	if (typeOption === "banned") {
		galleryType = "banned";
		showBannedOnly = true;
		galleryTitle = "Banned Server Gallery";
	} else if (typeOption === "special") {
		galleryType = "special";
		showBannedOnly = false;
		galleryTitle = "Special Server Gallery";
	} else if (typeOption === "server_members") {
		sortBy = "server_members";
		showBannedOnly = false;
		galleryTitle = "Server Gallery (Sorted by Members)";
	} else if (typeOption === "active_bot_users") {
		sortBy = "active_bot_users";
		showBannedOnly = false;
		galleryTitle = "Server Gallery (Sorted by Active Users)";
	} else if (typeOption === "ratings") {
		sortBy = "ratings";
		showBannedOnly = false;
		galleryTitle = "Server Gallery (Sorted by Rating)";
	} else {
		galleryType = "all";
		showBannedOnly = false;
	}

	if (specificServerId) {
		galleryTitle = `Details for Server: ${specificServerId}`;
	}

	await createGallery({
		bot,
		interaction,
		logger,
		sortBy,
		showBannedOnly,
		galleryType,
		title: galleryTitle,
		specificGuildId: specificServerId,
		forceEphemeral: useEphemeral,
		includeActions: true,
	}, bearerToken);
}
