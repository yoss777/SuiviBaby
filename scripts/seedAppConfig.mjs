#!/usr/bin/env node
// scripts/seedAppConfig.mjs
// Seeds the app_config/latest_version document in Firestore

import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const PROJECT_ID = "samaye-53723";
const appJson = JSON.parse(readFileSync(join(import.meta.dirname, "../app.json"), "utf-8"));
const currentVersion = appJson.expo.version;
const configPath = join(homedir(), ".config/configstore/firebase-tools.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));
const refreshToken = config.tokens?.refresh_token;

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi`,
  });
  if (!res.ok) throw new Error("Failed to get token: " + await res.text());
  const data = await res.json();
  return data.access_token;
}

function toFirestoreValue(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "object" && !Array.isArray(value)) {
    const fields = {};
    for (const [k, v] of Object.entries(value)) fields[k] = toFirestoreValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

async function main() {
  const token = await getAccessToken();
  console.log("✓ Authenticated");

  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/app_config/latest_version`;

  const fields = {
    latestVersion: currentVersion,
    minVersion: "1.0.0",
    releaseNotes: "Smart Content System, Tips carousel, Milestone timeline",
    storeUrl: {
      ios: "https://apps.apple.com/app/samaye/id0000000000",
      android: "https://play.google.com/store/apps/details?id=com.tesfa.suivibaby",
    },
  };

  const firestoreFields = {};
  for (const [k, v] of Object.entries(fields)) {
    firestoreFields[k] = toFirestoreValue(v);
  }

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: firestoreFields }),
  });

  if (!res.ok) throw new Error("Failed: " + await res.text());

  console.log("✓ app_config/latest_version seeded");
  console.log("  latestVersion:", fields.latestVersion);
  console.log("  storeUrl.ios:", fields.storeUrl.ios);
  console.log("  storeUrl.android:", fields.storeUrl.android);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
