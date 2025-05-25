import type { Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
	MessageFlags,
} from "@discordeno/bot";
import type { BotWithCache } from "../bot.ts";

import { MongoError, MongoServerError, type UpdateResult } from "mongodb";
import { catsDb, linksDb } from "$db";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

/**
 * Command data for the /rename command
 */
export const data = {
	name: "rename",
	description: "Rename a category or a link within a category (admin only)",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			name: "type",
			description: "What to rename: category or link",
			type: ApplicationCommandOptionTypes.String,
			required: true,
			choices: [
				{ name: "Category", value: "category" },
				{ name: "Link", value: "link" },
			],
		},
		{
			name: "old_name",
			description: "The current name of the category or link",
			type: ApplicationCommandOptionTypes.String,
			required: true,
			autocomplete: true,
		},
		{
			name: "new_name",
			description: "The new name for the category or link",
			type: ApplicationCommandOptionTypes.String,
			required: true,
		},
		{
			name: "category_context",
			description:
				"The category of the link to rename (if renaming a link)",
			type: ApplicationCommandOptionTypes.String,
			required: false,
			autocomplete: true,
		},
		{
			name: "ephemeral",
			description: "Whether the response should be visible only to you",
			type: ApplicationCommandOptionTypes.Boolean,
			required: false,
			choices: [{ name: "True", value: true }, {
				name: "False",
				value: false,
			}],
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

	const type = interaction.data?.options?.find((opt) => opt.name === "type")
		?.value as string;
	const oldName = interaction.data?.options?.find((opt) =>
		opt.name === "old_name"
	)?.value as string;
	const newName = interaction.data?.options?.find((opt) =>
		opt.name === "new_name"
	)?.value as string;
	const categoryContext = interaction.data?.options?.find((opt) =>
		opt.name === "category_context"
	)?.value as string | undefined;
	const ephemeralOption =
		interaction.data?.options?.find((opt) => opt.name === "ephemeral")
			?.value as boolean ?? false;

	await responder.defer(ephemeralOption ? MessageFlags.Ephemeral : undefined);

	if (!interaction.guildId) {
		logger.warn("Command used outside of a guild");
		await responder.editResponse(
			"This command can only be used in a server.",
		);
		return;
	}
	const guildId = String(interaction.guildId);

	if (!type) {
		logger.warn("The option 'type' is missing");
		await responder.editResponse(
			"⚠️ Unexpectedly missing option 'type'",
		);
		return;
	}
	if (!oldName) {
		logger.warn("The option 'old_name' is missing");
		await responder.editResponse(
			"⚠️ Unexpectedly missing option 'old_name'",
		);
		return;
	}
	if (!newName) {
		logger.warn("The option 'new_name' is missing");
		await responder.editResponse(
			"⚠️ Unexpectedly missing option 'new_name'",
		);
		return;
	}

	if (type === "category") {
		// Rename category in categoriesDb
		let categoryUpdateResult: UpdateResult;
		try {
			categoryUpdateResult = await catsDb.updateOne(
				{ guildId, name: oldName },
				{ $set: { name: newName } },
			);
		} catch (dbErr) {
			const action = `renaming category`;
			const details = `'${oldName}' to '${newName}'`;
			const context = `for guild ${guildId}`;
			const msgRest =
				` error occured while ${action} ${details} ${context}`;
			if (
				dbErr instanceof MongoError || dbErr instanceof MongoServerError
			) {
				logger.error(
					`A database${msgRest}`,
					dbErr,
				);
				await responder.editResponse(
					`⚠️ An error occurred while renaming`,
				);
				return;
			} else {
				logger.error(
					`An unexpected${msgRest}: ${dbErr}`,
				);
				await responder.editResponse(
					`⚠️ An unexpected error occurred while renaming`,
				);
				return;
			}
		}
		// Rename category in all associated links
		let linksUpdateResult: UpdateResult;
		try {
			linksUpdateResult = await linksDb.updateMany(
				{ guildId, cat: oldName },
				{ $set: { cat: newName } },
			);
		} catch (dbErr) {
			const action = `renaming links`;
			const context = `in category '${oldName}' for guild ${guildId}`;
			const responseMsgRest = ` error occured while ${action}`;
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
		if (
			categoryUpdateResult.matchedCount > 0 ||
			linksUpdateResult.matchedCount > 0
		) {
			logger.info(
				`Category '${oldName}' renamed to '${newName}' in guild ${guildId}\n\tCategories updated: ${categoryUpdateResult.modifiedCount}\n\tLinks updated: ${linksUpdateResult.modifiedCount}`,
			);
			await responder.editResponse(
				`Category '${oldName}' has been renamed to '${newName}'. ` +
					`${linksUpdateResult.modifiedCount} link(s) updated.`,
			);
		} else {
			logger.warn(
				`Category '${oldName}' not found for rename in guild ${guildId}`,
			);
			await responder.editResponse(
				`Category '${oldName}' not found`,
			);
		}
	} else if (type === "link") {
		if (!categoryContext) {
			logger.warn("Missing category_context for renaming a link");
			await responder.editResponse(
				"Category context is required when renaming a link.",
			);
			return;
		}

		// Rename link in linksDb
		let linkUpdateResult: UpdateResult;
		try {
			linkUpdateResult = await linksDb.updateOne(
				{ guildId, cat: categoryContext, name: oldName },
				{ $set: { name: newName } },
			);
		} catch (dbErr) {
			const action = `renaming ${type}`;
			const details = `'${oldName}' to '${newName}'`;
			const context = `for guild ${guildId}`;
			if (
				dbErr instanceof MongoError || dbErr instanceof MongoServerError
			) {
				const msgNext = ` error occurred while ${action}`;
				const loggerMsgRest = ` ${details} ${context}`;
				logger.error(
					`A database${msgNext}${loggerMsgRest}`,
					dbErr,
				);
				await responder.editResponse(
					`⚠️ An${msgNext}`,
				);
				return;
			} else {
				logger.error(
					`An unexpected error occurred while ${action} ${details} ${context}`,
					dbErr,
				);
				await responder.editResponse(
					"⚠️ An unexpected error occurred while renaming",
				);
				return;
			}
		}
		if (linkUpdateResult.matchedCount > 0) {
			logger.info(
				`Link '${oldName}' in category '${categoryContext}' renamed to '${newName}' in guild ${guildId}`,
			);
			await responder.editResponse(
				`Link '${oldName}' in category '${categoryContext}' has been renamed to '${newName}'`,
			);
		} else {
			logger.warn(
				`Link '${oldName}' in category '${categoryContext}' not found for rename in guild ${guildId}`,
			);
			await responder.editResponse(
				`Link '${oldName}' not found in category '${categoryContext}'.`,
			);
		}
	} else {
		logger.warn(`Invalid type '${type}' for rename`);
		await responder.editResponse(
			"Invalid type specified. Choose 'category' or 'link'.",
		);
	}
}
