/**
 * @name Ryan Wilson
 */
import { type Bot, type Interaction } from "npm:@discordeno/bot";

//import { InteractionResponseTypes, MessageFlags } from "npm:@discordeno/types";

import { filtersDb } from "$db";
import { PrefixedLogger } from "../../util/Logger.ts";

import Responder from "../../util/Responder.ts";

/**
 * Handles the interaction when a user selects filters from the panel
 * @param bot The bot instance
 * @param interaction The interaction object
 */
export default async function handlePanelFilterSelect(
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

	if (!interaction.guildId) {
		await responder.respondErr(
			"The interaction 'handlePanelFilterSelect' was used outside of a server",
			logger,
			"This interaction can only be used in a server",
		);
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

		await responder.respond("✅ Your filter preferences have been updated");
	} catch (err) {
		await responder.respondErr(
			`An unexpected error occurred while updating your filter preference`,
			logger,
			"Sorry, we were unable to update your filter preferences due to an internal error. Please try again later.",
			err,
		);
	}
}
