#!/usr/bin/env node
// scripts/updateAppConfig.mjs
// Met à jour app_config/latest_version dans Firestore à partir de app.json.
//
// Usage local (utilise ton token Firebase CLI) :
//   node scripts/updateAppConfig.mjs
//
// Usage CI (utilise un service account JSON) :
//   GCP_SA_KEY='{...json...}' node scripts/updateAppConfig.mjs
//
// Options via env vars :
//   MIN_VERSION=1.0.0           (default: 1.0.0, = pas de force update)
//   RELEASE_NOTES="..."         (default: généré depuis git)
//   IOS_STORE_URL="..."         (default: placeholder, à remplir)
//   ANDROID_STORE_URL="..."     (default: depuis app.json android.package)

import { execSync } from "child_process";
import { createSign } from "crypto";
import { readFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

const PROJECT_ID = "samaye-53723";

// ============================================
// INPUTS
// ============================================

const appJson = JSON.parse(readFileSync(join(rootDir, "app.json"), "utf-8"));
const version = appJson.expo?.version;
if (!version) {
  console.error("Error: app.json expo.version not found");
  process.exit(1);
}

const packageId = appJson.expo?.android?.package ?? "com.tesfa.suivibaby";
const minVersion = process.env.MIN_VERSION ?? "1.0.0";
const iosStoreUrl =
  process.env.IOS_STORE_URL ??
  "https://apps.apple.com/app/suivi-baby/id0000000000";
const androidStoreUrl =
  process.env.ANDROID_STORE_URL ??
  `https://play.google.com/store/apps/details?id=${packageId}`;

// Release notes : depuis env var, sinon depuis le dernier tag git, sinon default
let releaseNotes = process.env.RELEASE_NOTES;
if (!releaseNotes) {
  try {
    releaseNotes = execSync(
      'git log -1 --pretty=format:"%s"',
      { cwd: rootDir, encoding: "utf-8" },
    ).trim();
  } catch {
    releaseNotes = `Version ${version}`;
  }
}

// ============================================
// AUTH — service account (CI) ou refresh token (local)
// ============================================

async function getAccessTokenFromServiceAccount(saKey) {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: saKey.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const base64url = (obj) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsigned = `${base64url(header)}.${base64url(claims)}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  const signature = signer
    .sign(saKey.private_key)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  const jwt = `${unsigned}.${signature}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  if (!res.ok) {
    throw new Error(`Service account auth failed: ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function getAccessTokenFromRefreshToken() {
  const configPath = join(
    homedir(),
    ".config/configstore/firebase-tools.json",
  );
  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  const refreshToken = config.tokens?.refresh_token;
  if (!refreshToken) {
    throw new Error(
      "No Firebase CLI refresh token found. Run `firebase login` first.",
    );
  }

  // Firebase CLI OAuth client credentials (public — from firebase-tools source)
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body:
      `grant_type=refresh_token&refresh_token=${refreshToken}` +
      `&client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com` +
      `&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi`,
  });
  if (!res.ok) {
    throw new Error(`Refresh token auth failed: ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function getAccessToken() {
  const saKeyJson = process.env.GCP_SA_KEY;
  if (saKeyJson) {
    const saKey = JSON.parse(saKeyJson);
    return getAccessTokenFromServiceAccount(saKey);
  }
  return getAccessTokenFromRefreshToken();
}

// ============================================
// SEMVER COMPARE (mirror of services/appUpdateService.ts)
// ============================================

function compareSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

// ============================================
// FIRESTORE REST API
// ============================================

function toFirestoreValue(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number")
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "object" && !Array.isArray(value) && value !== null) {
    const fields = {};
    for (const [k, v] of Object.entries(value)) fields[k] = toFirestoreValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

async function fetchCurrentRemoteVersion(token, url) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Failed to GET current doc: ${await res.text()}`);
  }
  const data = await res.json();
  return data.fields?.latestVersion?.stringValue ?? null;
}

async function main() {
  console.log(`Updating app_config/latest_version for version ${version}...`);

  const token = await getAccessToken();
  console.log("✓ Authenticated");

  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/app_config/latest_version`;

  // Anti-regression guard: refuse to publish a version older than the one
  // currently in Firestore, to avoid accidental rollbacks (e.g. running the
  // script from an old branch). Bypass with FORCE_DOWNGRADE=true.
  const remoteVersion = await fetchCurrentRemoteVersion(token, url);
  if (remoteVersion) {
    const cmp = compareSemver(version, remoteVersion);
    if (cmp < 0 && process.env.FORCE_DOWNGRADE !== "true") {
      console.error(
        `Error: refusing to downgrade Firestore latestVersion from ${remoteVersion} to ${version}.`,
      );
      console.error(
        "Set FORCE_DOWNGRADE=true to bypass (intentional rollback).",
      );
      process.exit(1);
    }
    if (cmp === 0) {
      console.log(
        `✓ Firestore already at ${remoteVersion} — patching metadata only (releaseNotes, storeUrl).`,
      );
    }
  } else {
    console.log("ℹ No existing doc — creating from scratch.");
  }

  const fields = {
    latestVersion: version,
    minVersion,
    releaseNotes,
    storeUrl: {
      ios: iosStoreUrl,
      android: androidStoreUrl,
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

  if (!res.ok) {
    throw new Error(`Failed to update: ${await res.text()}`);
  }

  console.log("✓ app_config/latest_version updated");
  console.log("  latestVersion:", fields.latestVersion);
  console.log("  minVersion:", fields.minVersion);
  console.log("  releaseNotes:", fields.releaseNotes);
  console.log("  storeUrl.ios:", fields.storeUrl.ios);
  console.log("  storeUrl.android:", fields.storeUrl.android);
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
