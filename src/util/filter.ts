import { err, ok, Result } from "neverthrow";

import { type Bot, type Interaction } from "@discordeno/bot";

import { MongoError, MongoServerError } from "mongodb";
import { filtersDb } from "$db";
import type { PrefixedLogger } from "./Logger.ts";

import Responder from "../util/Responder.ts";

/**
 * Updates user filters in the database
 * @param guildId The guild ID
 * @param userId The user ID
 * @param filters Array of filter strings
 * @returns A Result indicating success or failure
 */
async function updateUserFilters(
	guildId: string,
	userId: string,
	filters: string[],
): Promise<Result<void, Error>> {
	try {
		await filtersDb.updateMany(
			{
				guildId: guildId,
				userId: userId,
			},
			{
				$set: {
					filters: filters,
				},
			},
			{
				upsert: true,
			},
		);
		return ok(undefined);
	} catch (error) {
		if (error instanceof MongoError || error instanceof MongoServerError) {
			return err(
				new Error(
					`Database error while updating user filters: ${error.message}`,
				),
			);
		} else if (error instanceof Error) {
			return err(
				new Error(`Failed to update user filters: ${error.message}`),
			);
		} else {
			return err(
				new Error(
					`Failed to update user filters: Unknown error occurred`,
				),
			);
		}
	}
}

export default async function handle(
	bot: Bot,
	interaction: Interaction,
	logger: PrefixedLogger,
): Promise<void> {
	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	const guildId = String(interaction.guildId);
	const userId = String(interaction.user.id);

	const name: string = interaction.user.username;

	const filters = interaction?.data?.values;

	if (filters) {
		logger.info(`${name} now uses ${filters?.join(", ")}`);

		const result = await updateUserFilters(guildId, userId, filters);
		if (result.isErr()) {
			logger.error("Failed to update user filters", {
				error: result.error,
				guildId,
				userId,
			});
			await responder.respond(
				"Failed to update filters due to a database error",
			);
			return;
		}

		await responder.respond("Updated ✅");
		return;
	}
}
