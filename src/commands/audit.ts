import {
	type ActionRow,
	type ButtonComponent,
	type Embed,
	type Interaction,
} from "@discordeno/bot";
import { ApplicationCommandTypes, MessageFlags } from "@discordeno/bot";
import { ButtonStyles, MessageComponentTypes } from "@discordeno/types";

import { MongoError, MongoServerError } from "mongodb";
import { linksDb } from "$db";
import type { Links } from "../types/db.d.ts";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";
import type { BotWithCache } from "../bot.ts";

import mainConfig from "../../config.ts";
import { getGuildConfig } from "../util/configManager.ts";
import type { GuildConfig } from "../types/guildConfig.d.ts";

import { createPaginator } from "../util/pagination.ts";

/**
 * Command data for the `/audit` command
 */
export const data = {
	name: "audit",
	description: "Views the audit log for this server (requires bot admin)",
	type: ApplicationCommandTypes.ChatInput,
	options: [], // No options, shows recent log entries
	dmPermission: false,
};

/**
 * Whether this command can only be run by administrators
 */
export const adminOnly = true;

interface LinkIncident {
	link: string;
	category: string;
	otherGuilds: {
		guildId: string;
		category: string;
	}[];
}

export async function handle(
	bot: BotWithCache,
	interaction: Interaction,
	logger: PrefixedLogger,
): Promise<void> {
	const responder = new Responder(bot, interaction.id, interaction.token, logger);

	if (!interaction.guildId) {
		await responder.respond("This command can only be used in a server!");
		return;
	}

	await responder.defer(MessageFlags.Ephemeral);
	const currentGuildId = String(interaction.guildId);
	const rawGuildConfig = await getGuildConfig(currentGuildId);
	const guildConfig: GuildConfig = {
		...rawGuildConfig,
		guildId: currentGuildId,
	};

	try {
		logger.info(`Starting link audit for guild ${currentGuildId}`);

		// Get all links in current guild for audit
		let currentGuildLinks: Links[];
		try {
			currentGuildLinks = await linksDb.find({
				guildId: currentGuildId,
			}).toArray();
		} catch (dbErr) {
			const action = `fetching current guild links`;
			const context = `for guild ${currentGuildId}`;
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

		if (currentGuildLinks.length === 0) {
			await responder.editResponse(
				"No links found in this server to audit!",
			);
			return;
		}

		logger.info(
			`Found ${currentGuildLinks.length} links to check in guild ${currentGuildId}`,
		);

		const incidents: LinkIncident[] = [];

		for (const linkDoc of currentGuildLinks) {
			// Check if link exists in other guilds
			let otherGuildsWithLink: { guildId: string }[];
			try {
				otherGuildsWithLink = await linksDb.find({
					link: linkDoc.link,
					guildId: { $ne: currentGuildId },
				}).project<{ guildId: string }>({ guildId: 1 }).toArray();
			} catch (dbErr) {
				const action = `checking for link in other guilds`;
				const details = `for link '${linkDoc.link}'`;
				const context = `from guild ${currentGuildId}`;
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

			if (otherGuildsWithLink.length > 0) {
				incidents.push({
					link: linkDoc.link,
					category: linkDoc.cat,
					otherGuilds: otherGuildsWithLink.map((g) => ({
						guildId: g.guildId,
						category: "unknown",
					})),
				});
			}
		}

		if (incidents.length === 0) {
			await responder.editResponse(
				"✅ All good! None of your links appear in other servers",
			);
			return;
		}

		logger.info(
			`Found ${incidents.length} potential link leaks in guild ${currentGuildId}`,
		);

		await createPaginator<LinkIncident>({
			bot,
			interaction,
			logger,
			data: incidents,
			itemsPerPage: 1,
			embedGenerator: (incident, bot, logger, currentPage, totalPages) =>
				createAuditEmbed(
					incident,
					bot,
					logger,
					currentPage,
					totalPages,
					guildConfig,
				),
			itemSpecificActionRowGenerator: (
				incident: LinkIncident | undefined,
			): ActionRow | undefined => {
				if (!incident) {
					return undefined;
				}

				const buttons: ButtonComponent[] = [
					{
						type: MessageComponentTypes.Button,
						style: ButtonStyles.Danger,
						label: "Report To Bot Devs",
						customId: `audit_report_link_leaking_${
							btoa(incident.link).substring(0, 90)
						}`,
					},
				];

				return {
					type: MessageComponentTypes.ActionRow,
					components: buttons as any,
				};
			},
			noDataMessage: "No link incidents found",
			buttonLabels: {
				previous: "◀ Previous Incident",
				next: "Next Incident ▶",
			},
			defer: false,
		});
	} catch (generalErr) {
		const action = `processing audit command`;
		const context = `for guild ${currentGuildId}`;
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

/**
 * Creates an embed for displaying a link incident
 * @param incident The link incident to display
 * @param bot The bot instance
 * @param logger The logger instance
 * @param currentPage The current page number
 * @param totalPages The total number of pages
 * @param guildConfig The guild configuration
 * @returns The embed for the incident
 */
async function createAuditEmbed(
	incident: LinkIncident | undefined,
	bot: BotWithCache,
	_logger: PrefixedLogger,
	currentPage: number,
	totalPages: number,
	guildConfig: GuildConfig,
): Promise<Embed> {
	if (!incident) {
		return {
			title: "Link Audit - Error",
			description: "No incident data available for this page",
			color: parseInt(guildConfig.theme.error_color, 16),
		};
	}

	const link = incident.link;

	// Create the description with basic info and other guilds
	let description =
		`**Link:** ${link}\n**Category:** ${incident.category}\n\n`;
	description +=
		`**This link appears in ${incident.otherGuilds.length} other server(s):**\n`;

	// List the other guilds where this link appears
	for (let i = 0; i < incident.otherGuilds.length; i++) {
		const otherGuild = incident.otherGuilds[i];
		let guildInfo = `${i + 1}. Guild ID: ${otherGuild.guildId}`;

		// Try to get guild name if the bot is in the guild
		try {
			const botWithCache = bot as any;
			const guild = botWithCache.cache?.guilds?.get?.(
				BigInt(otherGuild.guildId),
			);
			if (guild && guild.name) {
				guildInfo += ` (${guild.name})`;
			}
		} catch (_e) {
			// Ignore errors in getting guild name
		}

		guildInfo += ` - Category: ${otherGuild.category}`;
		description += `${guildInfo}\n`;
	}

	description +=
		"\n**This may indicate link leaking. You can report this to the bot developers using the button below.**";

	const embedToSend: Embed = {
		title: "Link Audit - Potential Leak Detected",
		description,
		color: parseInt(guildConfig.theme.warning_color, 16),
		footer: {
			text: `Incident ${currentPage} of ${totalPages}`,
		},
	};

	return embedToSend;
}
