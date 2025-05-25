import {
	ApplicationCommandOptionTypes,
	ApplicationCommandTypes,
	type Interaction,
} from "@discordeno/bot";
import { type DiscordEmbed, MessageFlags } from "@discordeno/types";
import type { BotWithCache } from "../bot.ts";

import { MongoError, MongoServerError } from "mongodb";
import { create } from "xmlbuilder2";
import { limitsDb, linksDb, rolesDb } from "$db";
import type { Limit, Links, Roles } from "../types/db.d.ts";

import Responder from "../util/Responder.ts";
import type { PrefixedLogger } from "../util/Logger.ts";

interface LinkDetails extends Links {
	limit?: number;
	premiumLimit?: number;
	addedByUserId: string;
	addedTimestamp: Date;
}

/**
 * Command data for the /list command
 */
export const data = {
	name: "list",
	description:
		"Lists all the links in the guild, with optional export format",
	type: ApplicationCommandTypes.ChatInput,
	options: [
		{
			type: ApplicationCommandOptionTypes.String,
			name: "category",
			description: "The category to get the links from (optional)",
			required: false,
			autocomplete: true,
		},
		{
			type: ApplicationCommandOptionTypes.String,
			name: "format",
			description: "Export format (csv, json, xml - optional)",
			required: false,
			choices: [
				{ name: "JSON", value: "json" },
				{ name: "CSV", value: "csv" },
				{ name: "XML", value: "xml" },
			],
		},
		{
			type: ApplicationCommandOptionTypes.Boolean,
			name: "basic_export",
			description:
				"Only export category and link, not other DB data (default: true)",
			required: false,
			choices: [
				{ name: "True", value: true },
				{ name: "False", value: false },
			],
		},
	],
	dmPermission: false,
};

/**
 * Whether this command can only be run by administrators
 */
export const adminOnly = true;

/**
 * Escapes special characters in a field for CSV formatting
 * @param field - The field to escape
 * @returns The escaped string
 */
function escapeCsv(field: any): string {
	if (field === null || field === undefined) return "";
	const str = String(field);
	return '"' + str.replace(/"/g, '""') + '"';
}

/**
 * Fetches link data, roles, and limits for a given guild and optional category
 * @param guildId - The ID of the guild to fetch data for
 * @param category - The optional category to filter links by
 * @returns A promise that resolves to an object containing links, roles, and limits
 */
async function fetchData(
	guildId: string,
	category?: string,
): Promise<{ links: Links[]; roles: Roles | null; limits: Limit[] }> {
	const query = category ? { guildId, cat: category } : { guildId };
	
	// Fetch links from database
	let links: Links[];
	try {
		links = await linksDb.find(query).toArray() as Links[];
	} catch (dbErr) {
		const action = `fetching links`;
		const details = category ? `for category '${category}'` : `for guild`;
		const context = `in guild ${guildId}`;
		const errorMsgRest = ` error occurred while ${action} ${details} ${context}`;
		if (
			dbErr instanceof MongoError || dbErr instanceof MongoServerError
		) {
			throw new Error(`A database${errorMsgRest}: ${dbErr}`);
		} else {
			throw new Error(`An unexpected${errorMsgRest}: ${dbErr}`);
		}
	}

	// Fetch roles from database
	let roles: Roles | null;
	try {
		roles = await rolesDb.findOne({ guildId });
	} catch (dbErr) {
		const action = `fetching roles`;
		const context = `for guild ${guildId}`;
		const errorMsgRest = ` error occurred while ${action} ${context}`;
		if (
			dbErr instanceof MongoError || dbErr instanceof MongoServerError
		) {
			throw new Error(`A database${errorMsgRest}: ${dbErr}`);
		} else {
			throw new Error(`An unexpected${errorMsgRest}: ${dbErr}`);
		}
	}

	// Fetch limits from database
	let limits: Limit[];
	try {
		limits = await limitsDb.find({ guildId }).toArray();
	} catch (dbErr) {
		const action = `fetching limits`;
		const context = `for guild ${guildId}`;
		const errorMsgRest = ` error occurred while ${action} ${context}`;
		if (
			dbErr instanceof MongoError || dbErr instanceof MongoServerError
		) {
			throw new Error(`A database${errorMsgRest}: ${dbErr}`);
		} else {
			throw new Error(`An unexpected${errorMsgRest}: ${dbErr}`);
		}
	}

	return { links: links, roles: roles, limits: limits };
}

/**
 * Formats link details as a JSON string
 * @param linkDetails - An array of link details to format
 * @param basicExport - Whether to only include basic fields (category and link)
 * @returns A promise that resolves to the JSON string
 */
async function formatDataAsJson(
	linkDetails: LinkDetails[],
	basicExport: boolean,
): Promise<string> {
	if (basicExport) {
		const basicLinks = linkDetails.map((link) => ({
			cat: link.cat,
			link: link.link,
		}));
		return JSON.stringify(basicLinks, null, 2);
	}
	return JSON.stringify(linkDetails, null, 2);
}

/**
 * Formats link details as a CSV string
 * @param linkDetails - An array of link details to format
 * @param basicExport - Whether to only include basic fields (category and link)
 * @returns A promise that resolves to the CSV string
 */
async function formatDataAsCsv(
	linkDetails: LinkDetails[],
	basicExport: boolean,
): Promise<string> {
	if (basicExport) {
		if (linkDetails.length === 0) {
			return "category,link\n";
		}
		const headers = ["category", "link"];
		let csv = headers.map(escapeCsv).join(",") + "\n";
		linkDetails.forEach((item) => {
			csv += [escapeCsv(item.cat), escapeCsv(item.link)].join(",") +
				"\n";
		});
		return csv;
	}
	// Full export
	if (linkDetails.length === 0) {
		return "category,link,limit,premiumLimit,addedByUserId,addedTimestamp\n";
	}
	const headers = [
		"category",
		"link",
		"limit",
		"premiumLimit",
		"addedByUserId",
		"addedTimestamp",
	];
	let csv = headers.map(escapeCsv).join(",") + "\n";
	linkDetails.forEach((item) => {
		csv += [
			escapeCsv(item.cat),
			escapeCsv(item.link),
			escapeCsv(item.limit ?? ""),
			escapeCsv(item.premiumLimit ?? ""),
			escapeCsv(item.addedByUserId),
			escapeCsv(
				item.addedTimestamp ? item.addedTimestamp.toISOString() : "",
			),
		].join(",") + "\n";
	});
	return csv;
}

/**
 * Formats link details as an XML string
 * @param linkDetails - An array of link details to format
 * @param basicExport - Whether to only include basic fields (category and link)
 * @returns A promise that resolves to the XML string
 */
async function formatDataAsXml(
	linkDetails: LinkDetails[],
	basicExport: boolean,
): Promise<string> {
	const root = create({ version: "1.0", encoding: "UTF-8" }).ele("links");
	for (const item of linkDetails) {
		const linkEntry = root.ele("linkEntry");
		linkEntry.ele("category").txt(item.cat);
		linkEntry.ele("link").txt(item.link);
		if (!basicExport) {
			if (item.limit !== undefined) {
				linkEntry.ele("limit").txt(String(item.limit));
			}
			if (item.premiumLimit !== undefined) {
				linkEntry.ele("premiumLimit").txt(String(item.premiumLimit));
			}
			linkEntry.ele("addedByUserId").txt(item.addedByUserId);
			if (item.addedTimestamp) {
				linkEntry.ele("addedTimestamp").txt(
					item.addedTimestamp.toISOString(),
				);
			}
		}
	}
	return root.end({ prettyPrint: true });
}

/**
 * Handles the 'list' slash command interaction
 * Fetches and lists links, optionally exporting them in different formats
 * @param bot - The bot instance
 * @param interaction - The interaction object
 */
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
	await responder.defer(MessageFlags.Ephemeral);

	const category = interaction.data?.options?.find(
		(opt) => opt.name === "category",
	)?.value as string | undefined;
	const format = interaction.data?.options?.find(
		(opt) => opt.name === "format",
	)?.value as "json" | "csv" | "xml" | undefined;
	const basicExportOption = interaction.data?.options?.find(
		(opt) => opt.name === "basic_export",
	);
	const basicExport = basicExportOption?.value as boolean ?? true;

	if (!interaction.guildId) {
		await responder.editResponse(
			"This command can only be used in a server!",
		);
		return;
	}
	const guildIdString = String(interaction.guildId);

	// Fetch guild data from database
	let links: Links[];
	let roles: Roles | null;
	let allLimitsInGuild: Limit[];
	try {
		const result = await fetchData(guildIdString, category);
		links = result.links;
		roles = result.roles;
		allLimitsInGuild = result.limits;
	} catch (dbErr) {
		const action = `fetching links`;
		const context = `for guild ${guildIdString}`;
		const responseMsgRest = ` error occurred while ${action}`;
		const loggerMsgRest = `${responseMsgRest} ${context}`;
		const responseMsg = `⚠️ An${responseMsgRest}`;
		if (
			dbErr instanceof MongoError || dbErr instanceof MongoServerError
		) {
			logger.error(
				`A database${loggerMsgRest}: ${dbErr}`,
			);
			await responder.editResponse(
				responseMsg,
			);
			return;
		} else {
			logger.error(
				`An unexpected${loggerMsgRest}: ${dbErr}`,
			);
			await responder.editResponse(
				responseMsg,
			);
			return;
		}
	}

	if (links.length === 0) {
		await responder.editResponse(
			category
				? `No links found for category '${category}'!`
				: "There are no links in this server to list!",
		);
		return;
	}

	// Create a map for quick limit lookups by category
	const limitsMap = new Map<
		string,
		{ limit?: number; premiumLimit?: number }
	>();
	allLimitsInGuild.forEach((l) => {
		limitsMap.set(l.cat, { limit: l.limit, premiumLimit: l.premiumLimit });
	});

	const enrichedLinks: LinkDetails[] = links.map((link) => ({
		...link,
		...(limitsMap.get(link.cat) || {}),
	}));

	if (format) {
		let formattedData = "";
		const fileExtension = format;

		switch (format) {
			case "json":
				formattedData = await formatDataAsJson(
					enrichedLinks,
					basicExport,
				);
				break;
			case "csv":
				formattedData = await formatDataAsCsv(
					enrichedLinks,
					basicExport,
				);
				break;
			case "xml":
				formattedData = await formatDataAsXml(
					enrichedLinks,
					basicExport,
				);
				break;
			default:
				await responder.editResponse(
					"⚠️ Invalid format specified. This should not happen!",
				);
				return;
		}

		// Discord embed code block limit is 1024, description limit 4096
		// If data is too large, consider sending as a file attachment instead
		// For now, truncate if too large for a code block
		const maxLen = 1000;
		let codeBlockContent = formattedData;
		if (formattedData.length > maxLen) {
			codeBlockContent = formattedData.substring(0, maxLen) +
				"\n... (truncated)";
		}

		const embedToSend: DiscordEmbed = {
			title: category
				? `Links for ${category} (${format.toUpperCase()})`
				: `All Links (${format.toUpperCase()})`,
			description: `\`\`\`${fileExtension}\n${codeBlockContent}\n\`\`\``,
			color: 0xe071ac,
		};

		await responder.editResponseWithEmbedAndFiles([embedToSend], [
			{
				name: `links.${fileExtension}`,
				blob: new Blob([formattedData], {
					type: `text/${fileExtension}`,
				}),
			},
		]);
	} else {
		// Original plain text list logic
		const adminRoleText = roles?.admin ? `<@&${roles.admin}>` : "Not set";
		const premiumRoleText = roles?.premium
			? `<@&${roles.premium}>`
			: "Not set";

		const listItems: string[] = enrichedLinks.map((link) => {
			let line = `*${link.cat}*`;
			if (link.limit !== undefined) line += ` **Limit**: ${link.limit}`;
			if (link.premiumLimit !== undefined) {
				line += ` **Premium Limit**: ${link.premiumLimit}`;
			}
			line += ` **Link**: ${link.link}`;
			line += ` (Added by: User ID ${link.addedByUserId})`;
			if (link.addedTimestamp) {
				line += ` on ${link.addedTimestamp.toLocaleDateString()}`;
			}
			return line;
		});

		const output =
			`**Role IDs**\nAdmin: ${adminRoleText}\nPremium: ${premiumRoleText}\n\n` +
			listItems.join("\n");

		if (output.length > 2000) {
			await responder.editResponseWithFiles(
				[
					{
						name: `message.txt`,
						blob: new Blob([output], {
							type: `text/plain`,
						}),
					},
				],
				"The list is too long to display in a message, sending as a file",
			);
			return;
		}
		await responder.editResponse(output);
		return;
	}
}
