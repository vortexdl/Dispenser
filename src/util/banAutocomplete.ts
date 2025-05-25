import {
    type ApplicationCommandOptionChoice,
    type Bot,
    type User,
} from "@discordeno/bot";

import { botBansDb } from "$db";
import { MongoError, MongoServerError } from "mongodb";
import { err, ok, Result } from "neverthrow";

import { Logger } from "./Logger.ts";

/**
 * Provides autocomplete suggestions for users who are currently bot-banned in a guild
 * @param bot The bot instance
 * @param logger The logger instance
 * @param guildId The ID of the guild
 * @param searchValue The current value entered by the user for filtering
 * @returns A Result containing an array of ApplicationCommandOptionChoice for banned users
 */
export async function autocompleteBannedUsers(
    bot: Bot,
    logger: Logger,
    guildId: string,
    searchValue: string
): Promise<Result<ApplicationCommandOptionChoice[], Error>> {
    try {
        const lowerSearchValue = searchValue.toLowerCase();
        const bannedDocs = await botBansDb.find({ guildId }).toArray();

        if (bannedDocs.length === 0) return ok([]);

        const choices: ApplicationCommandOptionChoice[] = [];

        for (const ban of bannedDocs) {
            try {
                const user = (await bot.helpers.getUser(
                    BigInt(ban.userId)
                )) as User;
                if (user) {
                    const userName = user.username ?? "Unknown User";
                    const userDiscriminator = user.discriminator ?? "0000";
                    const userId = user.id ? String(user.id) : ban.userId;
                    const userTag = `${userName}#${userDiscriminator}`;
                    const choiceName = `${userTag} (ID: ${userId})`;
                    if (
                        choiceName.toLowerCase().includes(lowerSearchValue) ||
                        userId.includes(lowerSearchValue)
                    ) {
                        choices.push({
                            name:
                                choiceName.length > 100
                                    ? choiceName.substring(0, 97) + "..."
                                    : choiceName,
                            value: userId,
                        });
                    }
                }
            } catch (userFetchError) {
                logger.warn(
                    `banAutocomplete: Error fetching user ${ban.userId} for banned list`,
                    { userFetchError }
                );
                // Optionally add a choice indicating the ID if user fetch fails but matches search
                if (String(ban.userId).includes(lowerSearchValue)) {
                    choices.push({
                        name: `ID: ${ban.userId} (User data unavailable)`.substring(
                            0,
                            100
                        ),
                        value: String(ban.userId),
                    });
                }
            }
            if (choices.length >= 25) break; // Discord limit
        }
        return ok(choices.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
        if (error instanceof MongoError || error instanceof MongoServerError) {
            const errorMsg = `Database error in autocompleteBannedUsers: ${error.message}`;
            logger.error(errorMsg, { error, guildId });
            return err(new Error(errorMsg));
        } else if (error instanceof Error) {
            const errorMsg = `Error in autocompleteBannedUsers: ${error.message}`;
            logger.error(errorMsg, { error, guildId });
            return err(new Error(errorMsg));
        } else {
            const errorMsg = `Unknown error in autocompleteBannedUsers: ${String(
                error
            )}`;
            logger.error(errorMsg, { error, guildId });
            return err(new Error(errorMsg));
        }
    }
}

/**
 * Provides autocomplete suggestions for users in a guild who are NOT currently bot-banned
 * Filters by guild members based on searchValue
 * @param bot The bot instance
 * @param logger The logger instance
 * @param guildId The ID of the guild
 * @param searchValue The current value entered by the user for filtering
 * @returns A Result containing an array of ApplicationCommandOptionChoice for non-banned guild members
 */
export async function autocompleteNonBannedUsers(
    bot: Bot,
    logger: Logger,
    guildId: string,
    searchValue: string
): Promise<Result<ApplicationCommandOptionChoice[], Error>> {
    try {
        const lowerSearchValue = searchValue.toLowerCase();
        const bannedDocs = await botBansDb.find({ guildId }).toArray();
        const bannedUserIds = new Set(bannedDocs.map((ban) => ban.userId));

        let guildMembers: User[] = [];
        try {
            // Fetch guild members. This might be a large list, so Discordeno might paginate
            // For simplicity, this example fetches up to 1000. Adjust as needed
            const membersResponse = await bot.helpers.getMembers(
                BigInt(guildId),
                { limit: 1000 }
            );
            // Extract users from members - need to handle the member.user relationship
            for (const member of membersResponse) {
                const memberAny = member as any;
                if (memberAny.user) {
                    guildMembers.push(memberAny.user as User);
                } else if (memberAny.id) {
                    // If member doesn't have user property, try to fetch user directly
                    try {
                        const user = (await bot.helpers.getUser(
                            BigInt(memberAny.id)
                        )) as User;
                        if (user) guildMembers.push(user);
                    } catch {
                        // Skip if we can't fetch the user
                    }
                }
            }
        } catch (memberFetchError) {
            const errorMsg = `Error fetching guild members for non-banned autocomplete: ${
                memberFetchError instanceof Error
                    ? memberFetchError.message
                    : String(memberFetchError)
            }`;
            logger.error(errorMsg, { memberFetchError, guildId });
            return err(new Error(errorMsg));
        }

        const choices: ApplicationCommandOptionChoice[] = [];
        for (const user of guildMembers) {
            if (!user) continue;

            const userId = user.id ? String(user.id) : undefined;
            if (!userId || bannedUserIds.has(userId)) continue; // Skip if no user ID or already banned

            const userName = user.username ?? "Unknown User";
            const userDiscriminator = user.discriminator ?? "0000";
            const userTag = `${userName}#${userDiscriminator}`;
            const choiceName = `${userTag} (ID: ${userId})`;

            if (
                choiceName.toLowerCase().includes(lowerSearchValue) ||
                userId.includes(lowerSearchValue)
            ) {
                choices.push({
                    name:
                        choiceName.length > 100
                            ? choiceName.substring(0, 97) + "..."
                            : choiceName,
                    value: userId,
                });
            }
            if (choices.length >= 25) break; // Discord limit
        }
        return ok(choices.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error) {
        if (error instanceof MongoError || error instanceof MongoServerError) {
            const errorMsg = `Database error in autocompleteNonBannedUsers: ${error.message}`;
            logger.error(errorMsg, { error, guildId });
            return err(new Error(errorMsg));
        } else if (error instanceof Error) {
            const errorMsg = `Error in autocompleteNonBannedUsers: ${error.message}`;
            logger.error(errorMsg, { error, guildId });
            return err(new Error(errorMsg));
        } else {
            const errorMsg = `Unknown error in autocompleteNonBannedUsers: ${String(
                error
            )}`;
            logger.error(errorMsg, { error, guildId });
            return err(new Error(errorMsg));
        }
    }
}
