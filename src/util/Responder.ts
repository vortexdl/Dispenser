import {
	type Bot,
	InteractionResponseTypes,
	MessageFlags,
} from "@discordeno/bot";
import type { ApplicationCommandOptionChoice } from "@discordeno/bot";
import { type DiscordEmbed as Embed } from "@discordeno/types";

import type { PrefixedLogger } from "./Logger.ts";

export default class Responder {
	bot: Bot;
	id: bigint;
	token: string;
	logger: PrefixedLogger;

	constructor(bot: Bot, id: bigint, token: string, logger: PrefixedLogger) {
		this.bot = bot;
		this.id = id;
		this.token = token;
		this.logger = logger;
	}

	async respond(msg: string): Promise<void> {
		try {
			await this.bot.rest.sendInteractionResponse(
				this.id,
				this.token,
				{
					type: InteractionResponseTypes.ChannelMessageWithSource,
					data: {
						content: msg,
						flags: MessageFlags.Ephemeral,
					},
				},
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes("API")) {
				this.logger.error(
					`Discord API error while sending response: ${error.message}`,
					error,
				);
			} else if (
				error instanceof TypeError && error.message.includes("fetch")
			) {
				this.logger.error(
					`Network error while sending response: ${error.message}`,
					error,
				);
			} else if (error instanceof Error) {
				this.logger.error(
					`Failed to send interaction response: ${error.message}`,
					error,
				);
			} else {
				this.logger.error(
					`Failed to send interaction response: Unknown error occurred`,
					error,
				);
			}
		}
	}

	async respondEmbed(embed: Embed): Promise<void> {
		try {
			await this.bot.rest.sendInteractionResponse(
				this.id,
				this.token,
				{
					type: InteractionResponseTypes.ChannelMessageWithSource,
					data: {
						embeds: [embed],
						flags: MessageFlags.Ephemeral,
					},
				},
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes("API")) {
				this.logger.error(
					`Discord API error while sending embed response: ${error.message}`,
					error,
				);
			} else if (
				error instanceof TypeError && error.message.includes("fetch")
			) {
				this.logger.error(
					`Network error while sending embed response: ${error.message}`,
					error,
				);
			} else if (error instanceof Error) {
				this.logger.error(
					`Failed to send embed response: ${error.message}`,
					error,
				);
			} else {
				this.logger.error(
					`Failed to send embed response: Unknown error occurred`,
					error,
				);
			}
		}
	}

	async defer(flags?: MessageFlags): Promise<void> {
		try {
			await this.bot.rest.sendInteractionResponse(
				this.id,
				this.token,
				{
					type: InteractionResponseTypes
						.DeferredChannelMessageWithSource,
					data: { flags },
				},
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes("API")) {
				this.logger.error(
					`Discord API error while deferring interaction: ${error.message}`,
					error,
				);
			} else if (
				error instanceof TypeError && error.message.includes("fetch")
			) {
				this.logger.error(
					`Network error while deferring interaction: ${error.message}`,
					error,
				);
			} else if (error instanceof Error) {
				this.logger.error(
					`Failed to defer interaction: ${error.message}`,
					error,
				);
			} else {
				this.logger.error(
					`Failed to defer interaction: Unknown error occurred`,
					error,
				);
			}
		}
	}

	async editResponse(content: string): Promise<void> {
		try {
			await this.bot.rest.editOriginalInteractionResponse(this.token, {
				content,
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes("API")) {
				this.logger.error(
					`Discord API error while editing response: ${error.message}`,
					error,
				);
			} else if (
				error instanceof TypeError && error.message.includes("fetch")
			) {
				this.logger.error(
					`Network error while editing response: ${error.message}`,
					error,
				);
			} else if (error instanceof Error) {
				this.logger.error(
					`Failed to edit response: ${error.message}`,
					error,
				);
			} else {
				this.logger.error(
					`Failed to edit response: Unknown error occurred`,
					error,
				);
			}
		}
	}

	async editResponseWithEmbed(embed: Embed): Promise<void> {
		try {
			await this.bot.rest.editOriginalInteractionResponse(this.token, {
				embeds: [embed],
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes("API")) {
				this.logger.error(
					`Discord API error while editing response with embed: ${error.message}`,
					error,
				);
			} else if (
				error instanceof TypeError && error.message.includes("fetch")
			) {
				this.logger.error(
					`Network error while editing response with embed: ${error.message}`,
					error,
				);
			} else if (error instanceof Error) {
				this.logger.error(
					`Failed to edit response with embed: ${error.message}`,
					error,
				);
			} else {
				this.logger.error(
					`Failed to edit response with embed: Unknown error occurred`,
					error,
				);
			}
		}
	}

	async editResponseWithFiles(files: any[], content?: string): Promise<void> {
		try {
			await this.bot.rest.editOriginalInteractionResponse(this.token, {
				content,
				files,
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes("API")) {
				this.logger.error(
					`Discord API error while editing response with files: ${error.message}`,
					error,
				);
			} else if (
				error instanceof TypeError && error.message.includes("fetch")
			) {
				this.logger.error(
					`Network error while editing response with files: ${error.message}`,
					error,
				);
			} else if (error instanceof Error) {
				this.logger.error(
					`Failed to edit response with files: ${error.message}`,
					error,
				);
			} else {
				this.logger.error(
					`Failed to edit response with files: Unknown error occurred`,
					error,
				);
			}
		}
	}

	async editResponseWithEmbedAndFiles(
		embeds: Embed[],
		files: any[],
	): Promise<void> {
		try {
			await this.bot.rest.editOriginalInteractionResponse(this.token, {
				embeds,
				files,
			});
		} catch (error) {
			if (error instanceof Error && error.message.includes("API")) {
				this.logger.error(
					`Discord API error while editing response with embed and files: ${error.message}`,
					error,
				);
			} else if (
				error instanceof TypeError && error.message.includes("fetch")
			) {
				this.logger.error(
					`Network error while editing response with embed and files: ${error.message}`,
					error,
				);
			} else if (error instanceof Error) {
				this.logger.error(
					`Failed to edit response with embed and files: ${error.message}`,
					error,
				);
			} else {
				this.logger.error(
					`Failed to edit response with embed and files: Unknown error occurred`,
					error,
				);
			}
		}
	}

	async editResponseWithData(data: any): Promise<void> {
		try {
			await this.bot.rest.editOriginalInteractionResponse(
				this.token,
				data,
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes("API")) {
				this.logger.error(
					`Discord API error while editing response with custom data: ${error.message}`,
					error,
				);
			} else if (
				error instanceof TypeError && error.message.includes("fetch")
			) {
				this.logger.error(
					`Network error while editing response with custom data: ${error.message}`,
					error,
				);
			} else if (error instanceof Error) {
				this.logger.error(
					`Failed to edit response with custom data: ${error.message}`,
					error,
				);
			} else {
				this.logger.error(
					`Failed to edit response with custom data: Unknown error occurred`,
					error,
				);
			}
		}
	}

	async respondWithEmbedAndComponents(
		embed: Embed,
		components: any[],
		flags?: MessageFlags,
	): Promise<void> {
		try {
			await this.bot.rest.sendInteractionResponse(
				this.id,
				this.token,
				{
					type: InteractionResponseTypes.ChannelMessageWithSource,
					data: {
						embeds: [embed],
						components,
						flags: flags || MessageFlags.Ephemeral,
					},
				},
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes("API")) {
				this.logger.error(
					`Discord API error while responding with embed and components: ${error.message}`,
					error,
				);
			} else if (
				error instanceof TypeError && error.message.includes("fetch")
			) {
				this.logger.error(
					`Network error while responding with embed and components: ${error.message}`,
					error,
				);
			} else if (error instanceof Error) {
				this.logger.error(
					`Failed to respond with embed and components: ${error.message}`,
					error,
				);
			} else {
				this.logger.error(
					`Failed to respond with embed and components: Unknown error occurred`,
					error,
				);
			}
		}
	}

	async respondWithData(data: any): Promise<void> {
		try {
			await this.bot.rest.sendInteractionResponse(
				this.id,
				this.token,
				{
					type: InteractionResponseTypes.ChannelMessageWithSource,
					data,
				},
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes("API")) {
				this.logger.error(
					`Discord API error while responding with custom data: ${error.message}`,
					error,
				);
			} else if (
				error instanceof TypeError && error.message.includes("fetch")
			) {
				this.logger.error(
					`Network error while responding with custom data: ${error.message}`,
					error,
				);
			} else if (error instanceof Error) {
				this.logger.error(
					`Failed to respond with custom data: ${error.message}`,
					error,
				);
			} else {
				this.logger.error(
					`Failed to respond with custom data: Unknown error occurred`,
					error,
				);
			}
		}
	}

	async deferUpdate(): Promise<void> {
		try {
			await this.bot.rest.sendInteractionResponse(
				this.id,
				this.token,
				{
					type: InteractionResponseTypes.DeferredUpdateMessage,
				},
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes("API")) {
				this.logger.error(
					`Discord API error while deferring update: ${error.message}`,
					error,
				);
			} else if (
				error instanceof TypeError && error.message.includes("fetch")
			) {
				this.logger.error(
					`Network error while deferring update: ${error.message}`,
					error,
				);
			} else if (error instanceof Error) {
				this.logger.error(
					`Failed to defer update: ${error.message}`,
					error,
				);
			} else {
				this.logger.error(
					`Failed to defer update: Unknown error occurred`,
					error,
				);
			}
		}
	}

	async autocompleteResult(
		choices: ApplicationCommandOptionChoice[],
	): Promise<void> {
		try {
			await this.bot.rest.sendInteractionResponse(
				this.id,
				this.token,
				{
					type: InteractionResponseTypes
						.ApplicationCommandAutocompleteResult,
					data: { choices },
				},
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes("API")) {
				this.logger.error(
					`Discord API error while sending autocomplete result: ${error.message}`,
					error,
				);
			} else if (
				error instanceof TypeError && error.message.includes("fetch")
			) {
				this.logger.error(
					`Network error while sending autocomplete result: ${error.message}`,
					error,
				);
			} else if (error instanceof Error) {
				this.logger.error(
					`Failed to send autocomplete result: ${error.message}`,
					error,
				);
			} else {
				this.logger.error(
					`Failed to send autocomplete result: Unknown error occurred`,
					error,
				);
			}
		}
	}

	async respondWithModal(modalData: any): Promise<void> {
		try {
			await this.bot.rest.sendInteractionResponse(
				this.id,
				this.token,
				{
					type: InteractionResponseTypes.Modal,
					data: modalData,
				},
			);
		} catch (error) {
			if (error instanceof Error && error.message.includes("API")) {
				this.logger.error(
					`Discord API error while sending modal response: ${error.message}`,
					error,
				);
			} else if (
				error instanceof TypeError && error.message.includes("fetch")
			) {
				this.logger.error(
					`Network error while sending modal response: ${error.message}`,
					error,
				);
			} else if (error instanceof Error) {
				this.logger.error(
					`Failed to send modal response: ${error.message}`,
					error,
				);
			} else {
				this.logger.error(
					`Failed to send modal response: Unknown error occurred`,
					error,
				);
			}
		}
	}
}
