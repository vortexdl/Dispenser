/**
 * Utility for fetching all guilds the bot has access to via Discord API
 */

import { Bot, type Guild } from "@discordeno/bot";
import { Logger } from "./Logger.ts";

import config from "../../config.ts";

/**
 * Fetches all guilds using OAuth2 with pagination
 */
export default async function fetchAllUserGuilds(
	bot: Bot,
	bearerToken: string,
	logger: Logger,
): Promise<any[]> {
	const allGuilds: any[] = [];
	let after: string | undefined;
	const limit = 200; // Discord's maximum per request

	while (true) {
		try {
			const params = new URLSearchParams({
				limit: limit.toString(),
				with_counts: "true",
			});

			if (after) {
				params.set("after", after);
			}

			const url =
				`https://discord.com/api/v10/users/@me/guilds?${params}`;
			const response = await fetch(url, {
				headers: {
					Authorization: `Bearer ${bearerToken}`,
					"User-Agent": "DiscordBot (Unknown, 1.0)",
				},
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() =>
					"Unknown error"
				);
				if (response.status === 401) {
					throw new Error(
						`Unauthorized access to Discord API: Invalid or expired bearer token`,
					);
				} else if (response.status === 403) {
					throw new Error(
						`Forbidden access to Discord API: Insufficient permissions`,
					);
				} else if (response.status === 429) {
					throw new Error(`Rate limited by Discord API`);
				} else {
					throw new Error(
						`Discord API error: ${response.status} ${response.statusText} - ${errorText}`,
					);
				}
			}

			const guilds = await response.json();

			if (!Array.isArray(guilds)) {
				throw new Error(
					"Discord API returned invalid data: Expected array of guilds",
				);
			}

			allGuilds.push(...guilds);

			// Check if we've reached the end
			if (guilds.length < limit) {
				break;
			}

			// Set the after parameter for the next request
			after = guilds[guilds.length - 1]?.id;
			if (!after) {
				break;
			}

			// Add a small delay to be respectful to the API
			await new Promise((resolve) => setTimeout(resolve, 100));
		} catch (error) {
			if (error instanceof TypeError && error.message.includes("fetch")) {
				logger.error(
					"Network error while fetching guilds from Discord API",
					{ error: error.message },
				);
				throw new Error(`Network error: ${error.message}`);
			} else if (
				error instanceof SyntaxError && error.message.includes("JSON")
			) {
				logger.error("Invalid JSON response from Discord API", {
					error: error.message,
				});
				throw new Error(
					`Invalid response format from Discord API: ${error.message}`,
				);
			} else if (error instanceof Error) {
				logger.error("Error fetching guilds from Discord API", {
					error: error.message,
				});
				throw error; // Re-throw the error with its specific message
			} else {
				logger.error("Unknown error fetching guilds from Discord API", {
					error,
				});
				throw new Error("Unknown error occurred while fetching guilds");
			}
		}
	}

	return allGuilds;
}
