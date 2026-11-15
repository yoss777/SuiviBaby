// services/widgetPushIosState.ts
// iPhone : état des gardes du message serveur « w1 » (temps réel du widget,
// E7 option 1). Équivalent JS de WidgetPushGuards.kt (Android). Gardé sur le
// disque : la tâche d'arrière-plan peut démarrer dans un JS tout neuf.
import AsyncStorage from "@react-native-async-storage/async-storage";

// Une clé par champ : deux écritures simultanées (l'app et la tâche
// d'arrière-plan) ne s'écrasent jamais l'une l'autre.
const K = {
  shown: "widgetPushIos:shown",
  seq: "widgetPushIos:seq",
  appAt: "widgetPushIos:appAt",
} as const;

export type WidgetPushIosState = {
  /** Enfant affiché par le widget (écrit par l'app) ; null : rien n'est appliqué. */
  shownChildId: string | null;
  /** Dernier `s` appliqué (horodatage serveur de la lecture, ms). */
  lastSeq: number;
  /** Dernière écriture du widget par l'app (horloge du téléphone, ms). */
  appWriteAtMs: number;
};

export async function readWidgetPushIosState(): Promise<WidgetPushIosState> {
  try {
    const [shown, seq, appAt] = await Promise.all([
      AsyncStorage.getItem(K.shown),
      AsyncStorage.getItem(K.seq),
      AsyncStorage.getItem(K.appAt),
    ]);
    return { shownChildId: shown || null, lastSeq: Number(seq) || 0, appWriteAtMs: Number(appAt) || 0 };
  } catch {
    return { shownChildId: null, lastSeq: 0, appWriteAtMs: 0 };
  }
}

async function set(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Disque indisponible : le message suivant sera refusé (enfant inconnu), sans dégât.
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

/** Message serveur appliqué. */
export function noteIosAppliedSeq(seq: number): Promise<void> {
  return set(K.seq, String(seq));
}

/** Déconnexion : plus rien n'est appliqué avant la prochaine écriture de l'app. */
export async function clearIosWidgetPush(): Promise<void> {
  try {
    await Promise.all(Object.values(K).map((k) => AsyncStorage.removeItem(k)));
  } catch {
    // Sans effet : les jetons de l'appareil sont supprimés à la déconnexion.
  }
}

export type WidgetPushDecision = "ok" | "fg" | "child" | "seq" | "app" | "invalid";

/** Même décision que WidgetPushGuards.decide (Android). */
export function decideWidgetPush(a: {
  childId: string | undefined;
  seq: number;
  propsVersion: number;
  state: WidgetPushIosState;
  foreground: boolean;
  skewMs?: number;
}): WidgetPushDecision {
  const skew = a.skewMs ?? 2000;
  if (!a.childId || !(a.seq > 0) || a.propsVersion !== 1) return "invalid";
  if (a.foreground) return "fg";
  if (!a.state.shownChildId || a.state.shownChildId !== a.childId) return "child";
  if (a.seq <= a.state.lastSeq) return "seq";
  // Lecture serveur antérieure à ce que l'app a déjà écrit : ne pas revenir en arrière.
  if (a.state.appWriteAtMs > 0 && a.seq + skew < a.state.appWriteAtMs) return "app";
  return "ok";
}
