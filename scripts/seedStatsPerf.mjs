#!/usr/bin/env node
// scripts/seedStatsPerf.mjs
// Seeds the Firestore EMULATOR with a child holding ~3 000 events (meals,
// pumping, sleep over 12 months) to profile the statistics screen
// (docs/STATS_PERF_REFONTE.md, sprint 0). Refuses to run against production.
//
//   firebase emulators:start --only firestore,auth
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/seedStatsPerf.mjs --uid <emulator user uid>
//
// Options: --uid (required, becomes owner), --child (default perf-child),
// --total (default 3000), --days (default 365).

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildStatsEvents } = require("./statsPerfFixtures.js");

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("FIRESTORE_EMULATOR_HOST is not set: this script only writes to the emulator.");
  process.exit(1);
}

const uid = arg("uid");
if (!uid) {
  console.error("Missing --uid <emulator user uid> (the account that will own the child).");
  process.exit(1);
}
const childId = arg("child", "perf-child");
const total = Number(arg("total", "3000"));
const days = Number(arg("days", "365"));

const admin = require("../functions/node_modules/firebase-admin");
admin.initializeApp({ projectId: "samaye-53723" });
const db = admin.firestore();
const { Timestamp } = admin.firestore;

const toTs = (value) => (value instanceof Date ? Timestamp.fromDate(value) : value);

async function main() {
  await db.doc(`children/${childId}`).set({
    name: "Léo (perf)",
    birthDate: Timestamp.fromDate(new Date(Date.now() - 400 * 24 * 3600 * 1000)),
    ownerId: uid,
    createdAt: Timestamp.now(),
  });
  const access = { userId: uid, childId, role: "owner", canWriteEvents: true, grantedAt: Timestamp.now() };
  await db.doc(`children/${childId}/access/${uid}`).set(access);
  await db.doc(`user_child_access/${uid}_${childId}`).set(access);

  const events = buildStatsEvents({ total, days, now: Date.now() });
  for (let i = 0; i < events.length; i += 400) {
    const batch = db.batch();
    for (const event of events.slice(i, i + 400)) {
      const { id, ...data } = event;
      const doc = { ...data, childId, userId: uid, createdAt: Timestamp.now() };
      for (const key of ["date", "heureDebut", "heureFin"]) {
        if (doc[key]) doc[key] = toTs(doc[key]);
      }
      batch.set(db.collection("events").doc(id), doc);
    }
    await batch.commit();
  }
  console.log(`Seeded child ${childId} (owner ${uid}) with ${events.length} events over ${days} days.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
