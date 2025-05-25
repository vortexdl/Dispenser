import { type Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
} from "@discordeno/bot";
import type { BotWithCache } from "../bot.ts";

import { MongoError, MongoServerError, type UpdateResult } from "mongodb";
import { limitsDb } from "$db";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

/**
 * Command data for the `/limit` command
 */
export const data = {
	name: "limit",
	description: "Manages request limits for categories in the guild",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			type: ApplicationCommandOptionTypes.String,
			name: "category",
			description: "The category to set or view the limit for",
			required: true,
			autocomplete: true,
		},
		{
			type: ApplicationCommandOptionTypes.Integer,
			name: "limit",
			description:
				"The request limit (0 for no limit, -1 to remove limit setting)",
			required: false,
		},
		{
			type: ApplicationCommandOptionTypes.Integer,
			name: "premium_limit",
			description:
				"The request limit for premium users (0 for no limit, -1 to remove)",
			required: false,
		},
	],
	dmPermission: false,
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

	const categoryOption = interaction.data?.options?.find(
		(opt) => opt.name === "category",
	);
	const limitOption = interaction.data?.options?.find(
		(opt) => opt.name === "limit",
	);
	const premiumLimitOption = interaction.data?.options?.find(
		(opt) => opt.name === "premium_limit",
	);

	const category = categoryOption?.value;
	const limit = limitOption?.value;
	const premiumLimit = premiumLimitOption?.value;

	if (typeof category === "undefined") {
		await responder.respond("⚠️ Category option was not found");
		return;
	}
	if (typeof category !== "string") {
		await responder.respond(
			"⚠️ The category option provided was not a string",
		);
		return;
	}

	if (typeof limit !== "number") {
		await responder.respond("⚠️ Limit option was not a number");
		return;
	}

	await responder.defer();

	// Update category limits in database
	try {
		const updateFields: { limit?: number; premiumLimit?: number } = {};
		if (typeof limit === "number") updateFields.limit = limit;
		if (typeof premiumLimit === "number") {
			updateFields.premiumLimit = premiumLimit;
		}

		await limitsDb.updateMany(
			{ guildId, cat: category },
			{ $set: updateFields },
			{ upsert: true },
		);

		let message = `Updated limits for category ${category}`;
		if (typeof limit === "number") message += ` (limit: ${limit})`;
		if (typeof premiumLimit === "number") {
			message += ` (premium limit: ${premiumLimit})`;
		}
		message += " ✅";

		await responder.editResponse(message);
		logger.info(
			`Updated limits for category ${category} in guild ${guildId}`,
		);
	} catch (dbErr) {
		const action = `updating the limits`;
		const details = `for category ${category}`;
		const context = `in guild ${guildId}`;
		const responseMsgRest = ` error occurred while ${action}`;
		const loggerMsgRest = `${responseMsgRest} ${details} ${context}`;
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
}
