// Ryan Wilson

import type { Bot } from "@discordeno/bot";
import { checkAndNotifyCohorts } from "./cohort.ts";
import type { Logger } from "./Logger.ts";

let intervalId: number | undefined;

/**
 * Start the cohort system scheduler
 */
export function startCohortScheduler(bot: Bot, logger: Logger): void {
	if (intervalId) {
		logger.warn("Cohort scheduler is already running");
		return;
	}

	logger.info("Starting cohort scheduler - will check every hour");
	
	// Run immediately on start
	checkAndNotifyCohorts(bot, logger).catch((error) => {
		logger.error("Error in initial cohort check", error as Error);
	});

	// Run every hour (3600000 ms)
	intervalId = setInterval(() => {
		checkAndNotifyCohorts(bot, logger).catch((error) => {
			logger.error("Error in scheduled cohort check", error as Error);
		});
	}, 3600000);
}

/**
 * Stop the cohort system scheduler
 */
export function stopCohortScheduler(logger: Logger): void {
	if (intervalId) {
		clearInterval(intervalId);
		intervalId = undefined;
		logger.info("Cohort scheduler stopped");
	} else {
		logger.warn("Cohort scheduler was not running");
	}
} 