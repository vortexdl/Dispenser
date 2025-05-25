import { type Embed, type Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
	MessageFlags,
} from "@discordeno/bot";
import type { BotWithCache } from "../bot.ts";

import { MongoError, MongoServerError } from "mongodb";
import { usersDb } from "$db";
import type { Users } from "../types/db.d.ts";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

import { createPaginator } from "../util/pagination.ts";

/**
 * Command data for the `/history` command
 */
export const data = {
	name: "history",
	description: "Shows your link request history in this guild or DMs",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			type: ApplicationCommandOptionTypes.String,
			name: "category",
			description: "Filter history by a specific category (optional)",
			required: false,
			autocomplete: true,
		},
	],
	dmPermission: true, // Allow checking history in DMs
};

/**
 * Whether this command can only be run by administrators
 */
export const adminOnly = false; // History is user-specific, not admin-only

/**
 * Interface for user link history data
 */
interface UserLinkHistory {
	guildId: string;
	category: string;
	links: string[];
	times: number;
}

/**
 * Interface for paginated history data
 */
interface HistoryPage {
	items: UserLinkHistory[];
	startIndex: number;
	endIndex: number;
}

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

	try {
		// Get the category filter if provided
		const categoryFilter = interaction.data?.options?.find(
			(opt) => opt.name === "category",
		)?.value as string | undefined;

		// Get all user data across all guilds and categories
		const userId = String(interaction.user.id);
		const query: { userId: string; cat?: string } = { userId };

		// Add category filter to query if provided
		if (categoryFilter) {
			query.cat = categoryFilter;
		}

		// Get user history from database
		let userHistory: Users[];
		try {
			userHistory = await usersDb.find(query).toArray();
		} catch (dbErr) {
			const action = `fetching user history`;
			const details = categoryFilter ? `for category '${categoryFilter}'` : `across all categories`;
			const context = `for user ${userId}`;
			const responseMsgRest = ` error occurred while ${action}`;
			const loggerMsgRest = `${responseMsgRest} ${details} ${context}`;
			const responseMsg = `⚠️ An${responseMsgRest}`;
			if (
				dbErr instanceof MongoError || dbErr instanceof MongoServerError
			) {
				logger.error(
					`A database${loggerMsgRest}: ${dbErr}`,
				);
				await responder.respond(
					responseMsg,
				);
				return;
			} else {
				logger.error(
					`An unexpected${loggerMsgRest}: ${dbErr}`,
				);
				await responder.respond(
					responseMsg,
				);
				return;
			}
		}

		if (userHistory.length === 0) {
			if (categoryFilter) {
				await responder.respond(
					`You have not requested any links in the "${categoryFilter}" category!`,
				);
			} else {
				await responder.respond(
					"You have not requested any links yet!",
				);
			}
			return;
		}

		// Transform the data for pagination
		const historyData: UserLinkHistory[] = userHistory.map((
			entry: Users,
		) => ({
			guildId: entry.guildId,
			category: entry.cat,
			links: entry.links,
			times: entry.times,
		}));

		// Sort by times (most used first)
		historyData.sort((a, b) => b.times - a.times);

		// Create pages with 5 items each
		const itemsPerPage = 5;
		const pages: HistoryPage[] = [];
		for (let i = 0; i < historyData.length; i += itemsPerPage) {
			pages.push({
				items: historyData.slice(i, i + itemsPerPage),
				startIndex: i,
				endIndex: Math.min(
					i + itemsPerPage - 1,
					historyData.length - 1,
				),
			});
		}

		// Create paginated embed
		await createPaginator({
			bot,
			interaction,
			logger,
			data: pages,
			itemsPerPage: 1, // One page object per page
			embedGenerator: (
				page,
				bot,
				logger,
				currentPage,
				totalPages,
				originalInteraction,
			) => createHistoryEmbed(
				page,
				bot,
				logger,
				currentPage,
				totalPages,
				originalInteraction,
				categoryFilter,
			),
			noDataMessage: "No link history found",
			buttonLabels: {
				previous: "◀ Previous",
				next: "Next ▶",
			},
			defer: true,
		});
	} catch (generalErr) {
		const action = `processing history command`;
		const context = `for user ${interaction.user.id}`;
		const responseMsgRest = ` error occurred while ${action}`;
		const loggerMsgRest = `${responseMsgRest} ${context}`;
		const responseMsg = `⚠️ An${responseMsgRest}`;
		logger.error(
			`An unexpected${loggerMsgRest}: ${generalErr}`,
		);
		await responder.respond(
			responseMsg,
		);
		return;
	}
}

/**
 * Creates an embed for displaying user link history
 */
async function createHistoryEmbed(
	page: HistoryPage | undefined,
	bot: BotWithCache,
	_logger: Logger,
	currentPage: number,
	totalPages: number,
	originalInteraction: Interaction,
	categoryFilter?: string,
): Promise<Embed> {
	if (!page || !page.items || page.items.length === 0) {
		return {
			title: "Link History",
			description: "No link history found for this page",
			color: 0xFF0000,
		};
	}

	// Get all user history for total stats
	const userId = String(originalInteraction.user.id);
	const query: { userId: string; cat?: string } = { userId };
	if (categoryFilter) {
		query.cat = categoryFilter;
	}
	// Get total user history stats from database
	let allHistory: Users[];
	try {
		allHistory = await usersDb.find(query).toArray();
	} catch (dbErr) {
		// For embed function, we'll return a basic error embed instead of throwing
		return {
			title: "Link History - Error",
			description: "Failed to fetch history data from database",
			color: 0xFF0000,
		};
	}
	const totalLinks = allHistory.reduce(
		(sum, item) => sum + item.links.length,
		0,
	);
	const totalRequests = allHistory.reduce((sum, item) => sum + item.times, 0);
	const totalCategories = categoryFilter
		? 1
		: new Set(allHistory.map((item) => item.cat)).size;

	// Build description with categories and their links
	let description = "";
	for (const item of page.items) {
		// Get guild name if possible
		let guildName = "Unknown Server";
		try {
			const guild = await bot.helpers.getGuild(BigInt(item.guildId))
				.catch(() => null);
			if (guild && "name" in guild && typeof guild.name === "string") {
				guildName = guild.name;
			}
		} catch {
			// Guild might not be accessible
		}

		description += `**${item.category}** (${guildName})\n`;
		description += `Times Requested: ${item.times}\n`;

		if (item.links.length > 0) {
			// Show first 3 links, truncate if too many
			const linksToShow = item.links.slice(0, 3);
			const remainingCount = item.links.length - linksToShow.length;

			linksToShow.forEach((link) => {
				// Truncate long links
				const displayLink = link.length > 50
					? link.substring(0, 47) + "..."
					: link;
				description += `• ${displayLink}\n`;
			});

			if (remainingCount > 0) {
				description += `• *...and ${remainingCount} more*\n`;
			}
		} else {
			description += "• No links recorded\n";
		}

		description += "\n";
	}

	const title = categoryFilter
		? `Your Link History - "${categoryFilter}" Category`
		: "Your Link Request History";

	return {
		title,
		description: description.trim(),
		color: 0x7289DA,
		fields: [
			{
				name: "Total Statistics",
				value:
					`Categories Used: ${totalCategories}\nTotal Links: ${totalLinks}\nTotal Requests: ${totalRequests}`,
				inline: false,
			},
		],
		footer: {
			text: `Page ${currentPage} of ${totalPages} • Showing items ${
				page.startIndex + 1
			}-${page.endIndex + 1}`,
		},
	};
}
