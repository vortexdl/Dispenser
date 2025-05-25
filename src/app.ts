import initBot from "./bot.ts";
// import { startLicensingServer, stopLicensingServer } from "./masqr/licensingServer.ts";

console.log("Starting bot");

async function main() {
	// Start Masqr licensing server (always enabled, controlled per-guild)
	// const MASQR_ENABLED = Deno.env.get("MASQR_LICENSING_SERVER_ENABLED") !== "false";
	// if (MASQR_ENABLED) {
	// 	console.log("Starting Masqr licensing server");
	// 	await startLicensingServer(); // Now an async function
	// }

	// Handle graceful shutdown
	async function shutdown() {
		console.log("Shutting down...");
		// if (MASQR_ENABLED) {
		// 	await stopLicensingServer();
		// }
		// Add any other cleanup tasks here
		Deno.exit(0);
	}

	Deno.addSignalListener("SIGINT", shutdown);
	Deno.addSignalListener("SIGTERM", shutdown);

	initBot();
}

main().catch((err) => {
	console.error("Fatal error during startup:", err);
	Deno.exit(1);
});
