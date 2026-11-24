#!/usr/bin/env node
// Suivi des refus App Check des fonctions appelables (ADR 0002), en lecture seule.
//
// Usage :
//   node scripts/appCheckRefusals.mjs            # dernières 24 heures
//   node scripts/appCheckRefusals.mjs 2h         # surveillance rapprochée après la bascule
//   node scripts/appCheckRefusals.mjs 7d         # bilan à J+7
//
// Lit Cloud Logging (tous niveaux, DEBUG compris) avec gcloud : chemin dans la
// variable GCLOUD, sinon `gcloud` du PATH. Projet : SUIVIBABY_PROJECT_ID, sinon
// samaye-53723.
//
// Contrairement à scripts/auditAppCheck.sh, ce suivi reste valable après la
// bascule : un appel refusé écrit encore sa ligne de vérification (MISSING ou
// INVALID) avant la réponse 401.
//
// Sortie : 0 tous les appels vérifiés ; 1 au moins un appel non vérifié (refusé
// si App Check est imposé) ou un 401 inexpliqué ; 2 lecture impossible, vide ou
// tronquée.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { windowToRange, summarize, exitCodeOf } = require("./lib/appCheckRefusals.js");

const PROJECT = process.env.SUIVIBABY_PROJECT_ID || "samaye-53723";
const GCLOUD = process.env.GCLOUD || "gcloud";
const LIMIT = 20000;

function read(filter) {
  try {
    const out = execFileSync(
      GCLOUD,
      ["logging", "read", filter, `--project=${PROJECT}`, `--limit=${LIMIT}`, "--format=json"],
      { encoding: "utf8", maxBuffer: 512 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
    return JSON.parse(out || "[]");
  } catch (e) {
    console.error(`STATUS: UNKNOWN — lecture Cloud Logging impossible (${String(e.message).split("\n")[0]})`);
    process.exit(2);
  }
}

let range;
try {
  range = windowToRange(process.argv[2] || "24h");
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
const time = `timestamp>="${range.start}" AND timestamp<"${range.end}"`;

const verifications = read(`${time} AND labels."firebase-log-type"="callable-request-verification"`);
const requests = read(`${time} AND logName="projects/${PROJECT}/logs/run.googleapis.com%2Frequests" AND httpRequest.requestMethod="POST"`);

if (verifications.length >= LIMIT || requests.length >= LIMIT) {
  console.log(`STATUS: UNKNOWN — lecture tronquée à ${LIMIT} lignes, prendre une fenêtre plus courte.`);
  process.exit(2);
}
if (verifications.length === 0) {
  console.log("STATUS: UNKNOWN — aucun appel de fonction appelable dans la fenêtre.");
  process.exit(2);
}

const s = summarize(verifications, requests);
console.log(`Projet ${PROJECT}, du ${range.start} au ${range.end}`);
console.log(`${s.total} appels (hors exceptions), ${s.exempt.total} appels aux fonctions exclues dont ${s.exempt.notValid} non vérifiés (hors verdict)\n`);

const pad = (v, n) => String(v).padEnd(n);
console.log(pad("FONCTION", 28) + pad("PLATEFORME", 11) + pad("VALID", 7) + pad("MISSING", 8) + pad("INVALID", 8) + pad("401 AC", 7) + "401 autres");
for (const r of s.table) {
  console.log(pad(r.fn, 28) + pad(r.platform, 11) + pad(r.VALID, 7) + pad(r.MISSING, 8) + pad(r.INVALID, 8) + pad(r.refused401, 7) + r.other401);
}

if (s.notVerified.length) {
  console.log(`\nAppels non vérifiés (${s.notVerified.length}, 20 plus récents) :`);
  for (const n of s.notVerified.slice(0, 20)) {
    console.log(`  ${n.t}  ${n.fn}  ${n.platform}  app=${n.app} auth=${n.auth} http=${n.status ?? "?"}  ${n.ua}`);
  }
}
if (s.orphan401) console.log(`\n${s.orphan401} réponse(s) 401 sans ligne de vérification : à examiner.`);

const code = exitCodeOf(s);
console.log(code === 0
  ? "\nSTATUS: OK — tous les appels portent une preuve App Check valide."
  : "\nSTATUS: ALERTE — appels non vérifiés : refusés si App Check est imposé. Voir l'ADR 0002, § Retour arrière.");
process.exit(code);
