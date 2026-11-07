// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Couche d'accès aux données (S13.3) : l'UI ne parle jamais directement à
// Firestore/Storage. Tout passe par services/ (repositories). Les imports
// `import type` restent autorisés (types seuls, aucun code runtime).
const FIREBASE_DATA_MESSAGE =
  "Import direct interdit hors services/ : passer par un service/repository " +
  "(services/*Repository.ts). Seul `import type` est autorisé dans l'UI.";

// Imports dynamiques (`require("firebase/firestore")`, `import("firebase/firestore")`)
// : non couverts par no-restricted-imports, donc interdits par sélecteur.
// esquery n'accepte ni `/` ni groupes dans une regex : un `.` remplace le `/`
// et un sélecteur par module évite l'alternance.
const FIREBASE_DATA_MODULES = [
  '^firebase.firestore',
  '^firebase.storage',
  '^@react-native-firebase.firestore',
  '^@react-native-firebase.storage',
];
const dynamicImportSelectors = (node, key) =>
  FIREBASE_DATA_MODULES.map((re) => `${node}[${key}.value=/${re}/]`);

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*'],
  },
  {
    files: [
      'app/**/*.{ts,tsx,js,jsx}',
      'components/**/*.{ts,tsx,js,jsx}',
      'hooks/**/*.{ts,tsx,js,jsx}',
      'contexts/**/*.{ts,tsx,js,jsx}',
      'utils/**/*.{ts,tsx,js,jsx}',
    ],
    ignores: ['**/__tests__/**', '**/*.test.*'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'firebase/firestore', message: FIREBASE_DATA_MESSAGE, allowTypeImports: true },
            { name: 'firebase/storage', message: FIREBASE_DATA_MESSAGE, allowTypeImports: true },
          ],
          patterns: [
            {
              group: [
                'firebase/firestore/*',
                'firebase/storage/*',
                '@react-native-firebase/firestore',
                '@react-native-firebase/firestore/*',
                '@react-native-firebase/storage',
                '@react-native-firebase/storage/*',
              ],
              message: FIREBASE_DATA_MESSAGE,
              allowTypeImports: true,
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...[
          ...dynamicImportSelectors("CallExpression[callee.name='require']", 'arguments.0'),
          ...dynamicImportSelectors('ImportExpression', 'source'),
        ].map((selector) => ({ selector, message: FIREBASE_DATA_MESSAGE })),
      ],
    },
  },
]);
