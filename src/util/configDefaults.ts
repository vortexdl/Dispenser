// Ryan Wilson
// src/util/configDefaults.ts

import type {
	DefaultDispenseInterval,
	DefaultDispenseQuantity,
	DefaultLoggingChannelId,
	DefaultMainColor,
	DefaultReportsChannelId,
	GuildCohortConfig,
	GuildConfig,
	GuildDiscoveryConfig,
	GuildMasqrConfig,
	GuildPanelConfig,
	//	GuildThemeConfig,
} from "../types/guildConfig.d.ts";

/**
 * Default main accent color for embeds
 */
export const DEFAULT_MAIN_COLOR: DefaultMainColor = "e071ac";
/**
 * Default warning color for embeds
 */
export const DEFAULT_WARNING_COLOR: string = "FFA500"; // Orange
/**
 * Default error color for embeds
 */
export const DEFAULT_ERROR_COLOR: string = "FF0000"; // Red
// No interval by default
/**
 * Default interval for automatic link dispensing
 */
export const DEFAULT_DISPENSE_INTERVAL: DefaultDispenseInterval = "0";
/**
 * Default number of links to dispense automatically
 */
export const DEFAULT_DISPENSE_QUANTITY: DefaultDispenseQuantity = 1;
/**
 * Default channel ID for bot audit logs and important messages (null to disable)
 */
export const DEFAULT_LOGGING_CHANNEL_ID: DefaultLoggingChannelId = null;
// Added default reports channel
/**
 * Default channel ID where user reports are sent (null to disable)
 */
export const DEFAULT_REPORTS_CHANNEL_ID: DefaultReportsChannelId = null;

// Default values for panel configuration
/**
 * Default custom title for the link panel embed
 */
export const DEFAULT_PANEL_TITLE: string = "Link Selection Panel";
/**
 * Default placeholder text for the category selector in the panel
 */
export const DEFAULT_PANEL_CAT_PLACEHOLDER: string = "Select a category";
/**
 * Default placeholder text for the filter selector in the panel
 */
export const DEFAULT_PANEL_FILTER_PLACEHOLDER: string = "Select a filter";
/**
 * Default custom footer text for the panel embed
 */
export const DEFAULT_PANEL_FOOTER_TEXT: string =
	"Choose an option from the menus above";
/**
 * Default custom text for the main button in the panel
 */
export const DEFAULT_PANEL_BUTTON_TEXT: string = "Request Link";
// Discord blurple
/**
 * Default color for the panel embed (Discord blue)
 */
export const DEFAULT_PANEL_COLOR_STRING: string = "5865F2";
// Added default for DM
/**
 * Default setting for whether to send the panel via DM
 */
export const DEFAULT_PANEL_DM: boolean = false;

/**
 * Default setting for whether to separate Masqr links from regular links
 */
export const DEFAULT_PANEL_MASQR_SEPARATION: boolean = true;

/**
 * Default DM message that appears before the link in DM embeds
 */
export const DEFAULT_PANEL_DM_MESSAGE: string | null = null;

// Default values for discovery configuration
/**
 * Default setting for allowing server to be listed in public gallery
 */
export const DEFAULT_DISCOVERY_PUBLISH: boolean = true;
/**
 * Default public invite link for the server (null to not display)
 */
export const DEFAULT_DISCOVERY_INVITE: string | null = null;
/**
 * Default setting for allowing server's ratings to be publicly visible/aggregated
 */
export const DEFAULT_DISCOVERY_RATING: boolean = true;

// Default values for Masqr configuration
/**
 * Default setting for enabling Masqr protection in a guild
 */
export const DEFAULT_MASQR_ENABLED: boolean = false;
/**
 * Default Masqr validation endpoint URL for a guild (should be configured by admin)
 */
export const DEFAULT_MASQR_VALIDATION_ENDPOINT_URL: string = "";
/**
 * Default license expiration time in hours for a guild
 */
export const DEFAULT_MASQR_DEFAULT_LICENSE_EXPIRATION_HOURS: number = 72;
/**
 * Maximum license expiration time in hours for a guild
 */
export const DEFAULT_MASQR_MAX_LICENSE_EXPIRATION_HOURS: number = 168; // 1 week
/**
 * Default list of whitelisted domains for Masqr in a guild
 */
export const DEFAULT_MASQR_GUILD_WHITELISTED_DOMAINS: string[] = [];

// Default values for Cohort configuration
/**
 * Default setting for enabling the cohort system in a guild
 */
export const DEFAULT_COHORT_ENABLE: boolean = true;
/**
 * Default setting for forcing users to choose filters first
 */
export const DEFAULT_COHORT_FORCE: boolean = false;
/**
 * Default maximum unblocked links per user at one time
 */
export const DEFAULT_COHORT_MAX_LINKS: number = 1;
/**
 * Default setting for allowing members to be indexed in global cohort system
 */
export const DEFAULT_COHORT_GLOBAL_SYSTEM: boolean = true;

/**
 * Default panel configuration for a guild
 */
export const DEFAULT_GUILD_PANEL_CONFIG: GuildPanelConfig = {
	title: DEFAULT_PANEL_TITLE,
	catPlaceholder: DEFAULT_PANEL_CAT_PLACEHOLDER,
	filterPlaceholder: DEFAULT_PANEL_FILTER_PLACEHOLDER,
	footerText: DEFAULT_PANEL_FOOTER_TEXT,
	buttonText: DEFAULT_PANEL_BUTTON_TEXT,
	colorString: DEFAULT_PANEL_COLOR_STRING,
	dm: DEFAULT_PANEL_DM,
	masqrSeparation: DEFAULT_PANEL_MASQR_SEPARATION,
	dmMessage: DEFAULT_PANEL_DM_MESSAGE,
};

/**
 * Default discovery configuration for a guild
 */
export const DEFAULT_GUILD_DISCOVERY_CONFIG: GuildDiscoveryConfig = {
	publish: DEFAULT_DISCOVERY_PUBLISH,
	invite: DEFAULT_DISCOVERY_INVITE,
	rating: DEFAULT_DISCOVERY_RATING,
};

/**
 * Default Masqr configuration for a guild
 */
export const DEFAULT_GUILD_MASQR_CONFIG: GuildMasqrConfig = {
	enabled: DEFAULT_MASQR_ENABLED,
	validationEndpointUrl: DEFAULT_MASQR_VALIDATION_ENDPOINT_URL,
	defaultLicenseExpirationHours:
		DEFAULT_MASQR_DEFAULT_LICENSE_EXPIRATION_HOURS,
	maxLicenseExpirationHours: DEFAULT_MASQR_MAX_LICENSE_EXPIRATION_HOURS,
	guildWhitelistedDomains: DEFAULT_MASQR_GUILD_WHITELISTED_DOMAINS,
};

/**
 * Default cohort configuration for a guild
 */
export const DEFAULT_GUILD_COHORT_CONFIG: GuildCohortConfig = {
	enable: DEFAULT_COHORT_ENABLE,
	force: DEFAULT_COHORT_FORCE,
	max_links: DEFAULT_COHORT_MAX_LINKS,
	global_system: DEFAULT_COHORT_GLOBAL_SYSTEM,
};

/**
 * Default configuration for a guild, excluding guildId
 */
export const DEFAULT_GUILD_CONFIG: Omit<GuildConfig, "guildId"> = {
	theme: {
		main_color: DEFAULT_MAIN_COLOR,
		warning_color: DEFAULT_WARNING_COLOR,
		error_color: DEFAULT_ERROR_COLOR,
	},
	dispense: {
		interval: DEFAULT_DISPENSE_INTERVAL,
		quantity: DEFAULT_DISPENSE_QUANTITY,
	},
	filterRoles: [],
	loggingChannelId: DEFAULT_LOGGING_CHANNEL_ID,
	reportsChannelId: DEFAULT_REPORTS_CHANNEL_ID, // Added reportsChannelId
	panel: DEFAULT_GUILD_PANEL_CONFIG,
	discovery: DEFAULT_GUILD_DISCOVERY_CONFIG, // Added discovery config
	masqr: DEFAULT_GUILD_MASQR_CONFIG, // Added Masqr config
	cohort: DEFAULT_GUILD_COHORT_CONFIG, // Added cohort config
};
