#!/usr/bin/env node
// scripts/resolveReport.mjs
// Resolves a content report via the resolveReport Cloud Function.
//
// Usage:
//   node scripts/resolveReport.mjs --id=REPORT_ID --action=dismiss|remove_photo|remove_event [--note="..."]
//
// Requires: firebase login (uses CLI refresh token for auth)
// The caller must have admin custom claims set on their Firebase Auth account.

import { readFileSync } from "fs";
import { homedir } from "os";

const PROJECT_ID = "samaye-53723";
const CF_REGION = "europe-west1";

function parseArgs() {
  const args = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--(\w+)=(.+)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function getAccessToken() {
  const configPath = `${homedir()}/.config/configstore/firebase-tools.json`;
  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  const refreshToken = config.tokens?.refresh_token;
  if (!refreshToken) throw new Error("No Firebase CLI refresh token. Run `firebase login` first.");

  // Get ID token (not access token) for calling Cloud Functions
  const res = await fetch("https://securetoken.googleapis.com/v1/token?key=AIzaSyC0k_APqTdFnMCTvqKKOfaGRFKi1Rt05fA", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${refreshToken}`,
  });

  if (!res.ok) throw new Error(`Auth failed: ${await res.text()}`);
  const data = await res.json();
  return data.id_token;
}

async function main() {
  const args = parseArgs();
  const reportId = args.id;
  const action = args.action;
  const adminNote = args.note || "";

  if (!reportId) {
    console.error("Usage: node scripts/resolveReport.mjs --id=REPORT_ID --action=dismiss|remove_photo|remove_event [--note=\"...\"]");
    process.exit(1);
  }
  if (!["dismiss", "remove_photo", "remove_event"].includes(action)) {
    console.error("Action invalide. Attendu: dismiss, remove_photo, remove_event");
    process.exit(1);
  }

  console.log(`Résolution du signalement ${reportId}...`);
  console.log(`  Action: ${action}`);
  if (adminNote) console.log(`  Note: ${adminNote}`);

  const idToken = await getAccessToken();

  const url = `https://${CF_REGION}-${PROJECT_ID}.cloudfunctions.net/resolveReport`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      data: { reportId, action, adminNote },
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error(`Erreur: ${res.status} ${errorText}`);
    process.exit(1);
  }

  const result = await res.json();
  console.log(`✅ Signalement ${reportId} résolu.`);
  console.log(`  Action exécutée: ${result.result?.action || action}`);
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
