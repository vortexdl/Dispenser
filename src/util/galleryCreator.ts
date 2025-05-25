import {
	type ActionRow,
	type Bot,
	type ButtonComponent,
	ButtonStyles,
	type Embed,
	type Guild,
	type Interaction,
	MessageComponentTypes,
	MessageFlags,
} from "@discordeno/bot";
import { type BotHelpers } from "@discordeno/bot";

import { globalBansDb } from "$db";

// Responders
import type { PrefixedLogger } from "./Logger.ts";
import Responder from "./Responder.ts";

// Configs
import { getGuildConfig } from "./configManager.ts";

// Utility functions
import fetchAllUserGuilds from "./getAllGuilds.ts";
import { createPaginator } from "./pagination.ts";

/**
 * Represents the extended Bot type with cache properties
 */
export interface BotWithCache extends Bot {
	/** The cache object */
	cache?: {
		/** Guild cache */
		guilds?: {
			/** Gets a guild from cache by ID */
			get: (id: bigint) => Guild | undefined;
			/** Returns all cached guilds */
			values: () => Guild[];
		};
	};
}

/**
 * Represents the extended BotHelpers type with guildIconUrl
 */
export interface BotHelpersWithIconUrl extends BotHelpers<any, any> {
	/** Function to get guild icon URL */
	guildIconUrl?: (
		guildId: bigint,
		icon: string | bigint | undefined,
		options?: { size?: number; format?: string },
	) => string | undefined;
}

/**
 * Base interface for gallery guilds
 */
export interface BaseGalleryGuild extends Guild {
	/** String version of the guild ID */
	guildId: string;
	/** Invite URL for the guild */
	inviteUrl?: string;
}

/**
 * Interface for banned gallery guilds, extending BaseGalleryGuild
 */
export interface BannedGalleryGuild extends BaseGalleryGuild {
	/** Reason for the ban */
	banReason?: string;
	/** User ID of the banner */
	bannedBy?: string;
	/** Timestamp of the ban */
	banTimestamp?: Date;
}

/**
 * Options for creating a gallery
 */
export interface CreateGalleryOptions {
	/** The bot instance */
	bot: Bot;
	/** The interaction object */
	interaction: Interaction;
	/** The logger instance */
	logger: PrefixedLogger;
	/** Criterion to sort the gallery by */
	sortBy?: string;
	/** Whether to show only banned servers */
	showBannedOnly: boolean;
	/** Whether to include action buttons on gallery items */
	includeActions?: boolean;
	/** Whether the gallery response should be ephemeral */
	forceEphemeral?: boolean;
	/** The type of gallery to create - derived from sortBy/showBannedOnly if not directly set */
	galleryType?: "all" | "banned" | "special";
	/** Title for the gallery embed */
	title?: string;
	/** The specific guild ID to show details for, if any */
	specificGuildId?: string;
}

/**
 * Creates a paginated gallery of servers
 * @param options Options for creating the gallery
 */
export async function createGallery(
	options: CreateGalleryOptions,
	bearerToken: string,
): Promise<void> {
	const {
		bot,
		interaction,
		logger,
		sortBy,
		showBannedOnly,
		includeActions = true,
		forceEphemeral = true,
	} = options;

	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	// Log the appropriate message based on gallery type
	if (showBannedOnly) {
		logger.info("Preparing banned servers gallery");
	} else if (sortBy) {
		logger.debug(`Sorting by ${sortBy}`);
	}

	// Use Responder for deferral with the provided ephemeral state
	const ephemeralFlag = forceEphemeral ? MessageFlags.Ephemeral : undefined;
	await responder.defer(ephemeralFlag);

	// Fetch all guilds via OAuth2 pagination
	let allGuilds: Guild[];
	try {
		allGuilds = await fetchAllUserGuilds(bot, bearerToken, logger);
	} catch (error: unknown) {
		logger.error("Failed to fetch guilds via OAuth2", { error });
		await responder.editResponse("Could not retrieve server list!");
		return;
	}
	if (!allGuilds || allGuilds.length === 0) {
		logger.warn("No guilds found via OAuth2");
		await responder.editResponse("No servers to display");
		return;
	}

	// Get list of globally banned servers
	let globalBans: any[] = [];
	let globallyBannedGuildIds = new Set<string>();
	try {
		globalBans = await globalBansDb.find().toArray();
		globallyBannedGuildIds = new Set(globalBans.map((ban) => ban.guildId));
		logger.debug(
			`Found ${globallyBannedGuildIds.size} globally banned servers`,
		);
	} catch (e: unknown) {
		logger.error("Error fetching globally banned servers", { error: e });
	}

	// Prepare a map for banned guild info
	const banInfoMap = new Map(globalBans.map((ban) => [ban.guildId, {
		reason: ban.reason,
		bannedBy: ban.bannedBy,
		timestamp: ban.timestamp,
	}]));

	// Filter and prepare guilds based on gallery type
	const guildsToDisplay: (BaseGalleryGuild | BannedGalleryGuild)[] = [];

	if (showBannedOnly) {
		// For banned gallery: only include globally banned servers
		for (const guild of allGuilds) {
			if (!guild || typeof guild !== "object" || !guild.id) {
				// Skip invalid guild objects
				continue;
			}

			const guildId = String(guild.id);
			if (globallyBannedGuildIds.has(guildId)) {
				const banInfo = banInfoMap.get(guildId);
				const bannedGuildItem: BannedGalleryGuild = {
					...guild,
					guildId,
					banReason: banInfo?.reason,
					bannedBy: banInfo?.bannedBy,
					banTimestamp: banInfo?.timestamp,
				};
				guildsToDisplay.push(bannedGuildItem);
			}
		}

		if (guildsToDisplay.length === 0) {
			await responder.editResponse(
				"No banned servers found that the bot is currently in",
			);
			return;
		}

		logger.info(
			`Found ${guildsToDisplay.length} banned servers to display`,
		);
	} else {
		// For regular gallery: exclude banned servers and only include servers that opt into discovery
		for (const guild of allGuilds) {
			if (!guild || typeof guild !== "object" || !guild.id) {
				// Skip invalid guild objects
				continue;
			}

			const guildId = String(guild.id);

			// Skip globally banned servers for regular gallery
			if (globallyBannedGuildIds.has(guildId)) {
				logger.debug(`Skipping banned server ${guildId}`);
				continue;
			}

			try {
				const config = await getGuildConfig(guildId);
				if (config.discovery.publish) {
					const galleryGuildItem: BaseGalleryGuild = {
						...guild,
						guildId,
					};
					if (
						config.discovery.invite &&
						typeof config.discovery.invite === "string" &&
						config.discovery.invite.trim() !== ""
					) {
						galleryGuildItem.inviteUrl = config.discovery.invite;
					}
					guildsToDisplay.push(galleryGuildItem);
				}
			} catch (configError: unknown) {
				logger.error(
					`Error fetching/processing config for guild ${guildId}`,
					{ error: configError },
				);
			}
		}

		// Apply sorting if specified
		if (sortBy === "server_members") {
			guildsToDisplay.sort((a, b) =>
				(b.memberCount ?? 0) - (a.memberCount ?? 0)
			);
		}
		// Other sorting options would be handled here

		if (guildsToDisplay.length === 0) {
			await responder.editResponse("No servers to display");
			return;
		}

		logger.info(
			`Found ${guildsToDisplay.length} regular servers to display`,
		);
	}

	// Create the paginator with the appropriate embed generator and action row generator
	await createPaginator({
		bot,
		interaction,
		logger: logger as any,
		data: guildsToDisplay,
		itemsPerPage: 1,
		embedGenerator: showBannedOnly
			? (createBannedGalleryEmbed as any)
			: (createRegularGalleryEmbed as any),
		itemSpecificActionRowGenerator: includeActions
			? (guild) => {
				return createGalleryActionRow(
					guild,
					interaction,
					showBannedOnly,
				);
			}
			: undefined,
		noDataMessage: showBannedOnly
			? "No banned servers found"
			: "No servers to display",
		buttonLabels: { previous: "◀ Previous Server", next: "Next Server ▶" },
		defer: false,
	});
}

/**
 * Creates the embed for a regular gallery item
 * @param guild The gallery guild to display
 * @param bot The bot instance
 * @param logger The logger instance
 * @param currentPage The current page number
 * @param totalPages The total number of pages
 * @param originalInteraction The original interaction
 * @returns The embed for the gallery item
 */
async function createRegularGalleryEmbed(
	guild: BaseGalleryGuild | undefined,
	bot: Bot,
	_logger: Logger,
	currentPage: number,
	totalPages: number,
): Promise<Embed> {
	if (!guild) {
		return {
			title: "Server Gallery - Error",
			description: "No server data available for this page",
			color: 0xFF0000,
		};
	}

	const config = await getGuildConfig(String(guild.id));

	let descriptionText = guild.description
		? `*${guild.description.replace(/\r\n|\r|\n/g, "\n")}*\n\n`
		: "";
	descriptionText += `**ID:** ${guild.id}`;

	if (guild.memberCount) {
		descriptionText += `\n**Members:** ${guild.memberCount}`;
	}

	// Add discovery invite if available
	if (guild.inviteUrl) {
		descriptionText += `\n\n**Invite Link:** ${guild.inviteUrl}`;
	} else if (config.discovery.publish && !config.discovery.invite) {
		descriptionText += "\n\n*No invite link provided by server.*";
	}

	const embedToSend: Embed = {
		title: guild.name,
		description: descriptionText,
		color: 0x7289DA, // Default Discord color
		footer: {
			text: `Server ${currentPage} of ${totalPages} | Server Gallery`,
		},
	};

	// Add guild icon if available
	try {
		const botHelpers = bot.helpers as BotHelpersWithIconUrl;
		if (guild.icon && typeof botHelpers.guildIconUrl === "function") {
			const iconUrl = botHelpers.guildIconUrl(guild.id, guild.icon);
			if (iconUrl) {
				embedToSend.thumbnail = { url: iconUrl };
			}
		}
	} catch (_error) {
		// Ignore errors with icon URL generation
	}

	return embedToSend;
}

/**
 * Creates the embed for a banned gallery item
 * @param guild The banned gallery guild to display
 * @param bot The bot instance
 * @param logger The logger instance
 * @param currentPage The current page number
 * @param totalPages The total number of pages
 * @param originalInteraction The original interaction
 * @returns The embed for the banned gallery item
 */
async function createBannedGalleryEmbed(
	guild: BannedGalleryGuild | undefined,
	bot: Bot,
	_logger: Logger,
	currentPage: number,
	totalPages: number,
	_originalInteraction: Interaction,
): Promise<Embed> {
	if (!guild) {
		return {
			title: "Banned Server Gallery - Error",
			description: "No server data available for this page",
			color: 0xFF0000,
		};
	}

	const config = await getGuildConfig(String(guild.id));
	// Red color for banned servers
	const color = 0xFF0000;

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

	const embedToSend: Embed = {
		title: `BANNED SERVER: ${guild.name}`,
		description: descriptionText,
		color: color,
		footer: {
			text:
				`Banned Server ${currentPage} of ${totalPages} | Banned Server Gallery`,
		},
	};

	// Add guild icon if available
	try {
		const botHelpers = bot.helpers as BotHelpersWithIconUrl;
		if (guild.icon && typeof botHelpers.guildIconUrl === "function") {
			const iconUrl = botHelpers.guildIconUrl(guild.id, guild.icon);
			if (iconUrl) {
				embedToSend.thumbnail = { url: iconUrl };
			}
		}
	} catch (_error) {
		// Ignore errors with icon URL generation
	}

	return embedToSend;
}

/**
 * Creates the action row with buttons for a gallery item
 * @param guild The gallery guild
 * @param interaction The interaction
 * @param isBannedGallery Whether this is for a banned gallery
 * @returns The action row with buttons
 */
function createGalleryActionRow(
	guild: BaseGalleryGuild | BannedGalleryGuild | undefined,
	interaction: Interaction,
	isBannedGallery: boolean,
): ActionRow | undefined {
	if (!guild) {
		return undefined;
	}

	const buttons: ButtonComponent[] = [];

	if (isBannedGallery) {
		// For banned gallery: add unban button
		buttons.push({
			type: MessageComponentTypes.Button,
			style: ButtonStyles.Danger,
			label: "Unban Server",
			customId: `banned_gallery_unban_${guild.id}`,
		});
	} else {
		// For regular gallery: add report button
		buttons.push({
			type: MessageComponentTypes.Button,
			style: ButtonStyles.Secondary,
			label: "Report Server",
			customId: `gallery_report_${guild.id}`,
		});

		// Add join button if invite URL is available
		if (guild.inviteUrl) {
			buttons.push({
				type: MessageComponentTypes.Button,
				style: ButtonStyles.Link,
				label: "Join Server",
				url: guild.inviteUrl,
			});
		}
	}

	if (buttons.length === 0) {
		return undefined;
	}

	return {
		type: MessageComponentTypes.ActionRow,
		components: buttons as any,
	};
}
