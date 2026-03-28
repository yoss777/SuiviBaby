// In-memory optimistic UI store for events.
// Events written via Cloud Functions are slow; this store lets the UI
// show them instantly while the CF runs in the background.

export type OptimisticOperation = 'create' | 'update';
export type OptimisticStatus =
  | 'pending'
  | 'queued_offline'
  | 'confirmed'
  | 'failed';

export interface OptimisticEntry {
  tempId: string;
  operation: OptimisticOperation;
  event: any;
  previousEvent?: any;
  realId?: string;
  status: OptimisticStatus;
  childId: string;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

const entries = new Map<string, OptimisticEntry>();
const subscribers = new Set<() => void>();
let onFailureCallback: ((message: string) => void) | null = null;

const STALE_THRESHOLD_MS = 20_000; // 20 seconds

/**
 * Register a callback to be called when an optimistic operation fails.
 * Used to show a toast/error to the user.
 */
export function setOnFailure(cb: ((message: string) => void) | null): void {
  onFailureCallback = cb;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function notify(): void {
  subscribers.forEach((cb) => cb());
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function generateTempId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `__optimistic_${Date.now()}_${random}`;
}

/**
 * Register an optimistic create. Accepts a pre-generated tempId so the caller
 * can track the entry for confirmation/failure.
 */
export function addOptimisticCreate(childId: string, event: any, tempId: string): void {
  entries.set(tempId, {
    tempId,
    operation: 'create',
    event: { ...event, id: tempId },
    status: 'pending',
    childId,
    createdAt: Date.now(),
  });
  notify();
}

/**
 * Register an optimistic update. The `eventId` is the real Firestore id of the
 * event being updated.
 */
export function addOptimisticUpdate(
  eventId: string,
  childId: string,
  newEvent: any,
  previousEvent: any,
): void {
  const tempId = generateTempId();
  entries.set(tempId, {
    tempId,
    operation: 'update',
    event: { ...newEvent, id: eventId },
    previousEvent,
    realId: eventId,
    status: 'pending',
    childId,
    createdAt: Date.now(),
  });
  notify();
}

/**
 * Mark an optimistic entry as confirmed. For creates, `realId` should be
 * provided so the merge step can reconcile with the Firestore snapshot.
 */
export function confirmOptimistic(tempIdOrEventId: string, realId?: string): void {
  // Try direct lookup first.
  const entry = entries.get(tempIdOrEventId);

  if (entry) {
    entry.status = 'confirmed';
    if (realId) entry.realId = realId;
  }

  // Also confirm ALL entries matching by realId (handles rapid edits to the
  // same event where multiple optimistic entries share the same realId).
  for (const e of entries.values()) {
    if (e.realId === tempIdOrEventId || (realId && e.realId === realId)) {
      e.status = 'confirmed';
      if (realId) e.realId = realId;
    }
  }

  // Notify so the merge can reconcile: replace tempId with realId and
  // clean up confirmed entries. The fingerprint will detect the optimistic
  // count change (1→0) and trigger setData to unblock edit/delete.
  notify();
}

/**
 * Mark an optimistic entry as queued for offline replay.
 * The entry remains visible in the UI until Firestore catches up.
 */
export function markOptimisticQueued(tempIdOrEventId: string): void {
  let changed = false;

  const entry = entries.get(tempIdOrEventId);
  if (entry && entry.status !== 'queued_offline') {
    entry.status = 'queued_offline';
    changed = true;
  }

  for (const e of entries.values()) {
    if (e.realId === tempIdOrEventId && e.status !== 'queued_offline') {
      e.status = 'queued_offline';
      changed = true;
    }
  }

  if (changed) {
    notify();
  }
}

/**
 * Mark an optimistic entry as failed and return its data so the caller can
 * trigger a rollback or show an error.
 */
export function failOptimistic(
  tempIdOrEventId: string,
): { event: any; operation: string } | null {
  let entry = entries.get(tempIdOrEventId);

  if (!entry) {
    for (const e of entries.values()) {
      if (e.realId === tempIdOrEventId) {
        entry = e;
        break;
      }
    }
  }

  if (!entry) return null;

  entry.status = 'failed';
  const result = {
    event: entry.operation === 'update' ? entry.previousEvent : entry.event,
    operation: entry.operation,
  };

  // Remove failed entries immediately – the caller already has the data.
  entries.delete(entry.tempId);

  // Notify the user via the registered failure callback.
  const action = entry.operation === 'create' ? "l'enregistrement" : 'la modification';
  onFailureCallback?.(`Erreur lors de ${action}. Veuillez réessayer.`);

  notify();
  return result;
}

/**
 * Silently remove an optimistic entry (e.g. when the offline queue takes over).
 * Unlike failOptimistic, this does NOT show an error toast.
 */
export function removeOptimistic(tempIdOrEventId: string): void {
  if (entries.delete(tempIdOrEventId)) {
    notify();
    return;
  }
  // Fallback: search by realId
  for (const [key, e] of entries) {
    if (e.realId === tempIdOrEventId) {
      entries.delete(key);
      notify();
      return;
    }
  }
}

/**
 * Return all optimistic entries for a given child, regardless of status.
 */
export function getOptimisticEntries(childId: string): OptimisticEntry[] {
  const result: OptimisticEntry[] = [];
  for (const entry of entries.values()) {
    if (entry.childId === childId) {
      result.push(entry);
    }
  }
  return result;
}

/**
 * Merge optimistic entries with the latest Firestore snapshot.
 *
 * 1. Start with firestoreEvents.
 * 2. For each pending *update*: replace the matching Firestore event with the
 *    optimistic version.
 * 3. For each pending *create*:
 *    - If a Firestore event matches by `realId`, the CF has already written the
 *      document -> mark the entry confirmed (will be cleaned up).
 *    - Otherwise append the optimistic event so it shows in the timeline.
 * 4. Clean up stale / confirmed entries.
 * 5. Sort by date descending and return.
 */
export function mergeWithFirestoreEvents(
  firestoreEvents: any[],
  childId: string,
): any[] {
  const merged = [...firestoreEvents];

  for (const entry of entries.values()) {
    if (entry.childId !== childId) continue;

    // -- Updates --
    if (
      entry.operation === 'update' &&
      (entry.status === 'pending' || entry.status === 'queued_offline')
    ) {
      const idx = merged.findIndex((e) => e.id === entry.realId);
      if (idx !== -1) {
        if (entryMatchesFirestore(entry.event, merged[idx])) {
          entry.status = 'confirmed';
        } else {
          merged[idx] = { ...merged[idx], ...entry.event, id: entry.realId };
        }
      }
    }

    // -- Creates --
    if (entry.operation === 'create') {
      const firestoreMatch = findCreateMatch(entry, merged);
      if (firestoreMatch) {
        // Firestore already has the document – confirm silently.
        entry.realId = firestoreMatch.id;
        entry.status = 'confirmed';
      } else if (entry.status === 'confirmed' && entry.realId) {
        // CF succeeded (realId set) but onSnapshot hasn't arrived yet.
        // Use realId so there's no duplicate when onSnapshot arrives.
        merged.push({ ...entry.event, id: entry.realId });
      } else if (
        entry.status === 'pending' ||
        entry.status === 'queued_offline'
      ) {
        merged.push(entry.event);
      }
    }
  }

  // Housekeeping after every merge (silent — don't re-notify subscribers to
  // avoid infinite re-render loops).
  cleanupSilent();

  // Sort descending by date. Support both Date objects and Firestore-like
  // timestamps with a `toDate` method, plus plain numbers / ISO strings.
  merged.sort((a, b) => {
    const dateA = extractTime(a.date ?? a.createdAt);
    const dateB = extractTime(b.date ?? b.createdAt);
    return dateB - dateA;
  });

  return merged;
}

/**
 * Lightweight hash of an event — captures all mutable fields so that any
 * edit (humeur, note, quantite, heureFin, temperature, etc.) changes the
 * fingerprint and triggers a re-render.
 */
function hashEvent(e: any): string {
  return JSON.stringify(normalizeValue(e));
}

/**
 * Build a fingerprint for a list of events that detects ANY mutation across
 * the full merged list, not only the first visible items.
 */
export function buildEventFingerprint(events: any[]): string {
  const optimisticCount = events.filter(
    (e: any) => e.id?.startsWith?.('__optimistic_'),
  ).length;
  return `${events.length}_${optimisticCount}_${events
    .map((event) => `${event?.id ?? ''}:${hashEvent(event)}`)
    .join('|')}`;
}

function extractTime(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') {
    const nanos =
      typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
    return value.seconds * 1000 + Math.round(nanos / 1_000_000);
  }
  const parsed = Date.parse(value);
  return isNaN(parsed) ? 0 : parsed;
}

function normalizeValue(value: any): any {
  if (value == null) return null;
  if (typeof value === 'function') return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') {
    const nanos =
      typeof value.nanoseconds === 'number' ? value.nanoseconds : 0;
    return value.seconds * 1000 + Math.round(nanos / 1_000_000);
  }
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, current]) => typeof current !== 'function')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, current]) => [key, normalizeValue(current)]),
    );
  }
  return value;
}

function valuesEquivalent(a: any, b: any): boolean {
  if (a == null && b == null) return true;
  return JSON.stringify(normalizeValue(a)) === JSON.stringify(normalizeValue(b));
}

function entryMatchesFirestore(entryEvent: any, firestoreEvent: any): boolean {
  if (!entryEvent || !firestoreEvent) return false;

  for (const [key, value] of Object.entries(entryEvent)) {
    if (key === 'createdAt' || key === 'updatedAt') continue;
    if (!valuesEquivalent(value, firestoreEvent[key])) {
      return false;
    }
  }

  return true;
}

function findCreateMatch(entry: OptimisticEntry, firestoreEvents: any[]): any | null {
  if (entry.realId) {
    const byId = firestoreEvents.find((event) => event.id === entry.realId);
    if (byId) return byId;
  }

  const idempotencyKey = entry.event?.idempotencyKey;
  if (!idempotencyKey) return null;

  return (
    firestoreEvents.find(
      (event) => event.idempotencyKey === idempotencyKey,
    ) ?? null
  );
}

// ---------------------------------------------------------------------------
// Subscribe / unsubscribe
// ---------------------------------------------------------------------------

/**
 * Subscribe to store changes. Returns an unsubscribe function.
 */
export function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/** Internal cleanup without notification (used during merge to avoid loops). */
function cleanupSilent(): void {
  const now = Date.now();
  for (const [key, entry] of entries) {
    if (
      entry.status === 'confirmed' ||
      (entry.status === 'pending' && now - entry.createdAt > STALE_THRESHOLD_MS)
    ) {
      entries.delete(key);
    }
  }
}

/**
 * Remove confirmed entries and entries that have been pending for longer than
 * 20 seconds (the CF probably succeeded but reconciliation was missed).
 */
export function cleanup(): void {
  const sizeBefore = entries.size;
  cleanupSilent();
  if (entries.size !== sizeBefore) {
    notify();
  }
}

/**
 * Test helper: clear the in-memory optimistic store between test cases.
 */
export function resetOptimisticStoreForTests(): void {
  entries.clear();
  onFailureCallback = null;
}
