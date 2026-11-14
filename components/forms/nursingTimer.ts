// components/forms/nursingTimer.ts
// Chrono de tétée indépendant de la feuille : l'état repose sur des horodatages
// (pas sur un compteur incrémenté par setInterval), il est persisté par enfant
// et la feuille le reprend à sa réouverture. Fermer la feuille, changer
// d'onglet ou relancer l'app ne fait plus perdre le minutage.
import AsyncStorage from "@react-native-async-storage/async-storage";

export type NursingSide = "left" | "right";

export interface NursingTimerState {
  /** Secondes déjà comptées (hors segment en cours). */
  leftSeconds: number;
  rightSeconds: number;
  /** Côté en cours, ou null en pause. */
  runningSide: NursingSide | null;
  /** Début du segment en cours (ms epoch), null en pause. */
  runningSince: number | null;
  /** Premier démarrage du chrono (ms epoch) : heure proposée pour la tétée. */
  startedAt: number | null;
  /** Dernière modification (ms epoch) : sert à écarter un brouillon oublié. */
  updatedAt: number;
}

export const EMPTY_NURSING_TIMER: NursingTimerState = {
  leftSeconds: 0,
  rightSeconds: 0,
  runningSide: null,
  runningSince: null,
  startedAt: null,
  updatedAt: 0,
};

/**
 * Expiration d'un brouillon oublié : un chrono en pause depuis plus d'1 h, ou
 * en marche sans aucune action depuis plus de 3 h (aucune tétée ne dure 3 h
 * d'affilée), n'est plus proposé et s'efface.
 */
// Même règle que le serveur (widget temps réel) : module partagé.
export {
  NURSING_PAUSED_TTL_MS as PAUSED_DRAFT_TTL_MS,
  NURSING_RUNNING_TTL_MS as RUNNING_DRAFT_TTL_MS,
} from "@/functions/shared/widget";
import { NURSING_PAUSED_TTL_MS as PAUSED_DRAFT_TTL_MS, NURSING_RUNNING_TTL_MS as RUNNING_DRAFT_TTL_MS } from "@/functions/shared/widget";

function runningExtra(state: NursingTimerState, side: NursingSide, now: number): number {
  if (state.runningSide !== side || state.runningSince == null) return 0;
  return Math.max(0, Math.floor((now - state.runningSince) / 1000));
}

/** Secondes affichées pour un côté (segment en cours compris). */
export function sideSeconds(state: NursingTimerState, side: NursingSide, now: number): number {
  const base = side === "left" ? state.leftSeconds : state.rightSeconds;
  return base + runningExtra(state, side, now);
}

/** Fige le segment en cours dans les compteurs (sans changer le côté actif). */
function commitRunning(state: NursingTimerState, now: number): NursingTimerState {
  if (!state.runningSide || state.runningSince == null) return state;
  return {
    ...state,
    leftSeconds: sideSeconds(state, "left", now),
    rightSeconds: sideSeconds(state, "right", now),
    runningSince: null,
  };
}

/** Lecture / pause d'un côté. Démarrer un côté met l'autre en pause. */
export function toggleSide(
  state: NursingTimerState,
  side: NursingSide,
  now: number,
): NursingTimerState {
  const committed = commitRunning(state, now);
  if (state.runningSide === side) {
    return { ...committed, runningSide: null, runningSince: null, updatedAt: now };
  }
  return {
    ...committed,
    runningSide: side,
    runningSince: now,
    startedAt: committed.startedAt ?? now,
    updatedAt: now,
  };
}

/** Remise à zéro d'un côté (le met en pause s'il tournait). */
export function resetSide(
  state: NursingTimerState,
  side: NursingSide,
  now: number,
): NursingTimerState {
  const committed = commitRunning(state, now);
  const keepRunning = state.runningSide && state.runningSide !== side;
  const next: NursingTimerState = {
    ...committed,
    leftSeconds: side === "left" ? 0 : committed.leftSeconds,
    rightSeconds: side === "right" ? 0 : committed.rightSeconds,
    runningSide: keepRunning ? state.runningSide : null,
    runningSince: keepRunning ? now : null,
    updatedAt: now,
  };
  if (!hasNursingProgress(next)) return { ...next, startedAt: null };
  return next;
}

/** Ajustement manuel (édition) : ±delta secondes, jamais négatif. */
export function adjustSide(
  state: NursingTimerState,
  side: NursingSide,
  deltaSeconds: number,
  now: number,
): NursingTimerState {
  const committed = commitRunning(state, now);
  const key = side === "left" ? "leftSeconds" : "rightSeconds";
  return {
    ...committed,
    [key]: Math.max(0, committed[key] + deltaSeconds),
    runningSince: committed.runningSide ? now : null,
    updatedAt: now,
  };
}

/** Le chrono contient quelque chose (temps compté ou côté en cours). */
export function hasNursingProgress(state: NursingTimerState): boolean {
  return state.leftSeconds > 0 || state.rightSeconds > 0 || state.runningSide !== null;
}

/** Heure (ms epoch) à laquelle le brouillon sera écarté s'il n'est pas repris. */
export function nursingDraftExpiresAt(state: NursingTimerState): number {
  return state.updatedAt + (state.runningSide ? RUNNING_DRAFT_TTL_MS : PAUSED_DRAFT_TTL_MS);
}

export function isNursingDraftStale(state: NursingTimerState, now: number): boolean {
  const ttl = state.runningSide ? RUNNING_DRAFT_TTL_MS : PAUSED_DRAFT_TTL_MS;
  return now - state.updatedAt > ttl;
}

/** Temps total compté (deux côtés, segment en cours compris). */
export function totalNursingSeconds(state: NursingTimerState, now: number): number {
  return sideSeconds(state, "left", now) + sideSeconds(state, "right", now);
}

/**
 * Que faire d'un brouillon de tétée trouvé à l'ouverture de la feuille Repas ?
 * - "resume" : la feuille est sur Tétée : on reprend le chrono ;
 * - "offer" : elle est ouverte pour un biberon ou un solide : on garde ce type
 *   et on propose la reprise dans un bandeau, sans rien imposer ;
 * - "none" : rien à reprendre (pas de brouillon, édition, chrono déjà lancé).
 */
export function resolveNursingDraftOnOpen(opts: {
  draft: NursingTimerState | null;
  currentType: string;
  isEditing: boolean;
  formHasProgress: boolean;
}): "resume" | "offer" | "none" {
  if (opts.isEditing || !opts.draft || opts.formHasProgress) return "none";
  if (!hasNursingProgress(opts.draft)) return "none";
  return opts.currentType === "tetee" ? "resume" : "offer";
}

/**
 * Heure proposée pour le repas saisi. L'heure de début du chrono n'est
 * utilisée que pour une tétée, et seulement si l'heure n'a pas été choisie à
 * la main : un biberon ou un solide garde toujours sa propre heure.
 */
export function proposedMealDate(opts: {
  mealType: string;
  timer: NursingTimerState;
  dateTouched: boolean;
  fallback: Date;
}): Date {
  if (opts.mealType === "tetee" && !opts.dateTouched && opts.timer.startedAt != null) {
    return new Date(opts.timer.startedAt);
  }
  return opts.fallback;
}

/** Durée lisible : « moins d'1 min », « 12 min », « 1 h 05 » (espaces insécables). */
export function formatNursingMinutes(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  if (minutes < 1) return "moins d'1 min";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} h ${m.toString().padStart(2, "0")}`;
}

/** Libellé du bandeau : « Tétée en cours (12 min) » ou « Tétée en pause (12 min) ». */
export function nursingDraftLabel(state: NursingTimerState, now: number): string {
  const status = state.runningSide ? "en cours" : "en pause";
  return `Tétée ${status} (${formatNursingMinutes(totalNursingSeconds(state, now))})`;
}

// ============================================
// PERSISTANCE (par enfant)
// ============================================
// Le brouillon vit à deux endroits :
// - AsyncStorage, sur ce téléphone : cache hors ligne, lu sans réseau ;
// - un document partagé du foyer (adaptateur « remote », Firestore
//   children/{childId}/live/nursing) : la tétée en cours est une donnée en
//   cours comme le sommeil ou la promenade, visible de tous les aidants.
// Une tétée terminée ou abandonnée laisse un état vide horodaté (« pierre
// tombale ») : un autre appareil sait ainsi que son brouillon local est dépassé.
// En cas de conflit, l'état le plus récent (updatedAt) l'emporte.

const STORAGE_PREFIX = "@suivibaby_nursing_timer:";
export const nursingTimerStorageKey = (childId: string) => `${STORAGE_PREFIX}${childId}`;

export function isValidNursingState(value: unknown): value is NursingTimerState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  const isNum = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const isNumOrNull = (x: unknown) => x === null || isNum(x);
  return (
    isNum(v.leftSeconds) &&
    isNum(v.rightSeconds) &&
    (v.runningSide === null || v.runningSide === "left" || v.runningSide === "right") &&
    isNumOrNull(v.runningSince) &&
    isNumOrNull(v.startedAt) &&
    isNum(v.updatedAt)
  );
}

/** Ne garde que les champs du chrono (le document partagé en porte d'autres). */
export function toNursingState(value: NursingTimerState): NursingTimerState {
  return {
    leftSeconds: value.leftSeconds,
    rightSeconds: value.rightSeconds,
    runningSide: value.runningSide,
    runningSince: value.runningSince,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
  };
}

/** Accès au document partagé du foyer (branché au démarrage de l'app). */
export interface NursingTimerRemote {
  read(childId: string): Promise<NursingTimerState | null>;
  write(childId: string, state: NursingTimerState): Promise<void>;
  subscribe(childId: string, onChange: (state: NursingTimerState | null) => void): () => void;
}

let remote: NursingTimerRemote | null = null;

export function setNursingTimerRemote(adapter: NursingTimerRemote | null): void {
  remote = adapter;
}

/** Délai maximal d'attente du document partagé : hors ligne, le local suffit. */
export const REMOTE_READ_TIMEOUT_MS = 1500;

/** L'état le plus récent des deux (une pierre tombale compte comme un état). */
export function pickNewerNursingState(
  local: NursingTimerState | null,
  shared: NursingTimerState | null,
): NursingTimerState | null {
  if (!local) return shared;
  if (!shared) return local;
  return shared.updatedAt > local.updatedAt ? shared : local;
}

/** Brouillon utilisable : il contient du temps et n'est pas périmé. */
function usableDraft(state: NursingTimerState | null, now: number): NursingTimerState | null {
  if (!state || !hasNursingProgress(state) || isNursingDraftStale(state, now)) return null;
  return state;
}

async function readLocal(childId: string): Promise<NursingTimerState | null> {
  try {
    const raw = await AsyncStorage.getItem(nursingTimerStorageKey(childId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isValidNursingState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeLocal(childId: string, state: NursingTimerState | null): Promise<void> {
  try {
    if (!state || !hasNursingProgress(state)) {
      await AsyncStorage.removeItem(nursingTimerStorageKey(childId));
      return;
    }
    await AsyncStorage.setItem(nursingTimerStorageKey(childId), JSON.stringify(toNursingState(state)));
  } catch {
    // Stockage indisponible : le chrono continue en mémoire.
  }
}

async function readRemote(childId: string): Promise<NursingTimerState | null> {
  if (!remote) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      remote.read(childId),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), REMOTE_READ_TIMEOUT_MS);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function writeRemote(childId: string, state: NursingTimerState): void {
  if (!remote) return;
  remote.write(childId, toNursingState(state)).catch(() => {
    // Hors ligne ou sans droit d'écriture : le brouillon local reste la référence.
  });
}

/**
 * Brouillon valide et récent (celui de ce téléphone ou celui du foyer, le plus
 * récent des deux), sinon null. Le cache local est aligné sur le résultat.
 */
export async function loadNursingTimer(
  childId: string,
  now: number = Date.now(),
): Promise<NursingTimerState | null> {
  const [local, shared] = await Promise.all([readLocal(childId), readRemote(childId)]);
  const newest = pickNewerNursingState(local, shared);
  const draft = usableDraft(newest, now);
  if (!draft) {
    if (local) await writeLocal(childId, null);
    return null;
  }
  if (draft !== local) await writeLocal(childId, draft);
  return toNursingState(draft);
}

/** Enregistre le brouillon (ici et pour le foyer), ou l'efface s'il est vide. Jamais bloquant. */
export async function saveNursingTimer(childId: string, state: NursingTimerState): Promise<void> {
  if (!hasNursingProgress(state)) {
    await clearNursingTimer(childId);
    return;
  }
  await writeLocal(childId, state);
  writeRemote(childId, state);
}

/** Efface le brouillon ici et publie une pierre tombale pour les autres aidants. */
export async function clearNursingTimer(childId: string, now: number = Date.now()): Promise<void> {
  await writeLocal(childId, null);
  writeRemote(childId, { ...EMPTY_NURSING_TIMER, updatedAt: now });
}

/**
 * Suit la tétée en cours du foyer : appelé avec le brouillon utilisable, ou
 * null quand il n'y en a plus (terminée ou abandonnée sur un autre appareil).
 * Le cache local est aligné quand l'état partagé est plus récent.
 */
export function subscribeNursingTimer(
  childId: string,
  onChange: (state: NursingTimerState | null) => void,
): () => void {
  if (!remote) return () => {};
  return remote.subscribe(childId, (shared) => {
    void readLocal(childId).then(async (local) => {
      const newest = pickNewerNursingState(local, shared);
      if (newest === shared && shared) {
        await writeLocal(childId, usableDraft(shared, Date.now()));
      }
      const draft = usableDraft(newest, Date.now());
      onChange(draft ? toNursingState(draft) : null);
    });
  });
}

// ============================================
// DERNIER BIBERON (quantité par défaut)
// ============================================

const LAST_BOTTLE_PREFIX = "@suivibaby_last_bottle:";
export const lastBottleStorageKey = (childId: string) => `${LAST_BOTTLE_PREFIX}${childId}`;

export interface LastBottle {
  quantite: number;
  typeBiberon?: string;
}

export async function loadLastBottle(childId: string): Promise<LastBottle | null> {
  try {
    const raw = await AsyncStorage.getItem(lastBottleStorageKey(childId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastBottle>;
    if (typeof parsed?.quantite !== "number" || !Number.isFinite(parsed.quantite)) return null;
    if (parsed.quantite <= 0) return null;
    return {
      quantite: parsed.quantite,
      typeBiberon: typeof parsed.typeBiberon === "string" ? parsed.typeBiberon : undefined,
    };
  } catch {
    return null;
  }
}

export async function saveLastBottle(childId: string, bottle: LastBottle): Promise<void> {
  try {
    await AsyncStorage.setItem(lastBottleStorageKey(childId), JSON.stringify(bottle));
  } catch {
    // ignoré : ce n'est qu'une valeur par défaut
  }
}
