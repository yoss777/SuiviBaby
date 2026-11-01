#!/usr/bin/env node
// scripts/migratePhotosToEu.mjs
// Photo migration from the legacy US bucket to the EU bucket
// (docs/MIGRATION_PHOTOS_EU.md, steps 4 and 5):
//   1. copy every children/ object missing (or with a different size) in the EU bucket;
//   2. rewrite legacy full download URLs stored in events.photos into storage paths.
//
// Dry run by default; pass --apply to write. Idempotent: safe to run again.
// Auth: uses the Firebase CLI login (`firebase login`), or GOOGLE_OAUTH_TOKEN.
//
//   node scripts/migratePhotosToEu.mjs            # report only
//   node scripts/migratePhotosToEu.mjs --apply    # copy + rewrite

import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const PROJECT = "samaye-53723";
const LEGACY_BUCKET = "samaye-53723.firebasestorage.app";
const EU_BUCKET = "samaye-53723-photos-eu";
const APPLY = process.argv.includes("--apply");
const URL_PREFIX = "https://firebasestorage.googleapis.com/";

async function getToken() {
  if (process.env.GOOGLE_OAUTH_TOKEN) return process.env.GOOGLE_OAUTH_TOKEN;
  const root = execSync("npm root -g").toString().trim();
  const require = createRequire(import.meta.url);
  const tools = path.join(root, "firebase-tools");
  const auth = require(path.join(tools, "lib/auth"));
  const { configstore } = require(path.join(tools, "lib/configstore"));
  const tokens = configstore.get("tokens");
  if (!tokens?.refresh_token) throw new Error("Run `firebase login` first.");
  return (await auth.getAccessToken(tokens.refresh_token, [])).access_token;
}

async function api(token, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`${init.method ?? "GET"} ${url} -> ${res.status} ${await res.text()}`);
  }
  return res.status === 404 ? null : res.json();
}

async function listObjects(token, bucket) {
  const objects = new Map();
  let pageToken = "";
  do {
    const page = await api(
      token,
      `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=children/&maxResults=1000&fields=nextPageToken,items(name,size)` +
        (pageToken ? `&pageToken=${pageToken}` : ""),
    );
    for (const item of page?.items ?? []) objects.set(item.name, Number(item.size));
    pageToken = page?.nextPageToken ?? "";
  } while (pageToken);
  return objects;
}

async function copyObject(token, name) {
  const src = encodeURIComponent(name);
  let rewriteToken = "";
  do {
    const res = await api(
      token,
      `https://storage.googleapis.com/storage/v1/b/${LEGACY_BUCKET}/o/${src}/rewriteTo/b/${EU_BUCKET}/o/${src}` +
        (rewriteToken ? `?rewriteToken=${rewriteToken}` : ""),
      { method: "POST", body: "{}" },
    );
    rewriteToken = res?.done ? "" : res?.rewriteToken ?? "";
  } while (rewriteToken);
}

function toStoragePath(ref) {
  const match = ref.match(/\/o\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function migrateObjects(token) {
  const [legacy, eu] = await Promise.all([listObjects(token, LEGACY_BUCKET), listObjects(token, EU_BUCKET)]);
  const toCopy = [...legacy].filter(([name, size]) => eu.get(name) !== size).map(([name]) => name);
  console.log(`Objets : ${legacy.size} dans le bucket US, ${eu.size} dans le bucket UE, ${toCopy.length} à copier.`);
  if (APPLY) {
    for (const name of toCopy) await copyObject(token, name);
    const after = await listObjects(token, EU_BUCKET);
    const missing = [...legacy].filter(([name, size]) => after.get(name) !== size);
    console.log(`Copie terminée : ${after.size} objets dans le bucket UE, ${missing.length} manquant(s).`);
  }
}

async function migrateRefs(token) {
  const base = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
  const rows = await api(token, `${base}:runQuery`, {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "events" }],
        select: { fields: [{ fieldPath: "photos" }] },
        orderBy: [{ field: { fieldPath: "photos" } }],
      },
    }),
  });
  let docs = 0;
  let refs = 0;
  for (const row of rows ?? []) {
    if (!row.document) continue;
    const values = row.document.fields?.photos?.arrayValue?.values ?? [];
    const photos = values.map((v) => v.stringValue ?? "");
    const rewritten = photos.map((p) => (p.startsWith(URL_PREFIX) ? toStoragePath(p) ?? p : p));
    const changed = rewritten.filter((p, i) => p !== photos[i]).length;
    if (changed === 0) continue;
    docs += 1;
    refs += changed;
    const id = row.document.name.split("/").pop();
    console.log(`${APPLY ? "Réécrit" : "À réécrire"} : events/${id} (${changed} URL)`);
    if (APPLY) {
      await api(token, `https://firestore.googleapis.com/v1/${row.document.name}?updateMask.fieldPaths=photos`, {
        method: "PATCH",
        body: JSON.stringify({
          fields: { photos: { arrayValue: { values: rewritten.map((p) => ({ stringValue: p })) } } },
        }),
      });
    }
  }
  console.log(`Références : ${refs} URL dans ${docs} événement(s) ${APPLY ? "réécrites" : "à réécrire"}.`);
}

const token = await getToken();
console.log(APPLY ? "Mode --apply : écritures activées." : "Mode simulation (ajoutez --apply pour écrire).");
await migrateObjects(token);
await migrateRefs(token);
