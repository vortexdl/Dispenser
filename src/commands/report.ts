import { type Attachment, type Bot, type Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
	FileContent,
	MessageFlags,
} from "@discordeno/bot";

import { botBansDb } from "$db";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

import mainConfig from "../../config.ts";
import { getGuildConfig } from "../util/configManager.ts";

import { sendReport } from "../util/reporting.ts";
import { parseCommandOptions } from "../util/commandUtils.ts";

/**
 * Command data for the /report command
 */
export const data = {
	name: "report",
	description: "Report an issue, user, or server to the bot administrators",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			name: "type",
			description: "What are you reporting?",
			type: ApplicationCommandOptionTypes.String,
			required: true,
			choices: [
				{
					name: "Issue with the bot (bugs, suggestions)",
					value: "bot_issue",
				},
				{ name: "A user's behavior", value: "user_behavior" },
				{
					name:
						"A server (e.g., inappropriate content, link leaking)",
					value: "server_issue",
				},
				{ name: "A specific link or message", value: "item_issue" },
				{ name: "Other", value: "other" },
			],
		},
		{
			name: "details",
			description:
				"Please provide as much detail as possible about the report",
			type: ApplicationCommandOptionTypes.String,
			required: true,
		},
		{
			name: "target_id_or_link",
			description:
				"ID or link related to user, server, message, or item (if applicable)",
			type: ApplicationCommandOptionTypes.String,
			required: false,
		},
		{
			name: "attachment",
			description:
				"Optional: Attach an image/file for context (e.g., screenshot)",
			type: ApplicationCommandOptionTypes.Attachment,
			required: false,
		},
		{
			name: "leaked_link_url",
			description:
				"If reporting server for link leaking, the specific URL that was leaked",
			type: ApplicationCommandOptionTypes.String,
			required: false,
			// Autocomplete could be added here if we have a way to suggest relevant links
		},
	],
	dmPermission: true, // Reports can be made from DMs
};

/**
 * Whether this command can only be run by administrators
 */
export const adminOnly = false; // Reports are for all users

export async function handle(
	bot: Bot,
	interaction: Interaction,
	logger: PrefixedLogger,
	bearerToken: string,
): Promise<void> {
	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	const options = parseCommandOptions(interaction.data?.options);

	const subject = options.subject as string;
	const details = options.details as string;
	const itemId = options.item_id as string | undefined;
	const attachmentId = options.attachment as string | undefined;
	const linkUrl = options.link as string | undefined;

	let attachmentUrl: string | undefined;
	let attachmentObject: Attachment | undefined;

	if (attachmentId && interaction.data?.resolved?.attachments) {
		attachmentObject = interaction.data.resolved.attachments.get(
			BigInt(attachmentId),
		);
		if (attachmentObject?.proxyUrl) {
			attachmentUrl = attachmentObject.proxyUrl;
		} else if (attachmentObject?.url) {
			attachmentUrl = attachmentObject.url;
		}
	}

	logger.info(
		`Report command initiated by ${interaction.user.id} in guild ${
			interaction.guildId ?? "DM"
		} with subject: ${subject}`,
	);

	// User Banned Check (Bot-level ban)
	if (interaction.guildId) {
		try {
			const banRecord = await botBansDb.findOne({
				userId: String(interaction.user.id),
				guildId: String(interaction.guildId),
			});
			if (banRecord) {
				await responder.respond(
					"You are currently banned from using this bot's features in this server",
				);
				logger.info(
					`User ${interaction.user.id} attempted to use /report but is bot-banned in guild ${interaction.guildId}`,
				);
				return;
			}
		} catch (error: unknown) {
			logger.error("Failed to check bot ban status for report command", {
				userId: interaction.user.id,
				guildId: interaction.guildId,
				error,
			});
			await responder.respond(
				"Could not verify your ban status due to an internal error. Please try again",
			);
			return;
		}
	} else {
		// It makes no sense to report a link from a DM, so we don't allow it, only bot issues
		if (subject !== "Bot Issue") {
			await logger.info(
				`User ${interaction.user.id} attempted to make a non-'Bot Issue' report from DMs`,
			);
			await responder.respond(
				"This type of report can only be made from within a server",
			);
			return;
		}
	}

	if (subject === "Link Leaking" && !linkUrl) {
		await responder.respond(
			"When reporting 'Link Leaking', the 'link' option specifying the URL is required",
		);
		return;
	}
	if (subject !== "Link Leaking" && linkUrl) {
		await responder.respond(
			"The 'link' option is only applicable when the report subject is 'Link Leaking'",
		);
		return;
	}

	await responder.defer(MessageFlags.Ephemeral);

	try {
		const rawGuildConfig = interaction.guildId
			? await getGuildConfig(String(interaction.guildId))
			: null;

		const guildConfig = rawGuildConfig && interaction.guildId
			? { ...rawGuildConfig, guildId: String(interaction.guildId) }
			: null;

		const reportResult = await sendReport({
			bot,
			interaction,
			subject,
			details,
			// This can be null if in DMs
			guildConfig,
			config: mainConfig,
			itemId,
			attachmentUrl,
			linkUrl,
		}, logger);

		if (reportResult.isErr()) {
			logger.error("Failed to send report", {
				error: reportResult.error,
			});
			await responder.editResponse(
				"An error occurred while processing your report. Please try again later",
			).catch((e: unknown) =>
				logger.error("Failed to send error reply for report", { e })
			);
		}
	} catch (error: unknown) {
		logger.error("Error processing report command", { error });
		// sendReport should handle its own errors and user feedback for delivery issues
		// This catch is for unexpected errors in the command handler itself before/after calling sendReport
		// or if sendReport itself throws an unhandled exception (which it shouldn't)
		await responder.editResponse(
			"An unexpected error occurred while trying to process your report. Please try again later",
		).catch((e: unknown) =>
			logger.error("Failed to send error reply for report", { e })
		);
	}
}
