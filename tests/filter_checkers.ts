import checkLightspeedBlocked from "../src/util/checker/ls";

/** This object maps links to their expected blocking status (e_g_, `true` for blocked, `false` for not blocked) */
const linkBlockStatusMap: Record<string, boolean> = {
	// Example of a site likely categorized as`adult/porn`
	"http://pornhub.com": true,
	// Example of a site likely categorized as `games`
	"http://roblox.com": true,
	// Example of a site likely categorized as `gambling/games`
	"http://stake.com": true,
	// Should not be blocked
	"https://google.com": false,
	// Should not be blocked
	"https://youtube.com": false,
};

describe("checkLightspeedBlocked", () => {
	// Increased timeout for tests that make network requests (30 seconds)
	jest.setTimeout(30 * 1000);

	test.each(Object.entries(linkBlockStatusMap))(
		"should return %s for %s",
		async (link, expectedBlockedStatus) => {
			const result = await checkLightspeedBlocked(link);

			if (result.isOk()) {
				expect(result.value).toBe(expectedBlockedStatus);
			} else {
				console.error(`API call failed for ${link}:`, result.error);
				throw result.error;
			}
		},
	);

	test("should return an error for an invalid URL", async () => {
		const invalidLink = "not-a-url";
		const result = await checkLightspeedBlocked(invalidLink);
		expect(result.isErr()).toBe(true);
		if (result.isErr()) {
			expect(result.error.message).toContain(
				"Invalid URL provided to Lightspeed checker",
			);
		}
	});
});
