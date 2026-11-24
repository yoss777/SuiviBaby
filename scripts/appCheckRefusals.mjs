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
// Sortie : 0 aucun appel non vérifié observé ; 1 au moins un appel non vérifié
// (refusé si App Check est imposé) ou un 401 inexpliqué ; 2 fenêtre invalide,
// lecture impossible, vide ou tronquée.
//
// Limites : un appel rejeté avant la vérification (requête mal formée, 400,
// pré-vol CORS) n'écrit aucune ligne de vérification et n'est pas vu ici.
// La fenêtre s'arrête 2 minutes avant maintenant (retard d'ingestion).

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { windowToRange, functionOf, summarize, exitCodeOf } = require("./lib/appCheckRefusals.js");

const PROJECT = process.env.SUIVIBABY_PROJECT_ID || "samaye-53723";
const GCLOUD = process.env.GCLOUD || "gcloud";
const LIMIT = 20000;

function unknown(message) {
  console.log(`STATUS: UNKNOWN — ${message}`);
  process.exit(2);
}

/** Lit Cloud Logging ; `truncated` vaut true si la limite est atteinte. */
function read(label, filter) {
  const res = spawnSync(
    GCLOUD,
    ["logging", "read", filter, `--project=${PROJECT}`, `--limit=${LIMIT}`, "--format=json"],
    { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
  );
  const stderr = String(res.stderr || "").trim();
  if (res.error || res.status !== 0) {
    unknown(`lecture ${label} impossible (${String((res.error && res.error.message) || stderr).split("\n")[0]})`);
  }
  if (stderr) console.error(`Avertissement gcloud (${label}) : ${stderr.split("\n")[0]}`);
  let entries;
  try {
    entries = JSON.parse(res.stdout || "[]");
  } catch {
    unknown(`réponse ${label} illisible`);
  }
  return { entries, truncated: entries.length >= LIMIT };
}

let range;
try {
  range = windowToRange(process.argv[2] || "24h");
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
const time = `timestamp>="${range.start}" AND timestamp<"${range.end}"`;
const requestsLog = `logName="projects/${PROJECT}/logs/run.googleapis.com%2Frequests"`;

const v = read("des vérifications", `timestamp>="${range.verificationStart}" AND timestamp<"${range.end}" AND labels."firebase-log-type"="callable-request-verification"`);
if (v.truncated) unknown(`vérifications tronquées à ${LIMIT} lignes, prendre une fenêtre plus courte.`);
if (v.entries.length === 0) unknown("aucun appel de fonction appelable dans la fenêtre.");

// Toutes les réponses 401 du projet, quel que soit le service.
const r401 = read("des réponses 401", `${time} AND ${requestsLog} AND httpRequest.status=401`);
if (r401.truncated) unknown(`réponses 401 tronquées à ${LIMIT} lignes : à examiner tout de suite.`);

// Requêtes des seules fonctions appelables vues : code et plateforme de chaque appel.
const services = [...new Set(v.entries.map(functionOf))].filter((n) => /^[a-z0-9-]+$/.test(n));
const req = read(
  "des requêtes",
  `timestamp>="${range.verificationStart}" AND timestamp<"${range.end}" AND ${requestsLog} AND resource.labels.service_name=(${services.map((n) => `"${n}"`).join(" OR ")})`,
);
if (req.entries.length === 0) unknown("aucune requête HTTP rapprochable des vérifications.");
if (req.truncated) console.error("Avertissement : requêtes tronquées, plateformes et codes HTTP incomplets pour les appels les plus anciens.");

const s = summarize(v.entries, req.entries, r401.entries, { start: range.start });
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
if (s.orphan401) console.log(`\n${s.orphan401} réponse(s) 401 sans ligne de vérification rapprochée : à examiner.`);
const other401 = s.table.reduce((n, r) => n + r.other401, 0);
if (other401) console.log(`\n${other401} réponse(s) 401 avec preuve App Check valide : refus d'authentification, pas d'App Check (hors verdict).`);

const code = exitCodeOf(s);
console.log(code === 0
  ? "\nSTATUS: OK — aucun appel sans preuve App Check valide observé (voir les limites en tête du script)."
  : "\nSTATUS: ALERTE — appels non vérifiés : refusés si App Check est imposé. Voir l'ADR 0002, § Retour arrière.");
process.exit(code);
