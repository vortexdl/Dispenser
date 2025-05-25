import { err, ok, Result } from "neverthrow";

const api =
	"https://archive.lightspeedsystems.com/domain_tab_info.php?text_file_name=reason&domain=";

const blockedCats = [
	"porn",
	"security",
	"security.proxy",
	"forums",
	"games",
	"adult",
	"mature",
	"facebook",
	"suspicous",
	"warez.security",
];

/**
 * Checks if a link is blocked by Lightspeed filtering
 * @param link The URL to check
 * @returns A Result indicating whether the link is blocked (true) or not blocked (false)
 */
export default async function checkLightspeedBlocked(
	link: string,
): Promise<Result<boolean, Error>> {
	try {
		const domain: string = new URL(link).hostname;

		const response = await fetch(api + domain);

		if (!response.ok) {
			const errorMsg =
				`Lightspeed API returned ${response.status}: ${response.statusText}`;
			console.error(errorMsg);
			return err(new Error(errorMsg));
		}

		const body: string = await response.text();

		console.log(`Scanning ${domain} for Lightspeed`);

		const lines: string[] = body.split("\n");

		const formatted: string[] = lines
			.map((line) => line.replace(/<br>/g, ""))
			.filter((line) => line !== "");

		if (formatted.length === 0 || formatted[0] === "No file Found") {
			return ok(false);
		}

		let cat: string = "none";
		formatted.forEach((line) => {
			const split = line.split("CategorizeContent: Bayes Category: ");

			if (split.length === 2 && split[1]) {
				cat = split[1];
			}
		});

		console.log(`${domain} is categorized as ${cat}`);

		return ok(blockedCats.includes(cat));
	} catch (error) {
		if (error instanceof TypeError && error.message.includes("URL")) {
			const errorMsg =
				`Invalid URL provided to Lightspeed checker: ${link}`;
			console.error(errorMsg, error.message);
			return err(new Error(errorMsg));
		} else if (
			error instanceof TypeError && error.message.includes("fetch")
		) {
			const errorMsg =
				`Network error when checking link with Lightspeed: ${link}`;
			console.error(errorMsg, error.message);
			return err(new Error(errorMsg));
		} else if (error instanceof Error) {
			const errorMsg = `Error checking link with Lightspeed: ${link}`;
			console.error(errorMsg, error.message);
			return err(new Error(errorMsg));
		} else {
			const errorMsg =
				`Unknown error checking link with Lightspeed: ${link}`;
			console.error(errorMsg, error);
			return err(new Error(errorMsg));
		}
	}
}
