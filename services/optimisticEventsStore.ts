// In-memory optimistic UI store for events.
// Events written via Cloud Functions are slow; this store lets the UI
// show them instantly while the CF runs in the background.

export type OptimisticOperation = 'create' | 'update';
export type OptimisticStatus = 'pending' | 'confirmed' | 'failed';

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

const STALE_THRESHOLD_MS = 60_000; // 60 seconds

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

  notify();
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
  const firestoreIds = new Set(merged.map((e) => e.id));

  for (const entry of entries.values()) {
    if (entry.childId !== childId) continue;

    // -- Updates --
    if (entry.operation === 'update' && entry.status === 'pending') {
      const idx = merged.findIndex((e) => e.id === entry.realId);
      if (idx !== -1) {
        merged[idx] = entry.event;
      }
    }

    // -- Creates --
    if (entry.operation === 'create') {
      if (entry.realId && firestoreIds.has(entry.realId)) {
        // Firestore already has the document – confirm silently.
        entry.status = 'confirmed';
      } else if (entry.status === 'confirmed' && entry.realId) {
        // CF succeeded (realId set) but onSnapshot hasn't arrived yet.
        // Use realId so there's no duplicate when onSnapshot arrives.
        merged.push({ ...entry.event, id: entry.realId });
      } else if (entry.status === 'pending') {
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

function extractTime(value: any): number {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  if (typeof value.seconds === 'number') return value.seconds * 1000;
  const parsed = Date.parse(value);
  return isNaN(parsed) ? 0 : parsed;
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
 * 60 seconds (the CF probably succeeded but reconciliation was missed).
 */
export function cleanup(): void {
  const sizeBefore = entries.size;
  cleanupSilent();
  if (entries.size !== sizeBefore) {
    notify();
  }
}
