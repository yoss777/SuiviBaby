// Eval suite — run explicitly, never part of `npm test`:
//   npx jest --config evals/jest.config.js
// Scores are reported, not asserted, so a weak parser doesn't turn CI red.
process.env.TZ = "Europe/Paris";

const base = require("../jest.config.js");

module.exports = {
  ...base,
  rootDir: "..",
  testMatch: ["<rootDir>/evals/**/*.eval.ts"],
  testPathIgnorePatterns: ["<rootDir>/node_modules/"],
  coverageThreshold: undefined,
};
