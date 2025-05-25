/**
 * Utility functions for DM-related functionality
 */

import type { Bot, Guild } from "@discordeno/bot";
import type { Logger } from "./Logger.ts";
import type { GuildConfig } from "../types/guildConfig.d.ts";

/**
 * Discord's official logo URL for use in DM embeds
 */
export const DISCORD_LOGO_URL = "https://cdn.discordapp.com/embed/avatars/0.png";

/**
 * Gets the appropriate footer icon URL based on the context
 * @param bot The bot instance
 * @param guildId The guild ID (null if in DMs)
 * @param guild The guild object (if available)
 * @param logger Logger instance
 * @returns The URL for the footer icon
 */
export async function getFooterIconUrl(
	bot: Bot,
	guildId: string | null,
	guild: Guild | null,
	logger: Logger,
): Promise<string> {
	if (!guildId || !guild) {
		return DISCORD_LOGO_URL;
	}

	try {
		if (guild.icon) {
			const helpers = bot.helpers as any;
			const iconUrl = helpers.guildIconUrl?.(BigInt(guildId), guild.icon);
			if (iconUrl) {
				return iconUrl;
			}
		}
	} catch (error) {
		logger.debug(`Failed to get guild icon for ${guildId}`, { error });
	}

	return DISCORD_LOGO_URL;
}

/**
 * Gets the footer text with the server name or "DMs"
 * @param guildId The guild ID (null if in DMs)
 * @param guildName The guild name (if available)
 * @returns The footer text
 */
export function getFooterText(
	guildId: string | null,
	guildName: string | null,
): string {
	if (!guildId || !guildName) {
		return "DMs";
	}
	return guildName;
}

/**
 * Formats filters array into a readable string with proper grammar
 * @param filters Array of filter names
 * @returns Formatted filter string
 */
export function formatFilters(filters: string[]): string {
	if (filters.length === 0) return "";
	if (filters.length === 1) return filters[0];
	if (filters.length === 2) return `${filters[0]} and ${filters[1]}`;
	
	const lastFilter = filters[filters.length - 1];
	const otherFilters = filters.slice(0, -1);
	return `${otherFilters.join(", ")}, and ${lastFilter}`;
}

/**
 * Creates the description for DM embeds including custom message, link, and filter info
 * @param link The link to include
 * @param customMessage Custom message from guild config (null if not set)
 * @param linksLeftMsg The remaining links message
 * @param filters Array of user's filters
 * @returns The formatted description
 */
export function createDmDescription(
	link: string,
	customMessage: string | null,
	linksLeftMsg: string,
	filters: string[],
): string {
	let description = "";
	
	if (customMessage && customMessage.trim()) {
		description += `${customMessage}\n`;
	}
	
	description += `${link}\n`;
	
	if (filters.length > 0) {
		const filterText = formatFilters(filters);
		description += `This link is unblocked on ${filterText} at this time\n`;
	}
	
	description += `\n${linksLeftMsg}`;
	
	return description;
}

/**
 * Creates the description for Masqr DM embeds including custom message and filter info
 * @param masqrInstructions The Masqr instructions text
 * @param customMessage Custom message from guild config (null if not set)
 * @param filters Array of user's filters
 * @returns The formatted description
 */
export function createMasqrDmDescription(
	masqrInstructions: string,
	customMessage: string | null,
	filters: string[],
): string {
	let description = "";
	
	if (customMessage && customMessage.trim()) {
		description += `${customMessage}\n`;
	}
	
	if (filters.length > 0) {
		const filterText = formatFilters(filters);
		description += `This Masqr-protected link is unblocked on ${filterText} at this time\n\n`;
	}
	
	description += masqrInstructions;
	
	return description;
} 