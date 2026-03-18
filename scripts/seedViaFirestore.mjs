#!/usr/bin/env node
// scripts/seedViaFirestore.mjs
// Seeds Firestore using the Firebase CLI refresh token
// Run: node scripts/seedViaFirestore.mjs

import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const PROJECT_ID = "samaye-53723";

// Read Firebase CLI refresh token
const configPath = join(homedir(), ".config/configstore/firebase-tools.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));
const refreshToken = config.tokens?.refresh_token;
if (!refreshToken) {
  console.error("No Firebase CLI refresh token found. Run 'firebase login' first.");
  process.exit(1);
}

// Exchange refresh token for access token
async function getAccessToken() {
  const res = await fetch("https://securetoken.googleapis.com/v1/token?key=AIzaSyBJUP-b3NPExx-4RfWFLvrbAM5pEfHvAOg", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
  });

  if (!res.ok) {
    // Try Google OAuth endpoint instead (for Google account tokens)
    const res2 = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi`,
    });
    if (!res2.ok) {
      throw new Error("Failed to get access token: " + await res2.text());
    }
    const data = await res2.json();
    return data.access_token;
  }
  const data = await res.json();
  return data.access_token || data.id_token;
}

// Write a document to Firestore via REST API
async function writeDoc(accessToken, collection, docId, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${docId}`;

  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: toFirestoreFields(fields) }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to write ${collection}/${docId}: ${err}`);
  }
}

// Convert JS values to Firestore REST API field format
function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }
  return { stringValue: String(value) };
}

async function main() {
  console.log("Getting access token...");
  const token = await getAccessToken();
  console.log("✓ Authenticated\n");

  const tipsData = JSON.parse(readFileSync("data/tips_seed.json", "utf-8"));
  const milestonesData = JSON.parse(readFileSync("data/milestones_seed.json", "utf-8"));

  // Seed tips
  console.log(`Seeding ${tipsData.length} tips...`);
  for (const tip of tipsData) {
    await writeDoc(token, "tips", tip.id, { ...tip, publishedAt: new Date().toISOString() });
    process.stdout.write(".");
  }
  console.log(`\n✓ ${tipsData.length} tips seeded\n`);

  // Seed milestones
  console.log(`Seeding ${milestonesData.length} milestones...`);
  for (const ms of milestonesData) {
    await writeDoc(token, "milestones_ref", ms.id, ms);
    process.stdout.write(".");
  }
  console.log(`\n✓ ${milestonesData.length} milestones seeded\n`);

  console.log("✓ All content seeded successfully!");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
