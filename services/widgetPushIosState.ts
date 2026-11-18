// services/widgetPushIosState.ts
// iPhone : état des gardes du message serveur « w1 » (temps réel du widget,
// E7 option 1). Équivalent JS de WidgetPushGuards.kt (Android). Gardé sur le
// disque : la tâche d'arrière-plan peut démarrer dans un JS tout neuf.
import AsyncStorage from "@react-native-async-storage/async-storage";

import { captureServiceError } from "@/utils/errorReporting";

// Échecs du disque signalés une fois par lancement (la tâche d'arrière-plan
// peut tourner souvent) : jamais en silence, jamais en rafale.
const reported = new Set<string>();
function reportOnce(error: unknown, operation: string): void {
  if (reported.has(operation)) return;
  reported.add(operation);
  captureServiceError(error, { service: "widgetPushIos", operation });
}
/** Tests uniquement. */
export function __resetWidgetPushIosReportsForTests(): void {
  reported.clear();
}

// Une clé par champ : deux écritures simultanées (l'app et la tâche
// d'arrière-plan) ne s'écrasent jamais l'une l'autre.
const K = {
  shown: "widgetPushIos:shown",
  seq: "widgetPushIos:seq",
  appAt: "widgetPushIos:appAt",
  offsets: "widgetPushIos:offsets",
} as const;

/** Échantillons gardés pour estimer l'écart d'horloge téléphone − serveur. */
const OFFSET_SAMPLES = 10;
/** Échantillons plus vieux (heure de réception) : oubliés. */
const OFFSET_MAX_AGE_MS = 24 * 3600_000;
/** La garde « plus ancien que l'app » ne joue que juste après une écriture de l'app. */
export const APP_GUARD_WINDOW_MS = 10 * 60_000;
/** Séquence plausible (au-delà de l'an 2100 : message invalide, jamais retenu). */
export const MAX_SEQ = 4_102_444_800_000;

/** Échantillon d'horloge : [réception − heure serveur du message, heure de réception]. */
export type OffsetSample = [number, number];

const fresh = (samples: OffsetSample[], nowMs: number) =>
  samples.filter(([x, at]) => Number.isFinite(x) && Number.isFinite(at) && at <= nowMs + 60_000 && nowMs - at <= OFFSET_MAX_AGE_MS);

/**
 * Écart d'horloge téléphone − serveur : plus petit échantillon des dernières
 * 24 h (écart d'horloge + délai de livraison le plus court), sans celui du
 * message en cours. Sans historique : 0 (tolérance fixe seule).
 */
export function clockOffsetMs(samples: OffsetSample[], nowMs: number): number {
  const recent = fresh(samples, nowMs);
  return recent.length ? Math.min(...recent.map(([x]) => x)) : 0;
}

/** Ajoute l'échantillon d'un message bien formé (10 au plus, dernières 24 h). */
export function nextOffsetSamples(samples: OffsetSample[], sample: number, nowMs: number): OffsetSample[] {
  return [...fresh(samples, nowMs), [sample, nowMs] as OffsetSample].slice(-OFFSET_SAMPLES);
}

export type WidgetPushIosState = {
  /** Enfant affiché par le widget (écrit par l'app) ; null : rien n'est appliqué. */
  shownChildId: string | null;
  /** Dernier `s` appliqué (horodatage serveur de la lecture, ms). */
  lastSeq: number;
  /** Dernière écriture du widget par l'app (horloge du téléphone, ms). */
  appWriteAtMs: number;
  /** Échantillons d'horloge, les plus récents à la fin. */
  offsetSamples: OffsetSample[];
  /** Disque illisible : état inconnu, aucun message appliqué (raison « state »). */
  unreadable?: boolean;
};

export async function readWidgetPushIosState(): Promise<WidgetPushIosState> {
  try {
    const [shown, seq, appAt, offsets] = await Promise.all([
      AsyncStorage.getItem(K.shown),
      AsyncStorage.getItem(K.seq),
      AsyncStorage.getItem(K.appAt),
      AsyncStorage.getItem(K.offsets),
    ]);
    let offsetSamples: OffsetSample[] = [];
    try {
      const parsed = JSON.parse(offsets ?? "[]");
      if (Array.isArray(parsed)) {
        offsetSamples = parsed.filter(
          (e): e is OffsetSample => Array.isArray(e) && e.length === 2 && e.every((v) => typeof v === "number" && Number.isFinite(v)),
        );
      }
    } catch (error) {
      // Échantillons corrompus : la garde repart sans écart estimé (tolérance fixe).
      reportOnce(error, "stateOffsetsCorrupt");
      offsetSamples = [];
    }
    return { shownChildId: shown || null, lastSeq: Number(seq) || 0, appWriteAtMs: Number(appAt) || 0, offsetSamples };
  } catch (error) {
    reportOnce(error, "stateRead");
    return { shownChildId: null, lastSeq: 0, appWriteAtMs: 0, offsetSamples: [], unreadable: true };
  }
}

/** Vrai si l'écriture a réussi ; un échec est signalé (une fois par lancement). */
async function set(key: string, value: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, value);
    return true;
  } catch (error) {
    reportOnce(error, "stateWrite");
    return false;
  }
}

/**
 * L'app vient d'écrire le widget pour cet enfant. L'heure d'abord : si
 * l'écriture de l'enfant échoue, la garde « plus ancien que l'app » tient.
 */
export async function noteIosAppSnapshot(childId: string, nowMs = Date.now()): Promise<void> {
  await set(K.appAt, String(nowMs));
  await set(K.shown, childId);
}

/** Message serveur appliqué ; faux si la séquence n'a pas pu être notée. */
export function noteIosAppliedSeq(seq: number): Promise<boolean> {
  return set(K.seq, String(seq));
}

/** Échantillon d'écart d'horloge d'un message reçu (appliqué ou non). */
export async function noteIosOffsetSamples(samples: OffsetSample[]): Promise<void> {
  await set(K.offsets, JSON.stringify(samples));
}

/** Déconnexion : plus rien n'est appliqué avant la prochaine écriture de l'app. */
export async function clearIosWidgetPush(): Promise<void> {
  try {
    await Promise.all(Object.values(K).map((k) => AsyncStorage.removeItem(k)));
  } catch {
    // Sans effet : les jetons de l'appareil sont supprimés à la déconnexion.
  }
}

export type WidgetPushDecision = "ok" | "fg" | "child" | "seq" | "app" | "invalid" | "state";

/** Même décision que WidgetPushGuards.decide (Android). */
export function decideWidgetPush(a: {
  childId: string | undefined;
  seq: number;
  propsVersion: number;
  state: WidgetPushIosState;
  foreground: boolean;
  skewMs?: number;
  /** Écart d'horloge téléphone − serveur estimé (clockOffsetMs) ; 0 si inconnu. */
  clockOffsetMs?: number;
  /** Heure de réception (téléphone) ; sans elle, la garde « app » joue toujours. */
  receivedAtMs?: number;
}): WidgetPushDecision {
  const skew = a.skewMs ?? 2000;
  const offset = a.clockOffsetMs ?? 0;
  if (!a.childId || !(a.seq > 0) || a.seq > MAX_SEQ || a.propsVersion !== 1) return "invalid";
  if (a.foreground) return "fg";
  // Disque illisible : rien n'est appliqué, mais la raison est distincte
  // (« enfant inconnu » masquait la panne).
  if (a.state.unreadable) return "state";
  if (!a.state.shownChildId || a.state.shownChildId !== a.childId) return "child";
  if (a.seq <= a.state.lastSeq) return "seq";
  // Lecture serveur antérieure à ce que l'app a déjà écrit : ne pas revenir en
  // arrière. Heure serveur ramenée à l'horloge du téléphone (écart estimé) :
  // un téléphone en avance ne refuse plus les messages frais.
  // Seulement dans les 10 min qui suivent l'écriture de l'app (la course à
  // couvrir) : une estimation faussée par un changement d'heure ne bloque
  // jamais le widget durablement. Une écriture « dans le futur » (heure du
  // téléphone reculée depuis) n'est pas récente non plus : sans cela, tous
  // les messages étaient refusés jusqu'à ce que l'horloge la rattrape.
  const sinceAppWrite = a.receivedAtMs == null ? 0 : a.receivedAtMs - a.state.appWriteAtMs;
  const recentAppWrite = sinceAppWrite >= -skew && sinceAppWrite <= APP_GUARD_WINDOW_MS;
  if (a.state.appWriteAtMs > 0 && recentAppWrite && a.seq + offset + skew < a.state.appWriteAtMs) return "app";
  return "ok";
}
