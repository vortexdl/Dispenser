import { type Member, Permissions } from "@discordeno/bot";
import { err, ok, Result } from "neverthrow";
import { MongoError, MongoServerError } from "mongodb";

import { rolesDb } from "$db";

import { type Logger } from "./Logger.ts";

export default async (
	member: Member,
	guildId: string,
	logger: Logger,
): Promise<boolean> => {
	try {
		// Member.permissions could be a bigint or an instance of the Permissions class
		// Ensure we have a Permissions object to work with
		const memberPermissions = typeof member.permissions === "bigint"
			? new Permissions(member.permissions)
			: member.permissions;

		if (memberPermissions?.has("ADMINISTRATOR")) return true;

		const roleRecord = await rolesDb.findOne({ guildId });
		const adminRoleId = roleRecord?.admin;

		if (!adminRoleId) return false;

		// Safely convert to BigInt with proper validation
		let adminRoleBigInt: bigint;
		try {
			adminRoleBigInt = BigInt(adminRoleId);
		} catch (conversionError) {
			if (conversionError instanceof RangeError) {
				logger.warn(
					`Admin role ID too large for BigInt conversion: ${adminRoleId}`,
					{ guildId, error: conversionError.message },
				);
			} else if (conversionError instanceof SyntaxError) {
				logger.warn(
					`Invalid admin role ID format in database: ${adminRoleId}`,
					{ guildId, error: conversionError.message },
				);
			} else if (conversionError instanceof Error) {
				logger.warn(
					`Error converting admin role ID to BigInt: ${adminRoleId}`,
					{ guildId, error: conversionError.message },
				);
			} else {
				logger.warn(
					`Unknown error converting admin role ID: ${adminRoleId}`,
					{ guildId, error: conversionError },
				);
			}
			return false;
		}

		return member.roles.includes(adminRoleBigInt);
	} catch (error) {
		if (error instanceof MongoError || error instanceof MongoServerError) {
			logger.error("Database error checking admin status", {
				error: error.message,
				guildId,
				memberId: member.id,
			});
		} else if (error instanceof Error) {
			logger.error("Error checking admin status", {
				error: error.message,
				guildId,
				memberId: member.id,
			});
		} else {
			logger.error("Unknown error checking admin status", {
				error,
				guildId,
				memberId: member.id,
			});
		}
		return false; // Fail-safe: assume not admin on error
	}
};
