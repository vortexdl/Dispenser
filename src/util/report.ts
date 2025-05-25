import { Bot, Interaction } from "discordeno";

import Responder from "./Responder.ts";

export default async function (
	bot: Bot,
	interaction: Interaction,
): Promise<void> {
	const responder = new Responder(bot, interaction.id, interaction.token);

	await responder.respond("Reports are a work in progress");
}
