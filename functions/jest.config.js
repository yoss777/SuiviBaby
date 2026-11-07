module.exports = {
  testEnvironment: "node",
  testTimeout: 10000,
  testMatch: ["**/__tests__/**/*.test.js"],
  // Real coverage of the deployed code (measured 2026-11-07: 87/77/91/88).
  // Floors sit just below so a regression fails CI; raise as the suite grows.
  collectCoverageFrom: [
    "*.js",
    "lib/**/*.js",
    "!jest.config.js",
    "!seedUsers.js",
    "!__tests__/**",
    "!node_modules/**",
    "!coverage/**",
  ],
  coverageThreshold: {
    global: {
      statements: 86,
      branches: 76,
      functions: 90,
      lines: 87,
    },
  },
};
