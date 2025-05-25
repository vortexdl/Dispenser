import { type Bot, type Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
} from "@discordeno/bot";

import { MongoError, MongoServerError, type UpdateResult } from "mongodb";
import { rolesDb } from "$db";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

/**
 * Command data for the `/premium` command
 */
export const data = {
	name: "premium",
	description: "Manages the premium role for the bot in this guild",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			type: ApplicationCommandOptionTypes.Role,
			name: "role",
			description:
				"The role to designate as the premium role for the bot",
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
	bot: Bot,
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

	const roleId = interaction.data?.options?.[0]?.value;

	if (!roleId) {
		logger.error("The Role ID is missing from the option data");
		await responder.respond("⚠️ Failed to get the premium role ID");
		return;
	}

	await responder.defer();

	// Set premium role for the guild in database
	try {
		await rolesDb.updateMany(
			{
				guildId: guildId,
			},
			{
				$set: {
					premium: String(roleId),
				},
			},
			{
				upsert: true,
			},
		);

		logger.info(`Set premium role to ${roleId} in guild ${guildId}`);
		await responder.editResponse(`Gave premium status to ${roleId} ✅`);
	} catch (dbErr) {
		const action = `setting the premium role`;
		const context = `for guild ${guildId}`;
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
