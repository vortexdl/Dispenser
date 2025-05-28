import { ApplicationCommandTypes } from "npm:@discordeno/bot";

export const data = {
	name: "credits",
	description: "View the credits for the link bot devs",
	type: ApplicationCommandTypes.ChatInput,
	options: [],
	dmPermission: true,
};

export async function handle(
	botWithCache: BotWithCache,
	interaction: Interaction,
	logger: PrefixedLogger,
): Promise<void> {
	const responder = new Responder(
		botWithCache,
		interaction.id,
		interaction.token,
		logger,
	);

	await responder.respond(
		"Bot made by [Ryan Wilson](https://ryanwilson.space) (EV/MovByte), [dave9123](https://dave9123.me/), and [appleflyer](https://appleflyer.xyz/",
	);
}
