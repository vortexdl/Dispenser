import { type Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
} from "@discordeno/bot";

import { MongoError, MongoServerError } from "mongodb";
import { botBansDb } from "$db";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

import type { BotWithCache } from "../bot.ts";

/**
 * Command data for the `/ban` command (bot ban, not guild ban)
 */
export const data = {
	name: "ban",
	description: "Manages bot-specific bans for users in this guild",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			name: "user",
			description: "Ban a user from using the bot in this guild",
			type: ApplicationCommandOptionTypes.SubCommand,
			options: [
				{
					name: "target",
					description: "The user to ban from the bot",
					type: ApplicationCommandOptionTypes.User,
					required: true,
				},
				{
					name: "reason",
					description: "The reason for the bot ban (optional)",
					type: ApplicationCommandOptionTypes.String,
					required: false,
				},
			],
		},
		{
			name: "remove",
			description: "Remove a bot ban from a user in this guild",
			type: ApplicationCommandOptionTypes.SubCommand,
			options: [
				{
					name: "target",
					description: "The user to unban from the bot",
					type: ApplicationCommandOptionTypes.User,
					required: true,
					autocomplete: true, // Autocomplete from currently bot-banned users
				},
			],
		},
		{
			name: "view",
			description: "View all users currently bot-banned in this guild",
			type: ApplicationCommandOptionTypes.SubCommand,
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

	const adminUserIdString = String(interaction.user.id);

	if (!interaction.guildId) {
		logger.warn("Command invoked without guildId");
		await responder.respond("This command can only be used in a server!");
		return;
	}
	const guildIdString = String(interaction.guildId);

	await responder.defer();

	// Prevent banned admins from using /ban command
	try {
		await bot.helpers.getBan(guildIdString, adminUserIdString);
		logger.info(
			`Admin ${adminUserIdString} is banned in guild ${guildIdString} tried to use /ban.`,
		);
		await responder.editResponse(
			"Banned administrators cannot use this command!",
		);
		return;
	} catch (error) {
		if (
			error instanceof Error &&
			(error.message.includes("404") ||
				error.message.includes("Unknown Ban"))
		) {
			// User is not banned, continue
		} else if (error instanceof Error && error.message.includes("API")) {
			logger.error(
				`Discord API error checking ban status for admin ${adminUserIdString} in guild ${guildIdString}`,
				{ error: error.message },
			);
			await responder.editResponse(
				"⚠️ Could not verify your permissions due to a Discord API error",
			);
			return;
		} else {
			logger.error(
				`Error checking ban status for admin ${adminUserIdString} in guild ${guildIdString}`,
				{ error },
			);
			await responder.editResponse(
				"⚠️ Could not verify your permissions due to an internal error",
			);
			return;
		}
	}

	const subcommand = interaction.data?.options?.[0]?.name;
	const targetUserId = interaction.data?.options?.[0]?.options?.find((opt) =>
		opt.name === "user"
	)?.value as string | undefined;
	const reason = interaction.data?.options?.[0]?.options?.find((opt) =>
		opt.name === "reason"
	)?.value as string | undefined;

	if (!targetUserId) {
		await responder.editResponse("Target user ID is required!");
		return;
	}

	if (subcommand === "user") {
		try {
			await botBansDb.updateOne(
				{ guildId: guildIdString, userId: targetUserId },
				{
					$set: {
						bannedBy: adminUserIdString,
						reason: reason ? reason : undefined,
						timestamp: new Date(),
					},
				},
				{ upsert: true },
			);
			await responder.editResponse(
				`User ${targetUserId} has been banned ✅${
					reason ? ` Reason: ${reason}` : ""
				}`,
			);
			logger.info(
				`User ${targetUserId} banned by ${adminUserIdString} in guild ${guildIdString}.${
					reason ? ` Reason: ${reason}` : ""
				}`,
			);
		} catch (error) {
			if (
				error instanceof MongoError || error instanceof MongoServerError
			) {
				logger.error(
					`Database error for guild ${guildIdString} when adding ban`,
					{ error: error.message, targetUserId },
				);
				await responder.editResponse(
					"⚠️ Failed to add ban due to a database error",
				);
			} else if (error instanceof Error) {
				logger.error(
					`Error for guild ${guildIdString} when adding ban`,
					{ error: error.message, targetUserId },
				);
				await responder.editResponse(
					"⚠️ Failed to add ban due to an unexpected error",
				);
			} else {
				logger.error(
					`Unknown error for guild ${guildIdString} when adding ban`,
					{ error, targetUserId },
				);
				await responder.editResponse(
					"⚠️ Failed to add ban due to an unknown error",
				);
			}
		}
	} else if (subcommand === "remove") {
		try {
			const result = await botBansDb.deleteOne({
				guildId: guildIdString,
				userId: targetUserId,
			});
			if (result.deletedCount === 0) {
				await responder.editResponse(
					`User ${targetUserId} was not found in the ban list!`,
				);
			} else {
				await responder.editResponse(
					`User ${targetUserId} has been unbanned ✅`,
				);
				logger.info(
					`User ${targetUserId} unbanned by ${adminUserIdString} in guild ${guildIdString}.`,
				);
			}
		} catch (error) {
			if (
				error instanceof MongoError || error instanceof MongoServerError
			) {
				logger.error(
					`Database error for guild ${guildIdString} when removing ban`,
					{ error: error.message, targetUserId },
				);
				await responder.editResponse(
					"⚠️ Failed to remove ban due to a database error",
				);
			} else if (error instanceof Error) {
				logger.error(
					`Error for guild ${guildIdString} when removing ban`,
					{ error: error.message, targetUserId },
				);
				await responder.editResponse(
					"⚠️ Failed to remove ban due to an unexpected error",
				);
			} else {
				logger.error(
					`Unknown error for guild ${guildIdString} when removing ban`,
					{ error, targetUserId },
				);
				await responder.editResponse(
					"⚠️ Failed to remove ban due to an unknown error",
				);
			}
		}
	} else if (subcommand === "view") {
		try {
			const bans = await botBansDb.find({ guildId: guildIdString })
				.toArray();
			if (bans.length === 0) {
				await responder.editResponse(
					"No users are currently banned in this server",
				);
				return;
			}
			const banListMessage = bans.map((ban) =>
				`User ID: ${ban.userId}${
					ban.reason ? ` - Reason: ${ban.reason}` : ""
				}`
			).join("\n");
			await responder.editResponse(
				`**Banned Users:**\n${banListMessage}`,
			);
		} catch (error) {
			if (
				error instanceof MongoError || error instanceof MongoServerError
			) {
				logger.error(
					`Database error for guild ${guildIdString} when listing bans`,
					{ error: error.message },
				);
				await responder.editResponse(
					"⚠️ Failed to retrieve ban list due to a database error",
				);
			} else if (error instanceof Error) {
				logger.error(
					`Error for guild ${guildIdString} when listing bans`,
					{ error: error.message },
				);
				await responder.editResponse(
					"⚠️ Failed to retrieve ban list due to an unexpected error",
				);
			} else {
				logger.error(
					`Unknown error for guild ${guildIdString} when listing bans`,
					{ error },
				);
				await responder.editResponse(
					"⚠️ Failed to retrieve ban list due to an unknown error",
				);
			}
		}
	} else {
		await responder.editResponse(
			"Invalid subcommand. Use user, remove, or view!",
		);
	}
}
