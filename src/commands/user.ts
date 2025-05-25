import { Interaction, type User } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
} from "@discordeno/bot";
import type { BotWithCache } from "../bot.ts";

import { MongoError, MongoServerError } from "mongodb";
import { usersDb } from "$db";
import type { Users } from "../types/db.d.ts";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

/**
 * Command data for the /user command
 */
export const data = {
	name: "user",
	description: "Manage user-specific settings or view user info",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		// Subcommand for viewing user info (already exists, ensure description is good)
		{
			name: "info",
			description: "View information about a user or yourself",
			type: ApplicationCommandOptionTypes.SubCommand,
			options: [
				{
					name: "user",
					description:
						"The user to view information about (defaults to yourself)",
					type: ApplicationCommandOptionTypes.User,
					required: false,
				},
			],
		},
	],
	dmPermission: true, // Assuming user info can be checked in DMs too
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
	const responder = new Responder(bot, interaction.id, interaction.token, logger);

	await responder.defer();

	const userOptionValue = interaction.data?.options?.find(
		(opt) => opt.name === "user",
	)?.value as string | undefined;
	const categoryOptionValue = interaction.data?.options?.find(
		(opt) => opt.name === "category",
	)?.value as string | undefined;
	const cat: string | undefined = typeof categoryOptionValue === "string"
		? categoryOptionValue
		: undefined;

	let resolvedUserObject: Partial<User> | undefined;
	let resolvedUserIdString: string = String(interaction.user.id);
	let resolvedUsername: string;

	try {

		if (userOptionValue) {
			resolvedUserIdString = userOptionValue;
			// Validate user ID format before BigInt conversion
			if (!/^\d+$/.test(userOptionValue)) {
				await responder.editResponse(
					"Invalid user ID format. User ID must be a numeric string!",
				);
				return;
			}

			// bot.helpers.getUser expects a bigint for the ID
			try {
				const userIdBigInt = BigInt(userOptionValue);
				try {
					resolvedUserObject =
						(await bot.helpers.getUser(userIdBigInt)) as
							| Partial<User>
							| undefined;
				} catch (fetchError) {
					if (
						fetchError instanceof Error &&
						fetchError.message.includes("404")
					) {
						logger.warn("User not found (404)", {
							userOptionValue,
							error: fetchError.message,
						});
						await responder.editResponse(
							`User with ID ${resolvedUserIdString} not found!`,
						);
					} else if (
						fetchError instanceof Error &&
						fetchError.message.includes("API")
					) {
						logger.warn("Discord API error fetching user data", {
							userOptionValue,
							error: fetchError.message,
						});
						await responder.editResponse(
							`⚠️ User with ID ${resolvedUserIdString} not found or could not be fetched (Discord API error)`,
						);
					} else if (fetchError instanceof Error) {
						logger.warn("Error fetching user data", {
							userOptionValue,
							error: fetchError.message,
						});
						await responder.editResponse(
							`⚠️ User with ID ${resolvedUserIdString} not found or could not be fetched`,
						);
					} else {
						logger.warn("Unknown error fetching user data", {
							userOptionValue,
							error: fetchError,
						});
						await responder.editResponse(
							`⚠️ User with ID ${resolvedUserIdString} not found or could not be fetched`,
						);
					}
					return;
				}
			} catch (conversionError) {
				if (conversionError instanceof RangeError) {
					logger.error(
						"BigInt conversion failed - number too large",
						{ userOptionValue, error: conversionError.message },
					);
					await responder.editResponse(
						`Invalid user ID: ${userOptionValue} - number is too large!`,
					);
				} else if (conversionError instanceof SyntaxError) {
					logger.error("BigInt conversion failed - invalid format", {
						userOptionValue,
						error: conversionError.message,
					});
					await responder.editResponse(
						`Invalid user ID format: ${userOptionValue}!`,
					);
				} else if (conversionError instanceof Error) {
					logger.error("Error converting user ID to BigInt", {
						userOptionValue,
						error: conversionError.message,
					});
					await responder.editResponse(
						`Invalid user ID: ${userOptionValue}!`,
					);
				} else {
					logger.error("Unknown error converting user ID to BigInt", {
						userOptionValue,
						error: conversionError,
					});
					await responder.editResponse(
						`Invalid user ID: ${userOptionValue}!`,
					);
				}
				return;
			}

			if (!resolvedUserObject) {
				await responder.editResponse(
					`User with ID ${resolvedUserIdString} not found!`,
				);
				return;
			}

			resolvedUsername = resolvedUserObject &&
					typeof resolvedUserObject.username === "string"
				? resolvedUserObject.username
				: `User ID ${resolvedUserIdString}`;
		} else {
			resolvedUserObject = interaction.user as Partial<User>;
			resolvedUserIdString = String(interaction.user.id);
			resolvedUsername = interaction.user &&
					typeof interaction.user.username === "string"
				? interaction.user.username
				: `User ID ${resolvedUserIdString}`;
		}

		if (cat) {
			const query = {
				guildId: String(interaction.guildId),
				userId: resolvedUserIdString,
				cat: cat,
			};
			// Get user data for specific category from database
			let userData: Users | null;
			try {
				userData = await usersDb.findOne(query);
			} catch (dbErr) {
				const action = `fetching user data for category`;
				const details = `'${cat}'`;
				const context = `for user ${resolvedUserIdString}`;
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

			if (!userData) {
				await responder.editResponse(
					`${
						resolvedUserIdString === String(interaction.user.id)
							? "You have"
							: `${resolvedUsername} has`
					} not used the bot in the ${cat} category`,
				);
				return;
			}

			await responder.editResponse(
				`Links: ${
					userData.links.join(", \n")
				}\nTimes: ${userData.times}`,
			);
		} else {
			const query = {
				guildId: String(interaction.guildId),
				userId: resolvedUserIdString,
			};
			// Get all user data across categories from database
			let userDatas: Users[];
			try {
				userDatas = await usersDb.find(query).toArray();
			} catch (dbErr) {
				const action = `fetching user data`;
				const context = `for user ${resolvedUserIdString}`;
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

			if (userDatas.length <= 0) {
				await responder.editResponse(
					`${
						resolvedUserIdString === String(interaction.user.id)
							? "You have"
							: `${resolvedUsername} has`
					} not used the bot`,
				);
				return;
			}

			await responder.editResponse(
				userDatas
					.map(
						(o) =>
							`**${o.cat}**\nLinks: ${
								o.links.join(
									", ",
								)
							}\nTimes: ${o.times}\n`,
					)
					.join("\n"),
			);
		}
	} catch (generalErr) {
		const action = `processing user command`;
		const context = `for user ${resolvedUserIdString}`;
		const responseMsgRest = ` error occurred while ${action}`;
		const loggerMsgRest = `${responseMsgRest} ${context}`;
		const responseMsg = `⚠️ An${responseMsgRest}`;
		logger.error(
			`An unexpected${loggerMsgRest}: ${generalErr}`,
		);
		await responder.editResponse(
			responseMsg,
		);
		return;
	}
}
