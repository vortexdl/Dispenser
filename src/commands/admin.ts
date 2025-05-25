import { type Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
} from "@discordeno/bot";
import type { BotWithCache } from "../bot.ts";

import { MongoError, MongoServerError, type UpdateResult } from "mongodb";
import { rolesDb } from "$db";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

/**
 * Command data for the `/admin` command
 */
export const data = {
	name: "admin",
	description: "Manages admin roles for the bot in this guild",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			type: ApplicationCommandOptionTypes.Role,
			name: "role",
			description: "The role to designate as the admin role for the bot",
			required: true,
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

	const roleId = interaction.data?.options?.[0]?.value as string | undefined;

	if (!roleId) {
		logger.error("The Role ID is missing from the option data");
		await responder.respond("⚠️ Failed to get the admin role ID");
		return;
	}

	await responder.defer();

	const guildIdString = String(interaction.guildId);

	// Set admin role for the guild in database
	try {
		await rolesDb.updateMany(
			{ guildId: guildIdString },
			{ $set: { admin: roleId } },
			{ upsert: true },
		);

		logger.info(`Set admin role to ${roleId} in guild ${guildIdString}`);
		await responder.editResponse(`Gave admin status to ${roleId} ✅`);
	} catch (dbErr) {
		const action = `setting the admin role`;
		const context = `for guild ${guildIdString}`;
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
}
