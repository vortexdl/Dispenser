import { Bot, Interaction } from "npm:@discordeno/bot";
import {
	ApplicationCommandTypes,
	CreateSlashApplicationCommand,
} from "npm:@discordeno/types";

//import { linksDb } from "$db";

import Responder from "../util/responder.ts";

const data: CreateSlashApplicationCommand = {
	name: "gallery",
	description: "Subscribe to get links from a category of a server",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			type: ApplicationCommandOptionTypes.String,
			name: "category",
			description: "The category to subscribe to",
			required: true,
		},
		{
			type: ApplicationCommandOptionTypes.String,
			name: "server",
			description:
				"The server the category is from. This could be either a guild id or the server name (it would get the most popular server with that name).",
			required: false,
			/* If omitted, it will get the links for the current server or tell the user they are using the command wrong */
		},
	],
	dmPermission: true,
};

async function handle(bot: Bot, interaction: Interaction): Promise<void> {
	const responder = new Responder(bot, interaction.id, interaction.token);

	// TODO: Implement

	responder.respond("This command is not yet implemented");
}

export { data, handle };
