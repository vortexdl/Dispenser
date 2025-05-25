import { Bot, Interaction } from "npm:@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
} from "npm:@discordeno/types";

//import { chansDb } from "$db";

import Responder from "../util/responder.ts";

import { CommandConfig } from "../types/commands.d.ts";

import { accessConfig } from "../util/AccessConfig.ts";
import { getUserLocale } from "../util/getIfExists.ts";

// TODO: Be able to set a channel in another guild. This would be useful because some servers have specific private "staff servers".

const data = {
	name: "logs",
	description: "Sets the channel for bot logs",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			type: ApplicationCommandOptionTypes.Channel,
			name: "channel",
			description: "The channel to log to",
			required: true,
		},
	],
	dmPermission: false,
};

const commandConfig: CommandConfig = {
	managementOnly: true,
};

async function handle(bot: Bot, interaction: Interaction): Promise<void> {
	const responder = new Responder(bot, interaction.id, interaction.token);

	const chan = interaction.data?.options?.[0]?.value;

	await responder.respond(`${await accessConfig.getTranslation({
		type: "in_command",
		searchString: "The channel is set to",
		commandTarget: "log",
		isEmbed: false,
	}, getUserLocale(interaction.user))} ${chan}`);

	// TODO: Implement this
}

export { commandConfig, data, handle };
