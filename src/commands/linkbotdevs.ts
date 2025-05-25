import { type Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
} from "@discordeno/bot";
import type { BotWithCache } from "../bot.ts";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

import { createPaginator } from "../util/pagination.ts";
import { createGallery } from "../util/galleryCreator.ts";
import {
	type BannedGalleryGuild,
	banServerGlobally,
	createBannedGalleryEmbed,
	getBannedGuilds,
	isBotDeveloper,
	unbanServerGlobally,
} from "../util/devGlobalBans.ts";

/**
 * Command data for the `/linkbotdevs` command
 */
export const data = {
	name: "linkbotdevs",
	description: "Bot developer tools for managing link leaking servers",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			name: "ban",
			description: "Globally ban a server from appearing in the gallery",
			type: ApplicationCommandOptionTypes.SubCommand,
			options: [
				{
					name: "server_id",
					description: "The ID of the server to ban from the gallery",
					type: ApplicationCommandOptionTypes.String,
					required: true,
				},
				{
					name: "reason",
					description:
						"Reason for banning the server from the gallery",
					type: ApplicationCommandOptionTypes.String,
					required: true,
				},
			],
		},
		{
			name: "unban",
			description: "Remove a global ban for a server",
			type: ApplicationCommandOptionTypes.SubCommand,
			options: [
				{
					name: "server_id",
					description:
						"The ID of the server to unban from the gallery",
					type: ApplicationCommandOptionTypes.String,
					required: true,
				},
			],
		},
		{
			name: "bannedgallery",
			description: "View the gallery of banned servers",
			type: ApplicationCommandOptionTypes.SubCommand,
		},
	],
	dmPermission: true,
};

/**
 * Whether this command can only be run by administrators (in this case, bot developers)
 */
export const adminOnly = false;

export async function handle(
	bot: BotWithCache,
	interaction: Interaction,
	logger: PrefixedLogger,
	bearerToken: string,
): Promise<void> {
	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	// Check if user is a bot developer
	if (!await isBotDeveloper(interaction)) {
		logger.warn(
			`User ${interaction.user.id} attempted to use /linkbotdevs without permission`,
		);
		await responder.respond("This command is restricted to bot developers");
		return;
	}

	const subcommand = interaction.data?.options?.[0];
	if (!subcommand) {
		logger.error("Failed to find the subcommand");
		await responder.respond("⚠️ Failed to find the subcommand");
		return;
	}
	switch (subcommand.name) {
		case "ban":
			await handleBan(
				bot,
				interaction,
				subcommand.options,
				logger,
				responder,
			);
			break;
		case "unban":
			await handleUnban(
				bot,
				interaction,
				subcommand.options,
				logger,
				responder,
			);
			break;
		case "bannedgallery":
			await handleBannedGallery(bot, interaction, logger, bearerToken);
			break;
		default:
			await responder.respond("Unknown subcommand!");
	}
}

async function handleBan(
	bot: BotWithCache,
	interaction: Interaction,
	options: any,
	logger: PrefixedLogger,
	responder: Responder,
): Promise<void> {
	const serverIdOption = options?.find((opt: any) =>
		opt.name === "server_id"
	);
	const reasonOption = options?.find((opt: any) => opt.name === "reason");

	if (!serverIdOption || typeof serverIdOption.value !== "string") {
		await responder.respond("Server ID is required!");
		return;
	}

	const serverId = serverIdOption.value;
	const reason = reasonOption?.value || "Link leaking";

	const result = await banServerGlobally(
		serverId,
		reason,
		String(interaction.user.id),
		logger,
	);
	await responder.respond(result.message);
}

async function handleUnban(
	bot: BotWithCache,
	interaction: Interaction,
	options: any,
	logger: PrefixedLogger,
	responder: Responder,
): Promise<void> {
	const serverIdOption = options?.find((opt: any) =>
		opt.name === "server_id"
	);

	if (!serverIdOption || typeof serverIdOption.value !== "string") {
		await responder.respond("Server ID is required!");
		return;
	}

	const serverId = serverIdOption.value;
	const result = await unbanServerGlobally(
		serverId,
		String(interaction.user.id),
		logger,
	);
	await responder.respond(result.message);
}

async function handleBannedGallery(
	bot: BotWithCache,
	interaction: Interaction,
	logger: PrefixedLogger,
	bearerToken: string,
): Promise<void> {
	await createGallery({
		bot,
		interaction,
		logger,
		galleryType: "banned",
		title: "Globally Banned Server Gallery",
		showBannedOnly: true,
	}, bearerToken);
}
