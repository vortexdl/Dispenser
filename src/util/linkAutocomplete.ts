/**
 * Ryan Wilson
 * Utility module for link autocomplete functionality
 */

import type { ApplicationCommandOptionChoice } from "@discordeno/bot";
import { linksDb } from "$db";
import { Logger } from "./Logger.ts";
import { err, ok, Result } from "neverthrow";
import { MongoError, MongoServerError } from "mongodb";

/**
 * Fetches links for autocomplete suggestions
 * @param guildId The guild ID to fetch links from
 * @param searchValue The search value to filter links
 * @param logger Logger instance for error handling
 * @param categoryFilter Optional category filter to restrict results to a specific category
 * @returns A Result containing array of autocomplete choices or an error
 */
export async function getLinkAutocompleteChoices(
	guildId: string,
	searchValue: string,
	logger: Logger,
	categoryFilter?: string,
): Promise<Result<ApplicationCommandOptionChoice[], Error>> {
	try {
		const query: any = { guildId };
		if (categoryFilter) {
			query.cat = categoryFilter;
		}

		const guildLinks = await linksDb.find(query)
			.sort({ addedTimestamp: 1 })
			.toArray();

		const searchLower = searchValue.toLowerCase();
		const choices: ApplicationCommandOptionChoice[] = guildLinks
			.map((linkDocument) => linkDocument.link)
			.filter((link) =>
				typeof link === "string" &&
				link.toLowerCase().includes(searchLower)
			)
			.slice(0, 25)
			.map((link) => ({
				name: link.length > 100 ? link.substring(0, 97) + "..." : link,
				value: link,
			}));

		return ok(choices);
	} catch (error) {
		if (error instanceof MongoError || error instanceof MongoServerError) {
			const errorMsg =
				`Database error fetching links for autocomplete: ${error.message}`;
			logger.error(errorMsg, { error, guildId, categoryFilter });
			return err(new Error(errorMsg));
		} else if (error instanceof Error) {
			const errorMsg =
				`Error fetching links for autocomplete: ${error.message}`;
			logger.error(errorMsg, { error, guildId, categoryFilter });
			return err(new Error(errorMsg));
		} else {
			const errorMsg = `Unknown error fetching links for autocomplete: ${
				String(error)
			}`;
			logger.error(errorMsg, { error, guildId, categoryFilter });
			return err(new Error(errorMsg));
		}
	}
}
