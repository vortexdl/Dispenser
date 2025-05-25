import { Bot, Interaction } from "npm:@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
	CreateSlashApplicationCommand,
	DiscordApplicationIntegrationType,
	DiscordInteractionContextType,
} from "npm:@discordeno/types";

import blockedOnLS from "../util/checker/ls.ts";

import { CommandConfig } from "../types/commands.d.ts";

import Responder from "../util/responder.ts";
import createErrorEmbed from "../util/createErrorEmbed.ts";
import { getUserLocale } from "../util/getIfExists.ts";

import { accessConfig } from "../util/AccessConfig.ts";

const data: CreateSlashApplicationCommand = {
	name: "lookup",
	description:
		"Lookup a link and get the results of how it is filtered in various filters",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			type: ApplicationCommandOptionTypes.String,
			name: "link",
			description:
				"The link(s) to lookup. It could be comma separated  . If ommitted and the user is an admin, it will display the status for every link in a forcefully empheral gallery, or else it would error out.",
			required: true,
		},
		{
			type: ApplicationCommandOptionTypes.String,
			name: "filter",
			description:
				"The filter to query from. If omitted, it will show the status from every filter.",
		},
		{
			type: ApplicationCommandOptionTypes.String,
			name: "empeheral",
			description:
				"If true, the bot will dm you the results. If false, the bot will respond in the channel.",
			maxLength: 4,
			minLength: 3,
		},
	],
	integrationTypes: [
		DiscordApplicationIntegrationType.GuildInstall,
		DiscordApplicationIntegrationType.UserInstall,
	],
	contexts: [
		DiscordInteractionContextType.BotDm |
		DiscordInteractionContextType.Guild |
		DiscordInteractionContextType.PrivateChannel,
	],
};

const commandConfig: CommandConfig = {
	managementOnly: true,
};

async function handle(bot: Bot, interaction: Interaction): Promise<void> {
	const responder = new Responder(bot, interaction.id, interaction.token);

	const userLocale = getUserLocale(interaction.user);

	const link = interaction.data?.options?.[0]?.value;
	if (typeof link !== "string") {
		await responder.respondEmbed(
			await createErrorEmbed(
				"the link provided is not a string",
				"bot_error",
				userLocale,
			),
			userLocale,
		);
		return;
	}
	const filter = interaction.data?.options?.[1]?.value;
	if (typeof filter !== "string") {
		await responder.respondEmbed(
			await createErrorEmbed(
				"the filter provided is not a string",
				"bot_error",
				userLocale,
			),
		);
		return;
	}
	const empheralStr = interaction.data?.options?.[2]?.value;
	if (empheralStr !== "string") {
		await responder.respondEmbed(
			await createErrorEmbed(
				"the empheral provided is not a string",
				"bot_error",
				userLocale,
			),
		);
		return;
	}
	// @ts-ignore: this is false
	const isEmpheral = empheralStr === "true";
	// @ts-ignore: this is false
	if (!isEmpheral && empheralStr !== "false") {
		await responder.respondEmbed(
			await createErrorEmbed(
				"the empheral value provided in the command is not a boolean",
				"user_error",
				userLocale,
			),
		);
		return;
	}

	switch (filter) {
		case "ls":
			if (await blockedOnLS(link)) {
				responder.respond(
					await accessConfig.getTranslation({
						type: "in_command",
						searchString: "Your link is blocked on Lightspeed",
						commandTarget: "lookup",
						isEmbed: false,
					}, userLocale),
				);
				return;
			} else {
				responder.respond(
					await accessConfig.getTranslation({
						type: "in_command",
						searchString: "Your link is not blocked on Lightspeed",
						commandTarget: "lookup",
						isEmbed: false,
					}, userLocale),
				);
				return;
			}
		default:
			await responder.respondEmbed(
				await createErrorEmbed(
					`${await accessConfig.getTranslation(
						{
							type: "in_command",
							searchString: "The filter you provided",
							commandTarget: "lookup",
							isEmbed: false,
						},
						userLocale,
					)}, ${filter}, ${await accessConfig.getTranslation(
						{
							type: "in_command",
							searchString: "is not yet implemented in Dispenser",
							commandTarget: "lookup",
							isEmbed: false,
						},
						userLocale,
					)}`,
					"user_error",
				),
			);
	}
}

export { commandConfig, data, handle };
