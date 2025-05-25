// Reference unstable Deno APIs for KV support
/// <reference lib="deno.unstable" />

import { Logger } from "./Logger.ts";
import { errAsync, okAsync, ResultAsync } from "npm:neverthrow";

import config from "../../config.ts";

/**
 * Cache key used to store the bearer token in Deno KV
 */
const TOKEN_CACHE_KEY = ["bearerToken"];

/**
 * Deno KV store instance for persistent token storage
 */
const kv = await Deno.openKv();

/**
 * Stored token data
 */
type StoredToken = {
	/** The bearer token string */
	token: string;
	/** Timestamp when the token was created */
	createdAt: number;
};

/**
 * Get bearer token from the OAuth2 token endpoint
 * Uses Deno KV for persistent caching
 *
 * @param logger - Logger instance for logging operations
 * @param scope - OAuth2 scope to request, defaults to `applications.commands.update`
 * @param forceRefresh - Force a new token request even if a cached token exists
 * @returns The bearer token as a Result
 */
export function getBearerToken(
	logger: Logger,
	scope = "applications.commands.update",
	forceRefresh = false,
): ResultAsync<string, Error> {
	// First check if we have a cached token (if not forcing refresh)
	if (!forceRefresh) {
		return ResultAsync.fromPromise(
			kv.get<StoredToken>(TOKEN_CACHE_KEY),
			(error: unknown): Error => {
				logger.error("Error accessing KV store", { error });
				return new Error(
					`KV store error: ${
						error instanceof Error ? error.message : String(error)
					}`,
				);
			},
		)
			.andThen((result) => {
				// If we have a valid token in the cache, return it
				if (result && result.value) {
					logger.debug("Using cached bearer token from KV store");
					return okAsync(result.value.token);
				}

				// Otherwise fetch a new token
				return fetchNewToken(logger, scope);
			});
	}

	// If forcing refresh, bypass the cache
	return fetchNewToken(logger, scope);
}

/**
 * Clears the cached bearer token, forcing a new token to be fetched on next request
 *
 * @param logger - Logger instance
 * @returns Promise that resolves when the cache is cleared
 */
export async function clearTokenCache(logger: Logger): Promise<void> {
	try {
		await kv.delete(TOKEN_CACHE_KEY);
		logger.info("Bearer token cache cleared from KV store");
	} catch (error) {
		logger.error("Failed to clear token cache", { error });
		throw new Error(
			`Failed to clear token cache: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

/**
 * Fetches a new token from the Discord API and stores it in the KV store
 *
 * @param logger - Logger instance
 * @param scope - OAuth2 scope to request
 * @returns ResultAsync with the token or error
 */
function fetchNewToken(
	logger: Logger,
	scope: string,
): ResultAsync<string, Error> {
	logger.info("Requesting new bearer token from Discord OAuth2", { scope });

	const clientCreds = {
		client_id: config.bot.oauth.clientId,
		client_secret: config.bot.oauth.clientSecret,
	};

	const requestParams = new URLSearchParams({
		grant_type: "client_credentials",
		...clientCreds,
		scope,
	});

	logger.debug(
		"Getting bearer token with client_id and client_secret",
		clientCreds,
	);

	return ResultAsync.fromPromise(
		fetch("https://discord.com/api/v10/oauth2/token", {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: requestParams,
		}),
		(error: unknown): Error => {
			const errorMessage = error instanceof Error
				? error.message
				: String(error);
			logger.error("Network error getting bearer token", errorMessage);
			return new Error(`Network error: ${errorMessage}`);
		},
	)
		.andThen((response: Response) => {
			if (!response.ok) {
				return ResultAsync.fromPromise(
					response.json(),
					(): Error =>
						new Error(
							`HTTP Error: ${response.status} ${response.statusText}`,
						),
				)
					.andThen((errorData: unknown) => {
						const error = errorData as {
							error?: string;
							error_description?: string;
						};
						const errorMessage = error.error_description
							? `${error.error}: ${error.error_description}`
							: error.error || `HTTP Error: ${response.status}`;

						logger.error(
							`OAuth2 error: ${errorMessage}`,
							errorData,
						);
						return errAsync<string, Error>(new Error(errorMessage));
					});
			}

			// Parse the successful response
			return ResultAsync.fromPromise(
				response.json(),
				(error: unknown): Error => {
					logger.error("Error parsing Discord OAuth2 response", {
						error,
					});
					return new Error("Failed to parse response");
				},
			)
				.andThen((data: unknown) => {
					if (
						data && typeof data === "object" &&
						"access_token" in data
					) {
						const token = data.access_token as string;

						// Store the token in KV store
						const tokenData: StoredToken = {
							token,
							createdAt: Date.now(),
						};

						// Store in KV and return the token
						return ResultAsync.fromPromise(
							kv.set(TOKEN_CACHE_KEY, tokenData),
							(error): Error => {
								logger.error("Failed to store token in KV", {
									error,
								});
								return new Error(
									`KV store error: ${
										error instanceof Error
											? error.message
											: String(error)
									}`,
								);
							},
						)
							.map(() => {
								logger.debug(
									"Successfully obtained bearer token",
								);
								logger.info(
									"Bearer token acquired successfully and stored in KV",
									token,
								);
								return token;
							});
					} else {
						const errorObj = data as {
							error?: string;
							error_description?: string;
						};
						const errorMessage = errorObj.error_description
							? `${errorObj.error}: ${errorObj.error_description}`
							: errorObj.error || "Unknown OAuth2 error";

						logger.error(`OAuth2 error: ${errorMessage}`, { data });
						return errAsync<string, Error>(
							new Error(
								`Failed to get bearer token: ${errorMessage}`,
							),
						);
					}
				});
		});
}
