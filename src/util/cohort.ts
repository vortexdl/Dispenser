// Ryan Wilson

import { createHash } from "node:crypto";
import type { Bot } from "@discordeno/bot";
import { cohortLinksDb, cohortMembersDb, filtersDb, linksDb, userCohortLinksDb, usersDb } from "../db.ts";
import type { CohortLinks, CohortMember, Links, UserCohortLinks } from "../types/db.d.ts";
import type { GuildConfig } from "../types/guildConfig.d.ts";
import { getGuildConfig } from "./configManager.ts";
import type { Logger } from "./Logger.ts";
import blocked from "./checker/ls.ts";

/**
 * Generate a cohort ID from a sorted array of filters
 */
export function generateCohortId(filters: string[]): string {
	const sorted = [...filters].sort();
	return createHash("sha256").update(sorted.join("|")).digest("hex");
}

/**
 * Get or create a cohort member entry
 */
export async function ensureCohortMember(
	guildId: string,
	userId: string,
	filters: string[],
	globalSystem: boolean,
	logger: Logger
): Promise<CohortMember> {
	const now = new Date();
	
	const existingMember = await cohortMembersDb.findOne({
		guildId,
		userId,
	});

	if (existingMember) {
		// Update if filters or global system changed
		if (
			JSON.stringify(existingMember.filters.sort()) !== JSON.stringify(filters.sort()) ||
			existingMember.globalSystem !== globalSystem
		) {
			await cohortMembersDb.updateOne(
				{ _id: existingMember._id },
				{
					$set: {
						filters,
						globalSystem,
						updatedAt: now,
					},
				}
			);
			logger.info(`Updated cohort member ${userId} in guild ${guildId}`);
		}
		return { ...existingMember, filters, globalSystem, updatedAt: now };
	}

	// Create new member
	const newMember: CohortMember = {
		guildId,
		userId,
		filters,
		globalSystem,
		joinedAt: now,
		updatedAt: now,
	};

	await cohortMembersDb.insertOne(newMember);
	logger.info(`Created new cohort member ${userId} in guild ${guildId}`);
	
	return newMember;
}

/**
 * Get or create cohort links entry
 */
export async function ensureCohortLinks(
	guildId: string,
	filters: string[],
	globalCohort: boolean,
	logger: Logger
): Promise<CohortLinks> {
	const cohortId = generateCohortId(filters);
	const now = new Date();

	const existing = await cohortLinksDb.findOne({
		guildId,
		cohortId,
		globalCohort,
	});

	if (existing) {
		return existing;
	}

	// Create new cohort
	const newCohort: CohortLinks = {
		guildId,
		cohortId,
		filters,
		globalCohort,
		unblockedLinks: [],
		lastChecked: now,
		lastUpdated: now,
	};

	await cohortLinksDb.insertOne(newCohort);
	logger.info(`Created new cohort ${cohortId} for guild ${guildId}`);

	return newCohort;
}

/**
 * Check if a link is blocked by any filters
 */
export async function isLinkBlockedByFilters(
	link: string,
	filters: string[],
	logger: Logger
): Promise<boolean> {
	logger.debug(`Checking if link ${link} is blocked by filters: ${filters.join(", ")}`);
	
	// Check Lightspeed filter
	if (filters.includes("lightspeed")) {
		try {
			const isBlockedResult = await blocked(link);
			if (isBlockedResult.isOk() && isBlockedResult.value) {
				logger.debug(`Link ${link} is blocked by Lightspeed filter`);
				return true;
			} else if (isBlockedResult.isErr()) {
				logger.warn(`Error checking link ${link} with Lightspeed filter: ${isBlockedResult.error.message}`);
				// Return false if we can't check it (keep the link available)
				return false;
			}
		} catch (error) {
			logger.warn(`Error checking link ${link} with Lightspeed filter`, error as Error);
			// Return false if we can't check it (keep the link available)
			return false;
		}
	}
	
	// Add other filter checks here as needed
	// For now, only Lightspeed is implemented
	
	return false; // Not blocked by any implemented filters
}

/**
 * Get unblocked links for a cohort
 */
export async function getUnblockedLinksForCohort(
	guildId: string,
	category: string,
	filters: string[],
	logger: Logger
): Promise<string[]> {
	// Get all links in the category
	const allLinks = await linksDb.find({ guildId, cat: category }).toArray();
	
	const unblockedLinks: string[] = [];
	
	for (const linkDoc of allLinks) {
		const isBlocked = await isLinkBlockedByFilters(linkDoc.link, filters, logger);
		if (!isBlocked) {
			unblockedLinks.push(linkDoc.link);
		}
	}
	
	return unblockedLinks;
}

/**
 * Update cohort links if needed
 */
export async function updateCohortLinks(
	guildId: string,
	cohortId: string,
	globalCohort: boolean,
	logger: Logger
): Promise<void> {
	const now = new Date();
	const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
	
	const cohort = await cohortLinksDb.findOne({
		guildId,
		cohortId,
		globalCohort,
	});
	
	if (!cohort || cohort.lastChecked < oneHourAgo) {
		logger.info(`Updating links for cohort ${cohortId} in guild ${guildId}`);
		
		// Get user's category to check links
		const cohortMember = await cohortMembersDb.findOne({
			guildId,
			filters: cohort?.filters || [],
		});
		
		if (cohortMember) {
			const user = await usersDb.findOne({
				guildId,
				userId: cohortMember.userId,
			});
			
			if (user) {
				const unblockedLinks = await getUnblockedLinksForCohort(
					guildId,
					user.cat,
					cohort?.filters || [],
					logger
				);
				
				await cohortLinksDb.updateOne(
					{ guildId, cohortId, globalCohort },
					{
						$set: {
							unblockedLinks,
							lastChecked: now,
							lastUpdated: now,
						},
					},
					{ upsert: true }
				);
			}
		}
	}
}

/**
 * Get the current unblocked links for a user's cohort
 */
export async function getCohortLinksForUser(
	guildId: string,
	userId: string,
	filters: string[],
	maxLinks: number,
	logger: Logger
): Promise<string[]> {
	const cohortId = generateCohortId(filters);
	
	// Get or create cohort links
	const cohort = await cohortLinksDb.findOne({
		guildId,
		cohortId,
	});
	
	if (!cohort || cohort.unblockedLinks.length === 0) {
		logger.warn(`No unblocked links available for cohort ${cohortId}`);
		return [];
	}
	
	// Return the first maxLinks from the cohort's shared pool
	return cohort.unblockedLinks.slice(0, maxLinks);
}

/**
 * Allocate links to a user from their cohort
 * @deprecated Use getCohortLinksForUser instead - all cohort members share the same links
 */
export async function allocateLinksToUser(
	guildId: string,
	userId: string,
	cohortId: string,
	maxLinks: number,
	logger: Logger
): Promise<string[]> {
	const cohort = await cohortLinksDb.findOne({
		guildId,
		cohortId,
	});
	
	if (!cohort || cohort.unblockedLinks.length === 0) {
		logger.warn(`No unblocked links available for cohort ${cohortId}`);
		return [];
	}
	
	// Everyone in the cohort gets the same links
	return cohort.unblockedLinks.slice(0, maxLinks);
}

/**
 * Get cohort members in a guild
 */
export async function getCohortMembers(
	guildId: string,
	filters: string[],
	globalSystem: boolean
): Promise<CohortMember[]> {
	const cohortId = generateCohortId(filters);
	
	if (globalSystem) {
		// Get members from all guilds with global system enabled
		return await cohortMembersDb.find({
			filters: { $all: filters, $size: filters.length },
			globalSystem: true,
		}).toArray();
	} else {
		// Get members only from this guild
		return await cohortMembersDb.find({
			guildId,
			filters: { $all: filters, $size: filters.length },
		}).toArray();
	}
}

/**
 * Check and notify cohorts that need new links
 */
export async function checkAndNotifyCohorts(
	bot: Bot,
	logger: Logger
): Promise<void> {
	logger.info("Starting cohort link check");
	
	// Get all guilds with cohort system enabled
	const guildConfigs = await usersDb.distinct("guildId");
	
	for (const guildId of guildConfigs) {
		try {
			const config = await getGuildConfig(guildId);
			
			if (!config.cohort.enable) {
				continue;
			}
			
			// Get all cohorts in this guild
			const cohorts = await cohortLinksDb.find({ guildId }).toArray();
			
			for (const cohort of cohorts) {
				// Update cohort links
				await updateCohortLinks(guildId, cohort.cohortId, cohort.globalCohort, logger);
				
				// Check if cohort has fewer than max_links unblocked
				if (cohort.unblockedLinks.length < config.cohort.max_links) {
					// Get all members of this cohort
					const members = await getCohortMembers(
						guildId,
						cohort.filters,
						cohort.globalCohort
					);
					
					// Notify each member
					for (const member of members) {
						try {
							const user = await bot.helpers.getUser(BigInt(member.userId));
							if (user) {
 								const dm = await bot.helpers.getDmChannel(BigInt(member.userId));
								await bot.helpers.sendMessage(BigInt(dm.toString()), {
									content: `Your cohort in ${cohort.globalCohort ? "the global system" : `guild ${guildId}`} has new unblocked links available! Use \`/cohort getunblockedlinks\` to get them`,
								});
							}
						} catch (error) {
							logger.error(`Failed to notify user ${member.userId}`, error as Error);
						}
					}
				}
			}
		} catch (error) {
			logger.error(`Failed to check cohorts for guild ${guildId}`, error as Error);
		}
	}
	
	logger.info("Completed cohort link check");
} 