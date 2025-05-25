// Ryan Wilson
// src/util/masqrIntegration.ts

import {
	linksDb,
	masqrCategoryConfigsDb,
	masqrDomainsDb,
	masqrLicensesDb,
} from "../db.ts";
import { Logger } from "./Logger.ts";
import { getGuildConfig } from "./configManager.ts";
import { err, ok, Result } from "npm:neverthrow@8.1.0";

/**
 * Interface for Masqr-protected link generation
 */
interface MasqrLinkRequest {
	guildId: string;
	userId: string;
	category: string;
	preferredDomain?: string;
}

/**
 * Interface for generated Masqr link response
 */
interface MasqrLinkResponse {
	link: string;
	license: string;
	domain: string;
	expiresAt: Date;
	instructions: string;
}

/**
 * Interface for Masqr license generation request
 */
interface MasqrLicenseRequest {
	guildId: string;
	userId: string;
	category: string;
	preferredDomain?: string;
}

/**
 * Interface for generated Masqr license response
 */
interface MasqrLicenseInfo {
	licenseKey: string;
	domain: string;
	expires: Date;
}

/**
 * Generates a Masqr-protected link for a user
 */
export async function generateMasqrLink(
	request: MasqrLinkRequest,
	logger: Logger,
): Promise<Result<MasqrLinkResponse, string>> {
	try {
		const { guildId, userId, category, preferredDomain } = request;

		// Get effective Masqr configuration for this category
		const effectiveConfig = await getEffectiveMasqrConfig(
			guildId,
			category,
		);

		// Check if licenses are enabled for this category
		if (!effectiveConfig.enabled) {
			return err(
				`Masqr licenses are disabled for category "${category}"!`,
			);
		}

		// Check if category has Masqr-enabled links
		const categoryLinks = await linksDb.find({
			guildId,
			cat: category,
			masqrEnabled: true,
		}).toArray();

		if (categoryLinks.length === 0) {
			return err(
				"No Masqr-protected links are available in this category!",
			);
		}

		// Get available domains for this guild
		const availableDomains = await masqrDomainsDb.find({
			guildId,
			enabled: true,
		}).toArray();

		if (availableDomains.length === 0) {
			return err(
				"No Masqr-protected domains are configured for this server!",
			);
		}

		// Select domain (preferred or first available)
		const selectedDomain = preferredDomain
			? availableDomains.find((d) => d.domain === preferredDomain)
			: availableDomains[0];

		if (!selectedDomain) {
			return err(
				`Domain ${preferredDomain} is not available or not configured`,
			);
		}

		// Generate license using guild-specific expiration settings
		const licenseKey = crypto.randomUUID().substring(0, 8);
		const expirationTime = new Date(
			Date.now() +
				(effectiveConfig.defaultLicenseExpirationHours * 60 * 60 *
					1000),
		);

		const license = {
			licenseKey,
			host: selectedDomain.domain,
			expires: expirationTime,
			guildId,
			userId,
			category,
			used: false,
			createdAt: new Date(),
		};

		await masqrLicensesDb.insertOne(license);

		// Select a random link from the category
		const selectedLink =
			categoryLinks[Math.floor(Math.random() * categoryLinks.length)];

		logger.info(`Generated Masqr-protected link for user ${userId}`, {
			licenseKey,
			domain: selectedDomain.domain,
			category,
			link: selectedLink.link,
		});

		const instructions = generateAccessInstructions(
			selectedLink.link,
			licenseKey,
			selectedDomain.domain,
			effectiveConfig.validationEndpointUrl,
		);

		return ok({
			link: selectedLink.link,
			license: licenseKey,
			domain: selectedDomain.domain,
			expiresAt: expirationTime,
			instructions,
		});
	} catch (error) {
		logger.error("Failed to generate Masqr link", { error });
		return err(
			"An unexpected error occurred while generating the Masqr link",
		);
	}
}

/**
 * Generates user-friendly instructions for accessing a Masqr-protected link
 * @param link - The link to access
 * @param license - The license key to use
 * @param domain - The domain to access
 * @param validationEndpointUrl - The validation endpoint to use
 * @returns The access instructions
 */
function generateAccessInstructions(
	link: string,
	license: string,
	domain: string,
	validationEndpointUrl?: string,
): string {
	const endpointInfo = validationEndpointUrl
		? `\n**Validation Endpoint:** ${validationEndpointUrl}`
		: "";

	return `
🛡️ **Masqr-Protected Link Access Instructions**

**Your Link:** ${link}
**License Key:** \`${license}\`
**Protected Domain:** ${domain}${endpointInfo}

**How to Access:**
1. Visit the link above in your browser
2. You'll see a login prompt after a few seconds
3. Enter any username (it doesn't matter)
4. Enter your license key: \`${license}\`
5. The page will refresh and grant you access

**Important Notes:**
• This license is **single-use only** - it will be consumed upon first use
• The license expires automatically after the specified time
• Do not share this license with others
• If you experience issues, contact the server admins

**Security:** This system prevents link leaking by ensuring only authorized users can access the content
	`.trim();
}

/**
 * Checks if a category has any Masqr-protected links
 */
export async function categoryHasMasqrLinks(
	guildId: string,
	category: string,
): Promise<boolean> {
	try {
		const count = await linksDb.countDocuments({
			guildId,
			cat: category,
			masqrEnabled: true,
		});
		return count > 0;
	} catch {
		return false;
	}
}

/**
 * Checks if a guild has any Masqr-protected domains configured
 */
export async function guildHasMasqrDomains(guildId: string): Promise<boolean> {
	try {
		const count = await masqrDomainsDb.countDocuments({
			guildId,
			enabled: true,
		});
		return count > 0;
	} catch {
		return false;
	}
}

/**
 * Gets available Masqr domains for a guild
 */
export async function getAvailableMasqrDomains(
	guildId: string,
): Promise<string[]> {
	try {
		const domains = await masqrDomainsDb.find({
			guildId,
			enabled: true,
		}).toArray();
		return domains.map((d) => d.domain);
	} catch {
		return [];
	}
}

/**
 * Validates if Masqr protection is available for a guild and category
 */
export async function validateMasqrAvailability(
	guildId: string,
	category: string,
): Promise<Result<{ domains: string[]; linkCount: number }, string>> {
	try {
		const [hasDomains, hasLinks, domains, linkCount] = await Promise.all([
			guildHasMasqrDomains(guildId),
			categoryHasMasqrLinks(guildId, category),
			getAvailableMasqrDomains(guildId),
			linksDb.countDocuments({
				guildId,
				cat: category,
				masqrEnabled: true,
			}),
		]);

		if (!hasDomains) {
			return err("No Masqr-protected domains configured for this server");
		}

		if (!hasLinks) {
			return err(
				`No Masqr-protected links available in category "${category}"`,
			);
		}

		return ok({ domains, linkCount });
	} catch (error) {
		return err("Failed to validate Masqr availability");
	}
}

/**
 * Cleans up expired licenses for a specific guild
 */
export async function cleanupExpiredLicenses(
	guildId: string,
	logger: Logger,
): Promise<number> {
	try {
		const result = await masqrLicensesDb.deleteMany({
			guildId,
			expires: { $lt: new Date() },
		});

		if (result.deletedCount > 0) {
			logger.info(
				`Cleaned up ${result.deletedCount} expired Masqr licenses for guild ${guildId}`,
			);
		}

		return result.deletedCount;
	} catch (error) {
		logger.error("Failed to cleanup expired licenses", { error, guildId });
		return 0;
	}
}

/**
 * Gets active license count for a user in a guild
 */
export async function getUserActiveLicenseCount(
	guildId: string,
	userId: string,
): Promise<number> {
	try {
		return await masqrLicensesDb.countDocuments({
			guildId,
			userId,
			expires: { $gt: new Date() },
		});
	} catch {
		return 0;
	}
}

/**
 * Generates a Masqr license for a user (simplified interface)
 */
export async function generateMasqrLicense(
	request: MasqrLicenseRequest,
): Promise<Result<MasqrLicenseInfo, string>> {
	const logger = console; // Use console logger for now

	const linkResult = await generateMasqrLink(request, logger);

	if (linkResult.isErr()) {
		return err(linkResult.error);
	}

	const linkResponse = linkResult.value;

	return ok({
		licenseKey: linkResponse.license,
		domain: linkResponse.domain,
		expires: linkResponse.expiresAt,
	});
}

/**
 * Gets effective Masqr configuration for a category, checking category-specific settings first
 */
export async function getEffectiveMasqrConfig(
	guildId: string,
	category: string,
): Promise<{
	enabled: boolean;
	defaultLicenseExpirationHours: number;
	maxLicenseExpirationHours: number;
	validationEndpointUrl?: string;
	isCustom: boolean;
}> {
	const [guildConfig, categoryConfig] = await Promise.all([
		getGuildConfig(guildId),
		masqrCategoryConfigsDb.findOne({ guildId, category }),
	]);

	const masqrConfig = guildConfig.masqr;

	if (categoryConfig) {
		return {
			enabled: categoryConfig.enabled,
			defaultLicenseExpirationHours:
				categoryConfig.defaultLicenseExpirationHours,
			maxLicenseExpirationHours: categoryConfig.maxLicenseExpirationHours,
			validationEndpointUrl: categoryConfig.validationEndpointUrl ||
				masqrConfig.validationEndpointUrl,
			isCustom: true,
		};
	}

	return {
		enabled: masqrConfig.enabled,
		defaultLicenseExpirationHours:
			masqrConfig.defaultLicenseExpirationHours,
		maxLicenseExpirationHours: masqrConfig.maxLicenseExpirationHours,
		validationEndpointUrl: masqrConfig.validationEndpointUrl,
		isCustom: false,
	};
}
