import type {
	ActionRow,
	Bot,
	ButtonComponent,
	Interaction,
	Message,
} from "npm:discordeno@^21.0.0-nightly.1724219627";
import {
	ButtonStyles,
	MessageComponentTypes,
} from "npm:discordeno@^21.0.0-nightly.1724219627";
import {
	InteractionResponseTypes,
	MessageFlags,
} from "npm:@discordeno/types@^21.0.0-nightly.1724219627";
import {
	createMessageComponentCollector,
	type MessageComponentCollectorOptions,
} from "./collectors.ts";

import type { Logger as CustomLogger } from "./Logger.ts";
import Responder from "./Responder.ts";

/**
 * Options for creating a paginator
 */
export interface PaginatorOptions<T> {
	/** The bot instance */
	bot: Bot;
	/** The interaction to control the paginator and respond to */
	interaction: Interaction;
	/** The logger instance for logging events and errors */
	logger: CustomLogger;
	/** The array of data items to paginate through */
	data: T[];
	/** The number of items to display on each page */
	itemsPerPage: number;
	/**
	 * Function that generates an embed for the current page's item
	 * @param item The data item for the current page (or undefined if page is out of bounds or data is empty)
	 * @param bot The bot instance, passed through for convenience
	 * @param logger The logger instance, passed through for convenience
	 * @param currentPage The current page number (1-indexed)
	 * @param totalPages The total number of pages
	 * @param originalInteraction The original interaction that initiated the paginator
	 * @returns A Promise that resolves to an Embed object (or a structure compatible with Discordeno's embeds)
	 */
	embedGenerator: (
		item: T | undefined,
		bot: Bot,
		logger: CustomLogger,
		currentPage: number,
		totalPages: number,
		originalInteraction: Interaction,
	) => Promise<Record<string, any>>; // Using Record<string, any> as a generic for embed structure
	/** Message content to display when there is no data to paginate */
	noDataMessage: string;
	/** Optional custom labels for the pagination buttons */
	buttonLabels?: {
		/** Label for the 'previous page' button */
		previous?: string;
		/** Label for the 'next page' button */
		next?: string;
		/** Label for the 'first page' button (if implemented) */
		first?: string;
		/** Label for the 'last page' button (if implemented) */
		last?: string;
		/** Label for a 'stop' button to end the paginator (if implemented) */
		stop?: string;
	};
	/**
	 * Optional function to generate an additional ActionRow component specific to the current item on the page
	 * This row will be displayed above the main pagination controls
	 * @param item The data item for the current page
	 * @param bot The bot instance
	 * @param logger The logger instance
	 * @returns An ActionRow component, or undefined if no specific action row is needed for this item
	 */
	itemSpecificActionRowGenerator?: (
		item: T | undefined,
		bot: Bot,
		logger: CustomLogger,
	) => ActionRow | undefined;
	/**
	 * Optional: Whether to defer the initial interaction response. Defaults to true.
	 * If true, a "Thinking..." message is shown while the first page loads.
	 */
	defer?: boolean;
	/**
	 * Optional: Whether the paginator should be ephemeral (visible only to the user who triggered it).
	 * Only used if defer is true. Defaults to false.
	 */
	ephemeral?: boolean;
	/**
	 * Optional: Duration in milliseconds for how long the component collector should run.
	 * Defaults to 5 minutes (300,000 ms).
	 */
	collectorDuration?: number;
	/** Optional: Title for the embed when there is no data. Used if `noDataMessage` is displayed as an embed. */
	noDataTitle?: string;
	/** Optional: The initial page number to display (1-indexed). Defaults to 1. */
	initialPage?: number;
	/** Optional: Additional static action rows to include below the item-specific one and above pagination. */
	additionalActionRows?: ActionRow[];
}

/**
 * Creates an action row with previous and next buttons for pagination
 * @param currentPage The current page number
 * @param totalPages The total number of pages
 * @param labels Optional custom labels for the buttons
 * @returns An ActionRow component or undefined if totalPages is 1 or less
 */
function createPaginationActionRow(
	currentPage: number,
	totalPages: number,
	labels?: { previous?: string; next?: string },
): ActionRow | undefined {
	if (totalPages <= 1) return undefined;

	const buttons: ButtonComponent[] = [
		{
			type: MessageComponentTypes.Button,
			style: ButtonStyles.Primary,
			label: labels?.previous ?? "Previous",
			customId: "paginator_prev",
			disabled: currentPage === 1,
		},
		{
			type: MessageComponentTypes.Button,
			style: ButtonStyles.Primary,
			label: labels?.next ?? "Next",
			customId: "paginator_next",
			disabled: currentPage === totalPages,
		},
	];

	return {
		type: MessageComponentTypes.ActionRow,
		components: buttons as any,
	};
}

/**
 * Creates a paginated message with embeds and navigation buttons
 * @param options The options for creating the paginator
 */
export async function createPaginator<T>(
	options: PaginatorOptions<T>,
): Promise<void> {
	const {
		bot,
		interaction,
		logger,
		data,
		itemsPerPage,
		embedGenerator,
		initialPage = 1,
		collectorDuration = 5 * 60 * 1000,
		noDataMessage = "No data to display",
		buttonLabels,
		additionalActionRows = [],
		itemSpecificActionRowGenerator,
		defer = true,
		ephemeral = false,
	} = options;

	const mainResponder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);

	if (defer) {
		try {
			await mainResponder.defer(
				ephemeral ? MessageFlags.Ephemeral : undefined,
			);
		} catch (e) {
			logger.error(
				"Paginator: Failed to send deferred response using Responder",
				e,
			);
			// If defer fails, we probably can't continue meaningfully
			return;
		}
	}

	const getItemForPage = (page: number): T | undefined => {
		const startIndex = (page - 1) * itemsPerPage;
		return data[startIndex];
	};

	const totalPages = Math.max(1, Math.ceil(data.length / itemsPerPage));
	let currentPage = Math.max(1, Math.min(initialPage, totalPages));

	if (data.length === 0) {
		try {
			if (mainResponder.deferred) {
				await mainResponder.editResponse(noDataMessage);
			} else {
				await mainResponder.respond(
					noDataMessage,
					ephemeral ? MessageFlags.Ephemeral : undefined,
				);
			}
		} catch (e) {
			logger.error(
				"Paginator: Failed to send noDataMessage using Responder",
				e,
			);
		}
		return;
	}

	const updatePageMessage = async (
		interactionTokenToUse: string,
		isButtonInteraction = false,
	) => {
		const currentItem = getItemForPage(currentPage);
		const currentEmbed = await embedGenerator(
			currentItem,
			bot,
			logger,
			currentPage,
			totalPages,
			interaction, // Original interaction for context
		);

		const components: ActionRow[] = [];
		if (itemSpecificActionRowGenerator) {
			const itemRow = itemSpecificActionRowGenerator(
				currentItem,
				bot,
				logger,
			);
			if (itemRow) components.push(itemRow);
		}
		components.push(...additionalActionRows);
		const paginationControls = createPaginationActionRow(
			currentPage,
			totalPages,
			buttonLabels,
		);
		if (paginationControls) components.push(paginationControls);

		const messageData = {
			embeds: [currentEmbed as any],
			components: components.length > 0 ? components : [],
		};

		try {
			if (isButtonInteraction) {
				// For button interactions, we MUST use sendInteractionResponse with UpdateMessage
				// And the collectedInteraction.id and collectedInteraction.token (passed as interactionTokenToUse)
				// This is handled by the caller of updatePageMessage in the collect block
				// This function will be called by the collect block with the correct token.
				// The actual sending is now outside this function for button clicks.
				return messageData; // Return data for the collect block to send
			} else {
				// Initial message send/edit (after defer or if not deferring)
				if (mainResponder.deferred && !mainResponder.responded) {
					await mainResponder.editResponseWithData(messageData);
				} else if (
					!mainResponder.deferred && !mainResponder.responded
				) {
					// This case should ideally not be hit if defer is true and succeeded,
					// or if data.length === 0 (handled above).
					// If defer is false, this is the first response.
					await mainResponder.respondWithData(
						messageData,
						ephemeral ? MessageFlags.Ephemeral : undefined,
					);
				} else {
					// Fallback to bot.rest.editOriginalInteractionResponse if Responder state is unusual
					logger.warn(
						"Paginator: Responder state unexpected for initial message, using direct edit.",
					);
					await bot.rest.editOriginalInteractionResponse(
						interactionTokenToUse,
						messageData,
					);
				}
			}
		} catch (e) {
			logger.error(
				`Paginator: Failed to send/edit message on page ${currentPage} using Responder/direct edit`,
				e,
			);
		}
		return messageData; // also return for non-button for consistency, though not strictly needed by caller
	};

	// Initial page update
	await updatePageMessage(interaction.token);

	const sentMessage = (await bot.helpers
		.getOriginalInteractionResponse(interaction.token)
		.catch((e) => {
			logger.error(
				"Paginator: Failed to get original interaction response after initial edit",
				e,
			);
			return undefined;
		})) as Message | undefined;

	if (!sentMessage?.id) {
		logger.error(
			"Paginator: Message ID not found after initial send/edit. Cannot start collector.",
		);
		return;
	}

	logger.debug(
		`Paginator: Setting up collector for message ID: ${sentMessage.id} (Original interaction ID: ${interaction.id})`,
	);

	if (
		totalPages <= 1 && additionalActionRows.length === 0 &&
		!itemSpecificActionRowGenerator
	) {
		logger.debug(
			`Paginator: No collector needed for message ID: ${sentMessage.id} (single page, no extra components)`,
		);
		return; // No collector needed
	}

	createMessageComponentCollector({
		bot,
		key: String(sentMessage.id),
		filter: (i: Interaction) => {
			logger.debug(
				`Paginator Filter Check (target msg: ${sentMessage.id}): Interaction from user ${i.user.id}, type ${i.data?.componentType}, customId ${i.data?.customId}`,
				{
					interactionMessage: i.message,
					interactionMessageId: i.message?.id,
				}, // Log the whole i.message object and its ID
			);
			const messageIdMatch = i.message?.id === sentMessage.id;
			const userMatch = i.user.id === interaction.user.id; // Match against the original interaction user
			const typeMatch =
				i.data?.componentType === MessageComponentTypes.Button;
			const customIdMatch = i.data?.customId === "paginator_prev" ||
				i.data?.customId === "paginator_next";

			// Temporarily remove messageIdMatch for testing ephemeral messages
			const result = userMatch && typeMatch && customIdMatch;
			logger.debug(
				`Paginator Filter Result for msg ${sentMessage.id}: (messageIdMatch was ${messageIdMatch}) userMatch=${userMatch}, typeMatch=${typeMatch}, customIdMatch=${customIdMatch} => ${result}`,
			);
			return result;
		},
		duration: collectorDuration,
		collect: async (collectedInteraction: Interaction) => {
			if (!collectedInteraction.data?.customId) {
				logger.warn(
					"Paginator: Button click with no customId",
					collectedInteraction,
				);
				return;
			}

			logger.debug(
				`Paginator: Button clicked: ${collectedInteraction.data.customId}, interactionId: ${collectedInteraction.id}`,
			);

			if (
				collectedInteraction.data.customId === "paginator_prev" &&
				currentPage > 1
			) {
				currentPage--;
			} else if (
				collectedInteraction.data.customId === "paginator_next" &&
				currentPage < totalPages
			) {
				currentPage++;
			} else {
				logger.warn(
					`Paginator: Unhandled button customId: ${collectedInteraction.data.customId}`,
				);
				return;
			}

			// Get the updated message data
			const updatedMessageData = await updatePageMessage(
				collectedInteraction.token,
				true,
			);

			try {
				logger.debug(
					`Paginator: Attempting to UpdateMessage for interaction ${collectedInteraction.id} (token: ${
						collectedInteraction.token.substring(0, 10)
					}...)`,
					JSON.stringify(updatedMessageData).substring(0, 200) +
						"...",
				);
				await bot.rest.sendInteractionResponse(
					collectedInteraction.id,
					collectedInteraction.token,
					{
						type: InteractionResponseTypes.UpdateMessage,
						data: updatedMessageData as any,
					},
				);
				logger.debug(
					`Paginator: Successfully sent UpdateMessage for interaction ${collectedInteraction.id}`,
				);
			} catch (e) {
				logger.error(
					`Paginator: Failed to send UpdateMessage for button interaction ${collectedInteraction.id}`,
					e,
				);
			}
		},
		end: async (_collectedInteractionsArray, reason) => {
			logger.info(
				`Paginator (message ${sentMessage.id}): Collector ended (${reason})`,
			);
			if (reason === "time" || reason === "limit") {
				// Try to get the original message to disable components
				let originalMessage;
				try {
					originalMessage = await bot.helpers
						.getOriginalInteractionResponse(interaction.token);
				} catch {
					logger.warn(
						`Paginator (message ${sentMessage.id}): Original interaction response not found, cannot disable components.`,
					);
					return;
				}

				const finalComponents: ActionRow[] = [];
				const currentItemForEnd = getItemForPage(currentPage);
				if (itemSpecificActionRowGenerator) {
					const itemRow = itemSpecificActionRowGenerator(
						currentItemForEnd,
						bot,
						logger,
					);
					if (itemRow) {
						finalComponents.push({
							...itemRow,
							components: itemRow.components.map((c) => ({
								...c,
								disabled: true,
							})) as any,
						});
					}
				}
				additionalActionRows.forEach((ar) => {
					finalComponents.push({
						...ar,
						components: ar.components.map((c) => ({
							...c,
							disabled: true,
						})) as any,
					});
				});
				const paginationControls = createPaginationActionRow(
					currentPage,
					totalPages,
					buttonLabels,
				);
				if (paginationControls) {
					finalComponents.push({
						...paginationControls,
						components: paginationControls.components.map((c) => ({
							...c,
							disabled: true,
						})) as any,
					});
				}

				if (originalMessage && finalComponents.length > 0) {
					try {
						const currentEmbedOnEnd = await embedGenerator(
							currentItemForEnd,
							bot,
							logger,
							currentPage,
							totalPages,
							interaction,
						);
						await bot.rest.editOriginalInteractionResponse(
							interaction.token,
							{
								embeds: [currentEmbedOnEnd as any],
								components: finalComponents,
							},
						);
					} catch (e) {
						logger.error(
							`Paginator (message ${sentMessage.id}): Failed to disable components on end`,
							e,
						);
					}
				}
			}
		},
	} as MessageComponentCollectorOptions);
}
