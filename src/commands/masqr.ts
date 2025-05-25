// Ryan Wilson
// src/commands/masqr.ts

import {
	ApplicationCommandTypes,
	type Interaction,
	MessageFlags,
} from "@discordeno/bot";
import { ApplicationCommandOptionTypes as DiscordOptionTypes } from "@discordeno/bot";
import { type DiscordEmbed as Embed } from "@discordeno/types";
import type { BotWithCache } from "../bot.ts";

import {
	linksDb,
	masqrCategoryConfigsDb,
	masqrDomainsDb,
	masqrLicensesDb,
} from "../db.ts";
import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

import {
	getGuildConfig
} from "../util/configManager.ts";

/**
 * Command data for the `/masqr` command
 */
export const data = {
	name: "masqr",
	description: "Manage Masqr anti-link-leaking protection for this sever",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			type: DiscordOptionTypes["SubCommandGroup"],
			name: "config",
			description: "Configure Masqr settings for this server",
			options: [
				{
					type: DiscordOptionTypes["SubCommand"],
					name: "set",
					description:
						"Set a Masqr configuration value for this server",
					options: [
						{
							type: DiscordOptionTypes["String"],
							name: "option",
							description:
								"The Masqr configuration option to set",
							required: true,
							// choices: [
							// 	{ name: "Enable Masqr for this server", value: "masqr.enabled" },
							// 	{ name: "Validation Endpoint URL (for your proxies)", value: "masqr.validationEndpointUrl" },
							// 	{ name: "Default License Expiration (hours)", value: "masqr.defaultLicenseExpirationHours" },
							// 	{ name: "Max License Expiration (hours)", value: "masqr.maxLicenseExpirationHours" },
							// 	{ name: "Guild Whitelisted Domains (comma-separated)", value: "masqr.guildWhitelistedDomains" },
							// ],
						},
						{
							type: DiscordOptionTypes["String"],
							name: "value",
							description:
								"The value to set for the option (use 'true'/'false' for boolean)",
							required: true,
						},
					],
				},
				{
					type: DiscordOptionTypes["SubCommand"],
					name: "view",
					description:
						"View the current Masqr configuration for this server",
				},
				{
					type: DiscordOptionTypes["SubCommand"],
					name: "remove",
					description: "Remove a Masqr-protected domain",
					options: [
						{
							type: DiscordOptionTypes["String"],
							name: "domain",
							description: "The domain to remove",
							required: true,
						},
					],
				},
				{
					type: DiscordOptionTypes["SubCommand"],
					name: "list",
					description: "List all Masqr-protected domains",
				},
				{
					type: DiscordOptionTypes["SubCommand"],
					name: "toggle",
					description:
						"Enable or disable Masqr protection for a domain",
					options: [
						{
							type: DiscordOptionTypes["String"],
							name: "domain",
							description: "The domain to toggle",
							required: true,
						},
						{
							type: DiscordOptionTypes["Boolean"],
							name: "enabled",
							description:
								"Whether to enable or disable protection",
							required: true,
							choices: [
								{ name: "True", value: true },
								{ name: "False", value: false },
							],
						},
					],
				},
			],
		},
		{
			type: DiscordOptionTypes["SubCommandGroup"],
			name: "license",
			description: "Manage Masqr licenses",
			options: [
				{
					type: DiscordOptionTypes["SubCommand"],
					name: "generate",
					description: "Generate a new Masqr license",
					options: [
						{
							type: DiscordOptionTypes["String"],
							name: "domain",
							description: "The domain this license is for",
							required: true,
						},
						{
							type: DiscordOptionTypes["String"],
							name: "category",
							description:
								"The category this license grants access to",
							required: true,
							autocomplete: true,
						},
						{
							type: DiscordOptionTypes["User"],
							name: "user",
							description:
								"The user to generate the license for (defaults to you)",
							required: false,
						},
						{
							type: DiscordOptionTypes["Integer"],
							name: "expires",
							description:
								"License expiration time in hours (default: 72)",
							required: false,
							minValue: 1,
							// 1 week max
							maxValue: 168,
						},
					],
				},
				{
					type: DiscordOptionTypes["SubCommand"],
					name: "revoke",
					description: "Revoke an active Masqr license",
					options: [
						{
							type: DiscordOptionTypes["String"],
							name: "license",
							description: "The license key to revoke",
							required: true,
						},
					],
				},
				{
					type: DiscordOptionTypes["SubCommand"],
					name: "list",
					description: "List active Masqr licenses",
					options: [
						{
							type: DiscordOptionTypes["User"],
							name: "user",
							description: "Filter by specific user",
							required: false,
						},
						{
							type: DiscordOptionTypes["String"],
							name: "domain",
							description: "Filter by specific domain",
							required: false,
						},
					],
				},
			],
		},
		{
			type: DiscordOptionTypes["SubCommandGroup"],
			name: "link",
			description: "Manage Masqr protection for links",
			options: [
				{
					type: DiscordOptionTypes["SubCommand"],
					name: "protect",
					description:
						"Enable Masqr protection for links in a category",
					options: [
						{
							type: DiscordOptionTypes["String"],
							name: "category",
							description: "The category to protect",
							required: true,
							autocomplete: true,
						},
						{
							type: DiscordOptionTypes["Boolean"],
							name: "enabled",
							description:
								"Whether to enable or disable protection",
							required: true,
							choices: [
								{ name: "True", value: true },
								{ name: "False", value: false },
							],
						},
					],
				},
			],
		},
		{
			type: DiscordOptionTypes["SubCommandGroup"],
			name: "category",
			description: "Manage per-category Masqr license settings",
			options: [
				{
					type: DiscordOptionTypes["SubCommand"],
					name: "set",
					description:
						"Set category-specific Masqr license configuration",
					options: [
						{
							type: DiscordOptionTypes["String"],
							name: "category",
							description: "The category to configure",
							required: true,
							autocomplete: true,
						},
						{
							type: DiscordOptionTypes["String"],
							name: "option",
							description: "The setting to configure",
							required: true,
							choices: [
								{
									name: "Enable licenses for category",
									value: "enabled",
								},
								{
									name: "Default license expiration hours",
									value: "defaultLicenseExpirationHours",
								},
								{
									name: "Max license expiration hours",
									value: "maxLicenseExpirationHours",
								},
								{
									name: "Validation endpoint URL",
									value: "validationEndpointUrl",
								},
							],
						},
						{
							type: DiscordOptionTypes["String"],
							name: "value",
							description: "The value to set for the option",
							required: true,
						},
					],
				},
				{
					type: DiscordOptionTypes["SubCommand"],
					name: "get",
					description:
						"Get category-specific Masqr license configuration",
					options: [
						{
							type: DiscordOptionTypes["String"],
							name: "category",
							description:
								"The category to view configuration for",
							required: true,
							autocomplete: true,
						},
					],
				},
				{
					type: DiscordOptionTypes["SubCommand"],
					name: "list",
					description:
						"List all category-specific Masqr configurations",
				},
				{
					type: DiscordOptionTypes["SubCommand"],
					name: "reset",
					description:
						"Reset category to use guild-wide Masqr defaults",
					options: [
						{
							type: DiscordOptionTypes["String"],
							name: "category",
							description: "The category to reset",
							required: true,
							autocomplete: true,
						},
					],
				},
			],
		},
	],
	dmPermission: false,
};

/**
 * Whether this command can only be run by administrators
 */
export const adminOnly = true;

export async function handle(
	bot: BotWithCache,
	interaction: Interaction,
	logger: PrefixedLogger,
): Promise<void> {
	const responder = new Responder(
		bot,
		interaction.id,
		interaction.token,
		logger,
	);
	const guildConfig = await getGuildConfig(String(interaction.guildId));
	const guildId = String(interaction.guildId);
	const userId = String(interaction.user?.id);

	const options = interaction.data?.options;
	const subcommandGroup = options?.[0];
	const subcommand = subcommandGroup?.options?.[0];

	if (!subcommandGroup || !subcommand) {
		await responder.respond("Invalid command structure!");
		return;
	}

	await responder.defer();

	const groupName = subcommandGroup.name;
	const commandName = subcommand.name;

	try {
		switch (groupName) {
			case "domain":
				await handleDomainCommands(
					commandName,
					subcommand.options,
					guildId,
					responder,
					logger,
					guildConfig,
				);
				break;
			case "license":
				await handleLicenseCommands(
					commandName,
					subcommand.options,
					guildId,
					userId,
					responder,
					logger,
					guildConfig,
				);
				break;
			case "link":
				await handleLinkCommands(
					commandName,
					subcommand.options,
					guildId,
					responder,
					logger,
					guildConfig,
				);
				break;
			case "category":
				await handleCategoryCommands(
					commandName,
					subcommand.options,
					guildId,
					responder,
					logger,
					guildConfig,
				);
				break;
			default:
				await responder.editResponse("Unknown command group!");
		}
	} catch (error: unknown) {
		logger.error("Failed to handle masqr command", {
			error,
			groupName,
			commandName,
		});
		await responder.editResponse(
			"⚠️ An unexpected error occurred while processing the command",
		);
	}
}

/**
 * Handles domain-related Masqr commands
 */
async function handleDomainCommands(
	command: string,
	options: any[] | undefined,
	guildId: string,
	responder: Responder,
	logger: PrefixedLogger,
	guildConfig: any,
): Promise<void> {
	switch (command) {
		case "add": {
			const domainOption = options?.find((opt) => opt.name === "domain");
			const pskOption = options?.find((opt) => opt.name === "psk");

			if (!domainOption?.value || !pskOption?.value) {
				await responder.editResponse("Domain and PSK are required!");
				return;
			}

			const domain = domainOption.value as string;
			const psk = pskOption.value as string;

			// Check if domain already exists
			const existingDomain = await masqrDomainsDb.findOne({
				domain,
				guildId,
			});
			if (existingDomain) {
				await responder.editResponse(
					`Domain ${domain} is already configured for Masqr protection!`,
				);
				return;
			}

			const domainDoc = {
				domain,
				guildId,
				enabled: true,
				preSharedKeys: [psk],
				whitelistedDomains: [],
				createdAt: new Date(),
				updatedAt: new Date(),
			};

			await masqrDomainsDb.insertOne(domainDoc);
			logger.info(`Added Masqr domain protection for ${domain}`, {
				guildId,
			});

			const embed: Embed = {
				title: "✅ Masqr Domain Added",
				description:
					`Successfully added Masqr protection for **${domain}**`,
				color: parseInt(guildConfig.theme.success_color, 16),
				fields: [
					{ name: "Domain", value: domain, inline: true },
					{ name: "Status", value: "Enabled", inline: true },
					{ name: "PSK", value: `||${psk}||`, inline: true },
				],
			};

			await responder.editResponseWithEmbed(embed);
			break;
		}

		case "remove": {
			const domainOption = options?.find((opt) => opt.name === "domain");
			if (!domainOption?.value) {
				await responder.editResponse("Domain is required!");
				return;
			}

			const domain = domainOption.value as string;
			const result = await masqrDomainsDb.deleteOne({ domain, guildId });

			if (result.deletedCount === 0) {
				await responder.editResponse(
					`Domain ${domain} is not configured for Masqr protection!`,
				);
				return;
			}

			// Also revoke all active licenses for this domain
			await masqrLicensesDb.deleteMany({ host: domain, guildId });
			logger.info(`Removed Masqr domain protection for ${domain}`, {
				guildId,
			});

			await responder.editResponse(
				`Successfully removed Masqr protection for **${domain}** and revoked all active licenses ✅`,
			);
			break;
		}

		case "list": {
			const domains = await masqrDomainsDb.find({ guildId }).toArray();

			if (domains.length === 0) {
				await responder.editResponse(
					"No Masqr-protected domains configured!",
				);
				return;
			}

			const embed: Embed = {
				title: "🛡️ Masqr Protected Domains",
				description: `Found ${domains.length} configured domain${
					domains.length === 1 ? "" : "s"
				}`,
				color: parseInt(guildConfig.theme.primary_color, 16),
				fields: domains.map((domain) => ({
					name: domain.domain,
					value: `Status: ${
						domain.enabled ? "✅ Enabled" : "❌ Disabled"
					}\nPSKs: ${domain.preSharedKeys.length}\nCreated: <t:${
						Math.floor(domain.createdAt.getTime() / 1000)
					}:R>`,
					inline: true,
				})),
			};

			await responder.editResponseWithEmbed(embed);
			break;
		}

		case "toggle": {
			const domainOption = options?.find((opt) => opt.name === "domain");
			const enabledOption = options?.find((opt) =>
				opt.name === "enabled"
			);

			if (!domainOption?.value || enabledOption?.value === undefined) {
				await responder.editResponse(
					"Domain and enabled status are required!",
				);
				return;
			}

			const domain = domainOption.value as string;
			const enabled = enabledOption.value as boolean;

			const result = await masqrDomainsDb.updateOne(
				{ domain, guildId },
				{ $set: { enabled, updatedAt: new Date() } },
			);

			if (result.matchedCount === 0) {
				await responder.editResponse(
					`Domain ${domain} is not configured for Masqr protection!`,
				);
				return;
			}

			logger.info(
				`${
					enabled
						? "Enabled"
						: "Disabled"
				} Masqr protection for ${domain}`,
				{ guildId },
			);
			await responder.editResponse(
				`Successfully ${
					enabled ? "enabled" : "disabled"
				} Masqr protection for **${domain}** ✅`,
			);
			break;
		}
	}
}

/**
 * Handles license-related Masqr commands
 */
async function handleLicenseCommands(
	command: string,
	options: any[] | undefined,
	guildId: string,
	userId: string,
	responder: Responder,
	logger: PrefixedLogger,
	guildConfig: any,
): Promise<void> {
	switch (command) {
		case "generate": {
			const domainOption = options?.find((opt) => opt.name === "domain");
			const categoryOption = options?.find((opt) =>
				opt.name === "category"
			);
			const userOption = options?.find((opt) => opt.name === "user");
			const expiresOption = options?.find((opt) =>
				opt.name === "expires"
			);

			if (!domainOption?.value || !categoryOption?.value) {
				await responder.editResponse(
					"Domain and category are required!",
				);
				return;
			}

			const domain = domainOption.value as string;
			const category = categoryOption.value as string;
			const targetUserId = userOption?.value as string || userId;
			let expiresHours = expiresOption?.value as number;

			// Check if the domain is configured
			const domainConfig = await masqrDomainsDb.findOne({
				domain,
				guildId,
			});
			if (!domainConfig || !domainConfig.enabled) {
				await responder.editResponse(
					`Domain ${domain} is not configured or enabled for Masqr protection!`,
				);
				return;
			}

			// Check if the category has links
			const categoryLinks = await linksDb.countDocuments({
				guildId,
				cat: category,
			});
			if (categoryLinks === 0) {
				await responder.editResponse(
					`Category ${category} has no links!`,
				);
				return;
			}

			// Check for category-specific Masqr configuration
			const categoryConfig = await masqrCategoryConfigsDb.findOne({
				guildId,
				category,
			});

			// Use category-specific settings if available, otherwise use guild defaults
			const effectiveConfig = categoryConfig || {
				enabled: guildConfig.masqr.enabled,
				defaultLicenseExpirationHours:
					guildConfig.masqr.defaultLicenseExpirationHours,
				maxLicenseExpirationHours:
					guildConfig.masqr.maxLicenseExpirationHours,
				validationEndpointUrl: guildConfig.masqr.validationEndpointUrl,
			};

			// Check if licenses are enabled for this category
			if (!effectiveConfig.enabled) {
				await responder.editResponse(
					`Masqr licenses are disabled for category **${category}**!`,
				);
				return;
			}

			// Use category-specific default if no expiration was specified
			if (!expiresHours) {
				expiresHours = effectiveConfig.defaultLicenseExpirationHours;
			}

			// Enforce category-specific or guild maximum
			if (expiresHours > effectiveConfig.maxLicenseExpirationHours) {
				expiresHours = effectiveConfig.maxLicenseExpirationHours;
				logger.warn(
					`License expiration capped at maximum for category ${category}`,
					{
						guildId,
						requestedHours: expiresOption?.value,
						cappedHours: expiresHours,
					},
				);
			}

			const licenseKey = crypto.randomUUID().substring(0, 8);
			const expirationTime = new Date(
				Date.now() + (expiresHours * 60 * 60 * 1000),
			);

			const license = {
				licenseKey,
				host: domain,
				expires: expirationTime,
				guildId,
				userId: targetUserId,
				category,
				used: false,
				createdAt: new Date(),
			};

			await masqrLicensesDb.insertOne(license);
			logger.info(`Generated Masqr license for user ${targetUserId}`, {
				licenseKey,
				domain,
				category,
				guildId,
			});

			const configSource = categoryConfig
				? "category-specific"
				: "guild default";
			const embed: Embed = {
				title: "🎫 Masqr License Generated",
				description:
					`A new license has been generated for category **${category}** ✅`,
				color: parseInt(guildConfig.theme.success_color, 16),
				fields: [
					{
						name: "License Key",
						value: `||${licenseKey}||`,
						inline: true,
					},
					{ name: "Domain", value: domain, inline: true },
					{ name: "Category", value: category, inline: true },
					{ name: "User", value: `<@${targetUserId}>`, inline: true },
					{
						name: "Expires",
						value: `<t:${
							Math.floor(expirationTime.getTime() / 1000)
						}:R>`,
						inline: true,
					},
					{ name: "Usage", value: "Single-use only", inline: true },
					{
						name: "Config Source",
						value: configSource,
						inline: true,
					},
				],
				footer: {
					text:
						"This license will be automatically deleted after use or expiration",
				},
			};

			await responder.editResponseWithEmbed(embed);
			break;
		}

		case "revoke": {
			const licenseOption = options?.find((opt) =>
				opt.name === "license"
			);
			if (!licenseOption?.value) {
				await responder.editResponse("License key is required!");
				return;
			}

			const licenseKey = licenseOption.value as string;
			const result = await masqrLicensesDb.deleteOne({
				licenseKey,
				guildId,
			});

			if (result.deletedCount === 0) {
				await responder.editResponse(
					"License not found or already revoked!",
				);
				return;
			}

			logger.info(`Revoked Masqr license ${licenseKey}`, { guildId });
			await responder.editResponse(
				`Successfully revoked license **${licenseKey}** ✅`,
			);
			break;
		}

		case "list": {
			const userOption = options?.find((opt) => opt.name === "user");
			const domainOption = options?.find((opt) => opt.name === "domain");

			const filter: any = { guildId };
			if (userOption?.value) filter.userId = userOption.value;
			if (domainOption?.value) filter.host = domainOption.value;

			const licenses = await masqrLicensesDb.find(filter).sort({
				createdAt: -1,
			}).limit(25).toArray();

			if (licenses.length === 0) {
				await responder.editResponse("No active licenses found!");
				return;
			}

			const embed: Embed = {
				title: "🎫 Active Masqr Licenses",
				description: `Found ${licenses.length} active license${
					licenses.length === 1 ? "" : "s"
				}`,
				color: parseInt(guildConfig.theme.primary_color, 16),
				fields: licenses.map((license) => ({
					name: `License: ${license.licenseKey}`,
					value:
						`Domain: **${license.host}**\nCategory: **${license.category}**\nUser: <@${license.userId}>\nExpires: <t:${
							Math.floor(license.expires.getTime() / 1000)
						}:R>\nStatus: ${
							license.used ? "❌ Used" : "✅ Active"
						}`,
					inline: true,
				})),
			};

			await responder.editResponseWithEmbed(embed);
			break;
		}
	}
}

/**
 * Handles link-related Masqr commands
 */
async function handleLinkCommands(
	command: string,
	options: any[] | undefined,
	guildId: string,
	responder: Responder,
	logger: PrefixedLogger,
	guildConfig: any,
): Promise<void> {
	switch (command) {
		case "protect": {
			const categoryOption = options?.find((opt) =>
				opt.name === "category"
			);
			const enabledOption = options?.find((opt) =>
				opt.name === "enabled"
			);

			if (!categoryOption?.value || enabledOption?.value === undefined) {
				await responder.editResponse(
					"Category and enabled status are required!",
				);
				return;
			}

			const category = categoryOption.value as string;
			const enabled = enabledOption.value as boolean;

			const result = await linksDb.updateMany(
				{ guildId, cat: category },
				{ $set: { masqrEnabled: enabled } },
			);

			if (result.matchedCount === 0) {
				await responder.editResponse(
					`No links found in category ${category}!`,
				);
				return;
			}

			logger.info(
				`${
					enabled
						? "Enabled"
						: "Disabled"
				} Masqr protection for category ${category}`,
				{ guildId, affectedLinks: result.modifiedCount },
			);
			await responder.editResponse(
				`Successfully ${
					enabled ? "enabled" : "disabled"
				} Masqr protection for **${result.modifiedCount}** links in category **${category}** ✅`,
			);
			break;
		}
	}
}

/**
 * Handles category-related Masqr commands
 */
async function handleCategoryCommands(
	command: string,
	options: any[] | undefined,
	guildId: string,
	responder: Responder,
	logger: PrefixedLogger,
	guildConfig: any,
): Promise<void> {
	switch (command) {
		case "set": {
			const categoryOption = options?.find((opt) =>
				opt.name === "category"
			);
			const optionOption = options?.find((opt) => opt.name === "option");
			const valueOption = options?.find((opt) => opt.name === "value");

			if (
				!categoryOption?.value || !optionOption?.value ||
				!valueOption?.value
			) {
				await responder.editResponse(
					"Category, option, and value are required!",
				);
				return;
			}

			const category = categoryOption.value as string;
			const option = optionOption.value as string;
			const rawValue = valueOption.value as string;

			// Check if category has links
			const categoryLinks = await linksDb.countDocuments({
				guildId,
				cat: category,
			});
			if (categoryLinks === 0) {
				await responder.editResponse(
					`Category ${category} has no links! Create links first before configuring Masqr settings.`,
				);
				return;
			}

			// Parse and validate the value based on option type
			let parsedValue: any;
			switch (option) {
				case "enabled":
					if (
						rawValue.toLowerCase() === "true" ||
						rawValue.toLowerCase() === "enabled"
					) {
						parsedValue = true;
					} else if (
						rawValue.toLowerCase() === "false" ||
						rawValue.toLowerCase() === "disabled"
					) {
						parsedValue = false;
					} else {
						await responder.editResponse(
							"Value for 'enabled' must be 'true' or 'false'!",
						);
						return;
					}
					break;
				case "defaultLicenseExpirationHours":
				case "maxLicenseExpirationHours":
					const hours = parseInt(rawValue, 10);
					if (isNaN(hours) || hours < 1 || hours > 168) {
						await responder.editResponse(
							"Expiration hours must be a number between 1 and 168 (1 week)!",
						);
						return;
					}
					parsedValue = hours;
					break;
				case "validationEndpointUrl":
					if (
						rawValue.toLowerCase() === "none" ||
						rawValue.toLowerCase() === "null" ||
						rawValue.toLowerCase() === "unset"
					) {
						parsedValue = undefined;
					} else if (!/^https?:\/\/.+/.test(rawValue)) {
						await responder.editResponse(
							"Validation endpoint URL must be a valid HTTP/HTTPS URL!",
						);
						return;
					} else {
						parsedValue = rawValue;
					}
					break;
				default:
					await responder.editResponse("Invalid option specified!");
					return;
			}

			// Update or create category configuration
			const updateData: any = {
				[option]: parsedValue,
				updatedAt: new Date(),
			};

			const result = await masqrCategoryConfigsDb.updateOne(
				{ guildId, category },
				{
					$set: updateData,
					$setOnInsert: {
						guildId,
						category,
						enabled: option === "enabled" ? parsedValue : true,
						defaultLicenseExpirationHours:
							option === "defaultLicenseExpirationHours"
								? parsedValue
								: guildConfig.masqr
									.defaultLicenseExpirationHours,
						maxLicenseExpirationHours:
							option === "maxLicenseExpirationHours"
								? parsedValue
								: guildConfig.masqr.maxLicenseExpirationHours,
						createdAt: new Date(),
					},
				},
				{ upsert: true },
			);

			logger.info(`Updated Masqr category settings for ${category}`, {
				guildId,
				option,
				value: parsedValue,
			});
			await responder.editResponse(
				`Successfully updated **${option}** for category **${category}** to **${parsedValue}** ✅`,
			);
			break;
		}

		case "get": {
			const categoryOption = options?.find((opt) =>
				opt.name === "category"
			);

			if (!categoryOption?.value) {
				await responder.editResponse("Category is required!");
				return;
			}

			const category = categoryOption.value as string;
			const config = await masqrCategoryConfigsDb.findOne({
				guildId,
				category,
			});

			if (!config) {
				await responder.editResponse(
					`No custom Masqr settings found for category **${category}**. It will use guild-wide defaults.`,
				);
				return;
			}

			const embed: Embed = {
				title: "🛡️ Category Masqr Settings",
				description:
					`Masqr license configuration for category **${category}**`,
				color: parseInt(guildConfig.theme.primary_color, 16),
				fields: [
					{
						name: "Enabled",
						value: config.enabled ? "✅ Yes" : "❌ No",
						inline: true,
					},
					{
						name: "Default Expiration",
						value: `${config.defaultLicenseExpirationHours} hours`,
						inline: true,
					},
					{
						name: "Max Expiration",
						value: `${config.maxLicenseExpirationHours} hours`,
						inline: true,
					},
					{
						name: "Validation Endpoint",
						value: config.validationEndpointUrl ||
							"Use guild default",
						inline: false,
					},
					{
						name: "Created",
						value: `<t:${
							Math.floor(config.createdAt.getTime() / 1000)
						}:R>`,
						inline: true,
					},
					{
						name: "Last Updated",
						value: `<t:${
							Math.floor(config.updatedAt.getTime() / 1000)
						}:R>`,
						inline: true,
					},
				],
			};

			await responder.editResponseWithEmbed(embed);
			break;
		}

		case "list": {
			const configs = await masqrCategoryConfigsDb.find({ guildId })
				.toArray();

			if (configs.length === 0) {
				await responder.editResponse(
					"No category-specific Masqr configurations found! All categories use guild-wide defaults.",
				);
				return;
			}

			const embed: Embed = {
				title: "🛡️ Category Masqr Configurations",
				description: `Found ${configs.length} category${
					configs.length === 1 ? "" : "s"
				} with custom Masqr settings`,
				color: parseInt(guildConfig.theme.primary_color, 16),
				fields: configs.map((config) => ({
					name: config.category,
					value: `Enabled: ${
						config.enabled ? "✅" : "❌"
					}\nDefault: ${config.defaultLicenseExpirationHours}h\nMax: ${config.maxLicenseExpirationHours}h\nUpdated: <t:${
						Math.floor(config.updatedAt.getTime() / 1000)
					}:R>`,
					inline: true,
				})),
			};

			await responder.editResponseWithEmbed(embed);
			break;
		}

		case "reset": {
			const categoryOption = options?.find((opt) =>
				opt.name === "category"
			);

			if (!categoryOption?.value) {
				await responder.editResponse("Category is required!");
				return;
			}

			const category = categoryOption.value as string;
			const result = await masqrCategoryConfigsDb.deleteOne({
				guildId,
				category,
			});

			if (result.deletedCount === 0) {
				await responder.editResponse(
					`No custom Masqr settings found for category **${category}** to reset.`,
				);
				return;
			}

			logger.info(`Reset Masqr category settings for ${category}`, {
				guildId,
			});
			await responder.editResponse(
				`Successfully reset Masqr settings for category **${category}** to use guild defaults ✅`,
			);
			break;
		}

		default:
			await responder.editResponse("Unknown category command!");
			break;
	}
}
