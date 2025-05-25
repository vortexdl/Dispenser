import { type Bot, type Interaction } from "@discordeno/bot";
import { err, ok, Result } from "neverthrow";
import { MongoError, MongoServerError } from "mongodb";

import Responder from "../util/Responder.ts";

import { catsDb } from "$db";
import { Logger } from "./Logger.ts";

/**
 * Updates user category selection in the database
 * @param guildId The guild ID
 * @param userId The user ID
 * @param category The selected category
 * @returns A Result indicating success or failure
 */
async function updateUserCategory(
	guildId: string,
	userId: string,
	category: string,
): Promise<Result<void, Error>> {
	try {
		await catsDb.updateMany(
			{
				guildId: guildId,
				userId: userId,
			},
			{
				$set: {
					cat: category,
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
					`Database error while updating user category: ${error.message}`,
				),
			);
		} else if (error instanceof Error) {
			return err(
				new Error(`Failed to update user category: ${error.message}`),
			);
		} else {
			return err(
				new Error(
					`Failed to update user category: Unknown error occurred`,
				),
			);
		}
	}
}

export default async function (
	bot: Bot,
	interaction: Interaction,
	logger: Logger,
) {
	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	const userId = String(interaction.user.id);
	const guildId = String(interaction.guildId);

	const name = interaction.user.username;

	const cats = interaction.data?.values;

	if (!cats || !Array.isArray(cats) || cats.length === 0) {
		logger.error(
			"No categories found in interaction data for the category command",
			{ userId, guildId },
		);
		return await responder.respond(
			"No category selected or an error occurred.",
		);
	}

	// Safely access the first element
	const cat = cats[0];
	if (typeof cat !== "string" || cat.trim() === "") {
		logger.error("Invalid category value provided", {
			userId,
			guildId,
			category: cat,
		});
		return await responder.respond("Invalid category selected!");
	}

	console.log(`${name} selected ${cat}`);

	const result = await updateUserCategory(guildId, userId, cat);

	if (result.isErr()) {
		logger.error("Failed to update user category", {
			error: result.error,
			guildId,
			userId,
			category: cat,
		});
		return await responder.respond(
			"Failed to update category due to a database error",
		);
	}

	return await responder.respond("Updated ✅");
}
