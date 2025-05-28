import {
	ApplicationCommandOptionChoice,
	Bot,
	Collection,
	createBot,
	createDesiredPropertiesObject,
	Interaction,
	InteractionResponseTypes,
	InteractionTypes,
	Member,
	MessageFlags,
} from "npm:discordeno@21.0.0";
import { MessageComponentTypes, TextStyles } from "npm:@discordeno/types";

import { createProxyCache } from "npm:dd-cache-proxy";

import config from "$config";

import filterHandle from "./interactions/dropdown/filterSelect.ts";
import catHandle from "./interactions/dropdown/catSelect.ts";
import requestHandle from "./interactions/button/request.ts";
import masqrRequestHandle from "./interactions/button/masqrRequest.ts";
import cohortRequestHandle from "./interactions/button/cohortRequest.ts";
import { sendReport } from "./util/reporting.ts";

import { createPrefixedLogger, Logger } from "./util/Logger.ts";
import Responder from "./util/Responder.ts";

import isAdmin from "./util/isAdmin.ts";

import { getGuildConfig } from "./util/configManager.ts";
import { generatePanelData } from "./util/genPanel.ts";

import { getBearerToken } from "./util/getBearerToken.ts";

import {
	getRankedConfigOptions,
	mostPopularAdminIssuedCategories,
	mostPopularUserCategories,
} from "./util/heuristics.ts";
import { getLinkAutocompleteChoices } from "./util/linkAutocomplete.ts";
import { startCohortScheduler } from "./util/scheduler.ts";

interface Command {
	data: {
		name: string;
	};
	adminOnly?: boolean;
	handle: (
		bot: Bot,
		interaction: Interaction,
		logger: Logger,
		bearerToken: string,
	) => Promise<void>;
}

const commands = new Collection<string, Command>();

const isDebug = Deno.args.includes("--debug");

const logger = new Logger();

// Minimized desired properties based on codebase analysis
const desiredProperties = createDesiredPropertiesObject({
	interaction: {
		id: true,
		applicationId: true,
		type: true,
		token: true,
		locale: true,
		member: true,
		user: true,
		guildId: true,
		channelId: true,
		message: true,
		data: true,
	},
	message: {
		id: true,
		channelId: true,
		guildId: true,
		author: true,
		member: true,
		content: true,
		timestamp: true,
		embeds: true,
		components: true,
	},
	user: {
		id: true,
		username: true,
		discriminator: true,
		avatar: true,
	},
	member: {
		id: true,
		guildId: true,
		user: true,
		nick: true,
		roles: true,
		permissions: true,
		toggles: true,
	},
	guild: {
		id: true,
		name: true,
		icon: true,
		ownerId: true,
		roles: true,
		channels: true,
		memberCount: true,
	},
	channel: {
		id: true,
		type: true,
		guildId: true,
		name: true,
		parentId: true,
	},
	role: {
		id: true,
		guildId: true,
		name: true,
		color: true,
		position: true,
		permissions: true,
		toggles: true,
	},
});

interface BotDesiredProperties extends Required<typeof desiredProperties> {}

const baseBot = createBot({
	token: config.bot.token,
	transformers: {
		desiredProperties: desiredProperties as BotDesiredProperties,
	},
});

export type BotWithCache = typeof botWithCache;

const botWithCache = createProxyCache(baseBot, {
	cacheInMemory: {
		guild: true,
		channel: true,
		member: true,
		user: false,
		role: true,
		default: false,
	},
	desiredProps: {
		guild: [
			"id",
			"name",
			"icon",
			"ownerId",
			"roles",
			"channels",
			"memberCount",
		],
		channel: ["id", "type", "guildId", "name", "parentId"],
		member: [
			"id",
			"guildId",
			"user",
			"nick",
			"roles",
			"joinedAt",
			"permissions",
			"toggles",
		],
		role: [
			"id",
			"guildId",
			"name",
			"color",
			"position",
			"permissions",
			"toggles",
		],
	},
	cacheOutsideMemory: {
		default: false,
	},
});

// Apply event handlers to the cached bot instance
botWithCache.events.ready = (): void => {
	logger.init(botWithCache, isDebug);
	logger.info("Ready!");

	// Start the cohort system scheduler
	startCohortScheduler(botWithCache, logger);
};
botWithCache.events.interactionCreate = async (interaction: Interaction) => {
	await handleInteraction(interaction);
};

/** Handles all bot interactions */
async function handleInteraction(interaction: Interaction): Promise<void> {
	const bot = interaction.bot;

	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	try {
		if (interaction.type === InteractionTypes.ApplicationCommand) {
			const command = commands.get(interaction.data?.name || "");

			if (!command) {
				await responder.respondErr(
					`Command not found: ${interaction.data?.name}`,
					logger,
					"Sorry I could not find that command",
				);
				return;
			}
			logger.debug(`Found the command ${command}!`);

			if (
				command.adminOnly &&
				interaction.member &&
				!(await isAdmin(
					interaction.member as Member,
					String(interaction.guildId),
					logger,
				))
			) {
				await responder.respondErr(
					`${interaction.user?.username} tried to run ${command.data.name} without permission`,
					logger,
					"You don't have permission to run this command",
				);
				return;
			}

			const bearerTokenRes = await getBearerToken(logger);
			if (bearerTokenRes.isErr()) {
				await responder.respondErr(
					"Failed to get bearer token",
					logger,
				);
				return;
			}
			const bearerToken = bearerTokenRes.value;
			let guildName = "DMs";
			if ("guildId" in interaction) {
				try {
					guildName = bot.guilds.get(interaction.guildId);
				} catch (err) {
					await responder.respondErr(
						"Failed to get guild name",
						logger,
						"Sorry! An internal error occurred while processing your request. Please try again later.",
						err,
					);
					return;
				}
			}
			try {
				logger.debug(`Running command ${command.data.name}`);
				await command.handle(
					bot,
					interaction,
					createPrefixedLogger(command.data.name, logger),
					bearerToken,
				);
				return;
			} catch (err) {
				let errorDetail = "An unknown error occurred";
				if (err instanceof Error) {
					errorDetail = err.stack || err.message;
				}
				const errFmt =
					`Error running ${command.data.name}: ${errorDetail}`;
				if (isDebug) {
					logger.error(errFmt);
					const respondResult = await responder.respond(
						"An unexpected error occurred while running the command",
					);
					if (respondResult.isErr()) {
						logger.error(
							"Failed to send 'unexpected error' response (debug)",
							{
								originalError: errFmt,
								responseError: respondResult.error,
							},
						);
					}
					throw new Error(errFmt);
				} else {
					console.error(errFmt);
					const respondResult = await responder.respond(
						"An unexpected error occurred while running the command",
					);
					if (respondResult.isErr()) {
						logger.error(
							"Failed to send 'unexpected error' response",
							{
								originalError: errFmt,
								responseError: respondResult.error,
							},
						);
					}
				}
			}
		} else if (
			interaction.type === InteractionTypes.ApplicationCommandAutocomplete
		) {
			const commandName = interaction.data?.name;
			const focusedOption = interaction.data?.options?.find(
				(opt: any) => opt.focused === true,
			);
			const guildId = interaction.guildId
				? String(interaction.guildId)
				: undefined;
			const adminUserId = String(interaction.user?.id);

			if (
				commandName === "history" &&
				focusedOption?.name === "category"
			) {
				const userId = String(interaction.user?.id);
				const searchValue = (focusedOption.value as string) || "";

				const result = await mostPopularUserCategories(
					userId,
					searchValue,
					logger,
				);
				let choices: ApplicationCommandOptionChoice[] = [];
				if (result.isOk()) {
					choices = result.value;
				} else {
					logger.error(
						"Error handling history category autocomplete:",
						result.error,
					);
				}
				await responder.autocompleteResult(choices);
			} else if (
				commandName === "panel" &&
				focusedOption?.name === "categories"
			) {
				if (!guildId) {
					await responder.autocompleteResult([]);
					return;
				}

				const rawInput = (focusedOption.value as string) || "";
				const segments = rawInput.split(",");
				const currentSegment = segments.pop()?.trim() ?? "";
				const alreadySelected = segments
					.map((s) => s.trim())
					.filter(Boolean);

				const result = await mostPopularAdminIssuedCategories(
					bot,
					logger,
					adminUserId,
					guildId,
				);

				let choices: ApplicationCommandOptionChoice[] = [];

				if (result.isOk()) {
					const popularCats = result.value.map(
						(item) => item.category,
					);

					const filteredCats = popularCats
						.filter((cat) => !alreadySelected.includes(cat))
						.filter((cat) =>
							cat
								.toLowerCase()
								.includes(currentSegment.toLowerCase())
						)
						.slice(0, 25);

					choices = filteredCats.map((cat) => {
						const newValue = [...alreadySelected, cat].join(", ");
						return {
							name: cat,
							value: newValue,
						} as ApplicationCommandOptionChoice;
					});
				} else {
					logger.error(
						"Error handling panel category autocomplete:",
						result.error,
					);
				}
				await responder.autocompleteResult(choices);
			} else if (
				commandName === "config" &&
				focusedOption?.name === "option"
			) {
				const searchValue = (focusedOption.value as string) || "";
				const result = await getRankedConfigOptions(searchValue);
				let choices: ApplicationCommandOptionChoice[] = [];
				if (result.isOk()) {
					choices = result.value;
				} else {
					logger.error(
						"Error handling config option autocomplete:",
						result.error,
					);
				}
				await responder.autocompleteResult(choices);
			} else if (
				(commandName === "rename" &&
					focusedOption &&
					(focusedOption.name === "category1" ||
						focusedOption.name === "category2")) ||
				(commandName === "limit" &&
					focusedOption &&
					focusedOption.name === "category") ||
				(commandName === "remove" &&
					focusedOption &&
					focusedOption.name === "category") ||
				(commandName === "add" &&
					focusedOption &&
					focusedOption.name === "category") ||
				(commandName === "user" &&
					focusedOption &&
					focusedOption.name === "category") ||
				(commandName === "list" &&
					focusedOption &&
					focusedOption.name === "category") ||
				(commandName === "reset" &&
					focusedOption &&
					focusedOption.name === "category")
			) {
				if (!guildId) {
					await responder.autocompleteResult([]);
					return;
				}
				const result = await mostPopularAdminIssuedCategories(
					bot,
					logger,
					adminUserId,
					guildId,
				);
				let choices: ApplicationCommandOptionChoice[] = [];

				if (result.isOk()) {
					const popularCats = result.value.map(
						(item) => item.category,
					);
					const query = typeof focusedOption.value === "string"
						? focusedOption.value.toLowerCase()
						: "";
					const filteredCats = query
						? popularCats.filter((cat) =>
							cat.toLowerCase().includes(query)
						)
						: popularCats;
					choices = filteredCats
						.map((cat) => ({
							name: cat,
							value: cat,
						}))
						.slice(0, 25);
				} else {
					logger.error(
						`Error handling ${commandName} ${focusedOption.name} autocomplete:`,
						result.error,
					);
				}
				await responder.autocompleteResult(choices);
			} else if (
				(commandName === "report" && focusedOption?.name === "link") ||
				(commandName === "remove" && focusedOption?.name === "link")
			) {
				if (!guildId) {
					await responder.autocompleteResult([]);
					return;
				}
				const searchValue = (focusedOption.value as string) || "";

				let categoryFilter: string | undefined;
				if (commandName === "remove") {
					const categoryOption = interaction.data?.options?.find(
						(opt: any) => opt.name === "category",
					);
					if (
						categoryOption &&
						typeof categoryOption.value === "string"
					) {
						categoryFilter = categoryOption.value;
					}
				}

				const choicesResult = await getLinkAutocompleteChoices(
					guildId,
					searchValue,
					logger,
					categoryFilter,
				);
				let choices: ApplicationCommandOptionChoice[] = [];
				if (choicesResult.isOk()) {
					choices = choicesResult.value;
				} else {
					logger.error("Failed to get link autocomplete choices", {
						error: choicesResult.error,
					});
				}
				await responder.autocompleteResult(choices);
				return;
			}
		} else if (interaction.type === InteractionTypes.MessageComponent) {
			if (!interaction.data) {
				await responder.respondErr(
					"Missing component data",
					logger,
					"Sorry! We were unable to retrieve some data due to an internal error. Please try again later!",
				);
				return;
			}

			const id: string = interaction.data.customId || "";

			if (isDebug) logger.debug(`Interacting with ${id}`);

			const panelReportMatch = id.match(/^(.*?)report_guild_(\d+)$/);

			if (panelReportMatch) {
				const guildId = panelReportMatch[2];
				await responder.respondWithModal(
					`panel_report_modal_${guildId}`,
					{
						title: "Report an Issue (Panel Item)",
						components: [
							{
								type: MessageComponentTypes.ActionRow,
								components: [
									{
										type: 4,
										customId: "report_subject",
										label: "Subject",
										style: TextStyles.Short,
										placeholder:
											"e.g., Broken Link, Incorrect Info",
										required: true,
									},
								],
							},
							{
								type: MessageComponentTypes.ActionRow,
								components: [
									{
										type: 4,
										customId: "report_details",
										label: "Details",
										style: TextStyles.Paragraph,
										placeholder:
											"Please provide as much detail as possible",
										required: true,
									},
								],
							},
						],
					},
				);
				return;
			}

			const isDmRequest = id.startsWith("dmRequest_guild_");
			const isRequest = id.startsWith("request_guild_");
			const isDmMasqrRequest = id.startsWith("dmMasqrRequest_guild_");
			const isMasqrRequest = id.startsWith("masqrRequest_guild_");
			const isDmCohortRequest = id.startsWith("dmCohortRequest_guild_");
			const isCohortRequest = id.startsWith("cohortRequest_guild_");
			const isCat = id.endsWith("cat_select");
			const isFilter = id.endsWith("filter_select");
			const dmPanelMatch = id.match(/^dmPanel_view_(\d+)$/);

			if (dmPanelMatch) {
				const guildId = dmPanelMatch[1];

				try {
					const guildConfig = await getGuildConfig(guildId);

					const panelOptions = {
						guildId: guildId,
						dmUser: true,
						title: guildConfig.panel.title,
						catPlaceholder: guildConfig.panel.catPlaceholder,
						filterPlaceholder: guildConfig.panel.filterPlaceholder,
						footerText: guildConfig.panel.footerText,
						buttonText: guildConfig.panel.buttonText,
						colorString: guildConfig.panel.colorString,
						logger: logger,
						customIdPrefix: `dmPanel_${guildId}_`,
						description: `Server ID: ${guildId}`,
						masqrSeparation: guildConfig.masqr.enabled &&
							guildConfig.panel.masqrSeparation,
						masqrEnabled: guildConfig.masqr.enabled,
					};

					const panelData = await generatePanelData(
						bot,
						panelOptions,
					);

					if (!panelData) {
						await responder.respondErr(
							"panelData requested whilst there were no categories set up for the server!",
							logger,
							"Could not generate panel. There might be no categories set up for this server!",
						);
						return;
					}

					await bot.rest.sendInteractionResponse(
						interaction.id,
						interaction.token,
						{
							type: InteractionResponseTypes
								.ChannelMessageWithSource,
							data: {
								...panelData,
								flags: MessageFlags.Ephemeral,
							},
						},
					);
					return;
				} catch (err) {
					await responder.respondErr(
						"Panel generation failed for guild.",
						logger,
						"Sorry! An internal error occured while attempting to generate the panel. Please try again later!",
						err,
					);
					return;
				}
			}

			if (isDmRequest) {
				// Check if this is a separation-enabled panel by looking for `_sep suffix
				const hasSeparation = id.includes("_sep");
				await requestHandle(
					bot,
					interaction,
					true,
					logger,
					hasSeparation ? false : undefined,
				);
			} else if (isRequest) {
				// Check if this is a separation-enabled panel by looking for `_sep` suffix
				const hasSeparation = id.includes("_sep");
				await requestHandle(
					bot,
					interaction,
					false,
					logger,
					hasSeparation ? false : undefined,
				);
			} else if (isDmMasqrRequest) {
				await masqrRequestHandle(bot, interaction, true, logger, true);
			} else if (isMasqrRequest) {
				await masqrRequestHandle(bot, interaction, false, logger, true);
			} else if (isDmCohortRequest) {
				await cohortRequestHandle(bot, interaction, true, logger);
			} else if (isCohortRequest) {
				await cohortRequestHandle(bot, interaction, false, logger);
			} else if (isCat) await catHandle(bot, interaction, logger);
			else if (isFilter) {
				// Use panelFilterSelect for panel filter interactions
				if (id.endsWith("filter_select")) {
					await filterHandle(bot, interaction, logger);
				}
			} else if (id === "config_change_modal") {
				// Handle config change button - open modal
				const { createConfigChangeModal } = await import(
					"./commands/config.ts"
				);
				await responder.respondWithModal(createConfigChangeModal());
				return;
			}
		} else if (interaction.type === InteractionTypes.ModalSubmit) {
			const modalReportMatch = interaction.data?.customId?.match(
				/^panel_report_modal_(\d+)$/,
			);

			if (modalReportMatch && interaction.data?.components) {
				const guildId = modalReportMatch[1];
				let subject = "";
				let details = "";

				for (const actionRow of interaction.data.components) {
					if (actionRow.components) {
						for (const component of actionRow.components) {
							if (component.customId === "report_subject") {
								subject = component.value || "";
							}
							if (component.customId === "report_details") {
								details = component.value || "";
							}
						}
					}
				}

				if (!subject || !details) {
					await responder.respondErr(
						`User did not specify subject/details for the report`,
						logger,
						`Sorry! You did not specify the subject/details for the report. Please submit a valid response`,
					);
					return;
				}

				try {
					const guildConfig = await getGuildConfig(guildId);

					const reportOptions = {
						bot,
						interaction,
						subject,
						details,
						guildConfig: { ...guildConfig, guildId },
						config,
					};

					const reportResult = await sendReport(
						reportOptions,
						logger,
					);

					if (reportResult.isErr()) {
						await responder.respondErr(
							"Failed to send report from modal",
							logger,
							"Sorry! An internal error occurred while processing your report. Please try again later!",
						);
					}
				} catch (err) {
					await responder.respondErr(
						"Failed to send report from modal",
						logger,
						"Sorry! An internal error occurred while processing your report. Please try again later!",
						err,
					);
				}

				if (interaction.data?.customId === "config_change_form") {
					// Handle config change modal submission
					const { handleConfigChangeModal } = await import(
						"./commands/config.ts"
					);
					await handleConfigChangeModal(bot, interaction, logger);
					return;
				}

				return;
			}
		}
	} catch (err) {
		if (interaction.id && interaction.token) {
			await responder.respondErr(
				"An unexpected server error occurred",
				logger,
				"Sorry! An internal error occurred while processing your request. Please try again later.",
				err,
			);
		} else {
			await responder.respondErr(
				"The interaction object is missing the id and token for the response",
				logger,
				"Sorry! An internal error occurred while processing your request. Please try again later.",
				err,
			);
		}
	}
}

export default async function initBot(): Promise<void> {
	const commandData = [];
	for await (
		const file of Deno.readDir(
			new URL("./commands", import.meta.url),
		)
	) {
		if (file.name.endsWith(".ts")) {
			let command;
			try {
				command = await import(`./commands/${file.name}`);
			} catch (err) {
				let errorDetail = "An unknown error occurred";
				if (err instanceof Error) {
					errorDetail = err.stack || err.message;
				}
				console.error(`Error importing ${file.name}${errorDetail}`);
			}

			if (!command?.data) {
				console.error(
					"The command file does not export a data object:",
					file.name,
				);
				continue;
			}

			commandData.push(command.data);

			commands.set(command.data.name, command);
		}
	}
	//console.debug(`Uploading ${commandData.map((c) => c.name).join(", ")}`);
	await botWithCache.rest.upsertGlobalApplicationCommands(commandData);

	await botWithCache.start();
}
