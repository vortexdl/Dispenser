// Ryan Wilson
// src/util/logger.ts

import pino, { type Logger as PinoLogger } from "npm:pino";
import type { Bot } from "@discordeno/bot";
import config from "$config";

/**
 * Helper to get a ISO-like timestamp, pino will use its own by default for JSON logs, but this can be used for custom messages or if we need it elsewhere
 * Get a formatted timestamp
 * @param date - The date to format
 * @returns The formatted timestamp
 */
function getFormattedTimestamp(date: Date = new Date()): string {
	// Pino typically uses epoch time or ISO string
	return date.toISOString();
}

/**
 * Custom stream for Pino to send logs to Discord
 */
class DiscordStream {
	private botInstance: Bot | null = null;
	private channelId: bigint | null = null;
	private isDebug = false;

	constructor(bot: Bot, channelId: string | bigint, isDebug: boolean) {
		this.botInstance = bot;
		this.isDebug = isDebug;
		try {
			this.channelId = BigInt(channelId);
		} catch (e) {
			console.error(
				`${getFormattedTimestamp()} [ERR] Invalid Discord channel ID for logger:`,
				e,
			);
			this.channelId = null;
		}
	}

	/**
	 * Write a log entry to Discord
	 * @param logEntryJson - The log entry to write
	 */
	async write(logEntryJson: string): Promise<void> {
		if (
			!this.botInstance || !this.channelId ||
			!config.logging.discord.enabled
		) return;

		try {
			const logEntry = JSON.parse(logEntryJson);

			// Skip debug logs for Discord if not in debug mode (pino level handles this upstream for the stream itself)
			// but an explicit check here is safer if stream receives all levels from pino instance
			if (logEntry.level >= 30 /* pino INFO */) {
				// Skip pino-pretty startup messages
				if (
					logEntry.level === 30 /* pino INFO */ &&
					logEntry.msg.startsWith("pino-pretty")
				) return;
				if (logEntry.level < 30 /* pino DEBUG */ && !this.isDebug) {
					return;
				}
				if (
					logEntry.level <
						20 /* pino TRACE, not used by our levels */ &&
					!this.isDebug
				) return;

				const pinoLevelToDiscord = (level: number): string => {
					// pino fatal
					if (level >= 60) return "FATAL";
					// pino error
					if (level >= 50) return "ERROR";
					// pino warn
					if (level >= 40) return "WARN";
					// pino info
					if (level >= 30) return "INFO";
					// pino debug
					if (level >= 20) return "DEBUG";
					// pino trace
					return "TRACE";
				};

				// Format the log message for Discord
				const levelStr = pinoLevelToDiscord(logEntry.level);
				let discordMessage = `**${levelStr}** | ${
					new Date(logEntry.time || Date.now()).toISOString()
				}\n\`\`\`\n${logEntry.msg}`;
				// Add any extra fields from the log to the Discord message
				const extras: string[] = [];
				for (const key in logEntry) {
					if (
						key !== "time" && key !== "level" && key !== "msg" &&
						key !== "pid" && key !== "hostname"
					) {
						extras.push(
							`${key}: ${
								typeof logEntry[key] === "string"
									? logEntry[key]
									: JSON.stringify(logEntry[key])
							}`,
						);
					}
				}
				if (extras.length > 0) {
					discordMessage += "\n" + extras.join("\n");
				}
				discordMessage += "\n\`\`\`";
				if (discordMessage.length > 2000) {
					discordMessage = discordMessage.substring(0, 1990) +
						"... (truncated)";
				}

				await this.botInstance.helpers.sendMessage(this.channelId, {
					content: discordMessage,
				}).catch((err) => {
					console.warn(
						`${getFormattedTimestamp()} [WRN] Failed to send log to Discord:`,
						err,
					);
				});
			}
		} catch (e) {
			console.warn(
				`${getFormattedTimestamp()} [WRN] Error processing log for Discord:`,
				e,
			);
		}
	}
}

/**
 * Logger class using Pino for handling application logs
 */
export class Logger {
	private pinoLogger: PinoLogger | null = null;
	private botInstance: Bot | null = null;
	private isDebugMode = false;
	private logDirectory = "./logs";
	// Default Discord channel ID, from config
	private developerLogChannelId: bigint | null = null;

	constructor() {
		// Ensure log directory exists (pino.destination will also create it)
		try {
			Deno.mkdirSync(this.logDirectory, { recursive: true });
		} catch (error) {
			if (!(error instanceof Deno.errors.AlreadyExists)) {
				console.error(
					`${getFormattedTimestamp()} [FTL] Failed to create log directory ${this.logDirectory}:`,
					error,
				);
			}
		}
	}

	/**
	 * Initializes the logger
	 * @param bot - The Bot instance
	 * @param isDebug - Whether debug logging is enabled
	 */
	public init(bot: Bot, isDebug = false): void {
		this.botInstance = bot;
		this.isDebugMode = isDebug;
		this.developerLogChannelId = null;

		// Attempt to set developerLogChannelId from config
		if (
			config.logging &&
			typeof config.logging.discord === "object" &&
			config.logging.discord !== null && // Ensure it's not null
			"developerChannelId" in config.logging.discord &&
			config.logging.discord.developerChannelId // Check if value is truthy (not null, undefined, empty string, 0, false)
		) {
			const devChannelIdFromConfig =
				config.logging.discord.developerChannelId;
			try {
				this.developerLogChannelId = BigInt(
					devChannelIdFromConfig as string | number | bigint,
				);
				console.info(
					`${getFormattedTimestamp()} [INF] Logger: Using developerChannelId ${this.developerLogChannelId} from config for default Discord logs`,
				);
			} catch (e) {
				console.error(
					`${getFormattedTimestamp()} [ERR] Invalid developerChannelId in config: ${devChannelIdFromConfig}`,
					e,
				);
				// `this.developerLogChannelId` remains `null` if config value is invalid
			}
		} else if (config.logging?.discord?.enabled) {
			// This condition means developerChannelId was not found, empty, or invalid in config, but Discord logging is enabled.
			console.info(
				`${getFormattedTimestamp()} [INF] Logger: developerChannelId from config was not found, empty, or invalid. Default Discord logging will be affected.`,
			);
		}

		// Log a warning if Discord logging is enabled but no channel ID could be resolved from config
		if (
			config.logging.discord.enabled &&
			this.developerLogChannelId === null
		) {
			console.warn(
				`${getFormattedTimestamp()} [WRN] Logger: Discord logging is enabled, but no valid developerChannelId found in config for default logs. Default Discord logging for the main logger instance will be disabled.`,
			);
		}

		const targets: pino.TransportTargetOptions[] = [];

		// Console transport
		targets.push({
			level: this.isDebugMode ? "debug" : "info",
			target: "pino-pretty",
			options: {
				colorize: true,
				ignore: "pid,hostname",
				singleLine: false,
			},
		});

		// File transport
		if (config.logging.fileEnabled) {
			const today = new Date();
			const fileName = `${today.getFullYear()}-${
				String(today.getMonth() + 1).padStart(2, "0")
			}-${String(today.getDate()).padStart(2, "0")}.log`;
			const filePath = `${this.logDirectory}/${fileName}`;
			targets.push({
				level: this.isDebugMode ? "debug" : "info", // Log debug to file if isDebugMode
				target: "pino/file",
				options: { destination: filePath, mkdir: true },
			});
		}

		const transport = pino.transport({ targets });
		this.pinoLogger = pino.default({
			level: this.isDebugMode ? "debug" : "info",
		}, transport);

		// Discord transport (custom stream for default guild log channel)
		if (
			config.logging.discord.enabled && this.developerLogChannelId &&
			this.botInstance
		) {
			const defaultDiscordStream = new DiscordStream(
				this.botInstance,
				this.developerLogChannelId,
				this.isDebugMode,
			);
			const pinoForDiscordOptions: pino.LoggerOptions = {
				level: this.isDebugMode ? "debug" : "info",
			};
			this.discordPinoStream = pino.default(
				pinoForDiscordOptions,
				defaultDiscordStream,
			);
		}

		this.info("Logger initialized");
		if (this.isDebugMode) {
			this.debug("Debug mode enabled for logger");
		}
	}

	// Store the discord stream logger instance if created for the default channel
	private discordPinoStream: PinoLogger | null = null;

	private async _logToSpecificDiscordChannel(
		level: "debug" | "info" | "warn" | "error" | "fatal",
		message: string,
		data: unknown | undefined,
		channelId: bigint,
	): Promise<void> {
		if (!this.botInstance || !config.logging.discord.enabled) return;

		try {
			// Create a temporary stream and pino logger instance for this specific channel
			const tempDiscordStream = new DiscordStream(
				this.botInstance,
				channelId,
				this.isDebugMode,
			);
			const pinoOptions: pino.LoggerOptions = {
				// Set level to ensure the message passes if the method (eg .debug()) is called
				level: this.isDebugMode || level !== "debug"
					? (level === "fatal"
						? "fatal"
						: level === "error"
						? "error"
						: level === "warn"
						? "warn"
						: level === "info"
						? "info"
						: "debug")
					: "info",
			};
			const tempPinoLogger = pino.default(pinoOptions, tempDiscordStream);
			if (level === "error" || level === "fatal") {
				if (data instanceof Error) tempPinoLogger[level](data, message);
				else if (data !== undefined) {
					tempPinoLogger[level]({ obj: data }, message);
				} else tempPinoLogger[level](message);
			} else {
				// For debug, info, warn
				if (data !== undefined) {
					tempPinoLogger[level]({ obj: data }, message);
				} else tempPinoLogger[level](message);
			}
		} catch (e) {
			// Log this internal error to console to avoid recursion or silent failures
			console.warn(
				`${getFormattedTimestamp()} [WRN] Failed to log to specific Discord channel ${channelId}:`,
				e,
			);
		}
	}

	/**
	 * Logs a debug message
	 * @param message - The main message to log
	 * @param data - Optional data or Error object to associate with the log
	 * @param discordChannelIdOverride - Optional Discord channel ID to send this specific log to, overriding the default Discord channel
	 */
	public async debug(
		message: string,
		data?: unknown,
		discordChannelIdOverride?: string | bigint,
	): Promise<void> {
		if (this.pinoLogger) {
			if (data !== undefined) {
				this.pinoLogger.debug({ obj: data }, message);
			} else this.pinoLogger.debug(message);
		}

		if (this.isDebugMode) {
			if (
				discordChannelIdOverride && this.botInstance &&
				config.logging.discord.enabled
			) {
				const overrideAsBigInt = BigInt(discordChannelIdOverride);
				await this._logToSpecificDiscordChannel(
					"debug",
					message,
					data,
					overrideAsBigInt,
				);
			} else if (this.discordPinoStream) {
				// Default guild channel respects isDebugMode via its own pino instance level
				if (data !== undefined) {
					this.discordPinoStream.debug({ obj: data }, message);
				} else this.discordPinoStream.debug(message);
			}
		}
	}

	/**
	 * Logs an info message
	 * @param message - The main message to log
	 * @param data - Optional data or Error object to associate with the log
	 * @param discordChannelIdOverride - Optional Discord channel ID to send this specific log to, overriding the default Discord channel
	 */
	public async info(
		message: string,
		data?: unknown,
		discordChannelIdOverride?: string | bigint,
	): Promise<void> {
		if (this.pinoLogger) {
			if (data !== undefined) {
				this.pinoLogger.info({ obj: data }, message);
			} else this.pinoLogger.info(message);
		}

		if (
			discordChannelIdOverride && this.botInstance &&
			config.logging.discord.enabled
		) {
			const overrideAsBigInt = BigInt(discordChannelIdOverride);
			this._logToSpecificDiscordChannel(
				"info",
				message,
				data,
				overrideAsBigInt,
			);
		} else if (this.discordPinoStream) {
			if (data !== undefined) {
				this.discordPinoStream.info({ obj: data }, message);
			} else this.discordPinoStream.info(message);
		}
	}

	/**
	 * Logs a warning message
	 * @param message - The main message to log
	 * @param data - Optional data or Error object to associate with the log
	 * @param discordChannelIdOverride - Optional Discord channel ID to send this specific log to, overriding the default Discord channel
	 */
	public async warn(
		message: string,
		data?: unknown,
		discordChannelIdOverride?: string | bigint,
	): Promise<void> {
		if (this.pinoLogger) {
			if (data !== undefined) {
				this.pinoLogger.warn({ obj: data }, message);
			} else this.pinoLogger.warn(message);
		}

		if (
			discordChannelIdOverride && this.botInstance &&
			config.logging.discord.enabled
		) {
			const overrideAsBigInt = BigInt(discordChannelIdOverride);
			await this._logToSpecificDiscordChannel(
				"warn",
				message,
				data,
				overrideAsBigInt,
			);
		} else if (this.discordPinoStream) {
			if (data !== undefined) {
				this.discordPinoStream.warn({ obj: data }, message);
			} else this.discordPinoStream.warn(message);
		}
	}

	/**
	 * Logs an error message
	 * @param message - The main message to log
	 * @param data - Optional data or Error object to associate with the log (preferably an Error instance)
	 * @param discordChannelIdOverride - Optional Discord channel ID to send this specific log to, overriding the default Discord channel
	 */
	public async error(
		message: string,
		data?: unknown,
		discordChannelIdOverride?: string | bigint,
	): Promise<void> {
		if (this.pinoLogger) {
			if (data instanceof Error) this.pinoLogger.error(data, message);
			else if (data !== undefined) {
				this.pinoLogger.error({ obj: data }, message);
			} else this.pinoLogger.error(message);
		}

		if (
			discordChannelIdOverride && this.botInstance &&
			config.logging.discord.enabled
		) {
			const overrideAsBigInt = BigInt(discordChannelIdOverride);
			await this._logToSpecificDiscordChannel(
				"error",
				message,
				data,
				overrideAsBigInt,
			);
		} else if (this.discordPinoStream) {
			if (data instanceof Error) {
				this.discordPinoStream.error(data, message);
			} else if (data !== undefined) {
				this.discordPinoStream.error({ obj: data }, message);
			} else this.discordPinoStream.error(message);
		}
	}

	/**
	 * Logs a fatal error message
	 * @param message - The main message to log
	 * @param data - Optional data or Error object to associate with the log (preferably an Error instance)
	 * @param discordChannelIdOverride - Optional Discord channel ID to send this specific log to, overriding the default Discord channel
	 */
	public async fatal(
		message: string,
		data?: unknown,
		discordChannelIdOverride?: string | bigint,
	): Promise<void> {
		if (this.pinoLogger) {
			if (data instanceof Error) this.pinoLogger.fatal(data, message);
			else if (data !== undefined) {
				this.pinoLogger.fatal({ obj: data }, message);
			} else this.pinoLogger.fatal(message);
		}

		if (
			discordChannelIdOverride && this.botInstance &&
			config.logging.discord.enabled
		) {
			const overrideAsBigInt = BigInt(discordChannelIdOverride);
			await this._logToSpecificDiscordChannel(
				"fatal",
				message,
				data,
				overrideAsBigInt,
			);
		} else if (this.discordPinoStream) {
			if (data instanceof Error) {
				this.discordPinoStream.fatal(data, message);
			} else if (data !== undefined) {
				this.discordPinoStream.fatal({ obj: data }, message);
			} else this.discordPinoStream.fatal(message);
		}
	}
}

/**
 * Default logger instance for the application
 */
export const logger = new Logger();

/**
 * Interface for a logger that includes a prefix in its messages
 */
export interface PrefixedLogger {
	debug: (
		message: string,
		data?: unknown,
		discordChannelIdOverride?: string | bigint,
	) => Promise<void>;
	info: (
		message: string,
		data?: unknown,
		discordChannelIdOverride?: string | bigint,
	) => Promise<void>;
	warn: (
		message: string,
		data?: unknown,
		discordChannelIdOverride?: string | bigint,
	) => Promise<void>;
	error: (
		message: string,
		data?: unknown,
		discordChannelIdOverride?: string | bigint,
	) => Promise<void>;
	fatal: (
		message: string,
		data?: unknown,
		discordChannelIdOverride?: string | bigint,
	) => Promise<void>;
}

/**
 * Creates a new logger instance that prepends a given prefix to all messages
 * @param prefix - The prefix string to prepend (e.g., command path)
 * @param baseLoggerInstance - The base logger instance to use (defaults to the global logger)
 * @returns A PrefixedLogger instance
 */
export function createPrefixedLogger(
	prefix: string,
	baseLoggerInstance: Logger = logger,
): PrefixedLogger {
	const prefixString = `[${prefix}] `;

	return {
		debug: async (message, data, discordChannelIdOverride) => {
			await baseLoggerInstance.debug(
				prefixString + message,
				data,
				discordChannelIdOverride,
			);
		},
		info: async (message, data, discordChannelIdOverride) => {
			await baseLoggerInstance.info(
				prefixString + message,
				data,
				discordChannelIdOverride,
			);
		},
		warn: async (message, data, discordChannelIdOverride) => {
			await baseLoggerInstance.warn(
				prefixString + message,
				data,
				discordChannelIdOverride,
			);
		},
		error: async (message, data, discordChannelIdOverride) => {
			await baseLoggerInstance.error(
				prefixString + message,
				data,
				discordChannelIdOverride,
			);
		},
		fatal: async (message, data, discordChannelIdOverride) => {
			await baseLoggerInstance.fatal(
				prefixString + message,
				data,
				discordChannelIdOverride,
			);
		},
	};
}
