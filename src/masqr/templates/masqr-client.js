// Ryan Wilson
// Masqr Client Library - Frontend JavaScript for handling Masqr license validation

class MasqrClient {
	constructor(config = {}) {
		this.licenseServerUrl = config.licenseServerUrl ||
			"http://localhost:8004/validate";
		this.domain = config.domain || window.location.hostname;
		this.autoCheck = config.autoCheck ?? true;
		this.onSuccess = config.onSuccess || (() => {});
		this.onFailure = config.onFailure || (() => {});

		this.storageKey = "masqr_license_check";
		this.debugMode = config.debug || false;

		if (this.autoCheck) {
			this.init();
		}
	}

	init() {
		this.log("Initializing Masqr client", { domain: this.domain });

		if (this.isValidated()) {
			this.log("License already validated from storage");
			this.onSuccess({ cached: true });
			return;
		}

		const urlLicense = this.getLicenseFromUrl();
		if (urlLicense) {
			this.log("License found in URL", { license: urlLicense });
			this.validateLicense(urlLicense);
			return;
		}

		this.promptForLicense();
	}

	isValidated() {
		const stored = localStorage.getItem(this.storageKey);
		if (!stored) return false;

		try {
			const data = JSON.parse(stored);
			const now = Date.now();

			if (now - data.timestamp < 24 * 60 * 60 * 1000) {
				return data.domain === this.domain;
			}
		} catch (error) {
			this.log("Error parsing stored validation", error);
		}

		localStorage.removeItem(this.storageKey);
		return false;
	}

	getLicenseFromUrl() {
		const params = new URLSearchParams(window.location.search);
		return params.get("license") || params.get("l");
	}

	promptForLicense() {
		const license = prompt(
			"🛡️ Masqr Protection Active\n\n" +
				"Please enter your license key to access this content:\n" +
				"(Contact server administrators if you need a license)",
		);

		if (license) {
			this.validateLicense(license.trim());
		} else {
			this.onFailure({
				reason: "No license provided",
				userCancelled: true,
			});
		}
	}

	async validateLicense(license) {
		try {
			this.log("Validating license", { license, domain: this.domain });

			const url = `${this.licenseServerUrl}?license=${
				encodeURIComponent(license)
			}&host=${encodeURIComponent(this.domain)}`;
			const response = await fetch(url);
			const data = await response.json();

			if (response.ok && data.status === "License valid") {
				this.log("License validation successful", data);
				this.markAsValidated();
				this.onSuccess({
					license,
					data,
					timestamp: Date.now(),
				});
			} else {
				this.log("License validation failed", data);
				this.onFailure({
					reason: data.error || "Validation failed",
					license,
					response: data,
				});
			}
		} catch (error) {
			this.log("License validation error", error);
			this.onFailure({
				reason: "Network error",
				error: error.message,
				license,
			});
		}
	}

	markAsValidated() {
		const validationData = {
			domain: this.domain,
			timestamp: Date.now(),
			version: "1.0",
		};

		localStorage.setItem(this.storageKey, JSON.stringify(validationData));
		this.log("Session marked as validated", validationData);
	}

	clearValidation() {
		localStorage.removeItem(this.storageKey);
		this.log("Validation status cleared");
	}

	async validate(license) {
		return new Promise((resolve, reject) => {
			const originalSuccess = this.onSuccess;
			const originalFailure = this.onFailure;

			this.onSuccess = (result) => {
				this.onSuccess = originalSuccess;
				this.onFailure = originalFailure;
				resolve(result);
			};

			this.onFailure = (error) => {
				this.onSuccess = originalSuccess;
				this.onFailure = originalFailure;
				reject(error);
			};

			this.validateLicense(license);
		});
	}

	log(message, data = null) {
		if (this.debugMode) {
			console.log(`[Masqr] ${message}`, data);
		}
	}
}

function setupMasqr(config = {}) {
	const defaultConfig = {
		onSuccess: () => {
			console.log("✅ Masqr validation successful");
		},
		onFailure: (error) => {
			console.error("❌ Masqr validation failed:", error.reason);

			if (config.failureUrl) {
				window.location.href = config.failureUrl;
			} else {
				alert(
					"🛡️ Access Denied\n\n" +
						"Masqr license validation failed.\n" +
						`Reason: ${error.reason}\n\n` +
						"Please contact server administrators for assistance.",
				);
			}
		},
		debug: localStorage.getItem("masqr_debug") === "true",
	};

	const finalConfig = { ...defaultConfig, ...config };
	return new MasqrClient(finalConfig);
}

async function checkLicense(license) {
	const client = new MasqrClient({
		autoCheck: false,
		debug: localStorage.getItem("masqr_debug") === "true",
	});

	if (client.isValidated()) {
		return true;
	}

	try {
		await client.validate(license);
		return true;
	} catch (error) {
		console.error("License validation failed:", error);
		return false;
	}
}

if (typeof module !== "undefined" && module.exports) {
	module.exports = { MasqrClient, setupMasqr, checkLicense };
}

if (typeof window !== "undefined") {
	window.MasqrClient = MasqrClient;
	window.setupMasqr = setupMasqr;
	window.checkLicense = checkLicense;
}

if (typeof window !== "undefined" && window.LICENSE_SERVER_URL) {
	const autoClient = setupMasqr({
		licenseServerUrl: window.LICENSE_SERVER_URL,
	});
}
