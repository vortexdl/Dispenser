import { type Bot, type Embed, type Interaction } from "@discordeno/bot";
import { ApplicationCommandTypes, MessageFlags } from "@discordeno/bot";

import { MongoError, MongoServerError } from "mongodb";
import { linksDb, usersDb } from "$db";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

import config from "../../config.ts";
import { getGuildConfig } from "../util/configManager.ts";

/**
 * Command data for the /stats command
 */
export const data = {
	name: "stats",
	description: "Display global statistics about the bot's usage",
	type: ApplicationCommandTypes.ChatInput,
	options: [],
	dmPermission: true,
};

/**
 * Whether this command can only be run by administrators
 */
export const adminOnly = false;

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

	await responder.defer(MessageFlags.Ephemeral);

	try {
		const stats = await collectStats(logger);

		const guildConfig = await getGuildConfig(String(config.bot.guildId));
		const mainColor = guildConfig.theme.main_color;

		const statsEmbed: Embed = {
			title: "Global Bot Statistics",
			description: "Current usage statistics for the bot",
			color: parseInt(`0x${mainColor}`),
			fields: [
				{
					name: "Total Servers",
					value: stats.totalGuilds.toString(),
					inline: true,
				},
				{
					name: "Total Users",
					value: stats.totalUsers.toString(),
					inline: true,
				},
				{
					name: "Total Links",
					value: stats.totalLinks.toString(),
					inline: true,
				},
				{
					name: "Most Proxy Sites",
					value: stats.topCategories,
					inline: false,
				},
			],
		};

		await responder.editResponseWithEmbed(statsEmbed);
	} catch (error) {
		logger.error("Failed to collect statistics", error);
		await responder.editResponse(
			"An error occurred while collecting statistics",
		);
	}
}

/**
 * Collects global statistics from the database
 */
async function collectStats(logger: PrefixedLogger): Promise<{
	totalGuilds: number;
	totalUsers: number;
	totalLinks: number;
	topCategories: string;
}> {
	try {
		const stats = {
			totalGuilds: 0,
			totalUsers: 0,
			totalLinks: 0,
			topCategories: "No proxy sites found",
		};

		stats.totalLinks = await linksDb.countDocuments({
			ignoreUndefined: true,
		});

		const uniqueGuilds = await linksDb.distinct("guildId");
		stats.totalGuilds = uniqueGuilds.length;

		const uniqueUsers = await usersDb.distinct("userId");
		stats.totalUsers = uniqueUsers.length;

		const categoryCounts = await linksDb
			.aggregate([
				{ $group: { _id: "$cat", count: { $sum: 1 } } },
				{ $sort: { count: -1 } },
				{ $limit: 5 },
			])
			.toArray();

		if (categoryCounts.length > 0) {
			stats.topCategories = categoryCounts
				.map(
					(cat, index) =>
						`${index + 1}. ${cat._id} (${cat.count} links)`,
				)
				.join("\n");
		}

		return stats;
	} catch (dbError) {
		if (
			dbError instanceof MongoError || dbError instanceof MongoServerError
		) {
			logger.error("");
		}
		logger.error("Stats: Error collecting statistics", dbError);
		throw dbError;
	}
}
