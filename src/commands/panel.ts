import { type Bot, type Interaction } from "@discordeno/bot";
import {
	ApplicationCommandOptionTypes,
	ChannelTypes,
	MessageFlags,
} from "@discordeno/bot";

import { botBansDb } from "$db";

import Responder from "../util/Responder.ts";
import { createPrefixedLogger, type Logger } from "../util/Logger.ts";

import { getGuildConfig } from "../util/configManager.ts";
import { generatePanelData } from "../util/genPanel.ts";

/**
 * Command data for the /panel command
 */
export const data = {
	name: "panel",
	description: "Displays the link panel in the current channel or DM",
	options: [
		{
			type: ApplicationCommandOptionTypes.Boolean,
			name: "dm",
			description:
				"Send the panel via Direct Message instead of in the current channel",
			required: false,
			choices: [
				{ name: "True", value: true },
				{ name: "False", value: false },
			],
		},
		{
			type: ApplicationCommandOptionTypes.Channel,
			name: "report",
			description:
				"Override the default channel to send panel-related issues to",
			required: false,
			channelTypes: [ChannelTypes.GuildText],
		},
		{
			type: ApplicationCommandOptionTypes.String,
			name: "categories",
			description:
				"Comma-separated list of categories to display (defaults to your top categories)",
			required: false,
			autocomplete: true,
		},
		{
			type: ApplicationCommandOptionTypes.Boolean,
			name: "ephemeral",
			description: "Whether the response should be visible only to you",
			required: false,
			choices: [
				{ name: "True", value: true },
				{ name: "False", value: false },
			],
		},
	],
	dmPermission: true, // Allow in DMs and guild channels
};

/**
 * Whether this command can only be run by administrators
 */
export const adminOnly = true;

export async function handle(
	bot: Bot,
	interaction: Interaction,
	logger: Logger,
): Promise<void> {
	const logger = createPrefixedLogger("panel", logger);
	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	const ephemeralOption = interaction.data?.options?.find(
		(opt) => opt.name === "ephemeral",
	)?.value as boolean | undefined ?? false;

	await responder.defer(ephemeralOption ? MessageFlags.Ephemeral : undefined);

	if (!interaction.guildId) {
		logger.warn("Panel command used outside of a server");
		await responder.editResponse(
			"This command can only be used in a server.",
		);
		return;
	}

	try {
		const banRecord = await botBansDb.findOne({
			guildId: String(interaction.guildId),
			userId: String(interaction.user.id),
		});
		if (banRecord) {
			logger.info(
				`User ${interaction.user.id} is bot-banned in guild ${interaction.guildId}. Denying panel access.`,
			);
			await responder.editResponse(
				"You are currently banned from using this feature in this server.",
			);
			return;
		}
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error(
			`Error checking botBanDb for user ${interaction.user.id} in guild ${interaction.guildId}`,
			message,
		);
		await responder.editResponse(
			"An error occurred while checking your permissions. Please try again later.",
		);
		return;
	}

	const guildConfig = await getGuildConfig(String(interaction.guildId));
	const panelConfig = guildConfig.panel;

	const dmUser = interaction.data?.options?.find(
		(opt) => opt.name === "dm",
	)?.value as boolean | undefined ?? panelConfig.dm;

	const reportOptionValue = interaction.data?.options?.find(
		(opt) => opt.name === "report",
	)?.value as string | undefined;

	const categoriesInput = interaction.data?.options?.find(
		(opt) => opt.name === "categories",
	)?.value as string | undefined;

	const includedCategories: string[] | undefined = categoriesInput
		? categoriesInput.split(",").map((c) => c.trim()).filter(Boolean).slice(
			0,
			25,
		)
		: undefined;

	const reportChannelId = reportOptionValue ?? guildConfig.reportsChannelId;

	const title = panelConfig.title;
	const catPlaceholder = panelConfig.catPlaceholder;
	const filterPlaceholder = panelConfig.filterPlaceholder;
	const footerText = panelConfig.footerText;
	const buttonText = panelConfig.buttonText;
	const colorString = guildConfig.theme.main_color;

	const masqrEnabled = guildConfig.masqr.enabled;
	const useMasqrSeparation = masqrEnabled && panelConfig.masqrSeparation;
	const cohortForce = guildConfig.cohort.enable && guildConfig.cohort.force;

	const panelOptions = {
		guildId: String(interaction.guildId),
		dmUser,
		title,
		catPlaceholder,
		filterPlaceholder,
		footerText,
		buttonText,
		colorString,
		logger: logger,
		reportChannelId,
		includedCategories,
		masqrSeparation: useMasqrSeparation,
		masqrEnabled,
		cohortForce,
	};

	logger.debug("Generating panel data", panelOptions);
	const panelData = await generatePanelData(bot, panelOptions);

	if (!panelData) {
		logger.warn(
			`Panel generation failed for guild ${interaction.guildId}, likely no categories.`,
		);
		await responder.editResponse(
			"Could not generate panel. There might be no categories set up for this server.",
		);
		return;
	}

	logger.info(
		`Panel generated successfully for guild ${interaction.guildId}`,
	);
	await responder.editResponseWithData(panelData);
}
