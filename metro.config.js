const { getDefaultConfig } = require('expo/metro-config');

// Récupère la config par défaut d'Expo
const config = getDefaultConfig(__dirname);

// Transformer options (utile pour release)
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true, // réduit les problèmes de performance et certains imports
  },
});

// Ajout des extensions de fichiers nécessaires pour expo-router
config.resolver.sourceExts = [
  ...config.resolver.sourceExts,
  'cjs', // parfois requis par certaines dépendances
];

// Gestion des assets (images, icônes, etc.)
config.resolver.assetExts = [
  ...config.resolver.assetExts,
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'bmp',
];

module.exports = config;
