const { config } = require('dotenv');

config();

module.exports = ({ config: expoConfig }) => ({
  ...expoConfig,
  extra: {
    ...expoConfig.extra,
    assemblyAiApiKey: process.env.EXPO_PUBLIC_ASSEMBLYAI_API_KEY || '',
  },
});
