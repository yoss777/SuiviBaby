#!/usr/bin/env node
// scripts/listOpenReports.mjs
// Lists all open content reports from Firestore.
// Usage: node scripts/listOpenReports.mjs

import { readFileSync } from "fs";
import { createSign } from "crypto";
import { homedir } from "os";

const PROJECT_ID = "samaye-53723";

async function getAccessToken() {
  const saKeyJson = process.env.GCP_SA_KEY;
  if (saKeyJson) {
    const saKey = JSON.parse(saKeyJson);
    const header = { alg: "RS256", typ: "JWT" };
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: saKey.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", exp: now + 3600, iat: now };
    const base64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const unsigned = `${base64url(header)}.${base64url(claims)}`;
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    const signature = signer.sign(saKey.private_key).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const jwt = `${unsigned}.${signature}`;
    const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}` });
    return (await res.json()).access_token;
  }

  const configPath = `${homedir()}/.config/configstore/firebase-tools.json`;
  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  const refreshToken = config.tokens?.refresh_token;
  if (!refreshToken) throw new Error("No Firebase CLI refresh token. Run `firebase login` first.");
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `grant_type=refresh_token&refresh_token=${refreshToken}&client_id=563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com&client_secret=j9iVZfS8kkCEFUPaAeJV0sAi` });
  return (await res.json()).access_token;
}

async function main() {
  const token = await getAccessToken();

  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "reports" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "status" },
            op: "EQUAL",
            value: { stringValue: "pending_review" },
          },
        },
        orderBy: [{ field: { fieldPath: "createdAt" }, direction: "DESCENDING" }],
        limit: 50,
      },
    }),
  });

  if (!res.ok) {
    // Try with "open" status for legacy reports
    const res2 = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: "reports" }],
          where: {
            compositeFilter: {
              op: "OR",
              filters: [
                { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "pending_review" } } },
                { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "open" } } },
              ],
            },
          },
          limit: 50,
        },
      }),
    });
    const data2 = await res2.json();
    console.log(JSON.stringify(data2, null, 2));
    return;
  }

  const results = await res.json();

  const reports = results
    .filter((r) => r.document)
    .map((r) => {
      const fields = r.document.fields;
      const id = r.document.name.split("/").pop();
      return {
        id,
        reason: fields.reason?.stringValue,
        status: fields.status?.stringValue,
        reporterUserId: fields.reporterUserId?.stringValue,
        childId: fields.childId?.stringValue,
        eventId: fields.eventId?.stringValue || null,
        photoPath: fields.photoPath?.stringValue || null,
        message: fields.message?.stringValue || null,
        createdAt: fields.createdAt?.timestampValue,
      };
    });

  if (reports.length === 0) {
    console.log("✅ Aucun signalement ouvert.");
    return;
  }

  console.log(`\n📋 ${reports.length} signalement(s) ouvert(s):\n`);
  for (const r of reports) {
    console.log(`  ID: ${r.id}`);
    console.log(`  Motif: ${r.reason}`);
    console.log(`  Reporter: ${r.reporterUserId}`);
    console.log(`  Child: ${r.childId}`);
    if (r.eventId) console.log(`  Event: ${r.eventId}`);
    if (r.photoPath) console.log(`  Photo: ${r.photoPath}`);
    if (r.message) console.log(`  Message: ${r.message}`);
    console.log(`  Date: ${r.createdAt}`);
    console.log("");
  }
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
