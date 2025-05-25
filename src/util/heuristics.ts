/// <reference lib="deno.unstable" />
// Ryan Wilson
// src/util/heuristics.ts

import { linksDb, usersDb } from "$db";
import { err, ok, Result } from "neverthrow";
import type {
	ApplicationCommandOptionChoice,
	Bot,
	Member,
} from "@discordeno/bot";
import { Logger } from "./Logger.ts";
import isAdmin from "./isAdmin.ts";
// Import config metadata
import { configMetadataMap } from "./configMetadata.ts";

/** Deno KV reference */
let kv: Deno.Kv | undefined;
async function getKv() {
	if (!kv) {
		kv = await Deno.openKv();
	}
	return kv;
}

/**
 * @name mostPopularUserCategories
 * @description Fetches and sorts a user's most popular categories for autocomplete
 * @param userId The ID of the user
 * @param searchValue The current value entered by the user for filtering
 * @param logger The logger instance to use for error logging
 * @returns A Result containing an array of category choices or an Error
 */
export async function mostPopularUserCategories(
	userId: string,
	searchValue: string,
	logger: Logger,
): Promise<Result<ApplicationCommandOptionChoice[], Error>> {
	try {
		// Get all categories the user has used with their times
		const userHistory = await usersDb.find({ userId }).toArray();

		if (userHistory.length === 0) {
			return ok([]);
		}

		// Create a map of category to total times
		const categoryTimes = new Map<string, number>();
		userHistory.forEach((entry) => {
			const currentTimes = categoryTimes.get(entry.cat) || 0;
			categoryTimes.set(entry.cat, currentTimes + entry.times);
		});

		// Convert to array and sort by times (most requested first)
		const sortedCategories = Array.from(categoryTimes.entries())
			// Sort by times descending
			.sort((a, b) => b[1] - a[1])
			.map(([cat]) => cat);

		// Filter categories based on search value
		const filteredCategories = sortedCategories
			.filter((cat) =>
				cat.toLowerCase().includes(searchValue.toLowerCase())
			)
			// Discord limits to 25 choices
			.slice(0, 25);

		const choices: ApplicationCommandOptionChoice[] = filteredCategories
			.map((cat) => ({
				name: cat,
				value: cat,
			}));

		return ok(choices);
	} catch (error: unknown) {
		logger.error(
			"Error fetching most popular user categories:",
			error,
		);
		if (error instanceof Error) {
			return err(error);
		}
		return err(
			new Error(
				"An unknown error occurred while fetching popular categories",
			),
		);
	}
}

/**
 * Structure for admin category counts
 */
export interface AdminCategoryCount {
	/** The name of the category */
	category: string;
	/** The number of links an admin has added to this category */
	count: number;
}

/**
 * @name mostPopularAdminIssuedCategories
 * @description Fetches a ranked list of categories for which a given admin has added the most links in a specific guild
 * @param bot The Bot instance
 * @param logger The Logger instance
 * @param adminUserId The ID of the user to check (must be an admin)
 * @param guildId The ID of the guild to check within
 * @returns A Result containing an array of { category: string, count: number } or an Error. Empty array if not admin or no links added
 */
export async function mostPopularAdminIssuedCategories(
	bot: Bot,
	logger: Logger,
	adminUserId: string,
	guildId: string,
): Promise<Result<AdminCategoryCount[], Error>> {
	try {
		let member: any;
		try {
			member = await bot.helpers.getMember(guildId, adminUserId);
		} catch (fetchError: any) {
			logger.warn(
				`mostPopularAdminIssuedCategories: Could not fetch member ${adminUserId} in guild ${guildId}. Error: ${fetchError.message}`,
			);
			return ok([]);
		}

		if (!member) {
			logger.info(
				`mostPopularAdminIssuedCategories: Member ${adminUserId} not found in guild ${guildId}.`,
			);
			return ok([]);
		}

		const isUserAdmin = await isAdmin(member, guildId, logger);
		if (!isUserAdmin) {
			logger.info(
				`mostPopularAdminIssuedCategories: User ${adminUserId} is not an admin in guild ${guildId}.`,
			);
			return ok([]);
		}

		// This assumes the Links collection has an 'addedByUserId' field
		const adminLinks = await linksDb.find({
			guildId: guildId,
			addedByUserId: adminUserId,
		}).toArray();

		if (adminLinks.length === 0) {
			logger.info(
				`mostPopularAdminIssuedCategories: Admin ${adminUserId} has not added any links in guild ${guildId}.`,
			);
			return ok([]);
		}

		const categoryCounts = new Map<string, number>();
		adminLinks.forEach((link) => {
			// Ensure link.cat is treated as string, even if DB might have other types (should be string ideally)
			const categoryName = String(link.cat);
			const currentCount = categoryCounts.get(categoryName) || 0;
			categoryCounts.set(categoryName, currentCount + 1);
		});

		const sortedCategories: AdminCategoryCount[] = Array.from(
			categoryCounts.entries(),
		)
			.map(([category, count]) => ({ category, count }))
			.sort((a, b) => b.count - a.count);

		return ok(sortedCategories);
	} catch (error: unknown) {
		logger.error("Error in mostPopularAdminIssuedCategories:", {
			error,
			adminUserId,
			guildId,
		});
		if (error instanceof Error) {
			return err(error);
		}
		return err(
			new Error(
				"An unknown error occurred while fetching most popular admin-issued categories",
			),
		);
	}
}

/**
 * Formats a config path string into a more readable name with grouping
 * e.g., "theme.main_color" becomes "Theme > Main Color"
 */
function formatConfigPathToName(path: string): string {
	return path.split(".")
		.map((part) =>
			part.charAt(0).toUpperCase() +
			part.slice(1).replace(/([A-Z])/g, " $1")
		) // Add space before uppercase for camelCase
		.join(" > ");
}

/**
 * @name getRankedConfigOptions
 * @description Fetches and ranks config options for autocomplete, supporting grouping
 * @param searchValue The current value entered by the user for filtering
 * @returns A Result containing an array of ApplicationCommandOptionChoice or an Error
 */
export async function getRankedConfigOptions(
	searchValue: string,
): Promise<Result<ApplicationCommandOptionChoice[], Error>> {
	try {
		const kvStore = await getKv();
		const configOptions = Array.from(configMetadataMap.keys());

		const rankedOptions: { name: string; value: string; count: bigint }[] =
			[];

		for (const path of configOptions) {
			const countRecord = await kvStore.get<Deno.KvU64>([
				"config_option_usage",
				path,
			]);
			// Deno.KvU64 stores bigint
			const count = countRecord?.value?.value ?? 0n;
			rankedOptions.push({
				name: formatConfigPathToName(path),
				value: path,
				count: count,
			});
		}

		// Sort: 1. by count (desc), 2. by formatted name (A-Z)
		rankedOptions.sort((a, b) => {
			if (a.count < b.count) return 1;
			if (a.count > b.count) return -1;
			return a.name.localeCompare(b.name);
		});

		const lowerSearchValue = searchValue.toLowerCase();
		const filteredChoices = rankedOptions
			.filter((opt) =>
				opt.name.toLowerCase().includes(lowerSearchValue) ||
				// Also match against the raw path
				opt.value.toLowerCase().includes(lowerSearchValue)
			)
			.map((opt) => ({ name: opt.name, value: opt.value }))
			.slice(0, 25);

		return ok(filteredChoices);
	} catch (error: unknown) {
		// Fallback console logging
		console.error("Error in getRankedConfigOptions:", error);
		if (error instanceof Error) {
			return err(error);
		}
		return err(
			new Error(
				"An unknown error occurred while fetching ranked config options",
			),
		);
	}
}
