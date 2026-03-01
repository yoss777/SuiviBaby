const { config } = require('dotenv');

config();

module.exports = ({ config: expoConfig }) => ({
  ...expoConfig,
  extra: {
    ...expoConfig.extra,
  },
});
