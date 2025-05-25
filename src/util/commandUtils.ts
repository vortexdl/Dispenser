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
			// This simple parser assumes direct key-value options
			// It does not handle nested subcommands/groups recursively here;
			// the caller should pass the correct options array (e.g., interaction.data.options[0].options for subcommand options)
			if ("value" in opt && opt.value !== undefined) {
				// opt.value can be string, number, boolean, or undefined based on DiscordInteractionDataOption structure
				// The assertion is safe given the check
				parsedOptions[opt.name] = opt
					.value as (string | number | boolean | undefined);
			}
		}
	}
	return parsedOptions;
}
