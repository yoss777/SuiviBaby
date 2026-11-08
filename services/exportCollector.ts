// Collecte des données de l'export RGPD. Règles (décisions du 2026-11-08) :
// - rôle relu SUR LE SERVEUR au moment de l'export (jamais l'état de l'écran) ;
// - Parent (owner/admin) : tous les événements de l'enfant ; Proche
//   (contributor/viewer) : seulement ses saisies + ses likes et commentaires ;
// - lectures serveur uniquement : hors ligne ou erreur réseau, l'export échoue
//   entièrement (ExportOfflineError), jamais de fichier partiel ;
// - aucune donnée conservée entre deux exports (pas de cache de module).
import { getAccessDocFromServer } from "@/services/accessRepository";
import { getChildDocFromServer } from "@/services/childRepository";
import {
  countCommentsForExport,
  countEventsForExport,
  countLikesForExport,
  EXPORT_MAX_DOCS,
  getCommentsForExport,
  getEventsForExport,
  getLikesForExport,
} from "@/services/eventsRepository";
import type { ExportRead } from "@/services/eventsRepository";
import { getExportEventTypes } from "@/services/eventTypeSupport";
import { buildChildExportProfile } from "@/services/exportDataHelpers";
import { isOnline } from "@/services/offlineQueueService";
import type { ChildRole } from "@/types/permissions";
import { isNetworkError } from "@/utils/networkError";

export const EXPORT_OFFLINE_MESSAGE = "Connexion requise pour exporter vos données";

export const PENDING_QUEUE_WARNING =
  "Des saisies sont en attente d'envoi : elles ne figureront pas dans l'export. Reconnectez-vous et réessayez.";

export const EXPORT_TRUNCATION_WARNING =
  "Un volume de données dépasse la limite d'export (100 000 éléments par catégorie et par enfant) : l'export sera incomplet.";

/** Connexion indisponible : on ne produit AUCUN fichier. */
export class ExportOfflineError extends Error {
  constructor() {
    super(EXPORT_OFFLINE_MESSAGE);
    this.name = "ExportOfflineError";
  }
}

export interface ExportDoc {
  id: string;
  [key: string]: unknown;
}

export interface ChildExportCounts {
  role: ChildRole | null;
  /** Nombre d'événements par type (déjà restreint aux saisies pour un Proche). */
  events: Record<string, number>;
  likes: number;
  comments: number;
}

export interface ExportSelection {
  eventTypes: string[];
  includeLikes: boolean;
  includeComments: boolean;
}

export interface CollectedChild {
  role: ChildRole | null;
  profile: Record<string, unknown>;
  events: ExportDoc[];
  likes: ExportDoc[];
  comments: ExportDoc[];
  /** Plafond dur atteint sur au moins une collection. */
  truncated: boolean;
}

/** Parent (owner/admin) : exporte tout le suivi de l'enfant. */
export function seesWholeTracking(role: ChildRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** `undefined` pour un Parent (tout le suivi) ; sinon l'uid dont on n'exporte que les saisies. */
export function getExportAuthorUid(role: ChildRole | null, uid: string): string | undefined {
  return seesWholeTracking(role) ? undefined : uid;
}

/** Toute erreur réseau devient ExportOfflineError ; les autres restent telles quelles. */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try {
    if (!(await isOnline())) throw new ExportOfflineError();
    return await work();
  } catch (error) {
    if (error instanceof ExportOfflineError) throw error;
    if (isNetworkError(error)) throw new ExportOfflineError();
    throw error;
  }
}

/** Rôle lu sur le serveur (échoue hors ligne : pas de repli sur un rôle en cache). */
async function fetchRole(childId: string, uid: string): Promise<ChildRole | null> {
  const snap = await getAccessDocFromServer(childId, uid);
  return snap.exists() ? ((snap.data()?.role ?? null) as ChildRole | null) : null;
}

/** Rôle + décomptes serveur (un `count()` par type) pour l'ouverture de l'écran. */
export function loadChildExportCounts(childId: string, uid: string): Promise<ChildExportCounts> {
  return guarded(async () => {
    const role = await fetchRole(childId, uid);
    const authorUid = getExportAuthorUid(role, uid);
    const types = getExportEventTypes();
    const [typeCounts, likes, comments] = await Promise.all([
      Promise.all(types.map((type) => countEventsForExport(childId, { type, authorUid }))),
      countLikesForExport(childId, uid),
      countCommentsForExport(childId, uid),
    ]);
    return {
      role,
      events: Object.fromEntries(types.map((type, i) => [type, typeCounts[i]])),
      likes,
      comments,
    };
  });
}

const toExportDocs = (read: ExportRead): ExportDoc[] =>
  read.docs.map((d) => ({ id: d.id, ...d.data() }));

/** Lit les données d'un enfant pour les types sélectionnés, selon le rôle relu à l'instant. */
export function collectChildExportData(
  childId: string,
  uid: string,
  selection: ExportSelection,
): Promise<CollectedChild> {
  return guarded(async () => {
    const role = await fetchRole(childId, uid);
    const authorUid = getExportAuthorUid(role, uid);
    const allTypes = getExportEventTypes();
    const wanted = allTypes.filter((type) => selection.eventTypes.includes(type));

    const readEvents = async (): Promise<ExportRead[]> => {
      if (wanted.length === 0) return [];
      // Tous les types : une seule lecture ; sinon une lecture ciblée par type.
      if (wanted.length === allTypes.length) return [await getEventsForExport(childId, { authorUid })];
      const reads: ExportRead[] = [];
      for (const type of wanted) reads.push(await getEventsForExport(childId, { authorUid, type }));
      return reads;
    };

    const [eventReads, likesRead, commentsRead, profile] = await Promise.all([
      readEvents(),
      selection.includeLikes ? getLikesForExport(childId, uid) : Promise.resolve(null),
      selection.includeComments ? getCommentsForExport(childId, uid) : Promise.resolve(null),
      readProfile(childId),
    ]);

    // Défense en profondeur : un Proche n'exporte jamais l'événement d'un autre.
    const events = eventReads
      .flatMap(toExportDocs)
      .filter((event) => !authorUid || event.userId === authorUid);

    return {
      role,
      profile,
      events,
      likes: likesRead ? toExportDocs(likesRead) : [],
      comments: commentsRead ? toExportDocs(commentsRead) : [],
      truncated: [...eventReads, likesRead, commentsRead].some((read) => read?.truncated),
    };
  });
}

/** Profil enfant (serveur). Une erreur réseau fait échouer l'export ; les autres (droits) laissent un profil vide. */
async function readProfile(childId: string): Promise<Record<string, unknown>> {
  try {
    const snap = await getChildDocFromServer(childId);
    return buildChildExportProfile(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
  } catch (error) {
    if (isNetworkError(error)) throw error;
    return {};
  }
}

/** Avertissements à confirmer avant l'export (saisies en attente, volume au-delà du plafond). */
export function buildPreExportWarnings(params: {
  selectedChildIds: string[];
  pendingChildIds: Set<string>;
  countsByChild: Record<string, ChildExportCounts | null | undefined>;
}): string[] {
  const warnings: string[] = [];
  if (params.selectedChildIds.some((id) => params.pendingChildIds.has(id))) {
    warnings.push(PENDING_QUEUE_WARNING);
  }
  const tooBig = params.selectedChildIds.some((id) => {
    const counts = params.countsByChild[id];
    if (!counts) return false;
    const events = Object.values(counts.events).reduce((sum, n) => sum + n, 0);
    return events > EXPORT_MAX_DOCS || counts.likes > EXPORT_MAX_DOCS || counts.comments > EXPORT_MAX_DOCS;
  });
  if (tooBig) warnings.push(EXPORT_TRUNCATION_WARNING);
  return warnings;
}
