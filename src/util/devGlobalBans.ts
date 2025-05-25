// Ryan Wilson
// src/util/devGlobalBans.ts

import {
	type Bot,
	type Embed,
	type Guild,
	type Interaction,
} from "@discordeno/bot";
import { err, ok, type Result } from "neverthrow";

import { globalBansDb } from "$db";

import { getGuildConfig } from "./configManager.ts";
import mainConfig from "../../config.ts";

import type { PrefixedLogger } from "./Logger.ts";

/**
 * Represents a guild that is banned from the gallery, including ban details
 */
export interface BannedGalleryGuild extends Guild {
	/** The ID of the guild */
	guildId: string;
	/** The reason for the ban */
	banReason?: string;
	/** The ID of the user who issued the ban */
	bannedBy?: string;
	/** The timestamp of when the ban was issued */
	banTimestamp?: Date;
}

/**
 * Checks if a user is a bot developer
 * @param interaction The interaction to check
 * @returns Whether the user is a bot developer
 */
export async function isBotDeveloper(
	interaction: Interaction,
): Promise<boolean> {
	const botDeveloperIds = mainConfig.bot.botDeveloperIds;
	return botDeveloperIds.includes(String(interaction.user.id));
}

/**
 * Bans a server globally
 * @param serverId The ID of the server to ban
 * @param reason The reason for the ban
 * @param bannedBy The ID of the user who issued the ban
 * @param logger The logger instance
 * @returns A result with success message or error
 */
export async function banServerGlobally(
	serverId: string,
	reason: string,
	bannedBy: string,
	logger: PrefixedLogger,
): Promise<Result<string, string>> {
	try {
		// Check if server is already banned
		try {
			const existingBan = await globalBansDb.findOne({
				guildId: serverId,
			});
		} catch (err) {
			const msg =
				`Failed to check if server ${serverId} is already banned: ${err}`;
			logger.error(msg);
			return err(msg);
		}
		if (existingBan) {
			return err(
				`Server ${serverId} is already globally banned. Reason: ${existingBan.reason}`,
			);
		}

		// Record the ban in the database
		await globalBansDb.insertOne({
			guildId: serverId,
			reason,
			bannedBy,
			timestamp: new Date(),
		});

		logger.info(
			`Server ${serverId} globally banned by ${bannedBy}. Reason: ${reason}`,
		);
		return ok(
			`Server ${serverId} has been globally banned. Reason: ${reason}`,
		);
	} catch (error: unknown) {
		logger.error(`Error banning server ${serverId} globally`, { error });
		return err(
			"An error occurred while trying to ban the server. Please try again later",
		);
	}
}

/**
 * Removes a global ban from a server
 * @param serverId The ID of the server to unban
 * @param unbannedBy The ID of the user who removed the ban
 * @param logger The logger instance
 * @returns A result with success message or error
 */
export async function unbanServerGlobally(
	serverId: string,
	unbannedBy: string,
	logger: PrefixedLogger,
): Promise<Result<string, string>> {
	try {
		// Check if server is banned
		const existingBan = await globalBansDb.findOne({ guildId: serverId });
		if (!existingBan) {
			return err(`Server ${serverId} is not globally banned`);
		}

		// Remove the ban from the database
		try {
			await globalBansDb.deleteOne({ guildId: serverId });
		} catch (deleteError: unknown) {
			const msg =
				`Failed to remove the ban from the database: ${deleteError}`;
			logger.error(msg);
			return err(msg);
		}

		logger.info(`Server ${serverId} globally unbanned by ${unbannedBy}`);
		return ok(
			`Server ${serverId} has been removed from the global ban list`,
		);
	} catch (error: unknown) {
		logger.error(`Error unbanning server ${serverId} globally`, { error });
		return err(
			"An error occurred while trying to unban the server. Please try again later",
		);
	}
}

/**
 * Retrieves a list of banned guilds that the bot is in
 * @param bot The bot instance
 * @param logger The logger instance
 * @returns A result with array of banned guilds or error message
 */
export async function getBannedGuilds(
	bot: Bot,
	logger: PrefixedLogger,
): Promise<Result<BannedGalleryGuild[], string>> {
	try {
		// Get all globally banned servers
		const globalBans = await globalBansDb.find().toArray();

		if (globalBans.length === 0) {
			return err("There are no globally banned servers");
		}

		// Get all guilds the bot is in
		const botWithCache = bot as any;
		let allGuildsFromCache: Guild[] = [];

		try {
			const cachedGuildsCollection = botWithCache.cache?.guilds;
			if (
				cachedGuildsCollection &&
				typeof cachedGuildsCollection.values === "function"
			) {
				allGuildsFromCache = Array.from(
					cachedGuildsCollection.values(),
				);
			} else {
				logger.warn("BannedGallery: bot.cache.guilds is not available");
				return err(
					"Could not retrieve server list. The bot's cache might be unavailable",
				);
			}
		} catch (e: unknown) {
			logger.error("BannedGallery: Error accessing bot.cache.guilds", {
				error: e,
			});
			return err("An error occurred while fetching server data");
		}

		// Filter to only include guilds that are globally banned
		const bannedGuildIds = new Set(globalBans.map((ban) => ban.guildId));
		const bannedGuildsToDisplay: BannedGalleryGuild[] = [];

		// Create map of guild ID to ban info for quick lookup
		const banInfoMap = new Map(globalBans.map((ban) => [ban.guildId, {
			reason: ban.reason,
			bannedBy: ban.bannedBy,
			timestamp: ban.timestamp,
		}]));

		for (const guild of allGuildsFromCache) {
			if (bannedGuildIds.has(String(guild.id))) {
				const banInfo = banInfoMap.get(String(guild.id));
				const bannedGuildItem: BannedGalleryGuild = {
					...guild,
					guildId: String(guild.id),
					banReason: banInfo?.reason,
					bannedBy: banInfo?.bannedBy,
					banTimestamp: banInfo?.timestamp,
				};
				bannedGuildsToDisplay.push(bannedGuildItem);
			}
		}

		if (bannedGuildsToDisplay.length === 0) {
			return err("No banned servers found that the bot is currently in");
		}

		return ok(bannedGuildsToDisplay);
	} catch (error: unknown) {
		logger.error("Error retrieving banned guilds", { error });
		return err("An error occurred while retrieving banned guilds");
	}
}

/**
 * Creates the embed for the banned server gallery
 * @param guild The banned guild to display
 * @param bot The bot instance
 * @param logger The logger instance
 * @param currentPage The current page number
 * @param totalPages The total number of pages
 * @param originalInteraction The original interaction
 * @returns The embed for the banned gallery
 */
export async function createBannedGalleryEmbed(
	guild: BannedGalleryGuild | undefined,
	bot: Bot,
	logger: Logger,
	currentPage: number,
	totalPages: number,
): Promise<Embed> {
	if (!guild) {
		return {
			title: "Banned Server Gallery - Error",
			description: "No server data available for this page",
			color: 0xFF0000,
		};
	}

	const config = await getGuildConfig(String(guild.id));
	const color = 0xFF0000; // Red color for banned servers

	let descriptionText = guild.description
		? `*${guild.description.replace(/\r\n|\r|\n/g, "\n")}*\n\n`
		: "";
	descriptionText += `**ID:** ${guild.id}`;
	descriptionText += `\n**Members:** ${guild.memberCount ?? "N/A"}`;

	// Add ban info
	descriptionText += `\n\n**Ban Reason:** ${
		guild.banReason ?? "Link leaking"
	}`;

	if (guild.bannedBy) {
		let bannerDisplay = guild.bannedBy;
		try {
			const bannerUser = await bot.helpers.getUser(
				BigInt(guild.bannedBy),
			);
			if (bannerUser) {
				// Cast to any to access properties safely
				const bannerUserAny = bannerUser as any;

				// Try to get the username if available
				if (bannerUserAny.username) {
					bannerDisplay =
						`${bannerUserAny.username} (${guild.bannedBy})`;
				}
			}
		} catch (_e) { /* Fallback to just the ID if error */ }
		descriptionText += `\n**Banned By:** ${bannerDisplay}`;
	}

	if (guild.banTimestamp) {
		descriptionText +=
			`\n**Ban Date:** ${guild.banTimestamp.toLocaleString()}`;
	}

	let ownerDisplay = `ID: ${guild.ownerId ?? "Unknown Owner"}`;
	if (guild.ownerId) {
		try {
			const owner = await bot.helpers.getUser(guild.ownerId);
			if (owner) {
				// Cast to any to access properties safely
				const ownerAny = owner as any;

				// Try to get the username if available
				if (ownerAny.username) {
					ownerDisplay =
						`${ownerAny.username} (ID: ${guild.ownerId})`;
				}
			}
		} catch (_e) { /* Muted error, owner info remains basic */ }
	}
	descriptionText += "\n**Owner:** " + ownerDisplay;

	const embedToSend: Embed = {
		title: `[BANNED] ${guild.name ?? "Unknown Server Name"}`,
		description: descriptionText,
		color,
		footer: {
			text:
				`Banned Server ${currentPage} of ${totalPages} | Global Ban List`,
		},
	};

	// Try to get guild icon if available
	const botHelpers = bot.helpers as any;
	if (guild.icon && botHelpers.guildIconUrl) {
		const iconURL = botHelpers.guildIconUrl(guild.id, guild.icon, {
			size: 128,
		});
		if (iconURL) {
			embedToSend.thumbnail = { url: iconURL };
		}
	}

	return embedToSend;
}
