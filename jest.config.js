module.exports = {
  preset: "jest-expo",
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?(-.*)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|@shopify/react-native-skia|react-native-svg|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-pager-view|@gorhom|firebase|@firebase)/)",
  ],
  setupFiles: ["<rootDir>/__tests__/setup.ts"],
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/__tests__/setup.ts",
    "<rootDir>/__tests__/firestore.rules.test.ts",
    "<rootDir>/functions/",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  // Coverage floors — set just below the 2026-04-29 baseline (62/57/62/64)
  // so a regression fails CI without locking us in. Raise as the suite grows.
  coverageThreshold: {
    global: {
      statements: 55,
      branches: 50,
      functions: 55,
      lines: 55,
    },
  },
};
