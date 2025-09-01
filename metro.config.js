// For React Native
module.exports = {
    transformer: {
      getTransformOptions: async () => ({
        transform: {
          experimentalImportSupport: false,
          inlineRequires: true,
        },
      }),
    },
  };

  const { getDefaultConfig } = require('expo/metro-config');
module.exports = getDefaultConfig(__dirname);