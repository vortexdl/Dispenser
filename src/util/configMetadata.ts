import { DEFAULT_GUILD_CONFIG } from "./configDefaults.ts";

/**
 * Helper function to retrieve a value from a nested object using a dot-separated path
 * @param path The dot-separated path (e.g., "theme.main_color")
 * @param obj The object to retrieve the value from
 * @returns The value at the path, or undefined if the path is not found
 */
function getValueByPath(
	path: string,
	obj: Record<string, any> | undefined,
): any {
	if (!obj) return undefined;
	const parts = path.split(".");
	let current: any = obj;
	for (const part of parts) {
		if (current && typeof current === "object" && part in current) {
			current = current[part];
		} else {
			return undefined;
		}
	}
	return current;
}

/**
 * Metadata for each configurable configuration item
 */
export interface ConfigItemMetadata {
	/** The dot-separated path to the config item (e.g., "theme.main_color") */
	path: string;
	/** A description of the config item */
	description: string;
	/** The default value of the config item */
	defaultValue: any;
}

// Define metadata for each configurable path
export const configMetadataDetails: ConfigItemMetadata[] = [
	{
		path: "loggingChannelId",
		description:
			"Channel ID for bot audit logs and important messages (null to disable)",
		defaultValue: getValueByPath("loggingChannelId", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "reportsChannelId",
		description: "Channel ID where user reports are sent (null to disable)",
		defaultValue: getValueByPath("reportsChannelId", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "theme.main_color",
		description: "Main accent color for embeds (6-digit hex, e.g., e071ac)",
		defaultValue: getValueByPath("theme.main_color", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "dispense.interval",
		description:
			"Interval for automatic link dispensing (e.g., 5m, 1h, 0 for none)",
		defaultValue: getValueByPath("dispense.interval", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "dispense.quantity",
		description:
			"Number of links to dispense automatically (number or 'all')",
		defaultValue: getValueByPath("dispense.quantity", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "panel.title",
		description: "Custom title for the link panel embed",
		defaultValue: getValueByPath("panel.title", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "panel.catPlaceholder",
		description: "Placeholder text for the category selector in the panel",
		defaultValue: getValueByPath(
			"panel.catPlaceholder",
			DEFAULT_GUILD_CONFIG,
		),
	},
	{
		path: "panel.filterPlaceholder",
		description: "Placeholder text for the filter selector in the panel",
		defaultValue: getValueByPath(
			"panel.filterPlaceholder",
			DEFAULT_GUILD_CONFIG,
		),
	},
	{
		path: "panel.footerText",
		description: "Custom footer text for the panel embed",
		defaultValue: getValueByPath("panel.footerText", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "panel.buttonText",
		description: "Custom text for the main button in the panel",
		defaultValue: getValueByPath("panel.buttonText", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "panel.colorString",
		description: "Color for the panel embed (6-digit hex, e.g., 0099FF)",
		defaultValue: getValueByPath("panel.colorString", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "panel.dm",
		description: "Whether to send the panel via DM by default (true/false)",
		defaultValue: getValueByPath("panel.dm", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "panel.masqrSeparation",
		description:
			"Whether to separate Masqr links from regular links with dedicated buttons (true/false)",
		defaultValue: getValueByPath(
			"panel.masqrSeparation",
			DEFAULT_GUILD_CONFIG,
		),
	},
	{
		path: "panel.dmMessage",
		description: "Custom message shown in DM embeds before the link (null to disable)",
		defaultValue: getValueByPath("panel.dmMessage", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "discovery.publish",
		description:
			"Allow this server to be listed in the public server gallery (true/false)",
		defaultValue: getValueByPath("discovery.publish", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "discovery.invite",
		description: "Public invite link for this server (null to not display)",
		defaultValue: getValueByPath("discovery.invite", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "discovery.rating",
		description:
			"Allow this server's ratings to be publicly visible/aggregated (true/false)",
		defaultValue: getValueByPath("discovery.rating", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "cohort.enable",
		description: "Enable the cohort system for this guild (true/false)",
		defaultValue: getValueByPath("cohort.enable", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "cohort.force",
		description: "Force users to choose filters first by combining request buttons (true/false)",
		defaultValue: getValueByPath("cohort.force", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "cohort.max_links",
		description: "Maximum unblocked links per user at one time (number)",
		defaultValue: getValueByPath("cohort.max_links", DEFAULT_GUILD_CONFIG),
	},
	{
		path: "cohort.global_system",
		description: "Allow members to be indexed in both guild and global cohort systems (true/false)",
		defaultValue: getValueByPath("cohort.global_system", DEFAULT_GUILD_CONFIG),
	},
];

/**
 * Map for easy lookup of config item metadata by its path
 */
export const configMetadataMap: Map<string, ConfigItemMetadata> = new Map(
	configMetadataDetails.map((item) => [item.path, item]),
);
