// services/offlineQueueService.ts
// Queue de synchronisation offline avec SQLite
import NetInfo from "@react-native-community/netinfo";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "@/config/firebase";
import * as SQLite from "expo-sqlite";

// ============================================
// TYPES
// ============================================

type QueueAction = "create" | "update" | "delete";

interface QueuedEvent {
  id: string;
  uid: string;
  action: QueueAction;
  payload: string; // JSON stringified
  status: "pending" | "syncing" | "failed";
  retryCount: number;
  lastError: string | null;
  createdAt: number;
}

type QueueChangeListener = (size: number) => void;

// ============================================
// DATABASE SETUP
// ============================================

let db: SQLite.SQLiteDatabase | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!db) {
    db = await SQLite.openDatabaseAsync("offlineQueue.db");
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS pending_events (
        id TEXT PRIMARY KEY,
        uid TEXT NOT NULL DEFAULT '',
        action TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        retryCount INTEGER NOT NULL DEFAULT 0,
        lastError TEXT,
        createdAt INTEGER NOT NULL
      );
    `);
    // Migration: ajouter colonne uid si absente (tables existantes)
    try {
      await db.execAsync(`ALTER TABLE pending_events ADD COLUMN uid TEXT NOT NULL DEFAULT ''`);
    } catch {
      // Colonne existe déjà — OK
    }
  }
  return db;
}

// ============================================
// QUEUE OPERATIONS
// ============================================

const listeners: Set<QueueChangeListener> = new Set();
let isProcessing = false;

function notifyListeners(size: number) {
  listeners.forEach((listener) => listener(size));
}

/**
 * Ajoute un événement à la queue offline, scopé par uid
 */
export async function enqueueEvent(
  action: QueueAction,
  payload: Record<string, unknown>,
): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("Cannot enqueue event: no authenticated user");
  }

  const database = await getDb();
  const id = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  await database.runAsync(
    `INSERT INTO pending_events (id, uid, action, payload, status, retryCount, createdAt)
     VALUES (?, ?, ?, ?, 'pending', 0, ?)`,
    id,
    uid,
    action,
    JSON.stringify(payload),
    Date.now(),
  );

  const size = await getQueueSize();
  notifyListeners(size);

  return id;
}

/**
 * Nombre d'événements en attente pour l'utilisateur courant (strict, pas de legacy uid='')
 */
export async function getQueueSize(): Promise<number> {
  const uid = auth.currentUser?.uid;
  if (!uid) return 0;
  const database = await getDb();
  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM pending_events WHERE status IN ('pending', 'failed') AND uid = ?`,
    uid,
  );
  return result?.count ?? 0;
}

/**
 * Récupère les événements en attente pour l'utilisateur courant uniquement (strict)
 */
export async function getPendingEvents(): Promise<QueuedEvent[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const database = await getDb();
  const rows = await database.getAllAsync<QueuedEvent>(
    `SELECT * FROM pending_events WHERE status IN ('pending', 'failed') AND retryCount < 3 AND uid = ? ORDER BY createdAt ASC`,
    uid,
  );
  return rows;
}

/**
 * Traite la queue — envoie les événements en attente au serveur
 */
export async function processQueue(): Promise<number> {
  if (isProcessing) return 0;

  const networkState = await NetInfo.fetch();
  if (!networkState.isConnected) return 0;

  isProcessing = true;
  let synced = 0;

  try {
    const events = await getPendingEvents();
    if (events.length === 0) return 0;

    const database = await getDb();

    for (const event of events) {
      try {
        // Marquer comme en cours de sync
        await database.runAsync(
          `UPDATE pending_events SET status = 'syncing' WHERE id = ?`,
          event.id,
        );

        const payload = JSON.parse(event.payload);

        // Appeler la Cloud Function appropriée
        switch (event.action) {
          case "create": {
            const create = httpsCallable(functions, "validateAndCreateEvent");
            await create(payload);
            break;
          }
          case "update": {
            const update = httpsCallable(functions, "validateAndUpdateEvent");
            await update(payload);
            break;
          }
          case "delete": {
            const del = httpsCallable(functions, "deleteEventCascade");
            await del(payload);
            break;
          }
        }

        // Succès : supprimer de la queue
        await database.runAsync(
          `DELETE FROM pending_events WHERE id = ?`,
          event.id,
        );
        synced++;
      } catch (error: any) {
        // Échec : incrémenter le compteur de retry
        const errorMessage =
          error?.message || error?.code || "Erreur inconnue";
        await database.runAsync(
          `UPDATE pending_events SET status = 'failed', retryCount = retryCount + 1, lastError = ? WHERE id = ?`,
          errorMessage,
          event.id,
        );
      }
    }

    const size = await getQueueSize();
    notifyListeners(size);
    return synced;
  } finally {
    isProcessing = false;
  }
}

/**
 * Supprime les événements échoués définitivement (3+ tentatives)
 */
export async function cleanupFailedEvents(): Promise<number> {
  const uid = auth.currentUser?.uid;
  if (!uid) return 0;
  const database = await getDb();
  const result = await database.runAsync(
    `DELETE FROM pending_events WHERE retryCount >= 3 AND uid = ?`,
    uid,
  );
  return result.changes;
}

/**
 * Supprime les événements legacy sans uid (orphelins de la migration)
 */
export async function cleanupOrphanedEvents(): Promise<number> {
  const database = await getDb();
  const result = await database.runAsync(
    `DELETE FROM pending_events WHERE uid = ''`,
  );
  return result.changes;
}

/**
 * Appelé au signOut — stoppe la sync et nettoie les orphelins.
 * Les events avec un uid valide restent pour être rejoués au re-login.
 */
export async function onSignOut(): Promise<void> {
  const uid = auth.currentUser?.uid;
  stopAutoSync();
  await cleanupOrphanedEvents();
  if (uid) {
    const database = await getDb();
    await database.runAsync(
      `DELETE FROM pending_events WHERE retryCount >= 3 AND uid = ?`,
      uid,
    );
  }
  notifyListeners(0);
}

// ============================================
// LISTENERS & AUTO-SYNC
// ============================================

let unsubscribeNetInfo: (() => void) | null = null;

/**
 * S'abonner aux changements de taille de la queue
 */
export function onQueueChange(listener: QueueChangeListener): () => void {
  listeners.add(listener);
  // Envoyer la taille actuelle immédiatement
  getQueueSize().then((size) => listener(size));
  return () => listeners.delete(listener);
}

/**
 * Démarre l'écoute réseau pour sync automatique au retour en ligne
 */
export function startAutoSync(): void {
  if (unsubscribeNetInfo) return;

  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      // Délai court pour laisser le réseau se stabiliser
      setTimeout(() => processQueue(), 1000);
    }
  });
}

/**
 * Arrête l'écoute réseau
 */
export function stopAutoSync(): void {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }
}

/**
 * Vérifie si on est en ligne
 */
export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!state.isConnected;
}
