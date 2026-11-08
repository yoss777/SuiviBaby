module.exports = function(api) {
  api.cache(true);

  const plugins = [];

  if (process.env.NODE_ENV === 'production' || process.env.BABEL_ENV === 'production') {
    plugins.push('transform-remove-console');
  }

  // Reanimated 4 / worklets : babel-preset-expo ajoute déjà
  // react-native-worklets/plugin (le déclarer ici l'appliquait deux fois).

  return {
    presets: ['babel-preset-expo'],
    plugins,
  };
};
