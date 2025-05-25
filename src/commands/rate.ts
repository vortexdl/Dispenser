import { type Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
	InteractionResponseTypes,
	MessageFlags,
} from "@discordeno/bot";
import type { BotWithCache } from "../bot.ts";

import { MongoError, MongoServerError } from "mongodb";

import { ratingsDb } from "$db";
import { type ServerRatingDoc } from "../types/db.d.ts";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

import mainConfig from "../../config.ts";
import { getGuildConfig } from "../util/configManager.ts";
import { parseCommandOptions } from "../util/commandUtils.ts";

const commandCooldowns = new Map<string, number>();
const COOLDOWN_DURATION = 5000;

const commandName = "rate";

/**
 * Command data for the `/rate` command
 */
export const data = {
	name: commandName, // Use variable
	description: "Rate this server or view its current rating",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			name: "give",
			description: "Give a rating to this server",
			type: ApplicationCommandOptionTypes.SubCommand,
			options: [
				{
					name: "stars",
					description: "The number of stars to give the server (1-5)",
					type: ApplicationCommandOptionTypes.Integer,
					required: true,
					minValue: 1,
					maxValue: 5,
				},
			],
		},
		{
			name: "view",
			description: "View the current average rating for this server",
			type: ApplicationCommandOptionTypes.SubCommand,
			// No options needed for viewing server's own rating
		},
	],
	dmPermission: false, // Server ratings don't make sense in DMs
};

/**
 * Whether this command can only be run by administrators
 */
export const adminOnly = false;

export async function handle(
	bot: BotWithCache,
	interaction: Interaction,
	logger: PrefixedLogger,
): Promise<void> {
	// Configure the logger for this specific command execution
	// Assuming mainConfig is accessible or passed appropriately if needed for debug flags
	// For now, let's assume a mainConfig import similar to report.ts or a global config object
	// As a placeholder, using false for debug. This should be wired to actual config
	const isDebug = false;

	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	const subcommand = interaction.data?.options?.[0]?.name;
	const subcommandOptions = parseCommandOptions(
		interaction.data?.options?.[0]?.options,
	);

	if (!interaction.guildId) {
		// This check is technically redundant due to dmPermission: false, but good for safety
		await responder.respond("This command can only be used in a server!");
		return;
	}
	const guildIdString = String(interaction.guildId);
	const raterUserIdString = String(interaction.user.id);

	// Fetch guild config to check the server's rating settings
	try {
		const guildConfig = await getGuildConfig(guildIdString);
		// Ensure discovery and rating are enabled for the guild
		if (!guildConfig.discovery?.publish || !guildConfig.discovery?.rating) {
			logger.info(
				`User ${raterUserIdString} tried to use /rate in guild ${guildIdString} where rating is disabled via discovery settings.`,
			);
			await responder.respond(
				"Rating is currently disabled for this server!",
			);
			return;
		}
	} catch (configError) {
		if (
			configError instanceof MongoError ||
			configError instanceof MongoServerError
		) {
			logger.error(
				`Database error fetching config for guild ${guildIdString}`,
				{ error: configError.message },
			);
			await responder.respond(
				"⚠️ An error occurred while checking server settings. Please try again later",
			);
		} else if (configError instanceof Error) {
			logger.error(`Error fetching config for guild ${guildIdString}`, {
				error: configError.message,
			});
			await responder.respond(
				"⚠️ An error occurred while checking server settings. Please try again later",
			);
		} else {
			logger.error(
				`Unknown error fetching config for guild ${guildIdString}`,
				{ error: configError },
			);
			await responder.respond(
				"⚠️ An error occurred while checking server settings. Please try again later",
			);
		}
		return;
	}

	// Ban check for the user running the command (already present, seems fine)
	try {
		// Check if the rater is banned in the current guild
		const banInfo = await bot.helpers.getBan(
			BigInt(guildIdString),
			BigInt(raterUserIdString),
		);

		// If getBan resolves without error, it means the user IS banned
		if (banInfo) {
			await responder.respond(
				"You are banned from this server and cannot rate it!",
			);
			return;
		}
	} catch (banCheckError) {
		// A 404 error from getBan means the user is not banned, so we can proceed
		// Any other error during the ban check should be logged and reported to the user
		if (
			banCheckError instanceof Error &&
			(banCheckError.message.includes("404") ||
				banCheckError.message.includes(
					"DiscordRESTError [10026]: Unknown Ban",
				))
		) {
			// User is not banned, continue
		} else if (
			banCheckError instanceof Error &&
			banCheckError.message.includes("API")
		) {
			logger.error(
				`Discord API error checking ban status for user ${raterUserIdString} in guild ${guildIdString}`,
				{ error: banCheckError.message },
			);
			await responder.respond(
				"⚠️ An error occurred while checking your permissions. Please try again later",
			);
			return;
		} else {
			logger.error(
				`Error checking ban status for user ${raterUserIdString} in guild ${guildIdString}`,
				{ error: banCheckError },
			);
			await responder.respond(
				"⚠️ An error occurred while checking your permissions. Please try again later",
			);
			return;
		}
	}

	// Re-added for consistency
	const commandName = "rate";

	logger.debug(
		`Rate command invoked by ${interaction.user.id} in guild ${interaction.guildId} for ${
			subcommandOptions.targetUserId
				? subcommandOptions.targetUserId
				: "self"
		}`,
	);

	const currentTime = Date.now();
	const cooldownKey = `${interaction.user.id}_${commandName}`;

	if (commandCooldowns.has(cooldownKey)) {
		const timeLeft =
			(commandCooldowns.get(cooldownKey)! + COOLDOWN_DURATION) -
			currentTime;
		if (timeLeft > 0) {
			const timeLeftSeconds = Math.ceil(timeLeft / 1000);
			await responder.respond(
				`You can use this command again in ${timeLeftSeconds} seconds!`,
			);
			return;
		}
	}

	commandCooldowns.set(cooldownKey, currentTime);

	setTimeout(() => {
		commandCooldowns.delete(cooldownKey);
	}, COOLDOWN_DURATION);

	let userId: string;
	let isTargetingOtherUser = false;

	const targetUserIdValue = subcommandOptions.targetUserId;
	if (
		typeof targetUserIdValue === "string" &&
		(!targetUserIdValue ||
			targetUserIdValue === String(interaction.user.id))
	) {
		userId = String(interaction.user.id);
	} else if (typeof targetUserIdValue === "string") {
		userId = targetUserIdValue;
		isTargetingOtherUser = true;
	} else {
		if (subcommand === "give") {
			userId = raterUserIdString;
		} else {
			userId = raterUserIdString;
		}
	}

	logger.debug(`Processing rate command for user ${userId}`);

	await responder.defer(MessageFlags.Ephemeral);

	switch (subcommand) {
		case "give": {
			const starsOption = subcommandOptions.stars as number | undefined;

			if (starsOption === undefined) {
				await responder.editResponse(
					"Stars are required to give a rating!",
				);
				return;
			}

			try {
				await ratingsDb.updateOne(
					{
						guildId: guildIdString,
						raterUserId: userId, // User can only rate a server once
					},
					{
						$set: {
							stars: starsOption,
							timestamp: new Date(),
						},
					},
					{ upsert: true },
				);

				await responder.editResponse(
					`You have rated this server with ${starsOption} star(s) ✅`,
				);
				logger.info(
					`Server rating given: User ${userId} rated server ${guildIdString} with ${starsOption} stars.`,
				);
			} catch (dbError) {
				if (
					dbError instanceof MongoError ||
					dbError instanceof MongoServerError
				) {
					logger.error(
						`Database error for server ${guildIdString} by user ${userId} when giving rating`,
						{ error: dbError.message },
					);
					await responder.editResponse(
						"⚠️ Could not save your rating due to a database error. Please try again later",
					);
				} else if (dbError instanceof Error) {
					logger.error(
						`Error for server ${guildIdString} by user ${userId} when giving rating`,
						{ error: dbError.message },
					);
					await responder.editResponse(
						"⚠️ Could not save your rating due to an unexpected error. Please try again later",
					);
				} else {
					logger.error(
						`Unknown error for server ${guildIdString} by user ${userId} when giving rating`,
						{ error: dbError },
					);
					await responder.editResponse(
						"⚠️ Could not save your rating due to an unknown error. Please try again later",
					);
				}
			}
			break;
		}
		case "view": {
			try {
				const serverRatings = await ratingsDb.find({
					guildId: guildIdString,
				}).toArray() as ServerRatingDoc[];

				if (!serverRatings || serverRatings.length === 0) {
					await responder.editResponse(
						"This server has not been rated yet!",
					);
					return;
				}

				const totalStars = serverRatings.reduce(
					(sum, rating) => sum + rating.stars,
					0,
				);
				const averageRating = totalStars / serverRatings.length;
				const numRatings = serverRatings.length;

				await responder.editResponse(
					`This server has an average rating of **${
						averageRating.toFixed(1)
					}** stars from **${numRatings}** rating(s).`,
				);
				logger.info(
					`Server rating viewed: Server ${guildIdString} has ${
						averageRating.toFixed(1)
					} stars from ${numRatings} ratings.`,
				);
			} catch (dbError) {
				if (
					dbError instanceof MongoError ||
					dbError instanceof MongoServerError
				) {
					logger.error(
						`Database error for server ${guildIdString} when viewing rating`,
						{ error: dbError.message },
					);
					await responder.editResponse(
						"⚠️ Could not retrieve server ratings due to a database error. Please try again later",
					);
				} else if (dbError instanceof Error) {
					logger.error(
						`Error for server ${guildIdString} when viewing rating`,
						{ error: dbError.message },
					);
					await responder.editResponse(
						"⚠️ Could not retrieve server ratings due to an unexpected error. Please try again later",
					);
				} else {
					logger.error(
						`Unknown error for server ${guildIdString} when viewing rating`,
						{ error: dbError },
					);
					await responder.editResponse(
						"⚠️ Could not retrieve server ratings due to an unknown error. Please try again later",
					);
				}
			}
			break;
		}
		default:
			await responder.editResponse(
				"Unknown subcommand. Please use 'give' or 'view'!",
			);
			break;
	}
}
