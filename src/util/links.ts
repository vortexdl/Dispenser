import { linksDb } from "$db";
import { MongoError, MongoServerError } from "mongodb";
import { err, ok, Result } from "neverthrow";
import blocked from "./checker/ls.ts";

function noLinksMessage(filter: string): string {
	return `All links are blocked by ${filter}!`;
}

/**
 * Fetches a random link from the database for a given guild and category with optional Masqr filtering
 * @param guildId The guild ID to fetch links from
 * @param ownedLinks Array of links the user already owns (to exclude)
 * @param filters Array of filter names to apply
 * @param cat The category to fetch links from
 * @param masqrOnly Optional: true to only return Masqr-protected links, false to exclude them, undefined for no filtering
 * @returns A Result containing the random link or error message
 */
export default async function getRandomLink(
	guildId: string,
	ownedLinks: Array<string>,
	filters: Array<string>,
	cat: string,
	masqrOnly?: boolean,
): Promise<Result<string, Error>> {
	try {
		// Build the base query
		const query: any = {
			guildId: guildId,
			cat: cat,
		};

		// Add Masqr filtering if specified
		if (masqrOnly === true) {
			query.masqrEnabled = true;
		} else if (masqrOnly === false) {
			query.$or = [
				{ masqrEnabled: { $ne: true } },
				{ masqrEnabled: { $exists: false } },
			];
		}

		const cursor = await linksDb.find(query);
		const links = await cursor.toArray();

		if (!Array.isArray(links) || links.length === 0) {
			if (masqrOnly === true) {
				return ok(
					"There are no Masqr-protected links in this category!",
				);
			} else if (masqrOnly === false) {
				return ok(
					"There are no regular (non-Masqr) links in this category!",
				);
			} else {
				return ok("There are no links!");
			}
		}

		let filteredLinks: Array<string> = [];

		if (ownedLinks && Array.isArray(ownedLinks)) {
			filteredLinks = links
				.map((entry) => entry.link)
				.filter((entry) =>
					typeof entry === "string" && !ownedLinks.includes(entry)
				);
		} else {
			filteredLinks = links
				.map((entry) => entry.link)
				.filter((entry) => typeof entry === "string");
		}

		// Apply Lightspeed blocking
		if (
			filters && Array.isArray(filters) && filters.includes("lightspeed")
		) {
			let blockedCount = 0;
			for (let i = filteredLinks.length - 1; i >= 0; i--) {
				try {
					const isBlockedResult = await blocked(filteredLinks[i]);
					if (isBlockedResult.isOk() && isBlockedResult.value) {
						filteredLinks.splice(i, 1);
						blockedCount++;
					} else if (isBlockedResult.isErr()) {
						console.warn(
							`Error checking link ${
								filteredLinks[i]
							} with Lightspeed filter: ${isBlockedResult.error.message}`,
						);
						// Keep the link if we can't check it
					}
				} catch (error) {
					if (error instanceof Error) {
						console.warn(
							`Error checking link ${
								filteredLinks[i]
							} with Lightspeed filter: ${error.message}`,
						);
					} else {
						console.warn(
							`Unknown error checking link ${
								filteredLinks[i]
							} with Lightspeed filter:`,
							error,
						);
					}
					// Keep the link if we can't check it
				}
			}

			if (filteredLinks.length === 0) {
				return ok(noLinksMessage("lightspeed"));
			}
		}

		if (filteredLinks.length === 0) {
			const criteria = masqrOnly === true
				? "Masqr-protected "
				: masqrOnly === false
				? "regular (non-Masqr) "
				: "";
			return ok(
				`No available ${criteria}links that match your criteria!`,
			);
		}

		const randomIndex = Math.floor(Math.random() * filteredLinks.length);
		const randomLink = filteredLinks[randomIndex];

		if (!randomLink || typeof randomLink !== "string") {
			return ok("Error selecting a random link");
		}

		return ok(randomLink);
	} catch (error) {
		if (error instanceof MongoError || error instanceof MongoServerError) {
			const errorMsg =
				`Database error when fetching links for guild ${guildId}, category ${cat}: ${error.message}`;
			console.error(errorMsg);
			return err(
				new Error("Database error occurred while fetching links"),
			);
		} else if (error instanceof Error) {
			const errorMsg =
				`Error when fetching links for guild ${guildId}, category ${cat}: ${error.message}`;
			console.error(errorMsg);
			return err(new Error("An error occurred while fetching links"));
		} else {
			const errorMsg =
				`Unknown error when fetching links for guild ${guildId}, category ${cat}: ${
					String(error)
				}`;
			console.error(errorMsg);
			return err(
				new Error("An unknown error occurred while fetching links"),
			);
		}
	}
}
