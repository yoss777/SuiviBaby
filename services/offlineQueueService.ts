// services/offlineQueueService.ts
// Queue de synchronisation offline avec SQLite
import NetInfo from "@react-native-community/netinfo";
import { onAuthStateChanged } from "firebase/auth";
import { httpsCallable } from "@/config/callable";
import { AppState } from "react-native";
import { auth, functions, waitForFirebaseAppCheckReady } from "@/config/firebase";
import * as SQLite from "expo-sqlite";
import { addBreadcrumb, captureServiceError } from "@/utils/errorReporting";
import {
  isConflictError as isConflictCode,
  isNetworkError,
  isNotFoundError,
  isUnauthenticatedError,
} from "@/utils/networkError";
import {
  alreadyRunningNotice,
  notifyOptimisticNotice,
  purgeQueuedOptimistic,
} from "@/services/optimisticEventsStore";

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
  /** Échecs d'infrastructure cumulés (cf. MAX_TRANSIENT_FAILURES). */
  transientFailures?: number;
}

export type QueuedWrite = QueuedEvent;

type QueueChangeListener = (size: number) => void;

/**
 * Nombre de tentatives au-delà duquel une écriture est considérée comme
 * définitivement perdue. Ne s'applique QU'AUX erreurs permanentes (payload
 * invalide, permission refusée) — les erreurs d'infrastructure ne consomment
 * pas de tentative, cf. isTransientError.
 */
export const MAX_RETRIES = 3;

/**
 * Plafond d'échecs d'infrastructure PAR écriture. Sans lui, une écriture qui
 * déclenche toujours une erreur « transitoire » (bug serveur renvoyant
 * `internal`, par exemple) bloquait toute la file derrière elle, pour toujours.
 * Au-delà, elle est mise de côté (visible et réarmable, jamais supprimée) et la
 * file passe à la suivante.
 */
export const MAX_TRANSIENT_FAILURES = 8;

/**
 * Refus `unauthenticated` reportés sans consommer d'essai tant qu'App Check n'a
 * pas de jeton (1.0.28). Au-delà de ce nombre de reports dans le processus, le
 * refus reprend le chemin normal (8 essais, puis « échec » visible) : un appareil
 * qui ne s'atteste jamais ne garde pas ses saisies en attente sans fin.
 */
export const MAX_APP_CHECK_DEFERRALS = 10;
let appCheckDeferrals = 0;

/**
 * Âge maximal d'une création en file. Le serveur évite de ressusciter un
 * événement supprimé grâce à une tombstone `deleted_idem` qui expire (TTL) au
 * bout de 30 jours : une création rejouée plus tard que cela pourrait recréer
 * un événement supprimé entre-temps. On la refuse bien avant (25 jours).
 */
export const MAX_CREATE_AGE_MS = 25 * 24 * 60 * 60 * 1000;

/** Création mise en file depuis trop longtemps (cf. MAX_CREATE_AGE_MS). */
const STALE_CREATE_CODE = "offline-queue/stale-create";
const isStaleCreateError = (error: any) => error?.code === STALE_CREATE_CODE;

/**
 * Conflit de version (`aborted`, verrou optimiste T2.2) : l'écriture a été
 * calculée sur une version périmée, la rejouer échouera toujours. Définitif.
 * Testé sur le CODE : le message « The request was aborted because there was no
 * available instance » est, lui, une panne d'infrastructure.
 */
const isConflictError = isConflictCode;

/**
 * Erreurs d'infrastructure : le serveur est temporairement indisponible mais
 * l'écriture reste parfaitement valide. Incrémenter retryCount dessus fait
 * perdre des données lors d'une panne prolongée (facturation coupée, cold
 * start Cloud Run, réseau instable) — on réessaie donc indéfiniment.
 *
 * A contrario, une erreur permanente (invalid-argument, permission-denied)
 * échouera identiquement à chaque rejeu : elle consomme une tentative.
 *
 * Même définition que les écritures optimistes (utils/networkError) : une
 * erreur ne peut plus être « réseau » pour l'une et « définitive » pour l'autre.
 */
function isTransientError(error: any): boolean {
  return isNetworkError(error);
}

// ============================================
// DATABASE SETUP
// ============================================

/** Publiée UNIQUEMENT une fois l'initialisation terminée. */
let db: SQLite.SQLiteDatabase | null = null;
/** Initialisation partagée : des appels simultanés n'ouvrent/migrent qu'une fois. */
let dbInit: Promise<SQLite.SQLiteDatabase> | null = null;

/** Ajoute la colonne si elle manque (lecture de PRAGMA table_info, pas d'ALTER à l'aveugle). */
async function addColumnIfMissing(
  database: SQLite.SQLiteDatabase,
  existing: Set<string>,
  name: string,
  definition: string,
): Promise<void> {
  if (existing.has(name)) return;
  try {
    await database.execAsync(`ALTER TABLE pending_events ADD COLUMN ${name} ${definition}`);
  } catch (error) {
    // Une exécution concurrente a pu l'ajouter entre-temps : seul cas toléré.
    if (/duplicate column/i.test(String((error as Error)?.message ?? error))) return;
    captureServiceError(error, {
      service: "offlineQueue",
      operation: "migrateColumn",
      extra: { column: name },
    });
    throw error;
  }
}

async function initDb(): Promise<SQLite.SQLiteDatabase> {
  const database = await SQLite.openDatabaseAsync("offlineQueue.db");
  await database.execAsync(`
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
  const columns = new Set(
    (
      (await database.getAllAsync<{ name: string }>(`PRAGMA table_info(pending_events)`)) ?? []
    ).map((c) => c.name),
  );
  // Migration : colonne uid (tables créées avant l'isolation par utilisateur).
  await addColumnIfMissing(database, columns, "uid", `TEXT NOT NULL DEFAULT ''`);
  // Migration S6 : compteur d'échecs d'infrastructure par écriture.
  await addColumnIfMissing(database, columns, "transientFailures", `INTEGER NOT NULL DEFAULT 0`);

  // Une écriture marquée 'syncing' dont le process est mort (app tuée,
  // crash, kill iOS pendant l'appel réseau) restait invisible à jamais :
  // getPendingEvents et getQueueSize ne lisent que 'pending'/'failed'.
  // Au démarrage, plus aucun envoi n'est en vol : on les repasse en
  // 'pending' pour qu'elles soient rejouées.
  await database.runAsync(`UPDATE pending_events SET status = 'pending' WHERE status = 'syncing'`);
  return database;
}

function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return Promise.resolve(db);
  if (!dbInit) {
    dbInit = initDb().then(
      (ready) => {
        db = ready;
        return ready;
      },
      (error) => {
        // Échec : le prochain appel retente, au lieu de garder une base à moitié migrée.
        dbInit = null;
        throw error;
      },
    );
  }
  return dbInit;
}

// ============================================
// QUEUE OPERATIONS
// ============================================

const listeners: Set<QueueChangeListener> = new Set();
const exhaustedListeners: Set<QueueChangeListener> = new Set();
let isProcessing = false;

export type QueueFailureHandler = (info: { count: number; message: string }) => void;
let onQueueFailure: QueueFailureHandler | null = null;

/**
 * Enregistre le rappel appelé quand des écritures deviennent définitivement
 * impossibles à envoyer (pour afficher un message à l'utilisateur).
 */
export function setOnQueueFailure(handler: QueueFailureHandler | null): void {
  onQueueFailure = handler;
}

function failureMessage(count: number): string {
  return count === 1
    ? "Un enregistrement n'a pas pu être envoyé. Touchez la bannière en haut de l'écran pour le réessayer."
    : `${count} enregistrements n'ont pas pu être envoyés. Touchez la bannière en haut de l'écran pour les réessayer.`;
}

/** Pause entre deux écritures d'un même cycle, pour lisser la charge. */
const INTER_WRITE_DELAY_MS = 300;

/** Backoff exponentiel (plafonné) entre deux cycles après une panne serveur. */
const BACKOFF_BASE_MS = 5000;
const BACKOFF_MAX_MS = 5 * 60 * 1000;
let consecutiveTransientFailures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
/** Un déclenchement est arrivé pendant un cycle : il ne doit pas être perdu. */
let rerunRequested = false;

/** Délai avant le rejeu qui suit un enfilement (laisse le réseau/serveur souffler). */
const ENQUEUE_RETRY_DELAY_MS = 3000;

const APP_CHECK_WAIT_MS = 5000;
const SESSION_CHECK_TIMEOUT_MS = 6000;
let appCheckReady = false;

/**
 * Au démarrage, la file peut repartir avant l'initialisation d'App Check.
 * Attente bornée, reprise au cycle suivant tant qu'il n'est pas prêt : un échec
 * n'empêche jamais le rejeu.
 */
async function waitForAppCheck(): Promise<void> {
  if (appCheckReady) return;
  try {
    // Prêt seulement si App Check est initialisé et le premier jeton obtenu : un
    // échec d'initialisation n'est plus pris pour un succès.
    appCheckReady = await waitForFirebaseAppCheckReady(APP_CHECK_WAIT_MS);
  } catch {
    // App Check signale lui-même ses échecs.
  }
}

/**
 * Après un refus `unauthenticated` : session encore valide (la cause est alors
 * App Check, on rejouera) ou morte (l'écriture suit le chemin des refus définitifs,
 * pour ne pas bloquer la file). Une coupure réseau ne prouve pas une session morte.
 */
async function isSessionAlive(uid: string): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      auth.currentUser?.getIdToken(true),
      // Sans réponse : réseau dégradé, ce n'est pas la preuve d'une session morte.
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, SESSION_CHECK_TIMEOUT_MS);
      }),
    ]);
    return auth.currentUser?.uid === uid;
  } catch (error) {
    return isNetworkError(error);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Lance un cycle sans jamais laisser une erreur remonter en rejet non géré. */
function runCycle(): void {
  processQueue().catch((error) =>
    captureServiceError(error, { service: "offlineQueue", operation: "runCycle" }),
  );
}

/**
 * Programme un cycle dans un instant. Sans ça, une écriture enfilée après une
 * erreur serveur passagère (réseau pourtant connecté) restait en attente
 * jusqu'au prochain changement d'état réseau, qui peut ne jamais venir.
 */
function scheduleSoon(delayMs: number = ENQUEUE_RETRY_DELAY_MS): void {
  if (retryTimer) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    runCycle();
  }, delayMs);
}

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
    runCycle();
  }, delay);
}

function notifyListeners(size: number) {
  listeners.forEach((listener) => listener(size));
}

/**
 * Publie les deux compteurs, qui ne se recouvrent jamais : écritures en
 * attente d'envoi (encore rejouées) et écritures abandonnées (à réessayer ou
 * supprimer par l'utilisateur).
 */
async function emitState(): Promise<void> {
  // Ne lève jamais : la ligne est déjà en base quand on arrive ici, un échec de
  // simple notification ne doit pas faire croire à l'appelant que l'écriture
  // n'a pas été enregistrée.
  try {
    notifyListeners(await getWaitingCount());
    const exhausted = await getExhaustedCount();
    exhaustedListeners.forEach((listener) => listener(exhausted));
  } catch (error) {
    captureServiceError(error, { service: "offlineQueue", operation: "emitState" });
  }
}

/**
 * Ajoute un événement à la queue offline, scopé par uid
 */
export async function enqueueEvent(
  action: QueueAction,
  payload: Record<string, unknown>,
  /** Compte qui a fait la saisie : jamais rangée sous un autre compte. */
  expectedUid?: string,
): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error("Cannot enqueue event: no authenticated user");
  }
  if (expectedUid && uid !== expectedUid) {
    throw new Error("Cannot enqueue event: account changed");
  }

  const database = await getDb();
  const id = `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  // Toute création porte une clé d'idempotence : le rejeu ne peut pas doubler.
  if (action === "create" && !payload.idempotencyKey) {
    payload = { ...payload, idempotencyKey: id };
  }

  await database.runAsync(
    `INSERT INTO pending_events (id, uid, action, payload, status, retryCount, createdAt)
     VALUES (?, ?, ?, ?, 'pending', 0, ?)`,
    id,
    uid,
    action,
    JSON.stringify(payload),
    Date.now(),
  );

  await emitState();
  // Rien d'autre ne relance la file après un enfilement « en ligne » (erreur
  // serveur passagère) : on programme le rejeu nous-mêmes.
  scheduleSoon();

  return id;
}

/**
 * Modification d'un événement créé hors ligne et encore en file (sieste
 * démarrée puis arrêtée sans réseau) : fusionnée dans la création, qui part
 * alors complète. Une valeur `null` retire le champ (annulation d'un arrêt).
 * Faux si la création n'est plus en attente (déjà en cours d'envoi ou
 * partie) : l'appelant doit le signaler.
 */
/** Champs modifiés après la mise en file d'une création (jamais envoyés tels quels). */
const MERGED_KEY = "__mergedAfterQueue";

export async function mergeIntoQueuedCreate(
  queueId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const uid = auth.currentUser?.uid;
  if (!uid) return false;
  const database = await getDb();
  const row = await database.getFirstAsync<{ payload: string }>(
    `SELECT payload FROM pending_events WHERE id = ? AND uid = ? AND action = 'create' AND status IN ('pending', 'failed')`,
    queueId,
    uid,
  );
  if (!row) return false;
  const merged: Record<string, unknown> = { ...JSON.parse(row.payload) };
  for (const [k, v] of Object.entries(patch)) {
    if (k === MERGED_KEY) continue;
    if (v === null) delete merged[k];
    else merged[k] = v;
  }
  // Gardé à part : si la création était déjà arrivée au serveur (réponse
  // perdue), le rejeu renvoie l'événement existant sans rien appliquer ; ces
  // champs partent alors en modification juste après.
  merged[MERGED_KEY] = { ...((merged[MERGED_KEY] as Record<string, unknown>) ?? {}), ...patch };
  const result = await database.runAsync(
    `UPDATE pending_events SET payload = ? WHERE id = ? AND uid = ? AND status IN ('pending', 'failed')`,
    JSON.stringify(merged),
    queueId,
    uid,
  );
  return (result?.changes ?? 0) > 0;
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
 * Écritures encore rejouées (tentatives non épuisées). Distinct de
 * getQueueSize, qui compte aussi les écritures abandonnées.
 */
export async function getWaitingCount(): Promise<number> {
  const uid = auth.currentUser?.uid;
  if (!uid) return 0;
  const database = await getDb();
  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM pending_events WHERE status IN ('pending', 'failed') AND retryCount < ${MAX_RETRIES} AND uid = ?`,
    uid,
  );
  return result?.count ?? 0;
}

/** Écritures abandonnées (tentatives épuisées) de l'utilisateur courant. */
export async function getExhaustedCount(): Promise<number> {
  const uid = auth.currentUser?.uid;
  if (!uid) return 0;
  const database = await getDb();
  const result = await database.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count FROM pending_events WHERE retryCount >= ${MAX_RETRIES} AND uid = ?`,
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
 * Identifiants des enfants ayant des écritures pas encore synchronisées
 * (en attente, en échec ou abandonnées) pour l'utilisateur courant. Sert à
 * prévenir qu'un export ne les contiendra pas. Charge illisible : ignorée.
 */
export async function getPendingChildIds(): Promise<Set<string>> {
  const uid = auth.currentUser?.uid;
  const childIds = new Set<string>();
  if (!uid) return childIds;
  const database = await getDb();
  const rows = await database.getAllAsync<{ payload: string }>(
    `SELECT payload FROM pending_events WHERE status IN ('pending', 'failed', 'syncing') AND uid = ?`,
    uid,
  );
  for (const row of rows) {
    const childId = safeParse(row.payload)?.childId;
    if (typeof childId === "string" && childId) childIds.add(childId);
  }
  return childIds;
}

function safeParse(payload: string): any {
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/** Remet une ligne bloquée 'syncing' en 'pending' (au mieux : signale si même cela échoue). */
async function restorePending(database: SQLite.SQLiteDatabase, id: string): Promise<void> {
  try {
    await database.runAsync(
      `UPDATE pending_events SET status = 'pending' WHERE id = ? AND status = 'syncing'`,
      id,
    );
  } catch (error) {
    captureServiceError(error, { service: "offlineQueue", operation: "restorePending" });
  }
}

/**
 * Traite la queue — envoie les événements en attente au serveur
 */
export async function processQueue(): Promise<number> {
  if (isProcessing) {
    rerunRequested = true;
    return 0;
  }
  // Pris AVANT l'attente réseau : au démarrage, NetInfo, la connexion et le
  // retour au premier plan lançaient deux cycles sur la même liste (une
  // modification rejouée deux fois sortait en faux conflit).
  isProcessing = true;

  let networkState;
  try {
    networkState = await NetInfo.fetch();
  } catch {
    networkState = { isConnected: false };
  }
  if (!networkState.isConnected) {
    isProcessing = false;
    return 0;
  }

  let synced = 0;
  let hitTransient = false;

  try {
    const events = await getPendingEvents();
    if (events.length === 0) return 0;

    await waitForAppCheck();
    const database = await getDb();
    let isFirst = true;

    let newlyExhausted = 0;

    for (const event of events) {
      // Espacer les envois : une queue rejouée d'un bloc après une panne
      // déclenche des cold starts en cascade sur Cloud Run, qui répond
      // "no available instance" — la rafale crée la panne qu'elle subit.
      if (!isFirst) {
        await new Promise((r) => setTimeout(r, INTER_WRITE_DELAY_MS));
      }
      isFirst = false;

      // Compte changé pendant le cycle (déconnexion, autre parent connecté) :
      // on s'arrête. Rien n'est envoyé sous l'identité d'un autre, et rien
      // n'est compté comme échec ; la file reprendra au retour de ce compte.
      if (auth.currentUser?.uid !== event.uid) break;

      // Marquer comme en cours de sync. Si même cette écriture en base échoue,
      // rien n'est parti : la ligne reste 'pending', on rend la main.
      try {
        await database.runAsync(
          `UPDATE pending_events SET status = 'syncing' WHERE id = ?`,
          event.id,
        );
      } catch (dbError) {
        captureServiceError(dbError, { service: "offlineQueue", operation: "markSyncing" });
        hitTransient = true;
        break;
      }

      let sendError: any = null;
      try {
        // Relu après le passage en « syncing » : une modification fusionnée
        // entre la lecture de la liste et ici (mergeIntoQueuedCreate) part aussi.
        const current = await database.getFirstAsync<{ payload: string }>(
          `SELECT payload FROM pending_events WHERE id = ?`,
          event.id,
        );
        const payload = JSON.parse(current?.payload ?? event.payload);

        // Appeler la Cloud Function appropriée
        switch (event.action) {
          case "create": {
            // Trop ancienne : refusée avant tout envoi (tombstone expirée côté serveur).
            if (Date.now() - event.createdAt > MAX_CREATE_AGE_MS) {
              throw Object.assign(
                new Error(
                  "Enregistrement trop ancien (plus de 25 jours) : il n'est plus envoyé pour ne pas recréer un événement supprimé entre-temps.",
                ),
                { code: STALE_CREATE_CODE },
              );
            }
            // Écriture mise en file par une ancienne version (1.0.8) sans clé :
            // l'identifiant de la ligne, stable d'un rejeu à l'autre, en tient lieu.
            if (!payload.idempotencyKey) payload.idempotencyKey = event.id;
            const { [MERGED_KEY]: mergedAfter, ...createPayload } = payload;
            const create = httpsCallable<Record<string, unknown>, { id: string; alreadyRunning?: boolean }>(
              functions,
              "validateAndCreateEvent",
            );
            const created = await create(createPayload);
            // Sieste/balade déjà en cours (lancée ailleurs pendant qu'on était
            // hors ligne) : rien de créé, l'entrée affichée en attente est retirée.
            if (created?.data?.alreadyRunning) {
              purgeQueuedOptimistic({ action: "create", idempotencyKey: payload.idempotencyKey as string });
              // Jamais silencieux : la saisie faite hors ligne n'a pas été ajoutée.
              notifyOptimisticNotice(alreadyRunningNotice(payload.type));
            } else if (mergedAfter && typeof mergedAfter === "object" && created?.data?.id) {
              // Modifications faites hors ligne après la mise en file : renvoyées
              // sur l'événement créé. Sans effet si la création les portait déjà ;
              // indispensables si elle existait (réponse perdue, rejeu). Un échec
              // repasse la ligne en file : création rejouée (même id), puis ceci.
              const update = httpsCallable(functions, "validateAndUpdateEvent");
              await update({ ...(mergedAfter as Record<string, unknown>), childId: payload.childId, eventId: created.data.id });
            }
            break;
          }
          case "update": {
            const update = httpsCallable(functions, "validateAndUpdateEvent");
            await update(payload);
            break;
          }
          case "delete": {
            const del = httpsCallable(functions, "deleteEventCascade");
            try {
              await del(payload);
            } catch (error) {
              // Suppression idempotente : « introuvable » = déjà supprimé
              // (un envoi précédent a abouti, sa réponse s'est perdue).
              if (!isNotFoundError(error)) throw error;
            }
            break;
          }
        }
      } catch (error) {
        sendError = error;
      }

      if (!sendError) {
        // Succès : supprimer de la queue. Si ce retrait échoue, l'écriture est
        // partie mais la ligne resterait 'syncing' (donc invisible) : on la
        // remet en 'pending', le rejeu est sans danger (clé d'idempotence,
        // suppression idempotente).
        try {
          await database.runAsync(`DELETE FROM pending_events WHERE id = ?`, event.id);
          synced++;
        } catch (dbError) {
          captureServiceError(dbError, { service: "offlineQueue", operation: "removeSynced" });
          await restorePending(database, event.id);
        }
        continue;
      }

      // Refus « non authentifié » parce que le compte a changé pendant l'envoi :
      // pas un échec de cette écriture (ni tentative consommée, ni bannière).
      if (auth.currentUser?.uid !== event.uid) {
        await restorePending(database, event.id);
        break;
      }

      // Refus pendant qu'App Check n'a pas encore de jeton (démarrage, attestation
      // indisponible) : l'écriture attend le cycle suivant sans consommer d'essai,
      // pour ne pas épuiser ses 8 essais avant que l'attestation revienne.
      if (
        !appCheckReady &&
        appCheckDeferrals < MAX_APP_CHECK_DEFERRALS &&
        isUnauthenticatedError(sendError) &&
        (await isSessionAlive(event.uid))
      ) {
        appCheckDeferrals += 1;
        addBreadcrumb("offlineQueue", "rejeu reporté : App Check sans jeton", { deferrals: appCheckDeferrals }, "warning");
        if (appCheckDeferrals === 1) {
          captureServiceError(new Error("Rejeu reporté : App Check sans jeton"), {
            service: "offlineQueue",
            operation: "appCheckDeferral",
          });
        }
        await restorePending(database, event.id);
        hitTransient = true; // nouveau cycle avec backoff (5 s à 5 min)
        break;
      }

      {
        const error: any = sendError;
        const errorMessage =
          error?.message || error?.code || "Erreur inconnue";
        const conflict = isConflictError(error);
        const stale = isStaleCreateError(error);
        // `unauthenticated` ici : le compte est bien celui de l'écriture (vérifié
        // plus haut), le refus peut donc venir d'un jeton App Check manquant.
        const transient =
          !stale &&
          (isTransientError(error) || (isUnauthenticatedError(error) && (await isSessionAlive(event.uid))));
        let exhausted = false;
        let reason: "conflict" | "permanent" | "transient-cap" | "stale" = "permanent";

        try {
        if (stale) {
          // Définitif tout de suite : rejouer ne changerait rien. Visible comme
          // les autres écritures épuisées, avec la raison dans lastError.
          exhausted = true;
          reason = "stale";
          await database.runAsync(
            `UPDATE pending_events SET status = 'failed', retryCount = ?, lastError = ? WHERE id = ?`,
            MAX_RETRIES,
            errorMessage,
            event.id,
          );
        } else if (conflict) {
          // Conflit de version : définitif tout de suite, inutile de réessayer.
          exhausted = true;
          reason = "conflict";
          await database.runAsync(
            `UPDATE pending_events SET status = 'failed', retryCount = ?, lastError = ? WHERE id = ?`,
            MAX_RETRIES,
            errorMessage,
            event.id,
          );
        } else if (transient) {
          // Erreur d'infrastructure : on repasse en 'pending' SANS consommer de
          // tentative. L'écriture est valide, seul le serveur est indisponible —
          // la perdre après 3 essais serait une perte de données utilisateur.
          const failures = (event.transientFailures ?? 0) + 1;
          if (failures >= MAX_TRANSIENT_FAILURES) {
            // Plafond atteint : on la met de côté (visible, réarmable) pour ne
            // plus bloquer la file derrière elle.
            exhausted = true;
            reason = "transient-cap";
            await database.runAsync(
              `UPDATE pending_events SET status = 'failed', retryCount = ?, transientFailures = ?, lastError = ? WHERE id = ?`,
              MAX_RETRIES,
              failures,
              errorMessage,
              event.id,
            );
          } else {
            await database.runAsync(
              `UPDATE pending_events SET status = 'pending', transientFailures = transientFailures + 1, lastError = ? WHERE id = ?`,
              errorMessage,
              event.id,
            );
          }
        } else {
          exhausted = (event.retryCount ?? 0) + 1 >= MAX_RETRIES;
          await database.runAsync(
            `UPDATE pending_events SET status = 'failed', retryCount = retryCount + 1, lastError = ? WHERE id = ?`,
            errorMessage,
            event.id,
          );
        }
        } catch (dbError) {
          // Le statut n'a pas pu être écrit : sans filet la ligne resterait
          // 'syncing', donc invisible pour toujours.
          captureServiceError(dbError, { service: "offlineQueue", operation: "processQueue" });
          await restorePending(database, event.id);
          if (transient) {
            hitTransient = true;
            break;
          }
          continue;
        }

        if (exhausted) {
          newlyExhausted++;
          const parsed = safeParse(event.payload);
          // L'écran ne doit plus montrer cette saisie comme enregistrée.
          purgeQueuedOptimistic({
            action: event.action,
            idempotencyKey:
              parsed?.idempotencyKey ?? (event.action === "create" ? event.id : undefined),
            eventId: parsed?.eventId,
          });
          // Photos déjà téléversées d'une écriture abandonnée : non supprimées
          // ici (« Réessayer » peut la réarmer, la photo serait alors perdue).
          // On les signale pour en mesurer l'ampleur, sans le chemin.
          const orphanPhotos = Array.isArray(parsed?.photos) ? parsed.photos.length : 0;
          // Plus rejouée : on le dit à Sentry (sans la charge utile, qui est
          // une donnée de santé) et, plus bas, à l'utilisateur.
          captureServiceError(error, {
            service: "offlineQueue",
            operation: "processQueue",
            extra: {
              action: event.action,
              reason,
              code: String(error?.code ?? ""),
              retryCount: event.retryCount ?? 0,
              ...(orphanPhotos > 0 ? { orphanPhotos } : {}),
            },
          });
        }

        // Le serveur est en difficulté : inutile de marteler avec le reste de
        // la queue, on rendra la main et le prochain cycle réessaiera. Sans ça
        // le rejeu en rafale sature Cloud Run et provoque lui-même les
        // "no available instance" qu'il tente de surmonter. Une écriture mise
        // de côté (plafond) ne compte pas : on passe à la suivante.
        if (transient && !exhausted) {
          hitTransient = true;
          break;
        }
      }
    }

    await emitState();
    if (newlyExhausted > 0) {
      try {
        onQueueFailure?.({ count: newlyExhausted, message: failureMessage(newlyExhausted) });
      } catch (error) {
        captureServiceError(error, { service: "offlineQueue", operation: "onQueueFailure" });
      }
    }
    return synced;
  } finally {
    isProcessing = false;
    // Un déclenchement est arrivé pendant ce cycle (ex. écriture enfilée) : un
    // cycle de plus, sans quoi elle attendrait le prochain événement externe.
    if (rerunRequested) {
      rerunRequested = false;
      if (!hitTransient) scheduleSoon();
    }
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
    `DELETE FROM pending_events WHERE retryCount >= ? AND uid = ?`,
    MAX_RETRIES,
    uid,
  );
  if (result.changes > 0) await emitState();
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
    `UPDATE pending_events SET status = 'pending', retryCount = 0, transientFailures = 0 WHERE retryCount >= ? AND uid = ?`,
    MAX_RETRIES,
    uid,
  );
  if (result.changes > 0) {
    await emitState();
    runCycle();
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
  exhaustedListeners.forEach((listener) => listener(0));
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
  exhaustedListeners.forEach((listener) => listener(0));
}

// ============================================
// LISTENERS & AUTO-SYNC
// ============================================

let unsubscribeNetInfo: (() => void) | null = null;
let unsubscribeAuth: (() => void) | null = null;
let appStateSubscription: { remove: () => void } | null = null;

/**
 * S'abonner aux changements de taille de la queue
 */
export function onQueueChange(listener: QueueChangeListener): () => void {
  listeners.add(listener);
  // Envoyer la taille actuelle immédiatement (écritures encore en attente)
  getWaitingCount()
    .then((size) => listener(size))
    .catch((error) =>
      captureServiceError(error, { service: "offlineQueue", operation: "onQueueChange" }),
    );
  return () => listeners.delete(listener);
}

/**
 * S'abonner au nombre d'écritures abandonnées (à réessayer ou supprimer).
 */
export function onExhaustedChange(listener: QueueChangeListener): () => void {
  exhaustedListeners.add(listener);
  getExhaustedCount()
    .then((count) => listener(count))
    .catch((error) =>
      captureServiceError(error, { service: "offlineQueue", operation: "onExhaustedChange" }),
    );
  return () => exhaustedListeners.delete(listener);
}

/**
 * Démarre l'écoute réseau pour sync automatique au retour en ligne
 */
export function startAutoSync(): void {
  if (unsubscribeNetInfo) return;

  unsubscribeNetInfo = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      // Délai court pour laisser le réseau se stabiliser
      setTimeout(runCycle, 1000);
    }
  });

  // Démarrage à froid : startAutoSync tourne avant la restauration de la
  // session, et l'appel suivant (AuthContext) est sans effet. Sans cette
  // écoute, la file d'une session précédente attendait un changement réseau.
  // Firebase rappelle aussi l'écoute immédiatement si l'utilisateur est connu.
  const stopAuth = onAuthStateChanged(auth, (user) => {
    if (user) runCycle();
  });
  unsubscribeAuth = typeof stopAuth === "function" ? stopAuth : null;

  // Retour au premier plan : un rejeu programmé a pu être gelé avec l'app.
  appStateSubscription = AppState.addEventListener("change", (state) => {
    if (state === "active") runCycle();
  });
}

/**
 * Supprime, parmi les écritures abandonnées de l'utilisateur courant, celles
 * dont l'identifiant est donné — et elles seules. Contrairement à
 * cleanupFailedEvents, une écriture devenue « abandonnée » entre-temps (non
 * affichée à l'utilisateur) n'est jamais supprimée sans qu'il l'ait vue.
 */
export async function deleteExhaustedEventsByIds(ids: string[]): Promise<number> {
  const uid = auth.currentUser?.uid;
  if (!uid || ids.length === 0) return 0;
  const database = await getDb();
  let deleted = 0;
  // Limite SQLite de variables : par paquets.
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const result = await database.runAsync(
      `DELETE FROM pending_events WHERE uid = ? AND retryCount >= ? AND id IN (${chunk.map(() => "?").join(",")})`,
      uid,
      MAX_RETRIES,
      ...chunk,
    );
    deleted += result.changes;
  }
  if (deleted > 0) await emitState();
  return deleted;
}

/**
 * Arrête l'écoute réseau
 */
export function stopAutoSync(): void {
  if (unsubscribeNetInfo) {
    unsubscribeNetInfo();
    unsubscribeNetInfo = null;
  }
  unsubscribeAuth?.();
  unsubscribeAuth = null;
  appStateSubscription?.remove();
  appStateSubscription = null;
  rerunRequested = false;
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
