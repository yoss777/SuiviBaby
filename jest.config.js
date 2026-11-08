// Fuseau fixé avant le lancement des workers : les tests de dates (heures
// calmes, filtres « aujourd'hui », regroupements par jour) doivent donner le
// même résultat en local (Paris) et en CI (UTC).
process.env.TZ = "Europe/Paris";

module.exports = {
  preset: "jest-expo",
  // Les tests de rendu lourds (écran d'export, graphiques) dépassaient les
  // 5 s par défaut sous la charge parallèle de la CI (échecs intermittents).
  testTimeout: 15000,
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?(-.*)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|@shopify/react-native-skia|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-pager-view|@gorhom|firebase|@firebase)/)",
  ],
  setupFiles: ["<rootDir>/__tests__/setup.ts"],
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/__tests__/setup.ts",
    // Rules tests need the emulators: run them with `npm run test:rules`.
    "<rootDir>/__tests__/firestore.rules.test.ts",
    "<rootDir>/__tests__/storage.rules.test.ts",
    "<rootDir>/__tests__/.*\\.rules\\.test\\.ts$",
    "<rootDir>/functions/",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  // Real coverage: every source file counts, even when no test imports it.
  collectCoverageFrom: [
    "app/**/*.{ts,tsx}",
    "components/**/*.{ts,tsx}",
    "hooks/**/*.{ts,tsx}",
    "services/**/*.{ts,tsx}",
    "contexts/**/*.{ts,tsx}",
    "utils/**/*.{ts,tsx}",
    "constants/**/*.{ts,tsx}",
    "!**/*.d.ts",
    "!**/__tests__/**",
    "!**/*.test.{ts,tsx}",
    "!**/types.ts",
    "!**/types/**",
    "!**/generated/**",
    "!**/assets/**",
    "!**/node_modules/**",
  ],
  // Coverage floors, set just below the 2026-11-07 measure with
  // collectCoverageFrom (23.44 / 19.61 / 19.17 / 23.61 for statements /
  // branches / functions / lines). The earlier 62/57 figures only counted
  // files that tests happened to import. Raise as the suite grows.
  coverageThreshold: {
    global: {
      statements: 22,
      branches: 18,
      functions: 18,
      lines: 22,
    },
  },
};
