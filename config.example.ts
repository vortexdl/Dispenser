import { MongoClient, ServerApiVersion } from "mongodb";

import type ConfigTypes from "./src/types/config.d.ts";
import { type DiscordID } from "./src/types/config.d.ts";
import { type BotConfig } from "./src/types/config.d.ts";

const guildId = "YOUR GUILD ID" as DiscordID;

const config: ConfigTypes.config = {
	bot: {
		oauth: {
			clientId: "YOUR_CLIENT_ID_HERE",
			clientSecret: "YOUR_CLIENT_SECRET_HERE",
		},
		token: "YOUR BOT TOKEN",
		id: "YOUR BOT ID" as DiscordID,
		guildId,
		botDeveloperIds: ["YOUR_USER_ID_HERE" as DiscordID],
	} as BotConfig,
	mongoClient: new MongoClient(
		"mongodb://127.0.0.1:27017/bot",
		{
			serverApi: {
				version: ServerApiVersion.v1,
				strict: true,
				deprecationErrors: true,
			},
		},
	),
	logging: {
		developerLogChannelId:
			"YOUR_DEVELOPER_LOG_CHANNEL_ID_HERE" as DiscordID,
		botIssuesChannelId: "YOUR_BOT_ISSUES_CHANNEL_ID_HERE" as DiscordID,
		developerLogChannelLinkLeakingId:
			"YOUR_LINK_LEAKING_LOG_CHANNEL_ID_HERE" as DiscordID,
		fileEnabled: true,
		console: {
			debug: true,
		},
		discord: {
			enabled: true,
		},
	},
};

export default config;
