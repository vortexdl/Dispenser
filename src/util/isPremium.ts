import { type Member } from "@discordeno/bot";
import { rolesDb } from "$db";
import { err, ok, Result } from "neverthrow";
import { MongoError, MongoServerError } from "mongodb";

/**
 * Checks if a member has premium status in a guild
 * @param member The guild member to check
 * @param guildId The guild ID to check premium status for
 * @returns A Result indicating whether the member has premium status
 */
export default async function isPremium(
	member: Member,
	guildId: string,
): Promise<Result<boolean, Error>> {
	try {
		const roleDoc = await rolesDb.findOne({
			guildId: guildId,
		});

		const premium = roleDoc?.premium;

		if (!premium) {
			return ok(false);
		}

		try {
			const premiumRoleBigInt = BigInt(premium);
			return ok(member.roles.includes(premiumRoleBigInt));
		} catch (conversionError) {
			if (conversionError instanceof RangeError) {
				return err(
					new Error(
						`Premium role ID too large for BigInt conversion: ${premium}`,
					),
				);
			} else if (conversionError instanceof SyntaxError) {
				return err(
					new Error(
						`Invalid premium role ID format in database: ${premium}`,
					),
				);
			} else {
				return err(
					new Error(
						`Error converting premium role ID to BigInt: ${premium}`,
					),
				);
			}
		}
	} catch (error) {
		if (error instanceof MongoError || error instanceof MongoServerError) {
			return err(
				new Error(
					`Database error while checking premium status: ${error.message}`,
				),
			);
		} else if (error instanceof Error) {
			return err(
				new Error(`Error checking premium status: ${error.message}`),
			);
		} else {
			return err(
				new Error(
					`Unknown error checking premium status: ${String(error)}`,
				),
			);
		}
	}
}
