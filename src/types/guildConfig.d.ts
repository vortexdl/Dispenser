export type DefaultMainColor = string; // Hex color
export type DefaultDispenseInterval = string; // e.g., "5m", "1h", "0"
export type DefaultDispenseQuantity = number | "all";
export type DefaultLoggingChannelId = string | null;
export type DefaultReportsChannelId = string | null; // Added for guild-specific report channel

/**
 * Guild theme configuration
 */
export interface GuildThemeConfig {
	/** Hex color, defaults to DEFAULT_MAIN_COLOR */
	main_color: string;
	/** Hex color for warning messages/embeds */
	warning_color: string;
	/** Hex color for error messages/embeds */
	error_color: string;
}

export interface GuildDispenseConfig {
	interval: string; // e.g., "5m", "1h", "0", defaults to DEFAULT_DISPENSE_INTERVAL
	quantity: number | "all"; // Defaults to DEFAULT_DISPENSE_QUANTITY
}

/**
 * Filter role configuration
 */
export interface FilterRole {
	/** Filter name */
	filterName: string;
	/** Role ID */
	roleId: string;
}

// Added GuildPanelConfig
export interface GuildPanelConfig {
	title: string;
	catPlaceholder: string;
	filterPlaceholder: string;
	/** Footer text */
	footerText: string;
	/** Button text */
	buttonText: string;
	/** Hex color */
	colorString: string;
	/** Default DM behavior */
	dm: boolean;
	/** Whether to separate Masqr links from regular links with dedicated buttons */
	masqrSeparation: boolean;
	/** Custom message shown in DM embeds before the link */
	dmMessage: string | null;
}

/**
 * New Guild Discovery Configuration
 */
export interface GuildDiscoveryConfig {
	/** Whether the server is published in the gallery */
	publish: boolean;
	/** Invite link for the server gallery button */
	invite: string | null;
	/** Whether the rating system is enabled for the server (overridden by publish) */
	rating: boolean;
}

/** Configuration for guild-specific Masqr settings */
export interface GuildMasqrConfig {
	/** Whether Masqr is enabled for this guild */
	enabled: boolean;
	/** The URL for the Masqr validation endpoint this guild will use (e.g., for proxy servers) */
	validationEndpointUrl: string;
	/** Default license expiration time in hours for this guild */
	defaultLicenseExpirationHours: number;
	/** Maximum license expiration time in hours for this guild */
	maxLicenseExpirationHours: number;
	/** Domains that bypass Masqr protection for this guild */
	guildWhitelistedDomains: string[];
	/** Placeholder for pre-shared keys if domains are self-managed */
	// preSharedKeys: Record<string, string[]>; // Example: { "domain1.com": ["psk1", "psk2"] }
}

/**
 * Guild configuration for the cohort system
 */
export interface GuildCohortConfig {
	/** Whether the cohort system is enabled for this guild */
	enable: boolean;
	/** Force users to choose filters first by combining the request buttons */
	force: boolean;
	/** Maximum unblocked links per user at one time */
	max_links: number;
	/** Allow members to be indexed in both guild and global cohort systems */
	global_system: boolean;
}

/**
 * Guild configuration for the bot
 */
export interface GuildConfig {
	/** Partition key for the database */
	guildId: string;
	theme: GuildThemeConfig;
	dispense: GuildDispenseConfig;
	filterRoles: FilterRole[];
	loggingChannelId: string | null; // Defaults to DEFAULT_LOGGING_CHANNEL_ID
	reportsChannelId: DefaultReportsChannelId; // Added for guild-specific reports
	panel: GuildPanelConfig; // Added panel config field
	discovery: GuildDiscoveryConfig; // Added discovery config field
	/** Masqr settings for this guild */
	masqr: GuildMasqrConfig;
	/** Cohort settings for this guild */
	cohort: GuildCohortConfig;
}

export declare const DEFAULT_MAIN_COLOR: DefaultMainColor;
export declare const DEFAULT_DISPENSE_INTERVAL: DefaultDispenseInterval;
export declare const DEFAULT_DISPENSE_QUANTITY: DefaultDispenseQuantity;
export declare const DEFAULT_LOGGING_CHANNEL_ID: DefaultLoggingChannelId;
export declare const DEFAULT_REPORTS_CHANNEL_ID: DefaultReportsChannelId; // Added

// Added defaults for discovery
export declare const DEFAULT_DISCOVERY_PUBLISH: boolean;
export declare const DEFAULT_DISCOVERY_INVITE: string | null;
export declare const DEFAULT_DISCOVERY_RATING: boolean;

/** Default Masqr configuration values for a guild */
export declare const DEFAULT_MASQR_ENABLED: boolean;
export declare const DEFAULT_MASQR_VALIDATION_ENDPOINT_URL: string;
export declare const DEFAULT_MASQR_DEFAULT_LICENSE_EXPIRATION_HOURS: number;
export declare const DEFAULT_MASQR_MAX_LICENSE_EXPIRATION_HOURS: number;
export declare const DEFAULT_MASQR_GUILD_WHITELISTED_DOMAINS: string[];

/** Default Cohort configuration values for a guild */
export declare const DEFAULT_COHORT_ENABLE: boolean;
export declare const DEFAULT_COHORT_FORCE: boolean;
export declare const DEFAULT_COHORT_MAX_LINKS: number;
export declare const DEFAULT_COHORT_GLOBAL_SYSTEM: boolean;

export declare const DEFAULT_GUILD_CONFIG: Omit<GuildConfig, "guildId">;
