import config from "../config.ts";

import type {
	BotBanDoc,
	CohortLinks,
	CohortMember,
	GlobalBanDoc,
	Limit,
	Links,
	LogChannels,
	MasqrAccessLog,
	MasqrCategoryConfig,
	MasqrDomain,
	MasqrLicense,
	RatingDoc,
	Roles,
	UserCategory,
	UserCohortLinks,
	UserFilter,
	Users,
} from "./types/db.d.ts";

import type { GuildConfig } from "./types/guildConfig.d.ts";

await config.mongoClient.connect();
const db = config.mongoClient.db("bot");

/** Collection for user-defined filters */
export const filtersDb = db.collection<UserFilter>("filter");
/** Collection for user-defined categories */
export const catsDb = db.collection<UserCategory>("cat");
/** Collection for user data and link history */
export const usersDb = db.collection<Users>("users");
/** Collection for all links */
export const linksDb = db.collection<Links>("links");
/** Collection for category request limits */
export const limitsDb = db.collection<Limit>("limit");
/** Collection for admin and premium roles per guild */
export const rolesDb = db.collection<Roles>("roles");
/** Collection for log channel configurations (deprecated or specific use) */
export const chansDb = db.collection<LogChannels>("chans");
/** Collection for guild-specific configurations */
export const guildConfigsDb = db.collection<GuildConfig>("guildConfigs");
/** Collection for server ratings */
export const ratingsDb = db.collection<RatingDoc>("ratings");
/** Collection for bot-specific user bans per guild */
export const botBansDb = db.collection<BotBanDoc>("botBans");
/** Collection for globally banned guilds (from gallery/discovery) */
export const globalBansDb = db.collection<GlobalBanDoc>("globalBans");
/** Collection for active Masqr licenses */
export const masqrLicensesDb = db.collection<MasqrLicense>("masqrLicenses");
/** Collection for Masqr-protected domains */
export const masqrDomainsDb = db.collection<MasqrDomain>("masqrDomains");
/** Collection for Masqr access logs */
export const masqrAccessLogsDb = db.collection<MasqrAccessLog>(
	"masqrAccessLogs",
);
/** Collection for per-category Masqr license configurations */
export const masqrCategoryConfigsDb = db.collection<MasqrCategoryConfig>(
	"masqrCategoryConfigs",
);
/** Collection for cohort memberships */
export const cohortMembersDb = db.collection<CohortMember>("cohortMembers");
/** Collection for cohort unblocked links */
export const cohortLinksDb = db.collection<CohortLinks>("cohortLinks");
/** Collection for user cohort link allocations */
export const userCohortLinksDb = db.collection<UserCohortLinks>(
	"userCohortLinks",
);

export type {
	BotBanDoc,
	CohortLinks,
	CohortMember,
	GlobalBanDoc,
	GuildConfig,
	Limit,
	Links,
	LogChannels,
	MasqrAccessLog,
	MasqrDomain,
	MasqrLicense,
	RatingDoc,
	Roles,
	UserCategory,
	UserCohortLinks,
	UserFilter,
	Users,
};
