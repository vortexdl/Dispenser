import { type Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
} from "@discordeno/bot";
import type { BotWithCache } from "../bot.ts";

import { MongoError, MongoServerError, type UpdateResult } from "mongodb";
import { usersDb } from "$db";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

/**
 * Command data for the /reset command
 */
export const data = {
	name: "reset",
	description:
		"Resets user data or link history for a category or all categories",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			type: ApplicationCommandOptionTypes.String,
			name: "scope",
			description:
				"What to reset: your history for a category, or all your history",
			required: true,
			choices: [
				{ name: "History for one category", value: "category_history" },
				{ name: "All my history", value: "all_history" },
			],
		},
		{
			type: ApplicationCommandOptionTypes.String,
			name: "category",
			description:
				"The category to reset history for (if scope is category_history)",
			required: false,
			autocomplete: true,
		},
	],
	dmPermission: true, // Allow resetting history from DMs
};

/**
 * Whether this command can only be run by administrators
 */
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

	const guildId = String(interaction.guildId);

	const userIdOption = interaction.data?.options?.find(
		(opt) => opt.name === "userid",
	);
	const userId = userIdOption?.value;

	if (typeof userId !== "string") {
		logger.error("The 'userid' option was not provided as a string");
		await responder.respond("⚠️ Malformed options data (this is a bug)");
		return;
	}

	await responder.defer();

	// Reset user data in database
	let updateResult: UpdateResult;
	try {
		const filter = { guildId, userId };
		const updateDoc = {
			$set: {
				links: [],
				times: 0,
			},
		};

		updateResult = await usersDb.updateMany(filter, updateDoc);
	} catch (dbErr) {
		const action = `resetting user data`;
		const context = `for user ${userId} in guild ${guildId}`;
		const responseMsgRest = ` error occurred while ${action}`;
		const loggerMsgRest = `${responseMsgRest} ${context}`;
		const responseMsg = `⚠️ An${responseMsgRest}`;
		if (
			dbErr instanceof MongoError || dbErr instanceof MongoServerError
		) {
			logger.error(
				`A database${loggerMsgRest}: ${dbErr}`,
			);
			await responder.editResponse(
				responseMsg,
			);
			return;
		} else {
			logger.error(
				`An unexpected${loggerMsgRest}: ${dbErr}`,
			);
			await responder.editResponse(
				responseMsg,
			);
			return;
		}
	}

	let msg = "";
	if (updateResult.modifiedCount === 0) {
		msg = `User ${userId} had no data to reset in this server!`;
	} else {
		msg =
			`Reset ${updateResult.modifiedCount} record(s) for user ${userId} ✅`;
	}

	await responder.editResponse(msg);
	logger.info(`Reset user data: ${msg}`);
}
