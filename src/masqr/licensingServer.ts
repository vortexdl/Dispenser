// Ryan Wilson
// src/masqr/licensingServer.ts

import { Hono } from "npm:hono@4.6.10";
import { cors } from "npm:hono@4.6.10/cors";
import { logger as honoLogger } from "npm:hono@4.6.10/logger"; // Renamed to avoid conflict
import { bearerAuth } from "npm:hono@4.6.10/bearer-auth";
import {
	masqrAccessLogsDb,
	masqrCategoryConfigsDb,
	masqrDomainsDb,
	masqrLicensesDb,
} from "../db.ts";
import { Logger } from "../util/Logger.ts";
import { getGuildConfig } from "../util/configManager.ts";

const app = new Hono();
const masqrLogger = new Logger();

// Get Masqr service configuration from environment variables
const MASQR_API_KEY = Deno.env.get("MASQR_API_KEY") ||
	"your-default-api-key-here";
const MASQR_LICENSING_SERVER_PORT = parseInt(
	Deno.env.get("MASQR_LICENSING_SERVER_PORT") || "8004",
);

// Middleware
app.use("*", cors());
app.use("*", honoLogger());

/**
 * Interface for license generation request to the licensing server
 */
interface LicenseGenerationServerRequest {
	guildId: string;
	userId: string;
	domainHost: string; // The specific domain the license is for
	category: string;
	customExpires?: number; // Optional: Expiration timestamp (milliseconds)
	assignedLicenseKey?: string; // Optional: Pre-assigned license key
}

/**
 * Generates a new license and stores it in the database
 * This endpoint is called by the bot, not directly by users
 */
app.post("/newLicense", bearerAuth({ token: MASQR_API_KEY }), async (c) => {
	try {
		const body = await c.req.json<LicenseGenerationServerRequest>();
		const {
			guildId,
			userId,
			domainHost,
			category,
			customExpires,
			assignedLicenseKey,
		} = body;

		if (!guildId || !userId || !domainHost || !category) {
			return c.json({
				error:
					"Missing required fields: guildId, userId, domainHost, category",
			}, 400);
		}

		// Fetch guild-specific Masqr configuration
		const guildMasqrConfig = (await getGuildConfig(guildId)).masqr;
		if (!guildMasqrConfig.enabled) {
			return c.json({
				error: "Masqr protection is disabled for this guild",
			}, 403);
		}

		// Check for category-specific Masqr configuration
		const categoryConfig = await masqrCategoryConfigsDb.findOne({
			guildId,
			category,
		});

		// Use category-specific settings if available, otherwise use guild defaults
		const effectiveConfig = categoryConfig || {
			enabled: guildMasqrConfig.enabled,
			defaultLicenseExpirationHours:
				guildMasqrConfig.defaultLicenseExpirationHours,
			maxLicenseExpirationHours:
				guildMasqrConfig.maxLicenseExpirationHours,
			validationEndpointUrl: guildMasqrConfig.validationEndpointUrl,
		};

		// Check if licenses are enabled for this category
		if (!effectiveConfig.enabled) {
			return c.json({
				error: `Masqr licenses are disabled for category "${category}"`,
			}, 403);
		}

		// Check if the provided domain is registered and enabled for this guild
		const domainConfig = await masqrDomainsDb.findOne({
			domain: domainHost,
			guildId,
		});
		if (!domainConfig || !domainConfig.enabled) {
			masqrLogger.warn(
				"Attempt to generate license for unconfigured/disabled domain",
				{ guildId, domainHost },
			);
			return c.json({
				error:
					`Domain ${domainHost} is not configured or enabled for Masqr protection in this guild`,
			}, 403);
		}

		const licenseKey = assignedLicenseKey ||
			crypto.randomUUID().substring(0, 8);

		const expirationHours = customExpires
			? Math.min(
				Math.max(1, customExpires / (60 * 60 * 1000)),
				effectiveConfig.maxLicenseExpirationHours,
			)
			: effectiveConfig.defaultLicenseExpirationHours;
		const expirationTime = new Date(
			Date.now() + (expirationHours * 60 * 60 * 1000),
		);

		// Check if license already exists (e.g. if assignedLicenseKey was provided)
		const existingLicense = await masqrLicensesDb.findOne({ licenseKey });
		if (existingLicense) {
			masqrLogger.warn("Attempt to generate license with existing key", {
				licenseKey,
				guildId,
			});
			return c.json({ error: "License key already exists" }, 409);
		}

		const license = {
			licenseKey,
			host: domainHost, // Store the specific domain this license is for
			expires: expirationTime,
			guildId,
			userId,
			category,
			used: false,
			createdAt: new Date(),
		};

		await masqrLicensesDb.insertOne(license);
		masqrLogger.info(`Generated Masqr license`, {
			licenseKey,
			domainHost,
			category,
			guildId,
			userId,
		});

		return c.json({
			licenseKey: license.licenseKey,
			domainHost: license.host,
			expiresAt: license.expires.getTime(),
			category: license.category,
			userId: license.userId,
			guildId: license.guildId,
		});
	} catch (error: unknown) {
		masqrLogger.error("Failed to generate new license", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return c.json({
			error: "Internal server error during license generation",
		}, 500);
	}
});

/**
 * Validates a license. This is the public endpoint used by the Masqr middleware/client.
 */
app.get("/validate", async (c) => {
	try {
		const licenseKey = c.req.query("license");
		const host = c.req.query("host"); // The host the user is trying to access

		if (!licenseKey || !host) {
			await logAccessAttempt(
				licenseKey || "N/A",
				host || "N/A",
				"N/A",
				"N/A",
				false,
				"Missing license or host parameter",
			);
			return c.json({ error: "Missing license or host parameter" }, 400);
		}

		const licenseDoc = await masqrLicensesDb.findOne({
			licenseKey: licenseKey,
		});

		if (!licenseDoc) {
			await logAccessAttempt(
				licenseKey,
				host,
				"N/A",
				"N/A",
				false,
				"Invalid license",
			);
			return c.json({ error: "Invalid License" }, 403);
		}

		// Fetch guild-specific Masqr configuration to check if Masqr is enabled for this guild
		const guildMasqrConfig =
			(await getGuildConfig(licenseDoc.guildId)).masqr;
		if (!guildMasqrConfig.enabled) {
			await logAccessAttempt(
				licenseKey,
				host,
				licenseDoc.userId,
				licenseDoc.guildId,
				false,
				"Masqr disabled for guild",
			);
			return c.json({
				error: "Masqr protection is disabled for this content's origin",
			}, 403);
		}

		if (licenseDoc.expires < new Date()) {
			await masqrLicensesDb.deleteOne({ licenseKey: licenseKey }); // Remove expired license
			await logAccessAttempt(
				licenseKey,
				host,
				licenseDoc.userId,
				licenseDoc.guildId,
				false,
				"Expired license",
			);
			return c.json({ error: "Expired License" }, 403);
		}

		if (licenseDoc.host !== host) {
			await logAccessAttempt(
				licenseKey,
				host,
				licenseDoc.userId,
				licenseDoc.guildId,
				false,
				"License for incorrect product/host",
			);
			return c.json({ error: "License for incorrect product/host" }, 403);
		}

		if (licenseDoc.used) {
			await logAccessAttempt(
				licenseKey,
				host,
				licenseDoc.userId,
				licenseDoc.guildId,
				false,
				"License already used",
			);
			return c.json({ error: "License already used" }, 403);
		}

		// Crucial: Mark license as used AND THEN delete it to prevent race conditions/reuse
		// While findOneAndUpdate could do this atomically, deleting after ensures single-use if validation passes.
		await masqrLicensesDb.updateOne({ licenseKey: licenseKey }, {
			$set: { used: true },
		});
		await masqrLicensesDb.deleteOne({ licenseKey: licenseKey, used: true }); // Only delete if successfully marked used

		await logAccessAttempt(
			licenseKey,
			host,
			licenseDoc.userId,
			licenseDoc.guildId,
			true,
			"Validation successful",
		);

		masqrLogger.info(`License validated successfully`, {
			licenseKey,
			host,
			userId: licenseDoc.userId,
			guildId: licenseDoc.guildId,
		});

		return c.json({
			status: "License valid",
			userId: licenseDoc.userId,
			guildId: licenseDoc.guildId,
			category: licenseDoc.category,
		});
	} catch (error: unknown) {
		masqrLogger.error("Failed to validate license", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return c.json({
			error: "Internal server error during license validation",
		}, 500);
	}
});

/**
 * Health check endpoint
 */
app.get("/health", (c) => {
	return c.json({
		status: "healthy",
		timestamp: new Date().toISOString(),
		service: "MasqrLicensingServer",
	});
});

/**
 * Get active licenses for a guild (admin only, secured by API key)
 */
app.get(
	"/licenses/:guildId",
	bearerAuth({ token: MASQR_API_KEY }),
	async (c) => {
		try {
			const guildId = c.req.param("guildId");
			const licenses = await masqrLicensesDb.find({
				guildId,
				used: false,
				expires: { $gt: new Date() },
			}).toArray();

			return c.json({
				guildId,
				activeCount: licenses.length,
				licenses: licenses.map((l) => ({
					licenseKey: l.licenseKey,
					host: l.host,
					category: l.category,
					userId: l.userId,
					expiresAt: l.expires.toISOString(),
					createdAt: l.createdAt.toISOString(),
				})),
			});
		} catch (error: unknown) {
			masqrLogger.error("Failed to fetch licenses for guild", {
				guildId: c.req.param("guildId"),
				error: error instanceof Error ? error.message : String(error),
			});
			return c.json({ error: "Internal server error" }, 500);
		}
	},
);

/**
 * Cleanup expired and used licenses (admin only, secured by API key)
 */
app.delete("/cleanup", bearerAuth({ token: MASQR_API_KEY }), async (c) => {
	try {
		const sevenDaysAgo = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000));
		// Cleanup licenses that are used OR expired more than 7 days ago
		const result = await masqrLicensesDb.deleteMany({
			$or: [
				{ used: true },
				{ expires: { $lt: sevenDaysAgo } },
			],
		});

		masqrLogger.info(
			`Manually cleaned up ${result.deletedCount} licenses (used or very old)`,
		);
		return c.json({
			message: "Cleanup successful",
			deletedCount: result.deletedCount,
		});
	} catch (error: unknown) {
		masqrLogger.error("Failed to cleanup licenses", {
			error: error instanceof Error ? error.message : String(error),
		});
		return c.json({ error: "Internal server error during cleanup" }, 500);
	}
});

/**
 * Logs access attempts for auditing purposes
 */
async function logAccessAttempt(
	licenseKey: string,
	host: string,
	userId: string,
	guildId: string,
	accessGranted: boolean,
	denialReason?: string,
): Promise<void> {
	try {
		await masqrAccessLogsDb.insertOne({
			licenseKey,
			host,
			userId,
			guildId,
			accessGranted,
			denialReason,
			// clientIp and userAgent could be added if available from request context
			timestamp: new Date(),
		});
	} catch (error: unknown) {
		masqrLogger.error("Failed to log Masqr access attempt", {
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

let server: Deno.HttpServer | undefined;

/**
 * Starts the Masqr licensing server
 * @param port - The port to run the server on, defaults to 8004
 */
export function startLicensingServer(port?: number): void {
	const serverPort = port || MASQR_LICENSING_SERVER_PORT;

	// Periodic cleanup of very old expired licenses (older than 7 days), this runs every hour
	setInterval(async () => {
		try {
			const sevenDaysAgo = new Date(
				Date.now() - (7 * 24 * 60 * 60 * 1000),
			);
			const result = await masqrLicensesDb.deleteMany({
				expires: { $lt: sevenDaysAgo },
				used: false, // Only cleanup unused ones this old, used ones are cleaned faster
			});
			if (result.deletedCount > 0) {
				masqrLogger.info(
					`Auto-cleaned ${result.deletedCount} very old, unused, expired Masqr licenses`,
				);
			}
		} catch (error: unknown) {
			masqrLogger.error("Failed to auto-cleanup old Masqr licenses", {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}, 60 * 60 * 1000);

	server = Deno.serve({ port: serverPort }, app.fetch);
	masqrLogger.info(`Masqr licensing server started on port ${serverPort}`);
}

/**
 * Stops the Masqr licensing server
 */
export async function stopLicensingServer(): Promise<void> {
	if (server) {
		masqrLogger.info("Stopping Masqr licensing server...");
		await server.shutdown();
		masqrLogger.info("Masqr licensing server stopped.");
		server = undefined;
	} else {
		masqrLogger.info("Masqr licensing server was not running.");
	}
}

export default app; // Export Hono app for potential external use/testing
