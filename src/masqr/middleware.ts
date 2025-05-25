// Ryan Wilson
// src/masqr/middleware.ts

import { Hono } from "npm:hono@4.6.10";
import { getCookie, setCookie } from "npm:hono@4.6.10/cookie";
import { masqrDomainsDb } from "../db.ts";

/**
 * Interface for Masqr configuration options
 */
interface MasqrConfig {
	licenseServerUrl: string;
	whitelistedDomains?: string[];
	failurePage?: string;
	placeholderSvg?: string;
	bareEndpoint?: string;
}

/**
 * Creates a Masqr validation middleware for Hono.js applications
 */
export function createMasqrMiddleware(masqrConfig: MasqrConfig) {
	return async (c: any, next: () => Promise<void>) => {
		const host = c.req.header("host");
		const url = c.req.url;

		// Skip if no host header
		if (!host) {
			return await next();
		}

		// Check if domain is whitelisted
		if (masqrConfig.whitelistedDomains?.includes(host)) {
			return await next();
		}

		// Check if this is a special endpoint that should bypass Masqr
		if (url.includes("placeholder.svg")) {
			const placeholderSvg = masqrConfig.placeholderSvg ||
				getDefaultPlaceholderSvg();
			c.header("Content-Type", "image/svg+xml");
			return c.body(placeholderSvg);
		}

		// Check if this is a bare endpoint that should bypass Masqr
		if (
			masqrConfig.bareEndpoint && url.includes(masqrConfig.bareEndpoint)
		) {
			return await next();
		}

		// Check if user already has a valid session cookie
		const authCookie = getCookie(c, "authcheck");
		if (authCookie === "true") {
			return await next();
		}

		// Check for refresh protection
		const refreshCookie = getCookie(c, "refreshcheck");
		if (refreshCookie !== "true") {
			setCookie(c, "refreshcheck", "true", { maxAge: 10 }); // 10 seconds
			return await serveFailurePage(c, host, masqrConfig.failurePage);
		}

		// Check for authorization header
		const authHeader = c.req.header("authorization");
		if (!authHeader) {
			c.header("WWW-Authenticate", "Basic");
			c.status(401);
			return await serveFailurePage(c, host, masqrConfig.failurePage);
		}

		// Parse basic auth
		try {
			const auth = atob(authHeader.split(" ")[1]).split(":");
			const username = auth[0];
			const license = auth[1];

			// Validate license with licensing server
			const licenseResponse = await fetch(
				`${masqrConfig.licenseServerUrl}?license=${license}&host=${host}`,
			);
			const licenseData = await licenseResponse.json();

			if (licenseData.status === "License valid") {
				// Set session cookie for future requests
				setCookie(c, "authcheck", "true", {
					expires: new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)), // 1 year
					httpOnly: true,
					secure: true,
					sameSite: "Strict",
				});

				// Redirect to remove auth params from URL
				c.header("Content-Type", "text/html");
				return c.body(
					"<script>window.location.href = window.location.href</script>",
				);
			}
		} catch (error) {
			console.error("Masqr validation error:", error);
		}

		// License validation failed
		return await serveFailurePage(c, host, masqrConfig.failurePage);
	};
}

/**
 * Serves the appropriate failure page based on the domain
 */
async function serveFailurePage(
	c: any,
	host: string,
	fallbackPage?: string,
): Promise<Response> {
	// Try to serve domain-specific failure page
	try {
		const domainSpecificPath = `./Masqrd/${host}.html`;
		const domainSpecificContent = await Deno.readTextFile(
			domainSpecificPath,
		);
		c.header("Content-Type", "text/html");
		return c.body(domainSpecificContent);
	} catch {
		// Fall back to generic failure page
		try {
			const genericContent = fallbackPage
				? await Deno.readTextFile(fallbackPage)
				: getDefaultFailurePage();
			c.header("Content-Type", "text/html");
			return c.body(genericContent);
		} catch {
			c.header("Content-Type", "text/html");
			return c.body(getDefaultFailurePage());
		}
	}
}

/**
 * Returns a default failure page if none is provided
 */
function getDefaultFailurePage(): string {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Access Denied - Masqr Protection</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            color: #333;
        }
        .container {
            background: white;
            padding: 2rem;
            border-radius: 15px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 500px;
            margin: 1rem;
        }
        .icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        h1 {
            color: #e74c3c;
            margin-bottom: 1rem;
        }
        p {
            line-height: 1.6;
            margin-bottom: 1rem;
            color: #555;
        }
        .code {
            background: #f8f9fa;
            padding: 0.5rem;
            border-radius: 5px;
            font-family: monospace;
            color: #e74c3c;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🛡️</div>
        <h1>Access Denied</h1>
        <p>This domain is protected by <strong>Masqr</strong>, an anti-link-leaking system.</p>
        <p>You need a valid license to access this content. Please obtain a license from the appropriate Discord server.</p>
        <div class="code">ERROR: MASQR_VALIDATION_FAILED</div>
        <p><small>If you believe this is an error, please contact the server administrators.</small></p>
    </div>
</body>
</html>
	`;
}

/**
 * Returns a default placeholder SVG
 */
function getDefaultPlaceholderSvg(): string {
	return `
<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
  <rect width="100" height="100" fill="#f0f0f0"/>
  <text x="50" y="50" font-family="Arial" font-size="12" text-anchor="middle" dy=".3em" fill="#999">
    Protected
  </text>
</svg>
	`;
}

/**
 * Creates a standalone Masqr validation app
 */
export function createMasqrApp(masqrConfig: MasqrConfig): Hono {
	const app = new Hono();

	// Apply Masqr middleware to all routes
	app.use("*", createMasqrMiddleware(masqrConfig));

	// Default route that serves content after validation
	app.get("*", (c) => {
		return c.text("Access granted - Masqr validation successful");
	});

	return app;
}

/**
 * Helper function to get domain configuration from database
 */
export async function getDomainConfig(domain: string, guildId: string) {
	try {
		return await masqrDomainsDb.findOne({ domain, guildId });
	} catch (error) {
		console.error("Failed to get domain config:", error);
		return null;
	}
}
