#!/usr/bin/env node
/* global __dirname */
// scripts/easCopyFirebaseFiles.js — run by EAS as the `eas-build-pre-install`
// npm hook (package.json), on cloud and local builds.
//
// The android/ and ios/ folders are committed, so EAS skips `expo prebuild`
// and app.config.js `googleServicesFile` never reaches the native projects.
// The Gradle plugin reads android/app/google-services.json and Xcode bundles
// ios/SuiviBaby/GoogleService-Info.plist; both are gitignored, so a build
// started from CI (or any clean checkout) had none — the cause of the
// "File google-services.json is missing" cloud failure (docs/adr/0001).
//
// This script:
//   1. copies the EAS file variables GOOGLE_SERVICES_JSON / GOOGLE_SERVICES_PLIST
//      (one value per EAS environment) into the native projects when set;
//   2. checks that the native file matches APP_ENV (project id), so a staging
//      build can never ship the production files or the reverse;
//   3. fails an EAS build early when the file of the platform being built is
//      missing, instead of failing 20 minutes later in Gradle.
// No dependency: it runs before `npm ci`.
const fs = require("fs");
const path = require("path");

const EXPECTED_PROJECT_IDS = {
  production: "samaye-53723",
  staging: "samaye-staging",
};

const TARGETS = {
  android: {
    envNames: ["GOOGLE_SERVICES_JSON"],
    dest: path.join("android", "app", "google-services.json"),
    readProjectId(content) {
      return JSON.parse(content)?.project_info?.project_id ?? null;
    },
  },
  ios: {
    envNames: ["GOOGLE_SERVICES_PLIST", "GOOGLE_SERVICE_INFO_PLIST"],
    dest: path.join("ios", "SuiviBaby", "GoogleService-Info.plist"),
    readProjectId(content) {
      const match = content.match(/<key>PROJECT_ID<\/key>\s*<string>([^<]+)<\/string>/);
      return match ? match[1] : null;
    },
  },
};

function run({ rootDir, env, log = console.log }) {
  const appEnv = env.APP_ENV || "production";
  const expectedProjectId = EXPECTED_PROJECT_IDS[appEnv];
  if (!expectedProjectId) {
    throw new Error(`Unknown APP_ENV "${appEnv}".`);
  }
  const isEasBuild = Boolean(env.EAS_BUILD);
  const platforms = env.EAS_BUILD_PLATFORM ? [env.EAS_BUILD_PLATFORM] : Object.keys(TARGETS);

  for (const platform of platforms) {
    const target = TARGETS[platform];
    if (!target) continue;
    const dest = path.join(rootDir, target.dest);
    const sourceEnv = target.envNames.find((name) => env[name]);

    if (sourceEnv) {
      const source = path.resolve(rootDir, env[sourceEnv]);
      if (!fs.existsSync(source)) {
        throw new Error(`${sourceEnv} points to a missing file (${source}).`);
      }
      if (path.resolve(source) !== path.resolve(dest)) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(source, dest);
        log(`[firebase-files] ${platform}: ${target.dest} <- $${sourceEnv}`);
      }
    }

    if (!fs.existsSync(dest)) {
      const message =
        `[firebase-files] ${platform}: ${target.dest} is missing. ` +
        `Create the EAS file variable ${target.envNames[0]} for this build's environment ` +
        "(docs/adr/0001-android-cloud-build.md).";
      if (isEasBuild) throw new Error(message);
      log(message);
      continue;
    }

    const projectId = target.readProjectId(fs.readFileSync(dest, "utf8"));
    if (projectId !== expectedProjectId) {
      throw new Error(
        `[firebase-files] ${platform}: ${target.dest} belongs to project "${projectId}" ` +
          `but APP_ENV=${appEnv} expects "${expectedProjectId}".`,
      );
    }
    log(`[firebase-files] ${platform}: ${target.dest} OK (${projectId}, APP_ENV=${appEnv})`);
  }
}

module.exports = { run, EXPECTED_PROJECT_IDS };

if (require.main === module) {
  try {
    run({ rootDir: path.join(__dirname, ".."), env: process.env });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
