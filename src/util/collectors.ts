// Ryan Wilson
import type { Bot, Interaction } from "@discordeno/bot";

/**
 * Options for creating a message component collector
 */
export interface MessageComponentCollectorOptions {
	/** The bot instance */
	bot: Bot;
	/** The unique key for this collector (typically the ID of the message with the components) */
	key: string;
	/** The filter function to determine if an interaction should be collected */
	filter: (interaction: Interaction) => boolean;
	/** The duration (in milliseconds) for which the collector should run */
	duration: number;
	/** Callback function executed when a valid interaction is collected */
	collect: (interaction: Interaction) => Promise<void> | void;
	/** Optional callback function executed when the collector stops */
	end?: (
		collectedInteractions: Interaction[],
		reason: "time" | "manual" | "limit" | "error" | "override",
	) => Promise<void> | void;
	/** Optional: Maximum number of interactions to collect */
	max?: number;
}

/**
 * Represents an active message component collector
 */
export interface MessageComponentCollector {
	/** Stops the collector */
	stop: (reason?: "manual" | "error") => void;
	/** Interactions collected so far */
	readonly collected: Interaction[];
	/** The unique key for this collector */
	readonly key: string;
}

interface InternalCollector extends MessageComponentCollectorOptions {
	collectedInteractions: Interaction[];
	// Internal stop function to allow more reasons than public stop
	internalStop: (
		reason: "time" | "manual" | "limit" | "error" | "override",
	) => void;
	processInteraction: (interaction: Interaction) => Promise<void>;
	timeoutId?: number; // Store timeoutId to clear it
}

// Map to store active collectors
// Exported for potential direct management or inspection, though typically handled by this utility's functions
/**
 * Map of active message component collectors
 * Key: Collector key (string)
 * Value: InternalCollector object
 */
export const activeCollectors = new Map<string, InternalCollector>();

/**
 * Creates and registers a message component collector
 * This collector will listen for interactions matching the provided filter on a specific message
 *
 * NOTE: For this collector to receive interactions, the `dispatchToMessageCollectors` function
 * must be called from your global `bot.events.interactionCreate` handler in `src/bot.ts`
 */
export function createMessageComponentCollector(
	options: MessageComponentCollectorOptions,
): MessageComponentCollector {
	const { bot, key, filter, duration, collect, end, max } = options;
	const collectedInteractions: Interaction[] = [];

	const stopCollector = (
		reason: "time" | "manual" | "limit" | "error" | "override" = "manual",
	) => {
		const collectorInstance = activeCollectors.get(key);
		if (!collectorInstance) return; // Already stopped

		if (collectorInstance.timeoutId) {
			clearTimeout(collectorInstance.timeoutId);
		}
		activeCollectors.delete(key);
		if (collectorInstance.end) {
			collectorInstance.end(collectedInteractions, reason);
		}
	};

	// If a collector with the same key already exists, stop it before creating a new one
	if (activeCollectors.has(key)) {
		activeCollectors.get(key)?.internalStop("override");
	}

	const internalCollector: InternalCollector = {
		...options,
		collectedInteractions,
		internalStop: stopCollector,
		processInteraction: async (interaction: Interaction) => {
			// Filter is checked by dispatchToMessageCollectors before calling this,
			// but double-checking here or applying parts of it can be useful
			// For simplicity, assuming filter in dispatchToMessageCollectors is sufficient for now
			// Or, filter could be called here too: if (!internalCollector.filter(interaction)) return;

			collectedInteractions.push(interaction);
			try {
				await internalCollector.collect(interaction);
			} catch (e) {
				console.error(
					`Error in collector (key: ${key}) 'collect' callback:`,
					e,
				);
				// Optionally stop the collector on error
				// stopCollector('error');
			}

			if (
				internalCollector.max &&
				collectedInteractions.length >= internalCollector.max
			) {
				stopCollector("limit");
			}
		},
		timeoutId: setTimeout(() => {
			stopCollector("time");
		}, duration),
	};

	activeCollectors.set(key, internalCollector);

	return {
		stop: (reason: "manual" | "error" = "manual") => stopCollector(reason),
		get collected() {
			return [...collectedInteractions];
		}, // Return a copy to prevent external modification
		key,
	};
}

/**
 * Dispatches a message component interaction to the relevant active collector
 * This function should be called from your global `bot.events.interactionCreate` handler
 *
 * @param bot The bot instance
 * @param interaction The interaction to dispatch
 */
export async function dispatchToMessageCollectors(
	bot: Bot,
	interaction: Interaction,
) {
	// Ensure it's a component interaction and has a message context
	if (!interaction.message?.id || !interaction.data?.customId) {
		return;
	}

	const collectorKey = String(interaction.message.id);
	const collector = activeCollectors.get(collectorKey);

	if (collector && collector.bot.id === bot.id) {
		// Now apply the collector-specific filter
		if (collector.filter(interaction)) {
			await collector.processInteraction(interaction);
		}
	}
}

/**
 * Represents a message component collector with additional properties
 */
export interface ExtendedMessageComponentCollector
	extends MessageComponentCollector {
	/** The message component collector options */
	options: MessageComponentCollectorOptions;
	/** The callback to run when a component is collected */
	resolve: (value: Interaction | PromiseLike<Interaction>) => void;
}
