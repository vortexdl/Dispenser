import { MongoClient } from "mongodb";

// Generic Types
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type IsNumber<S extends string> = S extends `${Digit}${infer Rest}`
	? Rest extends "" ? S
	: IsNumber<Rest>
	: never;

type FixedString<N extends number> = { length: N } & string;
type FixedNumberString<N extends number> = FixedString<N> & IsNumber<string>;

// Project specific types
export type DiscordID = FixedNumberString<17> | FixedNumberString<18> | string;
// TODO: Define a Discord Token Type
//type DiscordToken = ;

/** Configuration for a Discord bot instance */
export type BotConfig = {
	/** The Discord bot token used for authentication */
	token: string;
	/** The unique identifier for the bot */
	id: DiscordID;
	/** The ID of the testing server */
	guildId: DiscordID;
	/** Array of Discord User IDs who are considered bot developers */
	botDeveloperIds: DiscordID[];
	// Discord OAuth2 credentials
	oauth: {
		/** The client ID of the application */
		clientId: string;
		/** The client secret of the application */
		clientSecret: string;
	};
};

declare namespace ConfigTypes {
	export interface config {
		/** Main bot configuration */
		bot: BotConfig;
		/** Optional configuration for a development/testing bot instance */
		// This is useful if you have a bot for testing, so you can experiment without affecting your users.
		devBot?: BotConfig;
		/** MongoDB client instance */
		mongoClient: MongoClient;
		/** Logging configurations */
		logging: LoggingConfig;
	}

	export interface LoggingConfig {
		/** Discord channel ID for developer-specific logs */
		developerLogChannelId: DiscordID;
		/** Discord channel ID for user-submitted bot issue reports */
		botIssuesChannelId: DiscordID;
		/** Discord channel ID for reports about link leaking */
		developerLogChannelLinkLeakingId: DiscordID;
		/** Whether logging to a file is enabled */
		fileEnabled: boolean;
		/** Console logging specific settings */
		console: {
			/** Whether debug level logs should be output to the console */
			debug: boolean;
		};
		/** Discord logging specific settings */
		discord: {
			/** Whether logging to Discord is enabled */
			enabled: boolean;
		};
	}
}
export default ConfigTypes;
