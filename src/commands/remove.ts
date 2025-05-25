import type { Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
	MessageFlags,
} from "@discordeno/bot";
import type { BotWithCache } from "../bot.ts";

import { MongoError, MongoServerError, type DeleteResult } from "mongodb";
import { catsDb, linksDb } from "$db";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

/**
 * Command data for the `/remove` command
 */
export const data = {
	name: "remove",
	description: "Remove a link from a category (admin only)",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			name: "category",
			description: "The category to remove the link from",
			type: ApplicationCommandOptionTypes.String,
			required: true,
			autocomplete: true,
		},
		{
			name: "link_name",
			description: "The name of the link to remove",
			type: ApplicationCommandOptionTypes.String,
			required: true,
			// Autocomplete for link_name could be dynamic based on selected category
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

	const category = interaction.data?.options?.find((opt) =>
		opt.name === "category"
	)?.value as string;
	const linkName = interaction.data?.options?.find((opt) =>
		opt.name === "link_name"
	)?.value as string;
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
	if (!category) {
		logger.warn("Missing category");
		await responder.editResponse("The category is required!");
		return;
	}
	if (!linkName) {
		logger.warn("Missing link name");
		await responder.editResponse("The link name is required!");
		return;
	}

	// Remove link from linksDb
	let deleteResult: DeleteResult;
	try {
		deleteResult = await linksDb.deleteOne({
			guildId: String(interaction.guildId),
			cat: category,
			name: linkName,
		});
	} catch (dbErr) {
		const action = `removing the link`;
		const details = `'${linkName}' from category '${category}'`;
		const context = `in guild ${interaction.guildId}`;
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

	if (deleteResult && deleteResult.deletedCount > 0) {
		logger.info(
			`Link '${linkName}' removed from category '${category}' in guild ${interaction.guildId}`,
		);
		await responder.editResponse(
			`Link '${linkName}' has been removed from category '${category}' ✅`,
		);

		// Check if category is empty and remove it if so
		let remainingLinksInCategory: number;
		try {
			remainingLinksInCategory = await linksDb.countDocuments({
				guildId: String(interaction.guildId),
				cat: category,
			});
		} catch (dbErr) {
			const action = `counting remaining links`;
			const details = `in category '${category}'`;
			const context = `for guild ${interaction.guildId}`;
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

		if (remainingLinksInCategory === 0) {
			// Remove empty category from catsDb
			try {
				await catsDb.deleteOne({
					guildId: String(interaction.guildId),
					name: category,
				});
				logger.info(
					`Category '${category}' was empty and has been removed from guild ${interaction.guildId}`,
				);
			} catch (dbErr) {
				const action = `removing empty category`;
				const details = `'${category}'`;
				const context = `from guild ${interaction.guildId}`;
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
	} else {
		logger.warn(
			`Link '${linkName}' not found in category '${category}' or guild ${interaction.guildId}`,
		);
		await responder.editResponse(
			`Link '${linkName}' not found in category '${category}'!`,
		);
	}
}
