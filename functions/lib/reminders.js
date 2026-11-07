/**
 * Helpers of the scheduled reminder and recap jobs (S12.4).
 *
 * - lastEventAt: children/{id}.lastEventAt.{repas|pompages|changes|vitamines|any}
 *   holds the date of the latest event per reminder category, so the jobs read
 *   one child document instead of querying events for every user x child x
 *   category. A key that is absent means "never computed" (the jobs fall back
 *   to the events query); null means "computed, no such event".
 * - mapInChunks: bounded concurrency (Promise.all on slices of N).
 * - sendPushWithTickets: reads the Expo tickets, reports dead tokens.
 * - logJobSummary: one structured log line at the end of each run.
 */
const logger = require("firebase-functions/logger");

/** Reminder category -> Firestore event types. */
const REMINDER_CATEGORIES = {
  repas: ["biberon", "tetee", "solide"],
  pompages: ["pompage"],
  changes: ["miction", "selle", "couche"],
  vitamines: ["vitamine"],
};

/** Key for the latest event of any type (weekly recap activity check). */
const ANY_EVENT = "any";
const LAST_EVENT_KEYS = [...Object.keys(REMINDER_CATEGORIES), ANY_EVENT];

function categoryForType(type) {
  for (const [category, types] of Object.entries(REMINDER_CATEGORIES)) {
    if (types.includes(type)) return category;
  }
  return null;
}

function toMillis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : null;
}

/** Query returning the latest event of a category (or of any type) for a child. */
function lastEventQuery(db, childId, key) {
  let q = db.collection("events").where("childId", "==", childId);
  if (key !== ANY_EVENT) q = q.where("type", "in", REMINDER_CATEGORIES[key]);
  return q.orderBy("date", "desc").limit(1);
}

/**
 * Recompute lastEventAt after an event write. Recomputes the categories of the
 * given event types plus "any", and initialises every key still missing so the
 * jobs stop falling back to queries for that child. One transaction: it reads
 * the child and the latest events, then writes the child once.
 */
async function refreshLastEventAt(db, childId, types) {
  const wanted = new Set([ANY_EVENT]);
  for (const type of types || []) {
    const category = categoryForType(type);
    if (category) wanted.add(category);
  }
  const childRef = db.doc(`children/${childId}`);
  await db.runTransaction(async (tx) => {
    const childSnap = await tx.get(childRef);
    if (!childSnap.exists) return;
    const raw = childSnap.data()?.lastEventAt;
    // Valeur héritée null ou scalaire : un chemin pointé `lastEventAt.x` ne peut
    // pas la convertir de façon sûre, on réécrit alors la map entière.
    const isMap = raw !== null && typeof raw === "object" && !Array.isArray(raw);
    const known = isMap ? raw : {};
    const todo = LAST_EVENT_KEYS.filter((k) => !isMap || wanted.has(k) || known[k] === undefined);
    const snaps = await Promise.all(todo.map((k) => tx.get(lastEventQuery(db, childId, k))));
    const values = {};
    todo.forEach((k, i) => {
      values[k] = snaps[i].empty ? null : (snaps[i].docs[0].data().date ?? null);
    });
    const patch = isMap
      ? Object.fromEntries(Object.entries(values).map(([k, v]) => [`lastEventAt.${k}`, v]))
      : { lastEventAt: values };
    tx.update(childRef, patch);
  });
}

/**
 * Best effort: the event write has already succeeded, a failed maintenance must
 * not fail it. A stale value is repaired by the next write on the child or by
 * scripts/backfillLastEventAt.js.
 */
async function safeRefreshLastEventAt(db, childId, types) {
  try {
    await refreshLastEventAt(db, childId, types);
    return true;
  } catch (error) {
    console.warn(`lastEventAt: refresh failed for child ${childId}:`, error?.message ?? error);
    return false;
  }
}

/**
 * Milliseconds of the latest event of a reminder category, or null when there
 * is none. Reads the child's lastEventAt; queries events only when the key is
 * missing. `stats.fallbackReads` counts those queries.
 */
async function getLastEventMillis(db, childId, childData, category, stats) {
  const stored = childData?.lastEventAt?.[category];
  if (stored === null) return null;
  const storedMs = toMillis(stored);
  if (storedMs !== null) return storedMs;
  if (stats) stats.fallbackReads += 1;
  const snap = await lastEventQuery(db, childId, category).get();
  if (snap.empty) return null;
  // Date absente ou invalide : on ne sait pas quand a eu lieu l'événement, donc
  // aucun rappel (un 0 ferait partir un rappel immédiat à chaque passage).
  return toMillis(snap.docs[0].data().date);
}

/** True when the child has at least one event in [weekStart, weekEnd] (no figure is read). */
async function hadActivityInWeek(db, childId, childData, weekStart, weekEnd, stats) {
  const stored = childData?.lastEventAt?.[ANY_EVENT];
  if (stored === null) return false;
  const storedMs = toMillis(stored);
  if (storedMs !== null) {
    if (storedMs < weekStart.toMillis()) return false;
    if (storedMs <= weekEnd.toMillis()) return true;
    // Latest event is after the week: earlier ones may still be inside it.
  }
  if (stats && storedMs === null) stats.fallbackReads += 1;
  const snap = await db
    .collection("events")
    .where("childId", "==", childId)
    .where("date", ">=", weekStart)
    .where("date", "<=", weekEnd)
    .orderBy("date", "desc")
    .limit(1)
    .get();
  return !snap.empty;
}

/**
 * Run fn over items, at most `size` at a time (slices awaited with
 * Promise.all). Results keep the order of items. With { settle: true } a
 * rejection becomes a { status: "rejected" } entry instead of failing the run.
 */
async function mapInChunks(items, size, fn, { settle = false } = {}) {
  const n = Math.max(1, Math.floor(size) || 1);
  const out = [];
  for (let i = 0; i < items.length; i += n) {
    const slice = items.slice(i, i + n);
    const results = settle
      ? await Promise.allSettled(slice.map((item, j) => fn(item, i + j)))
      : await Promise.all(slice.map((item, j) => fn(item, i + j)));
    out.push(...results);
  }
  return out;
}

/**
 * Send messages and read the tickets. A ticket in error is not a delivery; a
 * DeviceNotRegistered one marks the token as dead. A missing ticket (no array
 * returned) counts as delivered. Receipts (delivery confirmation, fetched
 * later) are not read: tickets already carry DeviceNotRegistered.
 */
async function sendPushWithTickets(client, messages) {
  const dead = new Set();
  let delivered = 0;
  let failed = 0;
  let chunkErrors = 0;
  let firstError = null;
  for (const chunk of client.chunkPushNotifications(messages)) {
    // Un lot qui échoue ne doit pas faire oublier les lots déjà livrés : sinon
    // l'historique n'est pas écrit et le prochain passage renotifie ces appareils.
    let tickets;
    try {
      tickets = await client.sendPushNotificationsAsync(chunk);
    } catch (error) {
      chunkErrors += 1;
      failed += chunk.length;
      firstError = firstError || error;
      continue;
    }
    chunk.forEach((message, i) => {
      const ticket = Array.isArray(tickets) ? tickets[i] : undefined;
      if (ticket?.status === "error") {
        failed += 1;
        if (ticket.details?.error === "DeviceNotRegistered") dead.add(message.to);
      } else {
        delivered += 1;
      }
    });
  }
  // Rien n'est parti : l'erreur remonte (nouvel essai au passage suivant).
  if (firstError && delivered === 0) throw firstError;
  return { delivered, failed, dead, chunkErrors };
}

/** Delete the device_tokens documents whose token is dead. */
async function removeDeadTokens(tokenDocs, dead) {
  const victims = tokenDocs.filter((t) => dead.has(t.token));
  // allSettled : un jeton qui ne se supprime pas ne doit pas faire échouer
  // l'envoi déjà livré (l'historique serait perdu, donc un doublon au passage suivant).
  const results = await Promise.allSettled(victims.map((t) => t.ref.delete()));
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.warn(`removeDeadTokens: could not delete token ${victims[i].ref?.id ?? ""}:`, r.reason?.message ?? r.reason);
    }
  });
  return results.filter((r) => r.status === "fulfilled").length;
}

/** One structured log line at the end of a run. */
function logJobSummary(job, startedAtMs, fields) {
  logger.info(`${job}: done`, { job, durationMs: Date.now() - startedAtMs, ...fields });
}

module.exports = {
  REMINDER_CATEGORIES,
  ANY_EVENT,
  LAST_EVENT_KEYS,
  categoryForType,
  lastEventQuery,
  refreshLastEventAt,
  safeRefreshLastEventAt,
  getLastEventMillis,
  hadActivityInWeek,
  mapInChunks,
  sendPushWithTickets,
  removeDeadTokens,
  logJobSummary,
};
