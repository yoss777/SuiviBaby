// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Couche d'accès aux données (S13.3) : l'UI ne parle jamais directement à
// Firestore/Storage. Tout passe par services/ (repositories). Les imports
// `import type` restent autorisés (types seuls, aucun code runtime).
const FIREBASE_DATA_MESSAGE =
  "Import direct interdit hors services/ : passer par un service/repository " +
  "(services/*Repository.ts). Seul `import type` est autorisé dans l'UI.";

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
        },
      ],
    },
  },
]);
