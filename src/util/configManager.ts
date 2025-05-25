import { guildConfigsDb } from "$db";
import {
	DEFAULT_GUILD_COHORT_CONFIG,
	DEFAULT_GUILD_CONFIG,
	DEFAULT_GUILD_DISCOVERY_CONFIG,
	DEFAULT_GUILD_MASQR_CONFIG,
	DEFAULT_GUILD_PANEL_CONFIG,
} from "./configDefaults.ts";
import type {
	FilterRole,
	GuildConfig,
	GuildDispenseConfig,
	GuildMasqrConfig,
	GuildThemeConfig,
} from "../types/guildConfig.d.ts";
import { UpdateFilter } from "mongodb";
import { err, ok, Result } from "neverthrow";
import { MongoError, MongoServerError } from "mongodb";

/**
 * Retrieves a guild's configuration, returning default values if none is set
 * @param guildId The ID of the guild to retrieve configuration for
 * @returns The guild's configuration
 */
export async function getGuildConfig(
	guildId: string,
): Promise<Omit<GuildConfig, "guildId">> {
	try {
		const config = await guildConfigsDb.findOne({ guildId: guildId });
		if (config) {
			const currentPanelConfig =
				config.panel && typeof config.panel === "object"
					? config.panel
					: {};
			const currentDiscoveryConfig =
				config.discovery && typeof config.discovery === "object"
					? config.discovery
					: {};
			const currentMasqrConfig =
				config.masqr && typeof config.masqr === "object"
					? config.masqr
					: {};
			const currentCohortConfig =
				config.cohort && typeof config.cohort === "object"
					? config.cohort
					: {};
			return {
				...DEFAULT_GUILD_CONFIG,
				...config,
				theme: { ...DEFAULT_GUILD_CONFIG.theme, ...config.theme },
				dispense: {
					...DEFAULT_GUILD_CONFIG.dispense,
					...config.dispense,
				},
				filterRoles: config.filterRoles || [],
				loggingChannelId: config.loggingChannelId === undefined
					? DEFAULT_GUILD_CONFIG.loggingChannelId
					: config.loggingChannelId,
				reportsChannelId: config.reportsChannelId === undefined
					? DEFAULT_GUILD_CONFIG.reportsChannelId
					: config.reportsChannelId,
				panel: { ...DEFAULT_GUILD_PANEL_CONFIG, ...currentPanelConfig },
				discovery: {
					...DEFAULT_GUILD_DISCOVERY_CONFIG,
					...currentDiscoveryConfig,
				},
				masqr: { ...DEFAULT_GUILD_MASQR_CONFIG, ...currentMasqrConfig },
				cohort: {
					...DEFAULT_GUILD_COHORT_CONFIG,
					...currentCohortConfig,
				},
			};
		}
		return DEFAULT_GUILD_CONFIG;
	} catch (error) {
		if (error instanceof MongoError || error instanceof MongoServerError) {
			throw new Error(
				`Database error while getting guild config: ${error.message}`,
			);
		} else if (error instanceof Error) {
			throw new Error(`Failed to get guild config: ${error.message}`);
		} else {
			throw new Error(
				`Failed to get guild config: Unknown error occurred`,
			);
		}
	}
}

/**
 * Updates a guild's specific configuration path
 * @param guildId The ID of the guild to update configuration for
 * @param path The dot-separated path to the configuration option (e.g., "theme.main_color")
 * @param value The new value for the configuration option
 * @returns A Result indicating success or failure
 */
export async function updateGuildConfig(
	guildId: string,
	path: string,
	value: any,
): Promise<Result<void, Error>> {
	try {
		const update: UpdateFilter<GuildConfig> = { $set: { [path]: value } };
		await guildConfigsDb.updateOne({ guildId: guildId }, update, {
			upsert: true,
		});
		return ok(undefined);
	} catch (error) {
		if (error instanceof MongoError || error instanceof MongoServerError) {
			return err(
				new Error(
					`Database error while updating guild config: ${error.message}`,
				),
			);
		} else if (error instanceof Error) {
			return err(
				new Error(`Failed to update guild config: ${error.message}`),
			);
		} else {
			return err(
				new Error(
					`Failed to update guild config: Unknown error occurred`,
				),
			);
		}
	}
}

/**
 * Resets a guild's specific configuration path to its default value
 * @param guildId The ID of the guild to reset configuration for
 * @param path The dot-separated path to the configuration option (e.g., "theme.main_color")
 * @returns A Result indicating success or failure
 */
export async function resetGuildConfigField(
	guildId: string,
	path: string,
): Promise<Result<void, Error>> {
	try {
		const pathParts = path.split(".");
		let defaultValue: any = DEFAULT_GUILD_CONFIG;

		for (const part of pathParts) {
			if (
				defaultValue && typeof defaultValue === "object" &&
				part in defaultValue
			) {
				defaultValue = defaultValue[part as keyof typeof defaultValue];
			} else {
				return err(
					new Error(`Default value not found for path: ${path}`),
				);
			}
		}

		const result = await updateGuildConfig(guildId, path, defaultValue);
		return result;
	} catch (error) {
		if (error instanceof Error) {
			return err(
				new Error(
					`Failed to reset guild config field: ${error.message}`,
				),
			);
		} else {
			return err(
				new Error(
					`Failed to reset guild config field: Unknown error occurred`,
				),
			);
		}
	}
}

/**
 * Resets a guild's entire configuration to default values
 * @param guildId The ID of the guild to reset configuration for
 * @returns A Result indicating success or failure
 */
export async function resetEntireGuildConfig(
	guildId: string,
): Promise<Result<void, Error>> {
	try {
		await guildConfigsDb.updateOne(
			{ guildId: guildId },
			{ $set: { ...DEFAULT_GUILD_CONFIG, guildId: guildId } },
			{ upsert: true },
		);
		return ok(undefined);
	} catch (error) {
		if (error instanceof MongoError || error instanceof MongoServerError) {
			return err(
				new Error(
					`A Database error occured while resetting guild config: ${error.message}`,
				),
			);
		} else if (error instanceof Error) {
			return err(
				new Error(
					`Failed to reset entire guild config: ${error.message}`,
				),
			);
		} else {
			return err(
				new Error(
					`Failed to reset entire guild config: Unknown error occurred`,
				),
			);
		}
	}
}

/**
 * Adds a filter role to the guild's configuration
 * @param guildId The ID of the guild
 * @param filterName The name of the filter
 * @param roleId The ID of the role
 * @returns A Result indicating success or failure
 */
export async function addFilterRole(
	guildId: string,
	filterName: string,
	roleId: string,
): Promise<Result<void, Error>> {
	try {
		const newFilterRole: FilterRole = { filterName, roleId };
		const update: UpdateFilter<GuildConfig> = {
			$push: { filterRoles: newFilterRole },
		};
		await guildConfigsDb.updateOne({ guildId: guildId }, update, {
			upsert: true,
		});
		return ok(undefined);
	} catch (error) {
		if (error instanceof MongoError || error instanceof MongoServerError) {
			return err(
				new Error(
					`Database error while adding filter role: ${error.message}`,
				),
			);
		} else if (error instanceof Error) {
			return err(
				new Error(`Failed to add filter role: ${error.message}`),
			);
		} else {
			return err(
				new Error(`Failed to add filter role: Unknown error occurred`),
			);
		}
	}
}

/**
 * Removes a filter role from the guild's configuration by filter name
 * @param guildId The ID of the guild
 * @param filterName The name of the filter to remove
 * @returns A Result indicating success or failure
 */
export async function removeFilterRole(
	guildId: string,
	filterName: string,
): Promise<Result<void, Error>> {
	try {
		const update: UpdateFilter<GuildConfig> = {
			$pull: { filterRoles: { filterName: filterName } },
		};
		await guildConfigsDb.updateOne({ guildId: guildId }, update);
		return ok(undefined);
	} catch (error) {
		if (error instanceof MongoError || error instanceof MongoServerError) {
			return err(
				new Error(
					`Database error while removing filter role: ${error.message}`,
				),
			);
		} else if (error instanceof Error) {
			return err(
				new Error(`Failed to remove filter role: ${error.message}`),
			);
		} else {
			return err(
				new Error(
					`Failed to remove filter role: Unknown error occurred`,
				),
			);
		}
	}
}

/**
 * Retrieves the logging channel ID for a guild
 * @param guildId The ID of the guild
 * @returns The logging channel ID, or null if not set
 */
export async function getLoggingChannelId(
	guildId: string,
): Promise<string | null | undefined> {
	const config = await getGuildConfig(guildId);
	return config.loggingChannelId;
}

/**
 * Retrieves the filter roles for a guild
 * @param guildId The ID of the guild
 * @returns The filter roles array
 */
export async function getFilterRoles(guildId: string): Promise<FilterRole[]> {
	const config = await getGuildConfig(guildId);
	return config.filterRoles;
}
