const fs = require("fs");
const path = require("path");
const { config } = require("dotenv");

config();

function resolveExistingProjectFile(...candidates) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const absolutePath = path.resolve(__dirname, candidate);
    if (fs.existsSync(absolutePath)) {
      return path.relative(__dirname, absolutePath);
    }
  }
  return undefined;
}

function dedupePlugins(plugins) {
  const seen = new Set();
  return plugins.filter((plugin) => {
    const key = Array.isArray(plugin) ? plugin[0] : plugin;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

module.exports = ({ config: expoConfig }) => {
  const androidGoogleServicesFile = resolveExistingProjectFile(
    process.env.GOOGLE_SERVICES_JSON,
    "google-services.json",
  );
  const iosGoogleServicesFile = resolveExistingProjectFile(
    process.env.GOOGLE_SERVICE_INFO_PLIST,
    "GoogleService-Info.plist",
  );
  const nativeAppCheckConfigured = Boolean(
    androidGoogleServicesFile && iosGoogleServicesFile,
  );

  const plugins = [...(expoConfig.plugins || [])];
  if (nativeAppCheckConfigured) {
    plugins.push("@react-native-firebase/app", "@react-native-firebase/app-check");
  }

  return {
    ...expoConfig,
    plugins: dedupePlugins(plugins),
    android: {
      ...expoConfig.android,
      ...(androidGoogleServicesFile
        ? { googleServicesFile: androidGoogleServicesFile }
        : {}),
    },
    ios: {
      ...expoConfig.ios,
      ...(iosGoogleServicesFile ? { googleServicesFile: iosGoogleServicesFile } : {}),
    },
    extra: {
      ...expoConfig.extra,
      appCheck: {
        nativeConfigured: nativeAppCheckConfigured,
        webSiteKeyConfigured: Boolean(
          process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_WEB_SITE_KEY,
        ),
      },
    },
  };
};
