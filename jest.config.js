/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "node",
	moduleNameMapper: {
		"^\$config$": "<rootDir>/config.ts",
		"^\$db$": "<rootDir>/src/db.ts",
	},
	testPathIgnorePatterns: ["/node_modules/", "/dist/"],
	clearMocks: true,
};
