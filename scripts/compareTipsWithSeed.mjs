#!/usr/bin/env node
// scripts/compareTipsWithSeed.mjs
// Compare la collection Firestore `tips` (production) avec data/tips_seed.json
// et affiche les différences. LECTURE SEULE : aucune écriture.
//
// Authentification : identifiants par défaut de l'application (comme
// scripts/backfillRetention.js).
//   export GOOGLE_APPLICATION_CREDENTIALS="/chemin/vers/service-account.json"
//   node scripts/compareTipsWithSeed.mjs
//
// Code de sortie : 0 si identique, 1 s'il y a des différences, 2 en cas d'erreur.
// Le champ `publishedAt` est ignoré (ajouté par seedViaFirestore.mjs).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import admin from "firebase-admin";

const PROJECT_ID = "samaye-53723";
const IGNORED_FIELDS = new Set(["publishedAt"]);
const SEED_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "tips_seed.json");

const stable = (v) => JSON.stringify(v);

/** Convertit un Timestamp Firestore éventuel en valeur comparable. */
function normalize(v) {
  if (v && typeof v.toDate === "function") return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(normalize);
  return v;
}

/**
 * @param {Array<{id: string}>} seed
 * @param {Map<string, Record<string, unknown>>} remote id -> document
 */
export function diffTips(seed, remote) {
  const seedIds = new Set(seed.map((t) => t.id));
  const missingInProd = seed.filter((t) => !remote.has(t.id)).map((t) => t.id);
  const extraInProd = [...remote.keys()].filter((id) => !seedIds.has(id));
  const changed = [];

  for (const tip of seed) {
    const doc = remote.get(tip.id);
    if (!doc) continue;
    const fields = new Set([...Object.keys(tip), ...Object.keys(doc)]);
    for (const field of fields) {
      if (IGNORED_FIELDS.has(field)) continue;
      const a = normalize(tip[field]);
      const b = normalize(doc[field]);
      if (stable(a) !== stable(b)) changed.push({ id: tip.id, field, seed: a, prod: b });
    }
  }
  return { missingInProd, extraInProd, changed };
}

const show = (v) => {
  const s = typeof v === "string" ? v : stable(v);
  return s === undefined ? "(absent)" : s.length > 300 ? `${s.slice(0, 300)}... [${s.length} caractères]` : s;
};

async function main() {
  const seed = JSON.parse(readFileSync(SEED_PATH, "utf-8"));
  admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
  const snap = await admin.firestore().collection("tips").get();
  const remote = new Map(snap.docs.map((d) => [d.id, d.data()]));

  const { missingInProd, extraInProd, changed } = diffTips(seed, remote);
  console.log(`Seed : ${seed.length} fiches. Production : ${remote.size} fiches.\n`);

  if (missingInProd.length) console.log(`Dans le seed mais absentes en production (${missingInProd.length}) :\n  ${missingInProd.join("\n  ")}\n`);
  if (extraInProd.length) console.log(`En production mais absentes du seed (${extraInProd.length}) :\n  ${extraInProd.join("\n  ")}\n`);
  if (changed.length) {
    console.log(`Champs différents (${changed.length}) :`);
    for (const c of changed) {
      console.log(`\n[${c.id}] ${c.field}\n  seed : ${show(c.seed)}\n  prod : ${show(c.prod)}`);
    }
  }

  const same = !missingInProd.length && !extraInProd.length && !changed.length;
  console.log(same ? "Production identique au seed." : "\nDifférences trouvées.");
  process.exit(same ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}
