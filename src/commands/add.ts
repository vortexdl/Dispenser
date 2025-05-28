import { type ActionRow, type Interaction } from "@discordeno/bot";
import {
    ApplicationCommandOptionTypes,
    ApplicationCommandTypes,
    ButtonStyles,
    MessageComponentTypes,
    MessageFlags,
} from "@discordeno/bot";
import { type Embed } from "npm:@discordeno/bot@21.0.0";
import type { BotWithCache } from "../bot.ts";

import { linksDb } from "$db";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

import mainConfig from "../../config.ts";
import { getGuildConfig } from "../util/configManager.ts";

/**
 * Command data for the `/add` command
 */
export const data = {
    name: "add",
    description: "Adds one or more links to a category in the guild",
    type: ApplicationCommandTypes.ChatInput,
    options: [
        {
            type: ApplicationCommandOptionTypes.String,
            name: "category",
            description: "The category to add the link(s) to",
            required: true,
            autocomplete: true,
        },
        {
            type: ApplicationCommandOptionTypes.String,
            name: "link",
            description: "The link(s) to add (comma-separated for multiple)",
            required: true,
        },
    ],
    dmPermission: false,
};

/**
 * Whether this command can only be run by administrators
 */
export const adminOnly = true;

/**
 * Interface for tracking link processing results
 */
interface LinkResult {
    link: string;
    status: "success" | "duplicate" | "leak" | "error";
    error?: string;
    leakGuilds?: number;
}

/**
 * Interface for aggregated results
 */
interface ProcessingResults {
    successful: LinkResult[];
    duplicates: LinkResult[];
    leaks: LinkResult[];
    errors: LinkResult[];
}

export async function handle(
    bot: BotWithCache,
    interaction: Interaction,
    logger: PrefixedLogger
): Promise<void> {
    const responder = new Responder(
        bot,
        interaction.id,
        interaction.token,
        logger
    );
    const guildConfig = await getGuildConfig(String(interaction.guildId));

    // Properly extract and type options
    const options = interaction.data?.options;
    const linkOption = options?.find((opt) => opt.name === "link");
    const categoryOption = options?.find((opt) => opt.name === "category");
    const premiumOption = options?.find((opt) => opt.name === "premium");

    if (
        !linkOption ||
        typeof linkOption.value !== "string" ||
        !categoryOption ||
        typeof categoryOption.value !== "string" ||
        (premiumOption && typeof premiumOption.value !== "string")
    ) {
        await responder.respond(
            "Link, category, and premium status (y/n) must be provided as strings!"
        );
        return;
    }

    await responder.defer();

    const linksInput: string = linkOption.value;
    const categoryValue: string = categoryOption.value;
    const premiumStringValue: string = premiumOption?.value || "n";
    const isPremium = premiumStringValue.toLowerCase() === "y";

    // Detect if user intended multiple links (contains comma)
    const isMultipleLinkIntent = linksInput.includes(",");

    // Parse comma-separated links
    const linksList = linksInput
        .split(",")
        .map((link) => link.trim())
        .filter((link) => link.length > 0);

    if (linksList.length === 0) {
        if (isMultipleLinkIntent) {
            await responder.editResponse("No valid links provided!");
        } else {
            await responder.editResponse("The link isn't valid!");
        }
        return;
    }

    // Remove duplicates from the input
    const uniqueLinks = [...new Set(linksList)];

    if (uniqueLinks.length !== linksList.length) {
        const duplicateCount = linksList.length - uniqueLinks.length;
        logger.info(`Removed ${duplicateCount} duplicate links from input`);
    }

    // For single link, use simpler processing
    if (uniqueLinks.length === 1 && !isMultipleLinkIntent) {
        await handleSingleLink(
            uniqueLinks[0],
            categoryValue,
            isPremium,
            String(interaction.guildId),
            String(interaction.user.id),
            bot,
            responder,
            guildConfig,
            logger
        );
        return;
    }

    // Process each link and categorize results
    const results: ProcessingResults = {
        successful: [],
        duplicates: [],
        leaks: [],
        errors: [],
    };

    for (const link of uniqueLinks) {
        try {
            const result = await processLink(
                link,
                categoryValue,
                isPremium,
                String(interaction.guildId),
                String(interaction.user.id)
            );

            switch (result.status) {
                case "success":
                    results.successful.push(result);
                    break;
                case "duplicate":
                    results.duplicates.push(result);
                    break;
                case "leak":
                    results.leaks.push(result);
                    break;
                case "error":
                    results.errors.push(result);
                    break;
            }
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            results.errors.push({
                link,
                status: "error",
                error: errorMessage,
            });
            logger.error(`Error processing link ${link}`, { error });
        }
    }

    // Handle leak notifications if any leaks were detected
    if (results.leaks.length > 0) {
        await handleLeakNotifications(
            bot,
            results.leaks,
            String(interaction.guildId),
            logger
        );
    }

    // Insert successful links
    if (results.successful.length > 0) {
        try {
            const documentsToInsert = results.successful.map((result) => ({
                guildId: String(interaction.guildId),
                link: result.link,
                cat: categoryValue,
                isPremium: isPremium,
                addedByUserId: String(interaction.user.id),
                addedTimestamp: new Date(),
            }));

            await linksDb.insertMany(documentsToInsert as any);
            logger.info(
                `Successfully added ${results.successful.length} links to guild ${interaction.guildId}`
            );
        } catch (error: unknown) {
            logger.error("Failed to insert links to database", { error });
            await responder.editResponse(
                "⚠️ An error occurred while saving the links to the database"
            );
            return;
        }
    }

    // Generate comprehensive response
    const responseEmbed = await generateResultsEmbed(
        results,
        categoryValue,
        isPremium,
        guildConfig,
        uniqueLinks.length
    );

    await responder.editEmbed(responseEmbed);
}

/**
 * Handles adding a single link with original-style behavior including interactive leak warnings
 */
async function handleSingleLink(
    link: string,
    category: string,
    isPremium: boolean,
    guildId: string,
    userId: string,
    bot: BotWithCache,
    responder: Responder,
    guildConfig: any,
    logger: PrefixedLogger
): Promise<void> {
    const toInsert = {
        guildId: guildId,
        link: link,
        cat: category,
        isPremium: isPremium,
        addedByUserId: userId,
        addedTimestamp: new Date(),
    };

    // Check for existing link using precise fields
    if (
        await linksDb.findOne({
            guildId: toInsert.guildId,
            link: toInsert.link,
            cat: toInsert.cat,
        })
    ) {
        await responder.editResponse(
            "This exact link and category combination already exists!"
        );
        return;
    }

    // Check if this link exists in other guilds (potential leak)
    const otherGuildInstances = await linksDb
        .find({
            link: link,
            guildId: { $ne: guildId },
        })
        .toArray();

    if (otherGuildInstances.length > 0) {
        // The link exists in other guilds - potential leak
        logger.warn(
            `Link ${link} found in ${otherGuildInstances.length} other guilds when adding to guild ${guildId}`
        );

        // Create warning embed with confirmation buttons
        const warningEmbed: Embed = {
            title: "⚠️ Potential Link Leak Detected",
            description: `The link you're trying to add exists in ${otherGuildInstances.length} other server(s).\n\nDo you want to continue adding this link anyway?`,
            color: parseInt(guildConfig.theme.warning_color, 16),
            footer: {
                text: "If you continue, a notification will be sent to the other servers and bot developers",
            },
        };

        // Create confirmation buttons
        const actionRow: ActionRow = {
            type: MessageComponentTypes.ActionRow,
            components: [
                {
                    type: MessageComponentTypes.Button,
                    style: ButtonStyles.Success,
                    label: "Continue Adding",
                    customId: `add_confirm_${btoa(link).substring(0, 80)}`,
                },
                {
                    type: MessageComponentTypes.Button,
                    style: ButtonStyles.Danger,
                    label: "Cancel",
                    customId: `add_cancel_${btoa(link).substring(0, 80)}`,
                },
                {
                    type: MessageComponentTypes.Button,
                    style: ButtonStyles.Secondary,
                    label: "Report Other Servers",
                    customId: `add_report_link_leaking_${btoa(link).substring(
                        0,
                        80
                    )}`,
                },
            ] as any,
        };

        // Send the warning with buttons
        await responder.editWithEmbedAndComponents(
            warningEmbed,
            [actionRow],
            MessageFlags.Ephemeral
        );

        // Send notifications to other servers' report channels
        await sendLeakNotifications(
            bot,
            link,
            guildId,
            otherGuildInstances,
            logger
        );
        // Also notify bot developers through the link leaking channel
        await sendDeveloperLeakNotification(
            bot,
            link,
            guildId,
            otherGuildInstances,
            logger
        );

        return;
    }

    // No potential leak, proceed with adding the link
    await linksDb.insertOne(toInsert as any);
    await responder.editResponse(
        `Added ${link} to ${category} (${
            isPremium ? "Premium" : "Standard"
        }) ✅`
    );
}

/**
 * Processes a single link and determines its status
 */
async function processLink(
    link: string,
    category: string,
    isPremium: boolean,
    guildId: string,
    userId: string
): Promise<LinkResult> {
    // Check for existing link using precise fields
    const existingLink = await linksDb.findOne({
        guildId: guildId,
        link: link,
        cat: category,
    });

    if (existingLink) {
        return {
            link,
            status: "duplicate",
        };
    }

    // Check if this link exists in other guilds (potential leak)
    const otherGuildInstances = await linksDb
        .find({
            link: link,
            guildId: { $ne: guildId },
        })
        .toArray();

    if (otherGuildInstances.length > 0) {
        return {
            link,
            status: "leak",
            leakGuilds: otherGuildInstances.length,
        };
    }

    return {
        link,
        status: "success",
    };
}

/**
 * Handles leak notifications for all detected leaks
 */
async function handleLeakNotifications(
    bot: BotWithCache,
    leaks: LinkResult[],
    currentGuildId: string,
    logger: PrefixedLogger
): Promise<void> {
    for (const leak of leaks) {
        try {
            // Get other guild instances for this specific link
            const otherGuildInstances = await linksDb
                .find({
                    link: leak.link,
                    guildId: { $ne: currentGuildId },
                })
                .toArray();

            await sendLeakNotifications(
                bot,
                leak.link,
                currentGuildId,
                otherGuildInstances,
                logger
            );

            await sendDeveloperLeakNotification(
                bot,
                leak.link,
                currentGuildId,
                otherGuildInstances,
                logger
            );
        } catch (error: unknown) {
            logger.error(
                `Failed to send leak notifications for link ${leak.link}`,
                { error }
            );
        }
    }
}

/**
 * Generates a comprehensive results embed
 */
async function generateResultsEmbed(
    results: ProcessingResults,
    category: string,
    isPremium: boolean,
    guildConfig: any,
    totalProcessed: number
): Promise<Embed> {
    const { successful, duplicates, leaks, errors } = results;

    let description = `**Category:** ${category}\n**Premium:** ${
        isPremium ? "Yes" : "No"
    }\n**Total Links Processed:** ${totalProcessed}\n\n`;

    // Successful additions
    if (successful.length > 0) {
        description += `✅ **Successfully Added (${successful.length}):**\n`;
        successful.forEach((result, index) => {
            if (index < 10) {
                // Limit display to first 10 to avoid embed limits
                description += `• ${result.link}\n`;
            }
        });
        if (successful.length > 10) {
            description += `• *...and ${successful.length - 10} more*\n`;
        }
        description += "\n";
    }

    // Duplicates
    if (duplicates.length > 0) {
        description += `⚠️ **Already exists (${duplicates.length}):**\n`;
        duplicates.forEach((result, index) => {
            if (index < 5) {
                // Limit display to first 5
                description += `• ${result.link}\n`;
            }
        });
        if (duplicates.length > 5) {
            description += `• *...and ${duplicates.length - 5} more*\n`;
        }
        description += "\n";
    }

    // Leaks
    if (leaks.length > 0) {
        description += `🚨 **Potential leaks detected (${leaks.length}):**\n`;
        leaks.forEach((result, index) => {
            if (index < 5) {
                // Limit display to first 5
                description += `• ${result.link} (found in ${
                    result.leakGuilds
                } other server${result.leakGuilds === 1 ? "" : "s"})\n`;
            }
        });
        if (leaks.length > 5) {
            description += `• *...and ${leaks.length - 5} more*\n`;
        }
        description +=
            "*Leak notifications have been sent to affected servers and bot developers*\n\n";
    }

    // Errors
    if (errors.length > 0) {
        description += `❌ **Errors (${errors.length}):**\n`;
        errors.forEach((result, index) => {
            if (index < 3) {
                // Limit display to first 3
                description += `• ${result.link}: ${
                    result.error || "Unknown error"
                }\n`;
            }
        });
        if (errors.length > 3) {
            description += `• *...and ${errors.length - 3} more*\n`;
        }
        description += "\n";
    }

    // Determine embed color based on results
    let color: number;
    if (successful.length > 0 && leaks.length === 0 && errors.length === 0) {
        color = parseInt(guildConfig.theme.success_color || "00ff00", 16); // Green for success
    } else if (leaks.length > 0) {
        color = parseInt(guildConfig.theme.warning_color || "ffaa00", 16); // Orange for warnings
    } else if (errors.length > 0 && successful.length === 0) {
        color = parseInt(guildConfig.theme.error_color || "ff0000", 16); // Red for errors
    } else {
        color = parseInt(guildConfig.theme.main_color || "7289DA", 16); // Default
    }

    return {
        title: "📋 Link addition results",
        description: description.trim(),
        color: color,
        footer: {
            text: `${successful.length} added • ${duplicates.length} duplicates • ${leaks.length} leaks • ${errors.length} errors`,
        },
    };
}

/**
 * Sends notifications to the report channels of servers that may be affected by a link leak
 * @param bot The bot instance
 * @param link The link that may be leaked
 * @param currentGuildId The ID of the guild trying to add the link
 * @param otherInstances Other instances of the link in different guilds
 * @param logger The logger instance
 */
async function sendLeakNotifications(
    bot: BotWithCache,
    link: string,
    currentGuildId: string,
    otherInstances: any[],
    logger: PrefixedLogger
): Promise<void> {
    try {
        const guildConfig = await getGuildConfig(currentGuildId); // Get config for current guild to use its error color if needed
        // Get the current guild name if possible
        let currentGuildName = currentGuildId;
        try {
            const botWithCache = bot as any;
            const guild = botWithCache.cache?.guilds?.get?.(
                BigInt(currentGuildId)
            );
            if (guild && guild.name) {
                currentGuildName = guild.name;
            }
        } catch (_e) {
            // Ignore errors in getting guild name
        }

        // Create the leak notification embed
        const leakEmbed: Embed = {
            title: "⚠️ Possible leaked link detected!",
            description: `Someone just attempted to add a link from your server to another server!\n\n**Server:** ${currentGuildName}\n**Link:** ${link}`,
            color: parseInt(guildConfig.theme.error_color, 16), // Use error_color for leak alert in other servers
            footer: {
                text: "This may be a link leak! Use the button below to report this incident to bot developers.",
            },
        };

        // Create report button
        const actionRow: ActionRow = {
            type: MessageComponentTypes.ActionRow,
            components: [
                {
                    type: MessageComponentTypes.Button,
                    style: ButtonStyles.Danger,
                    label: "Report to Bot Developers",
                    customId: `leak_report_link_leaking_${btoa(link).substring(
                        0,
                        80
                    )}`,
                },
            ] as any,
        };

        // Send notifications to each affected guild
        for (const instance of otherInstances) {
            try {
                // Get the guild's reporting channel
                const reportChannelId = guildConfig?.reportsChannelId;

                if (reportChannelId) {
                    await bot.helpers.sendMessage(reportChannelId, {
                        embeds: [leakEmbed],
                        components: [actionRow],
                    });
                    await logger.debug(
                        `Sent leak notification to guild ${instance.guildId}`
                    );
                } else {
                    await logger.debug(
                        `Guild ${instance.guildId} has no report channel configured, skipping notification`
                    );
                }
            } catch (error: unknown) {
                await logger.error(
                    `Failed to send leak notification to guild ${instance.guildId}`,
                    { error }
                );
            }
        }
    } catch (error: unknown) {
        // No specific guild config here, as this is a general failure in the function
        // Consider a global default error color if appropriate, or log without colored embed
        await logger.error("Unknown error in sendLeakNotifications", { error });
    }
}

/**
 * Sends a notification to the bot developer channel about a potential link leak
 * @param bot The bot instance
 * @param link The link that may be leaked
 * @param currentGuildId The ID of the guild trying to add the link
 * @param otherInstances Other instances of the link in different guilds
 * @param logger The logger instance
 */
async function sendDeveloperLeakNotification(
    bot: BotWithCache,
    link: string,
    currentGuildId: string,
    otherInstances: any[],
    logger: PrefixedLogger
): Promise<void> {
    try {
        const guildConfig = await getGuildConfig(currentGuildId); // Get config for current guild
        const devChannel = mainConfig.logging.developerLogChannelLinkLeakingId;

        if (!devChannel) {
            logger.warn(
                "No developer log channel for link leaking configured, skipping notification..."
            );
            return;
        }

        // Get the current guild name if possible
        let currentGuildName = currentGuildId;
        try {
            const botWithCache = bot as any;
            const guild = botWithCache.cache?.guilds?.get?.(
                BigInt(currentGuildId)
            );
            if (guild && guild.name) {
                currentGuildName = guild.name;
            }
        } catch (_e) {
            // Ignore errors in getting guild name
        }

        // Build list of other guilds
        let otherGuildsText = "";
        for (let i = 0; i < otherInstances.length; i++) {
            const instance = otherInstances[i];
            let guildName = instance.guildId;

            try {
                const botWithCache = bot as any;
                const guild = botWithCache.cache?.guilds?.get?.(
                    BigInt(instance.guildId)
                );
                if (guild && guild.name) {
                    guildName = guild.name;
                }
            } catch (_e) {
                // Ignore errors in getting guild name
            }

            otherGuildsText += `${i + 1}. ${guildName} (ID: ${
                instance.guildId
            }) - Category: ${instance.cat}\n`;
        }

        // Create the developer notification embed
        const devEmbed: Embed = {
            title: "🚨 Potential link leak detected!",
            description: `Someone just attempted to add a link from a server to another server!\n\n**Adding Server:** ${currentGuildName}\n**Link:** ${link}\n\n**Existing in server(s):**\n${otherGuildsText}`,
            color: parseInt(guildConfig.theme.error_color, 16), // Use error_color for dev notification
        };

        // Send to developer channel
        await bot.helpers.sendMessage(devChannel, {
            embeds: [devEmbed],
        });

        await logger.debug("Sent the link leak notification to bot developer!");
    } catch (error: unknown) {
        // No specific guild config here
        await logger.error(
            "Failed to send bot developers the leak notification!",
            { error }
        );
    }
}
