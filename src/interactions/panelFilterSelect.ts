/**
 * @name Ryan Wilson
 */
import {
	type Bot,
	type Interaction,
} from "npm:discordeno@^21.0.0-nightly.1724219627";
import {
	InteractionResponseTypes,
	MessageFlags,
} from "npm:discordeno@^21.0.0-nightly.1724219627";

import { filtersDb } from "$db";
import { logger } from "../util/Logger.ts";

import Responder from "../util/Responder.ts";

/**
 * Handles the interaction when a user selects filters from the panel
 * @param bot The bot instance
 * @param interaction The interaction object
 */
export async function handlePanelFilterSelect(
	bot: Bot,
	interaction: Interaction,
): Promise<void> {
	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	if (!interaction.guildId) {
		logger.warn("Panel filter interaction received outside of a guild");
		await responder.respond({
			type: InteractionResponseTypes.ChannelMessageWithSource,
			data: {
				content: "This interaction can only be used in a server",
				flags: MessageFlags.Ephemeral,
			},
		});
		return;
	}

	const guildId = String(interaction.guildId);
	const userId = String(interaction.user.id);
	const userName = interaction.user.username;

	// Ensure data and values are present
	if (!interaction.data?.values || interaction.data.values.length === 0) {
		logger.warn("No filter values selected in the interaction");
		await responder.respond("You did not select any filters!");
		return;
	}

	const selectedFilters = interaction.data.values;

	logger.info(
		`User ${userName} (${userId}) in guild ${guildId} selected filters: ${
			selectedFilters.join(", ")
		}`,
	);

	try {
		await filtersDb.updateOne(
			{
				guildId: guildId,
				userId: userId,
			},
			{
				$set: {
					filters: selectedFilters,
					updatedAt: new Date(),
				},
				$setOnInsert: {
					createdAt: new Date(),
				},
			},
			{
				upsert: true,
			},
		);

		await responder.respond("Your filter preferences have been updated ✅");
	} catch (err: unknown) {
		const msg = err instanceof Error ? err.message : String(err);
		logger.error(
			`Failed to update filters for user ${userId} in guild ${guildId}`,
			err,
		);
		await responder.respond(
			`⚠️ An unexpected error occurred while updating your filter preferences: ${msg}`,
		);
	}
}
