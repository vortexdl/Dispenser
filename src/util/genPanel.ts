/**
 * @name Ryan Wilson
 */
import {
	type ActionRow,
	type Bot,
	type ButtonComponent,
	ButtonStyles,
	MessageComponentTypes,
	type SelectMenuComponent,
	type SelectOption,
} from "npm:discordeno@^21.0.0-nightly.1724219627";

import { filtersDb, linksDb } from "$db";

import type { Logger } from "./Logger.ts";

interface LinkEntry {
	cat: string | any;
}

// Define a simple type for filter documents, assuming 'filters' is a property
interface FilterDoc {
	filters: string[] | any; // Or a more specific type if known
	// other properties...
}

/**
 * Options for generating a panel
 */
export interface GeneratePanelOptions {
	/** The ID of the guild */
	guildId: string;
	/** Whether to send the panel to the user via DM */
	dmUser?: boolean;
	/** The title of the panel embed */
	title?: string;
	/** Placeholder text for the category selection menu */
	catPlaceholder?: string;
	/** Placeholder text for the filter selection menu */
	filterPlaceholder?: string;
	/** Footer text for the panel embed */
	footerText?: string;
	/** Text for the main action button */
	buttonText?: string;
	/** Hex color string for the panel embed */
	colorString?: string;
	/** The logger instance */
	logger: Logger;
	/** Optional prefix for custom IDs of components */
	customIdPrefix?: string;
	/** Optional description for the panel embed */
	description?: string;
	/** The ID of the channel to send reports to */
	reportChannelId?: string;
	/** Array of specific categories to include in the panel */
	includedCategories?: string[];
	/** Whether to separate Masqr links from regular links with dedicated buttons */
	masqrSeparation?: boolean;
	/** Whether Masqr is enabled for the guild */
	masqrEnabled?: boolean;
	/** Whether cohort force mode is enabled */
	cohortForce?: boolean;
}

// This interface should align with what sendInteractionResponse expects for embeds
interface PanelEmbed {
	title?: string;
	description?: string;
	color?: number;
	footer?: { text: string; iconUrl?: string; proxyIconUrl?: string };
	// Add other Embed properties as needed by your panel
}

/**
 * Represents the data returned for a generated panel
 */
export interface PanelData {
	/** Array of embeds for the panel */
	embeds: PanelEmbed[];
	/** Array of action row components for the panel */
	components: ActionRow[];
}

/**
 * Generates the data (embeds and components) for a selection panel
 * @param bot The bot instance
 * @param options Options for generating the panel
 * @returns A promise that resolves with the generated panel data, or null if an error occurs (e.g., no categories)
 */
export async function generatePanelData(
	_bot: Bot,
	options: GeneratePanelOptions,
): Promise<PanelData | null> {
	const {
		guildId,
		dmUser = false,
		title = "Selection",
		catPlaceholder = "Select a category",
		filterPlaceholder = "Select your filters (optional)",
		footerText = "Hosted by Browser Ports",
		buttonText = "Request Link",
		colorString = "e071ac",
		logger,
		customIdPrefix = "",
		description,
		reportChannelId,
		includedCategories,
		masqrSeparation,
		masqrEnabled,
		cohortForce = false,
	} = options;

	logger.debug(
		`Generating panel data for guild ${guildId} with prefix '${customIdPrefix}'`,
	);
	logger.debug(
		`Masqr config - enabled: ${masqrEnabled}, separation: ${masqrSeparation}`,
	);
	logger.debug(`Cohort force mode: ${cohortForce}`);

	try {
		const links = await linksDb
			.find({ guildId: guildId })
			.toArray();

		const uniqueCategories: SelectOption[] = [
			...new Set(
				(links as LinkEntry[]) // Cast links to LinkEntry[]
					.map((entry: LinkEntry) => entry.cat)
					.filter((cat: any): cat is string =>
						typeof cat === "string"
					) // Explicitly type cat
					.sort(),
			),
		]
			.slice(0, 25)
			.map((
				cat: string,
			) => ({
				label: cat,
				value: cat,
				description: undefined,
				emoji: undefined,
				default: false,
			} as SelectOption));

		if (uniqueCategories.length === 0) {
			logger.warn(
				`No categories found for guild ${guildId}. Panel cannot be generated.`,
			);
			return null;
		}

		const allFilterDocs = await filtersDb.find({ guildId: guildId }, {
			projection: { filters: 1 },
		}).toArray();
		logger.debug(
			`Filter DB query completed, found ${allFilterDocs.length} filter documents for guild ${guildId}`,
		);

		const distinctFiltersSet = new Set<string>();
		(allFilterDocs as FilterDoc[]).forEach((doc: FilterDoc) => {
			if (doc.filters && Array.isArray(doc.filters)) {
				doc.filters.forEach((filter: any) =>
					distinctFiltersSet.add(String(filter))
				);
			}
		});

		// Always ensure Lightspeed is available as a filter option
		distinctFiltersSet.add("Lightspeed");

		logger.debug(
			`Found ${allFilterDocs.length} filter documents for guild ${guildId}`,
		);
		logger.debug(
			`Distinct filters: ${Array.from(distinctFiltersSet).join(", ")}`,
		);

		const filterOptions: SelectOption[] = Array.from(distinctFiltersSet)
			.sort()
			.slice(0, 25)
			.map((filterName: string, index: number) => ({
				label: filterName,
				value: filterName,
				description: undefined,
				emoji: undefined,
				default: false,
			} as SelectOption));

		logger.debug(
			`Generated ${filterOptions.length} filter options: ${
				filterOptions.map((f) => f.label).join(", ")
			}`,
		);

		const components: ActionRow[] = [
			{
				type: MessageComponentTypes.ActionRow,
				components: [
					{
						type: MessageComponentTypes.SelectMenu,
						customId: `${customIdPrefix}cat_select`,
						placeholder: catPlaceholder,
						options: uniqueCategories,
						minValues: 1,
						maxValues: 1,
					} as SelectMenuComponent,
				],
			},
		];

		// Only add filter dropdown if there are actual filter options
		if (filterOptions.length > 0) {
			components.push({
				type: MessageComponentTypes.ActionRow,
				components: [
					{
						type: MessageComponentTypes.SelectMenu,
						customId: `${customIdPrefix}filter_select`,
						placeholder: filterPlaceholder,
						options: filterOptions,
						minValues: 0,
						maxValues: Math.min(filterOptions.length, 25),
					} as SelectMenuComponent,
				],
			});
		}

		// Construct button custom IDs carefully
		const requestCustomId = `${customIdPrefix}${
			dmUser ? "dmRequest_guild_" : "request_guild_"
		}${guildId}${masqrSeparation ? "_sep" : ""}`;
		const masqrRequestCustomId = `${customIdPrefix}${
			dmUser ? "dmMasqrRequest_guild_" : "masqrRequest_guild_"
		}${guildId}`;
		const cohortRequestCustomId = `${customIdPrefix}${
			dmUser ? "dmCohortRequest_guild_" : "cohortRequest_guild_"
		}${guildId}`;
		const reportCustomId = `${customIdPrefix}report_guild_${guildId}`;

		const buttonComponents: ButtonComponent[] = [];

		if (cohortForce) {
			// In cohort force mode, show only cohort request button
			buttonComponents.push({
				type: MessageComponentTypes.Button,
				label: buttonText,
				customId: cohortRequestCustomId,
				style: ButtonStyles.Primary,
			} as ButtonComponent);
		} else if (masqrSeparation && masqrEnabled) {
			// Add separate buttons for regular and Masqr requests
			buttonComponents.push(
				{
					type: MessageComponentTypes.Button,
					label: buttonText,
					customId: requestCustomId,
					style: ButtonStyles.Secondary,
				} as ButtonComponent,
				{
					type: MessageComponentTypes.Button,
					label: "Request Link (Masqr)",
					customId: masqrRequestCustomId,
					style: ButtonStyles.Primary,
				} as ButtonComponent,
			);

			// Add cohort button as an option
			buttonComponents.push({
				type: MessageComponentTypes.Button,
				label: "Request Link (Cohort)",
				customId: cohortRequestCustomId,
				style: ButtonStyles.Secondary,
			} as ButtonComponent);
		} else {
			// Add single request button (handles both regular and Masqr links)
			buttonComponents.push({
				type: MessageComponentTypes.Button,
				label: buttonText,
				customId: requestCustomId,
				style: ButtonStyles.Primary,
			} as ButtonComponent);

			// Add cohort button as an option
			buttonComponents.push({
				type: MessageComponentTypes.Button,
				label: "Request Link (Cohort)",
				customId: cohortRequestCustomId,
				style: ButtonStyles.Secondary,
			} as ButtonComponent);
		}

		// Add report button
		buttonComponents.push({
			type: MessageComponentTypes.Button,
			label: "Report Issue",
			customId: reportCustomId,
			style: ButtonStyles.Danger,
		} as ButtonComponent);

		components.push({
			type: MessageComponentTypes.ActionRow,
			components: buttonComponents,
		});

		let finalColorString = colorString.startsWith("#")
			? colorString.substring(1)
			: colorString;
		if (!/^[0-9A-Fa-f]{6}$/.test(finalColorString)) {
			logger.warn(
				`Invalid color string format: ${colorString}. Defaulting to e071ac.`,
			);
			finalColorString = "e071ac";
		}
		const embedColor = parseInt(`0x${finalColorString}`);

		const embedToReturn: PanelEmbed = {
			color: embedColor,
			title: title,
			description: description ?? undefined,
			footer: {
				text: footerText,
			},
		};

		return {
			embeds: [embedToReturn],
			components: components,
		};
	} catch (error) {
		logger.error(`Error generating panel data for guild ${guildId}`, error); // Corrected template literal
		return null;
	}
}
