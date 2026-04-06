module.exports = {
  testMatch: ["**/*.rules.test.ts"],
  transform: {
    "^.+\\.tsx?$": "babel-jest",
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@firebase|firebase)/)",
  ],
  testTimeout: 30000,
};
