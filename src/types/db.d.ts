// Ryan Wilson
// src/types/db.d.ts

import { ObjectId } from "mongodb";

/** Represents a user's filter settings in a guild */
export interface UserFilter {
	/** The ID of the guild */
	guildId: string;
	/** The ID of the user */
	userId: string;
	/** Array of filter strings */
	filters: Array<string>;
	/** Optional timestamp of when the filter was created */
	timestamp?: Date;
}

/** Represents a user's category assignment in a guild */
export interface UserCategory {
	/** The ID of the guild */
	guildId: string;
	/** The ID of the user */
	userId: string;
	/** The category name */
	cat: string;
}

/** Represents a user's data in the database */
export interface Users {
	/** MongoDB document ID */
	_id: ObjectId;
	/** The ID of the guild */
	guildId: string;
	/** The ID of the user */
	userId: string;
	/** The category name */
	cat: string;
	/** Array of links associated with the user */
	links: Array<string>;
	/** Number of times the user has accessed links */
	times: number;
}

/** Represents a link in a guild's category */
export interface Links {
	/** The ID of the guild */
	guildId: string;
	/** The category name */
	cat: string;
	/** The link URL */
	link: string;
	/** Whether the link is for premium users only */
	isPremium: boolean;
	/** The ID of the user who added the link */
	addedByUserId: string;
	/** Timestamp of when the link was added */
	addedTimestamp: Date;
	/** Whether Masqr protection is enabled for this link */
	masqrEnabled?: boolean;
	/** Whitelisted domains that bypass Masqr for this link */
	masqrWhitelistedDomains?: string[];
}

/** Represents usage limits for a category in a guild */
export interface Limit {
	/** The ID of the guild */
	guildId: string;
	/** The category name */
	cat: string;
	/** Regular user limit */
	limit: number;
	/** Premium user limit */
	premiumLimit: number;
}

/** Represents role configurations for a guild */
export interface Roles {
	/** The ID of the guild */
	guildId: string;
	/** ID of the admin role */
	admin: string;
	/** ID of the premium role */
	premium: string;
}

/** Represents log channel configuration for a guild */
export interface LogChannels {
	/** The ID of the guild */
	guildId: string;
	/** ID of the log channel */
	id: string;
}

/** Represents a user rating in the system */
export interface RatingDoc {
	/** MongoDB document ID */
	_id?: ObjectId;
	/** The ID of the guild */
	guildId: string;
	/** ID of the user being rated */
	targetUserId: string;
	/** ID of the user giving the rating */
	raterUserId: string;
	/** Number of stars in the rating */
	stars: number;
	/** Optional timestamp of when the rating was given */
	timestamp?: Date;
}

/** Represents a bot-specific ban in a guild */
export interface BotBanDoc {
	/** MongoDB document ID */
	_id?: ObjectId;
	/** The ID of the guild */
	guildId: string;
	/** ID of the banned user */
	userId: string;
	/** Optional reason for the ban */
	reason?: string;
	/** ID of the admin who issued the ban */
	bannedBy: string;
	/** Timestamp of when the ban was issued */
	timestamp: Date;
}

/** Represents a server rating given by a user */
export interface ServerRatingDoc {
	/** MongoDB document ID, optional as it's auto-generated on insert */
	_id?: ObjectId;
	/** The ID of the server (guild) being rated */
	guildId: string;
	/** ID of the user who gave the rating */
	raterUserId: string;
	/** Number of stars (1-5) */
	stars: number;
	/** Timestamp of when the rating was given/updated */
	timestamp?: Date;
}

/** Represents a globally banned server */
export interface GlobalBanDoc {
	/** MongoDB document ID */
	_id?: ObjectId;
	/** The ID of the guild that is globally banned */
	guildId: string;
	/** Optional reason for the global ban */
	reason?: string;
	/** ID of the bot developer who issued the ban */
	bannedBy: string;
	/** Timestamp of when the global ban was issued */
	timestamp: Date;
}

/** Represents an active Masqr license */
export interface MasqrLicense {
	/** MongoDB document ID */
	_id?: ObjectId;
	/** The license key/ID */
	licenseKey: string;
	/** The host domain this license is valid for */
	host: string;
	/** When the license expires */
	expires: Date;
	/** The ID of the guild this license was issued for */
	guildId: string;
	/** The ID of the user this license was issued to */
	userId: string;
	/** The category this license grants access to */
	category: string;
	/** Whether this license has been used */
	used: boolean;
	/** When the license was created */
	createdAt: Date;
	/** Optional metadata about the license */
	metadata?: Record<string, unknown>;
}

/** Represents a Masqr-protected domain configuration */
export interface MasqrDomain {
	/** MongoDB document ID */
	_id?: ObjectId;
	/** The domain name */
	domain: string;
	/** The ID of the guild that owns this domain */
	guildId: string;
	/** Whether Masqr protection is enabled for this domain */
	enabled: boolean;
	/** Pre-shared keys for authentication */
	preSharedKeys: string[];
	/** Domains that bypass Masqr protection */
	whitelistedDomains: string[];
	/** When the domain configuration was created */
	createdAt: Date;
	/** When the domain configuration was last updated */
	updatedAt: Date;
}

/** Represents Masqr access logs */
export interface MasqrAccessLog {
	/** MongoDB document ID */
	_id?: ObjectId;
	/** The license key used */
	licenseKey: string;
	/** The host domain accessed */
	host: string;
	/** The ID of the user who accessed */
	userId: string;
	/** The ID of the guild */
	guildId: string;
	/** Whether access was granted or denied */
	accessGranted: boolean;
	/** Reason for denial (if applicable) */
	denialReason?: string;
	/** IP address of the client */
	clientIp?: string;
	/** User agent of the client */
	userAgent?: string;
	/** Timestamp of the access attempt */
	timestamp: Date;
}

/** Represents per-category Masqr license configuration */
export interface MasqrCategoryConfig {
	/** MongoDB document ID */
	_id?: ObjectId;
	/** The ID of the guild this configuration belongs to */
	guildId: string;
	/** The category name this configuration applies to */
	category: string;
	/** Whether Masqr licenses are enabled for this category */
	enabled: boolean;
	/** Default license expiration time in hours for this category */
	defaultLicenseExpirationHours: number;
	/** Maximum license expiration time in hours for this category */
	maxLicenseExpirationHours: number;
	/** Category-specific validation endpoint URL (optional override) */
	validationEndpointUrl?: string;
	/** When the configuration was created */
	createdAt: Date;
	/** When the configuration was last updated */
	updatedAt: Date;
}

/** Represents a user's cohort membership */
export interface CohortMember {
	/** MongoDB document ID */
	_id?: ObjectId;
	/** The ID of the guild */
	guildId: string;
	/** The ID of the user */
	userId: string;
	/** Array of filter strings that define this user's cohort */
	filters: string[];
	/** Whether this member is part of the global cohort system */
	globalSystem: boolean;
	/** Timestamp of when the member joined this cohort */
	joinedAt: Date;
	/** Timestamp of when the member's cohort was last updated */
	updatedAt: Date;
}

/** Represents a cohort's unblocked links */
export interface CohortLinks {
	/** MongoDB document ID */
	_id?: ObjectId;
	/** The ID of the guild */
	guildId: string;
	/** Cohort identifier (hash of sorted filter array) */
	cohortId: string;
	/** Array of filter strings that define this cohort */
	filters: string[];
	/** Whether this is a global cohort */
	globalCohort: boolean;
	/** Array of unblocked link URLs for this cohort */
	unblockedLinks: string[];
	/** Timestamp of when the links were last checked */
	lastChecked: Date;
	/** Timestamp of when the links were last updated */
	lastUpdated: Date;
}

/** Represents a user's link allocation in a cohort */
export interface UserCohortLinks {
	/** MongoDB document ID */
	_id?: ObjectId;
	/** The ID of the guild */
	guildId: string;
	/** The ID of the user */
	userId: string;
	/** Cohort identifier */
	cohortId: string;
	/** Array of link URLs currently allocated to this user */
	allocatedLinks: string[];
	/** Timestamp of when the links were allocated */
	allocatedAt: Date;
}
