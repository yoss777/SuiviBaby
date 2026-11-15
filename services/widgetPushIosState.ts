// services/widgetPushIosState.ts
// iPhone : état des gardes du message serveur « w1 » (temps réel du widget,
// E7 option 1). Équivalent JS de WidgetPushGuards.kt (Android). Gardé sur le
// disque : la tâche d'arrière-plan peut démarrer dans un JS tout neuf.
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "widgetPushIos:v1";

export type WidgetPushIosState = {
  /** Enfant affiché par le widget (écrit par l'app) ; null : rien n'est appliqué. */
  shownChildId: string | null;
  /** Dernier `s` appliqué (horodatage serveur de la lecture, ms). */
  lastSeq: number;
  /** Dernière écriture du widget par l'app (horloge du téléphone, ms). */
  appWriteAtMs: number;
};

const EMPTY: WidgetPushIosState = { shownChildId: null, lastSeq: 0, appWriteAtMs: 0 };

export async function readWidgetPushIosState(): Promise<WidgetPushIosState> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<WidgetPushIosState>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

async function patch(next: Partial<WidgetPushIosState>): Promise<void> {
  try {
    const cur = await readWidgetPushIosState();
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...cur, ...next }));
  } catch {
    // Disque indisponible : le message suivant sera refusé (enfant inconnu), sans dégât.
  }
}

/** L'app vient d'écrire le widget pour cet enfant. */
export function noteIosAppSnapshot(childId: string, nowMs = Date.now()): Promise<void> {
  return patch({ shownChildId: childId, appWriteAtMs: nowMs });
}

/** Message serveur appliqué. */
export function noteIosAppliedSeq(seq: number): Promise<void> {
  return patch({ lastSeq: seq });
}

/** Déconnexion : plus rien n'est appliqué avant la prochaine écriture de l'app. */
export async function clearIosWidgetPush(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
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
