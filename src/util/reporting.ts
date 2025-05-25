import { Bot, Embed, Interaction } from "@discordeno/bot";
import { err, ok, Result } from "neverthrow";

import type { GuildConfig } from "../types/guildConfig.d.ts";
import type ConfigTypes from "../types/config.d.ts";

import { Logger } from "./Logger.ts";
import Responder from "./Responder.ts";

/**
 * Options for sending a report
 */
export interface SendReportOptions {
	/** The bot instance */
	bot: Bot;
	/** The interaction that triggered the report */
	interaction: Interaction;
	/** The subject of the report */
	subject: string;
	/** Detailed information about the report */
	details: string;
	/** The guild configuration, if available */
	guildConfig: GuildConfig | null;
	/** The main application configuration */
	config: ConfigTypes.config;
	/** Optional ID of the item being reported (e.g., message ID, user ID) */
	itemId?: string;
	/** Optional URL of an attachment related to the report */
	attachmentUrl?: string;
	/** Optional URL of a link related to the report */
	linkUrl?: string;
	// Add a field for the original responder if needed, or pass interaction to create a new one
}

/**
 * @name sendReport
 * @description Handles the creation and dispatching of reports
 * @param options The options for sending the report
 * @param logger An initialized Logger instance
 * @returns A Result indicating successful submission or an error
 */
export async function sendReport(
	options: SendReportOptions,
	logger: Logger,
): Promise<Result<void, Error>> {
	try {
		const {
			bot,
			interaction,
			subject,
			details,
			guildConfig,
			config,
			itemId,
			attachmentUrl,
			linkUrl,
		} = options;

		const responder = new Responder(bot, interaction.id, interaction.token, logger);

		const user = interaction.user;

		const reportEmbedObject: Embed = {
			type: "rich",
			title: `Report: ${subject}`,
			description: `**Details:**\n${details}${
				itemId ? `\n**Item ID:** ${itemId}` : ""
			}${
				linkUrl
					? `\n**Reported Link:** ${linkUrl}`
					: ""
			}\n\nReported by: <@${user.id}> (${user.id})`,
			// color: transformColor(config.colors.default) ?? undefined, // For Embed type (number)
			author: {
				name: `${user.username ?? "Unknown User"}`,
				iconUrl:
					`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`,
			},
			footer: {
				text: `Guild ID: ${interaction.guildId ?? "N/A"}`,
			},
		};

		if (attachmentUrl) reportEmbedObject.image = { url: attachmentUrl };

		const embedToSendForMessage = {
			...reportEmbedObject,
		};

		let guildReportChannelId = guildConfig?.reportsChannelId ?? null;
		let messageSentToGuildChannel = false;
		let messageSentToDevChannel = false;
		const devIssuesChannelId = config.logging.botIssuesChannelId;
		const devLinkLeakingChannelId =
			config.logging.developerLogChannelLinkLeakingId;

		if (subject === "Link Leaking" && devLinkLeakingChannelId) {
			try {
				await bot.helpers.sendMessage(devLinkLeakingChannelId, {
					embeds: [embedToSendForMessage],
				});
				messageSentToDevChannel = true;
				logger.info(
					`Link Leaking report by ${user.id} sent to link leaking log channel ${devLinkLeakingChannelId}`,
				);
			} catch (error: unknown) {
				const errorMsg =
					`Failed to send Link Leaking report to channel ${devLinkLeakingChannelId}`;
				logger.error(errorMsg, { error });
				return err(
					new Error(
						`${errorMsg}: ${
							error instanceof Error
								? error.message
								: String(error)
						}`,
					),
				);
			}
		} else if (guildReportChannelId) {
			try {
				await bot.helpers.sendMessage(guildReportChannelId, {
					embeds: [embedToSendForMessage],
				});
				messageSentToGuildChannel = true;
				logger.info(
					`Report (${subject}) by ${user.id} sent to guild channel ${guildReportChannelId}`,
				);
			} catch (error: unknown) {
				logger.error(
					`Failed to send report to guild channel ${guildReportChannelId}`,
					{ error },
				);
				// Prevents trying to link to it in the confirmation
				guildReportChannelId = null;
			}
		}

		if (subject === "Bot Issue" && devIssuesChannelId) {
			try {
				await bot.helpers.sendMessage(devIssuesChannelId, {
					embeds: [embedToSendForMessage],
				});
				messageSentToDevChannel = true;
				logger.info(
					`Bot Issue report by ${user.id} also sent to dev channel ${devIssuesChannelId}`,
				);
			} catch (error: unknown) {
				const errorMsg =
					`Failed to send Bot Issue report to dev channel ${devIssuesChannelId}`;
				logger.error(errorMsg, { error });
				return err(
					new Error(
						`${errorMsg}: ${
							error instanceof Error
								? error.message
								: String(error)
						}`,
					),
				);
			}
		}

		// Form the confirmation message
		let confirmationMessage = "Your report has been submitted";
		const serverHasConfiguredChannel = guildConfig?.reportsChannelId &&
			guildReportChannelId;
		if (subject === "Link Leaking") {
			if (messageSentToDevChannel) {
				confirmationMessage +=
					" to the bot development team for review";
			} else {
				confirmationMessage +=
					", but there was an issue delivering it to the bot development team. Please try again later or contact a bot developer directly";
			}
		} else if (messageSentToGuildChannel && serverHasConfiguredChannel) {
			confirmationMessage +=
				` and sent to the server's report channel (<#${guildConfig.reportsChannelId}>)`;
		} else if (
			subject !== "Bot Issue" &&
			!serverHasConfiguredChannel &&
			guildConfig
		) {
			// If it's not a bot issue, no guild channel was configured (or failed to send)
			// and we are in a guild context (guildConfig exists)
			confirmationMessage +=
				". However, the server administrators have not configured a report channel, or there was an issue sending to it. Your report may not be seen by them";
		} else if (subject !== "Bot Issue" && !guildConfig) {
			// If it's not a bot issue and not in a guild context (e.g. DM report if that were possible)
			// This case might not be reachable with current command structure but good for robustness
			confirmationMessage +=
				". This report was not submitted to a server-specific channel";
		}
		if (
			subject === "Bot Issue" &&
			messageSentToDevChannel &&
			devIssuesChannelId
		) {
			confirmationMessage += messageSentToGuildChannel ||
					(subject !== "Bot Issue" &&
						!serverHasConfiguredChannel &&
						guildConfig &&
						subject !== "Link Leaking")
				? " and"
				: "";
			confirmationMessage += ` to the bot development team`;
		} else if (
			!messageSentToGuildChannel &&
			!messageSentToDevChannel &&
			subject !== "Link Leaking"
		) {
			// If not sent anywhere (e.g. Bot Issue, but dev channel failed, and no guild channel)
			confirmationMessage =
				"Your report was submitted, but could not be delivered to any reporting channels at this time. This is a significant issue, and the bot devs investigate it as soon";
		}
		confirmationMessage += ".";

		await responder.respond(confirmationMessage);
		return ok(undefined);
	} catch (error) {
		if (error instanceof Error) {
			const errorMsg = `Error in sendReport: ${error.message}`;
			logger.error(errorMsg, { error });
			return err(new Error(errorMsg));
		} else {
			const errorMsg = `Unknown error in sendReport: ${String(error)}`;
			logger.error(errorMsg, { error });
			return err(new Error(errorMsg));
		}
	}
}
