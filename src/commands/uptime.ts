/**
 * Displays the bot's uptime since the last restart
 */

import { type Bot, type Embed, type Interaction } from "@discordeno/bot";
import { ApplicationCommandTypes, MessageFlags } from "@discordeno/bot";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

import config from "../../config.ts";
import { getGuildConfig } from "../util/configManager.ts";

// Global variable to store the bot's start time (initialized with current time)
const BOT_START_TIME: number = Date.now();

/**
 * Command data for the /uptime command
 */
export const data = {
	name: "uptime",
	description: "Shows how long the bot has been online",
	type: ApplicationCommandTypes.ChatInput,
	options: [],
	dmPermission: true, // Uptime can be checked from DMs
};

/**
 * Whether this command can only be run by administrators
 */
export const adminOnly = false; // Uptime is a public command

export async function handle(
	bot: Bot,
	interaction: Interaction,
	logger: PrefixedLogger,
): Promise<void> {
	const responder = new Responder(bot, interaction.id, interaction.token, logger);

	// Prepare a message to be sent to the user only
	await responder.defer(MessageFlags.Ephemeral);

	try {
		// Calculate uptime
		const uptimeMs = Date.now() - BOT_START_TIME;
		const uptimeStrCompact = formatUptime(uptimeMs);
		const uptimeStrFull = formatUptimeFull(uptimeMs);

		// Get the start date as a formatted string
		const startDate = new Date(BOT_START_TIME).toLocaleString();

		// Get the guild configuration to use the theme color
		const guildConfig = await getGuildConfig(String(config.bot.guildId));
		const mainColor = guildConfig.theme.main_color;

		// Create the uptime embed
		const uptimeEmbed: Embed = {
			title: "Bot Uptime",
			description:
				`Dispenser has been online for **${uptimeStrCompact}**`,
			color: parseInt(`0x${mainColor}`),
			fields: [
				{
					name: "Uptime (Full)",
					value: uptimeStrFull,
					inline: true,
				},
				{
					name: "Started At",
					value: startDate,
					inline: true,
				},
			],
			footer: {
				text: "Uptime Command",
			},
		};

		// Send the uptime information
		await responder.editResponseWithEmbed(uptimeEmbed);
	} catch (err) {
		logger.error("Failed to get uptime information", err);
		await responder.editResponse(
			"An error occurred while fetching uptime information",
		);
	}
}

/**
 * Formats milliseconds into a compact human-readable uptime string
 * @param ms Time in milliseconds
 * @returns Formatted uptime string in compact format (1d 5h 30m 20s)
 */
function formatUptime(ms: number): string {
	// For very short uptimes
	if (ms < 1000) {
		return "just started";
	}

	// Calculate time units
	const seconds = Math.floor((ms / 1000) % 60);
	const minutes = Math.floor((ms / (1000 * 60)) % 60);
	const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
	const days = Math.floor(ms / (1000 * 60 * 60 * 24));

	// Format parts with compact notation
	const parts: string[] = [];
	if (days > 0) {
		parts.push(`${days}d`);
	}
	if (hours > 0 || parts.length > 0) {
		parts.push(`${hours}h`);
	}
	if (minutes > 0 || parts.length > 0) {
		parts.push(`${minutes}m`);
	}
	parts.push(`${seconds}s`);
	return parts.join(" ");
}

/**
 * Formats milliseconds into a full human-readable uptime string
 * @param ms Time in milliseconds
 * @returns Formatted uptime string with full units (1 day, 5 hours, 30 minutes, 20 seconds)
 */
function formatUptimeFull(ms: number): string {
	// For very short uptimes
	if (ms < 1000) {
		return "just started";
	}

	// Calculate time units
	const seconds = Math.floor((ms / 1000) % 60);
	const minutes = Math.floor((ms / (1000 * 60)) % 60);
	const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
	const days = Math.floor(ms / (1000 * 60 * 60 * 24));

	// Format with full unit names, only including non-zero values except for seconds
	const parts: string[] = [];
	if (days > 0) {
		parts.push(`${days} day${days === 1 ? "" : "s"}`);
	}
	if (hours > 0) {
		parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
	}
	if (minutes > 0) {
		parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
	}
	// Always include seconds unless it's `0` and we have other units
	if (seconds > 0 || parts.length === 0) {
		parts.push(`${seconds} second${seconds === 1 ? "" : "s"}`);
	}
	// Join with commas and add `and` before the last part if there are multiple parts
	if (parts.length > 1) {
		const lastPart = parts.pop();
		return `${parts.join(", ")} and ${lastPart}`;
	}
	return parts[0];
}
