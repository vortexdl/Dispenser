import { type Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
} from "@discordeno/bot";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";
import type { BotWithCache } from "../bot.ts";

export const data = {
	name: "legal",
	description: "Read legal documents",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			name: "document",
			description: "Which document to read",
			type: ApplicationCommandOptionTypes.String,
			required: true,
			choices: [
				{ name: "Terms of Service", value: "tos" },
				{ name: "Privacy Policy", value: "pp" },
			],
		},
	],
	dmPermission: true,
};

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

	const choice = String(interaction.data?.options?.[0]?.value).toLowerCase();
	let fileName: string;
	let title: string;

	switch (choice) {
		case "tos":
			fileName = "TERMS_OF_SERVICE.md";
			title = "Terms of Service";
			break;
		case "pp":
			fileName = "PRIVACY_POLICY.md";
			title = "Privacy Policy";
			break;
		default:
			await responder.respondErr(
				"Invalid readLegal option",
				logger,
				"Invalid option! Please choose `Terms of Service` or `Privacy Policy`.",
			);
			return;
	}

	try {
		const fileUrl = new URL(`../legal/${fileName}`, import.meta.url);
		const raw = await Deno.readTextFile(fileUrl);

		const lines = raw.split("\n");
		const content = lines.slice(1).join("\n").trim();

		const firstChunk = content.slice(0, 4096);
		const embed = {
			title,
			description: firstChunk,
			color: 0x99ff,
		};

		await responder.respondEmbed(embed);

		// slice if msg too long, cuz the legal documents might be longgg
		if (content.length > 4096) {
			const rest = content.slice(4096);
			const parts = rest.match(/[\s\S]{1,2000}/g) || [];
			for (const part of parts) {
				await responder.respond(part);
			}
		}
	} catch (err) {
		await responder.respondErr(
			`Failed to load ${fileName}`,
			logger,
			"Could not load the document",
			err,
		);
	}
}
