import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
	type Interaction,
	MessageFlags,
} from "@discordeno/bot";
import type { BotWithCache } from "../bot.ts";

import { linksDb, usersDb } from "$db";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

import config from "../../config.ts";
import { getGuildConfig } from "../util/configManager.ts";

export const data = {
	name: "unblock",
	description:
		"Sends false reports to filtering companies to unblock links (recommended for Masqr links)",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			type: ApplicationCommandOptionTypes.String,
			name: "filters",
			description:
				"The filters ('Lightspeed') to unblock (can be a comma-separated list)",
			required: true,
		},
		{
			type: ApplicationCommandOptionTypes.String,
			name: "links",
			description: "The links to unblock (can be a comma-separated list)",
			required: true,
		},
	],
	dmPermission: false,
};

export const adminOnly = true;

export async function handle(
	bot: BotWithCache,
	interaction: Interaction,
	logger: PrefixedLogger,
): Promise<void> {
	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	responder.respond("This command is not implemented yet!");
}
