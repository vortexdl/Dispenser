import { type Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
	MessageFlags,
} from "@discordeno/bot";
import type { BotWithCache } from "../bot.ts";

import Responder from "../util/Responder.ts";
import { createPrefixedLogger, Logger } from "../util/Logger.ts";

import { getGuildConfig } from "../util/configManager.ts";
import { createPaginator } from "../util/pagination.ts";
import {
	generatePanelData,
	type GeneratePanelOptions,
} from "../util/genPanel.ts";
import type {
	GuildMasqrConfig,
	GuildPanelConfig,
	GuildThemeConfig,
} from "../types/guildConfig.d.ts";

/**
 * Interface for guilds with user membership
 */
interface UserGuild {
	/** The ID of the guild (Discord Snowflake) as a bigint */
	id: bigint;
	/** The name of the guild */
	name: string;
	/** The icon hash of the guild */
	icon?: string | undefined;
	/** The number of members in the guild */
	memberCount?: number;
	/** The ID of the guild (Discord Snowflake) as a string */
	guildId: string;
	/** The configuration for the guild */
	config: {
		/** The panel configuration for the guild */
		panel: GuildPanelConfig;
		/** The theme configuration for the guild */
		theme: GuildThemeConfig;
		/** The masqr configuration for the guild */
		masqr: GuildMasqrConfig;
	};
}

/**
 * Command data for the `/dmpanel` command
 */
export const data = {
	name: "dmpanel",
	description:
		"Shows panels from servers you're in that have this bot, in your DMs",
	type: ApplicationCommandTypes.ChatInput,
	options: [],
	dmPermission: true,
};

/**
 * Whether this command can only be run by administrators
 */
export const adminOnly = false;

export async function handle(
	botWithCache: BotWithCache,
	interaction: Interaction,
	logger: Logger,
): Promise<void> {
	const cmdLogger = createPrefixedLogger("dmpanel", logger);
	const responder = new Responder(
		botWithCache,
		interaction.id,
		interaction.token,
		cmdLogger,
	);

	// This command should only work in DMs
	if (interaction.guildId) {
		await responder.respond(
			"This command can only be used in direct messages",
		);
		return;
	}

	await responder.defer(MessageFlags.Ephemeral);

	try {
		// Try to get guilds via cache first
		let allBotGuilds: any[] = [];
		// Check if we have cache access
		const hasCache = Boolean((botWithCache as any).cache?.guilds);
		if (hasCache) {
			// Get guilds from cache if available
			const cachedGuildsCollection = (botWithCache as any).cache.guilds;
			if (
				cachedGuildsCollection &&
				typeof cachedGuildsCollection.values === "function"
			) {
				allBotGuilds = Array.from(cachedGuildsCollection.values());
				cmdLogger.info(
					`Retrieved ${allBotGuilds.length} guilds from cache`,
				);
			}
		}

		// Fallback if no cache or cache is empty
		if (allBotGuilds.length === 0) {
			cmdLogger.warn(
				"Bot cache not available, using alternative method to get guilds",
			);
			// Try to get guilds using the API
			try {
				const guilds = await botWithCache.helpers.getGuilds("1").catch(
					() => [],
				);
				allBotGuilds = Array.isArray(guilds) ? guilds : [];
				cmdLogger.info(
					`Retrieved ${allBotGuilds.length} guilds using API fallback`,
				);
			} catch (error) {
				cmdLogger.error("Failed to get guilds using fallback method", {
					error,
				});
				await responder.editResponse(
					"Unable to retrieve server data. Please try again later",
				);
				return;
			}
		}

		if (allBotGuilds.length === 0) {
			await responder.editResponse(
				"Unable to retrieve server data. Please try again later",
			);
			return;
		}

		// Get the user's guild memberships
		// We'll have to verify each guild that the bot is in to see if the user is a member
		const userGuilds: UserGuild[] = [];

		for (const guild of allBotGuilds) {
			try {
				if (!guild || typeof guild !== "object" || !guild.id) {
					continue; // Skip invalid guild objects
				}

				const member = await botWithCache.helpers.getMember(
					guild.id,
					interaction.user.id,
				).catch(() => null);
				// If the user who ran the command is in this guild, add the guild to our list
				if (member) {
					const guildIdString = String(guild.id);
					const guildConfig = await getGuildConfig(guildIdString);
					if (guildConfig.panel) {
						userGuilds.push({
							id: guild.id,
							name: guild.name,
							icon: typeof guild.icon === "bigint"
								? String(guild.icon)
								: guild.icon,
							memberCount: guild.memberCount,
							guildId: guildIdString,
							config: {
								panel: guildConfig.panel,
								theme: guildConfig.theme,
								masqr: guildConfig.masqr,
							},
						});
					}
				}
			} catch (error) {
				cmdLogger.warn(
					`Error checking membership for guild ${
						String(guild?.id || "unknown")
					}`,
					{ error },
				);
			}
		}

		if (userGuilds.length === 0) {
			await responder.editResponse(
				"You are not in any servers that have configured panels with this bot",
			);
			return;
		}

		cmdLogger.info(
			`Found ${userGuilds.length} servers with panels for user ${interaction.user.id}`,
		);

		// Create a paginator to display the guilds and their panels
		await createPaginator({
			bot: botWithCache,
			interaction,
			logger: cmdLogger,
			data: userGuilds,
			itemsPerPage: 1,
			embedGenerator: createDMPanelEmbed,
			noDataMessage: "No panels found in servers you're in",
			buttonLabels: {
				previous: "◀ Previous Server",
				next: "Next Server ▶",
			},
			itemSpecificActionRowGenerator: createPanelActionRow,
			defer: false, // We already deferred above
		});
	} catch (error) {
		cmdLogger.error("Error creating DM panel", { error });
		await responder.editResponse(
			"An error occurred while creating the panel. Please try again later!",
		);
	}
}

/**
 * Creates an embed to display a server in the DM panel list
 */
async function createDMPanelEmbed(
	guild: UserGuild | undefined,
	bot: BotWithCache,
	logger: Logger,
	currentPage: number,
	totalPages: number,
	_originalInteraction: Interaction,
): Promise<Embed> {
	if (!guild) {
		return {
			title: "Server Panels - Error",
			description: "No server data available for this page",
			// Red color for error
			color: 0xFF0000,
		};
	}

	try {
		// Get server icon if available
		let thumbnailUrl: string | undefined;
		if (guild.icon) {
			const helpers = bot.helpers as any;
			thumbnailUrl = helpers.guildIconUrl?.(String(guild.id), guild.icon);
		}

		// Get theme color from guild config
		const themeColor = guild.config.theme?.main_color
			? parseInt(`0x${guild.config.theme.main_color}`)
			: 0x7289DA;

		// Test panel generation
		const panelOptions: GeneratePanelOptions = {
			guildId: guild.guildId,
			dmUser: true,
			title: guild.config.panel.title,
			catPlaceholder: guild.config.panel.catPlaceholder,
			filterPlaceholder: guild.config.panel.filterPlaceholder,
			footerText: guild.config.panel.footerText,
			buttonText: guild.config.panel.buttonText,
			colorString: guild.config.panel.colorString,
			logger,
			description: `Server: ${guild.name}`,
			masqrSeparation: guild.config.masqr.enabled &&
				guild.config.panel.masqrSeparation,
			masqrEnabled: guild.config.masqr.enabled,
		};

		// Check if the panel can be generated (has categories)
		const canGeneratePanel =
			await generatePanelData(bot, panelOptions) !== null;

		return {
			title: guild.name,
			description: canGeneratePanel
				? "Use the button below to view this server's panel and request links."
				: "This server has no categories configured yet. Panel cannot be generated.",
			color: themeColor,
			thumbnail: thumbnailUrl ? { url: thumbnailUrl } : undefined,
			footer: {
				text:
					`Server ${currentPage} of ${totalPages} | Server ID: ${guild.guildId}`,
			},
		};
	} catch (error) {
		logger.error(`Error creating embed for guild ${guild.guildId}`, {
			error,
		});
		return {
			title: "Error",
			description:
				"An error occurred while loading this server's information",
			// Red color for error
			color: 0xFF0000,
		};
	}
}

/**
 * Creates action rows with a "View Panel" button that will display the actual panel for that server
 */
function createPanelActionRow(
	guild: UserGuild | undefined,
	_bot: BotWithCache,
	_logger: Logger,
): any | undefined {
	if (!guild) return undefined;

	// When the "View Panel" button is clicked, we'll generate and send a panel
	const customId = `dmPanel_view_${guild.guildId}`;

	// Return a simple button that will show the panel when clicked
	return {
		type: 1, // ActionRow
		components: [
			{
				type: 2, // Button
				style: 1, // Primary
				label: "View Panel",
				customId,
			},
		],
	};
}
