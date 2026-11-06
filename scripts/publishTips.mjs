#!/usr/bin/env node
/**
 * Publishes selected tips from data/tips_seed.json to the production `tips`
 * collection, replacing each doc with its seed version (publishedAt kept).
 * Only the ids passed are touched; everything else stays as it is.
 *
 * Usage (application default credentials, like compareTipsWithSeed.mjs):
 *   node scripts/publishTips.mjs --ids a,b,c          # dry run
 *   node scripts/publishTips.mjs --ids a,b,c --apply  # write
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const PROJECT_ID = "samaye-53723";
const SEED_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "tips_seed.json");

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const idsArg = args[args.indexOf("--ids") + 1];
if (!args.includes("--ids") || !idsArg) {
  console.error("Usage: node scripts/publishTips.mjs --ids a,b,c [--apply]");
  process.exit(2);
}
const ids = idsArg.split(",").map((id) => id.trim()).filter(Boolean);

const seed = new Map(JSON.parse(readFileSync(SEED_PATH, "utf-8")).map((tip) => [tip.id, tip]));
const missing = ids.filter((id) => !seed.has(id));
if (missing.length) {
  console.error(`Not in the seed: ${missing.join(", ")}`);
  process.exit(2);
}

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

console.log(apply ? "APPLY mode" : "DRY RUN (pass --apply to write)");
for (const id of ids) {
  const ref = db.collection("tips").doc(id);
  const current = await ref.get();
  const tip = seed.get(id);
  const doc = {
    ...tip,
    publishedAt: current.exists ? current.data().publishedAt ?? new Date().toISOString() : new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  console.log(`${id}: ${current.exists ? "replace" : "create"} — "${tip.title}"`);
  if (apply) await ref.set(doc);
}
console.log(apply ? `✓ ${ids.length} tips published` : "Nothing written.");
