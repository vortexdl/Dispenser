// Ryan Wilson
// src/util/commandUtils.ts

import type { DiscordInteractionDataOption } from "@discordeno/types";

/**
 * Parses an array of command options into a key-value object
 * @param optionsArray The array of options from interaction.data.options or a subcommand's options
 * @returns A record where keys are option names and values are their respective values
 */
export function parseCommandOptions(
	optionsArray?: readonly DiscordInteractionDataOption[],
): Record<string, string | number | boolean | undefined> {
	const parsedOptions: Record<string, string | number | boolean | undefined> =
		{};
	if (optionsArray) {
		for (const opt of optionsArray) {
			if ("value" in opt && opt.value !== undefined) {
				parsedOptions[opt.name] = opt
					.value as (string | number | boolean | undefined);
			}
		}
	}
	return parsedOptions;
}
