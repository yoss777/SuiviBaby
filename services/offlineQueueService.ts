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

/**
 * Nombre de tentatives au-delà duquel une écriture est considérée comme
 * définitivement perdue. Ne s'applique QU'AUX erreurs permanentes (payload
 * invalide, permission refusée) — les erreurs d'infrastructure ne consomment
 * pas de tentative, cf. isTransientError.
 */
export const MAX_RETRIES = 3;

/**
 * Erreurs d'infrastructure : le serveur est temporairement indisponible mais
 * l'écriture reste parfaitement valide. Incrémenter retryCount dessus fait
 * perdre des données lors d'une panne prolongée (facturation coupée, cold
 * start Cloud Run, réseau instable) — on réessaie donc indéfiniment.
 *
 * A contrario, une erreur permanente (invalid-argument, permission-denied)
 * échouera identiquement à chaque rejeu : elle consomme une tentative.
 */
function isTransientError(error: any): boolean {
  const code = String(error?.code ?? "").toLowerCase();
  const message = String(error?.message ?? "").toLowerCase();
  const haystack = `${code} ${message}`;

  return (
    haystack.includes("unavailable") ||
    haystack.includes("resource-exhausted") ||
    haystack.includes("deadline-exceeded") ||
    haystack.includes("internal") ||
    haystack.includes("aborted") ||
    haystack.includes("no available instance") ||
    haystack.includes("billing") ||
    haystack.includes("network") ||
    haystack.includes("timeout") ||
    haystack.includes("fetch") ||
    haystack.includes("failed to connect") ||
    haystack.includes("offline")
  );
}

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

    // Une écriture marquée 'syncing' dont le process est mort (app tuée,
    // crash, kill iOS pendant l'appel réseau) restait invisible à jamais :
    // getPendingEvents et getQueueSize ne lisent que 'pending'/'failed'.
    // Au démarrage, plus aucun envoi n'est en vol : on les repasse en
    // 'pending' pour qu'elles soient rejouées.
    await db.runAsync(
      `UPDATE pending_events SET status = 'pending' WHERE status = 'syncing'`,
    );
  }
  return db;
}

// ============================================
// QUEUE OPERATIONS
// ============================================

const listeners: Set<QueueChangeListener> = new Set();
let isProcessing = false;

/** Pause entre deux écritures d'un même cycle, pour lisser la charge. */
const INTER_WRITE_DELAY_MS = 300;

/** Backoff exponentiel (plafonné) entre deux cycles après une panne serveur. */
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;
let consecutiveTransientFailures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Reprogramme un cycle après une erreur d'infrastructure, avec backoff
 * exponentiel + jitter. Sans ça, une entrée transitoire attendrait le prochain
 * changement d'état réseau — qui n'arrive jamais si la connexion n'a pas bougé
 * (cas d'une panne purement serveur).
 */
function scheduleRetry(): void {
  if (retryTimer) return;

  const exponential = Math.min(
    BACKOFF_BASE_MS * 2 ** (consecutiveTransientFailures - 1),
    BACKOFF_MAX_MS,
  );
  // Jitter : évite que tous les clients reviennent en même temps et
  // re-saturent le serveur qui vient à peine de se rétablir.
  const delay = exponential * (0.5 + Math.random() * 0.5);

  retryTimer = setTimeout(() => {
    retryTimer = null;
    void processQueue();
  }, delay);
}

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
    `SELECT * FROM pending_events WHERE status IN ('pending', 'failed') AND retryCount < ${MAX_RETRIES} AND uid = ? ORDER BY createdAt ASC`,
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
  let hitTransient = false;

  try {
    const events = await getPendingEvents();
    if (events.length === 0) return 0;

    const database = await getDb();
    let isFirst = true;

    for (const event of events) {
      // Espacer les envois : une queue rejouée d'un bloc après une panne
      // déclenche des cold starts en cascade sur Cloud Run, qui répond
      // "no available instance" — la rafale crée la panne qu'elle subit.
      if (!isFirst) {
        await new Promise((r) => setTimeout(r, INTER_WRITE_DELAY_MS));
      }
      isFirst = false;

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
        const errorMessage =
          error?.message || error?.code || "Erreur inconnue";
        const transient = isTransientError(error);

        // Erreur d'infrastructure : on repasse en 'pending' SANS consommer de
        // tentative. L'écriture est valide, seul le serveur est indisponible —
        // la perdre après 3 essais serait une perte de données utilisateur.
        await database.runAsync(
          transient
            ? `UPDATE pending_events SET status = 'pending', lastError = ? WHERE id = ?`
            : `UPDATE pending_events SET status = 'failed', retryCount = retryCount + 1, lastError = ? WHERE id = ?`,
          errorMessage,
          event.id,
        );

        // Le serveur est en difficulté : inutile de marteler avec le reste de
        // la queue, on rendra la main et le prochain cycle réessaiera. Sans ça
        // le rejeu en rafale sature Cloud Run et provoque lui-même les
        // "no available instance" qu'il tente de surmonter.
        if (transient) {
          hitTransient = true;
          break;
        }
      }
    }

    const size = await getQueueSize();
    notifyListeners(size);
    return synced;
  } finally {
    isProcessing = false;
    // Hors du try : on veut reprogrammer même si getQueueSize a levé.
    if (hitTransient) {
      consecutiveTransientFailures++;
      scheduleRetry();
    } else {
      consecutiveTransientFailures = 0;
    }
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
 * Réarme les écritures bloquées par un retryCount épuisé et relance un cycle.
 *
 * Sert après une panne d'infrastructure prolongée : avant le passage à
 * isTransientError, chaque échec serveur consommait une tentative, si bien que
 * des écritures parfaitement valides se retrouvaient exclues de la sync
 * (getPendingEvents filtre sur retryCount < MAX_RETRIES) sans jamais être
 * rejouées. Remet le compteur à zéro pour l'utilisateur courant.
 *
 * Retourne le nombre d'écritures réarmées.
 */
export async function retryExhaustedEvents(): Promise<number> {
  const uid = auth.currentUser?.uid;
  if (!uid) return 0;
  const database = await getDb();
  const result = await database.runAsync(
    `UPDATE pending_events SET status = 'pending', retryCount = 0 WHERE retryCount >= ? AND uid = ?`,
    MAX_RETRIES,
    uid,
  );
  if (result.changes > 0) {
    notifyListeners(await getQueueSize());
    void processQueue();
  }
  return result.changes;
}

/**
 * Écritures définitivement abandonnées (tentatives épuisées), pour affichage
 * ou diagnostic. Permet de prévenir l'utilisateur plutôt que de perdre ses
 * données en silence.
 */
export async function getExhaustedEvents(): Promise<QueuedEvent[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) return [];
  const database = await getDb();
  return database.getAllAsync<QueuedEvent>(
    `SELECT * FROM pending_events WHERE retryCount >= ? AND uid = ? ORDER BY createdAt ASC`,
    MAX_RETRIES,
    uid,
  );
}

/**
 * Supprime les événements legacy sans uid (orphelins de la migration) ET
 * les événements trop vieux (>60 jours). B2.4 — ce second nettoyage
 * couvre le cas "compte supprimé côté serveur après 30j de grâce" : au
 * prochain signOut, la queue de l'ancien user est purgée, évitant que
 * le prochain user sur le même device hérite d'écritures fantômes.
 */
export async function cleanupOrphanedEvents(): Promise<number> {
  const database = await getDb();
  const sixtyDaysAgoMs = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const result = await database.runAsync(
    `DELETE FROM pending_events WHERE uid = '' OR createdAt < ?`,
    sixtyDaysAgoMs,
  );
  return result.changes;
}

/**
 * Appelé au signOut — stoppe la sync et nettoie les orphelins.
 * Les events avec un uid valide restent pour être rejoués au re-login.
 */
export async function onSignOut(): Promise<void> {
  stopAutoSync();
  await cleanupOrphanedEvents();
  // Volontairement : on ne purge plus les retryCount >= 3 ici. Une panne
  // serveur prolongée pouvait épuiser le compteur sur des écritures valides,
  // que le signOut supprimait alors définitivement — perte silencieuse de
  // données utilisateur. Elles restent en base pour être rejouées au
  // re-login ; cleanupOrphanedEvents (>60j) reste le filet de sécurité.
  notifyListeners(0);
}

/**
 * B2.4 — Appelé au DELETE d'un compte (pas au signOut).
 * Purge TOUT ce qui reste localement pour cet uid : queue complète,
 * pas seulement les retries épuisés. Le compte est irréversiblement
 * supprimé côté serveur, donc rien ne doit être rejoué.
 *
 * À appeler depuis le flow accountDeletionService AVANT le signOut
 * final pour éviter de tenter de resync au prochain login (potentiel
 * autre user sur le même device).
 */
export async function onAccountDelete(uid: string): Promise<void> {
  stopAutoSync();
  const database = await getDb();
  // Purge TOUS les events de cet uid, peu importe le retryCount.
  await database.runAsync(
    `DELETE FROM pending_events WHERE uid = ?`,
    uid,
  );
  // Nettoie aussi les orphans (uid vide hérité d'anciens flows).
  await cleanupOrphanedEvents();
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
  // Annuler un rejeu programmé : sans ça, un cycle peut se déclencher après
  // le signOut et écrire avec les credentials du user suivant.
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  consecutiveTransientFailures = 0;
}

/**
 * Vérifie si on est en ligne
 */
export async function isOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return !!state.isConnected;
}
