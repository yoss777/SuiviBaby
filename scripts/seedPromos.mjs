#!/usr/bin/env node
// scripts/seedPromos.mjs — Seeds sample promotions into Firestore

import { readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const PROJECT_ID = "samaye-53723";
const configPath = join(homedir(), ".config/configstore/firebase-tools.json");
const config = JSON.parse(readFileSync(configPath, "utf-8"));
const refreshToken = config.tokens?.refresh_token;

async function getAccessToken() {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi`,
  });
  if (!res.ok) throw new Error("Failed to get token");
  return (await res.json()).access_token;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } };
  if (typeof value === "object") {
    const fields = {};
    for (const [k, v] of Object.entries(value)) fields[k] = toFirestoreValue(v);
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

async function main() {
  const token = await getAccessToken();
  console.log("✓ Authenticated");

  const promos = JSON.parse(readFileSync("data/promos_seed.json", "utf-8"));
  console.log(`Seeding ${promos.length} promotions...`);

  for (const promo of promos) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/promotions/${promo.id}`;
    const fields = {};
    for (const [k, v] of Object.entries(promo)) fields[k] = toFirestoreValue(v);

    const res = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) throw new Error(`Failed ${promo.id}: ${await res.text()}`);
    process.stdout.write(".");
  }

  console.log(`\n✓ ${promos.length} promotions seeded`);
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
