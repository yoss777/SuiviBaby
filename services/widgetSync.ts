// services/widgetSync.ts
// Envoie les données du widget « Bébé maintenant » à l'extension (iOS) ou au
// widget Android. Jamais bloquant : sans module natif (Expo Go, tests, web),
// rien ne se passe. Anti-rebond de 2 s et envoi seulement si le contenu change,
// pour ne pas dépenser le budget de rechargement de WidgetKit ; immédiat au
// changement d'enfant et à la mise en arrière-plan.
import { AppState, Platform } from "react-native";

import { clearWidgetPush, noteAppSnapshot } from "@/modules/widget-push";
import { captureServiceError } from "@/utils/errorReporting";
import {
  EMPTY_NOW_WIDGET,
  EMPTY_NOW_WIDGET_NATIVE,
  type NowWidgetProps,
  toNativeWidgetProps,
} from "@/utils/widgetSnapshot";

export const WIDGET_SYNC_DEBOUNCE_MS = 2000;
/** Après un changement d'enfant, ses données arrivent par vagues : envois immédiats pendant ce délai. */
export const WIDGET_CHILD_SWITCH_WINDOW_MS = 15000;

type WidgetHandle = { updateSnapshot: (props: NowWidgetProps) => void };

let handle: WidgetHandle | null | undefined;
let lastKey = "";
let pending: ReturnType<typeof setTimeout> | null = null;
// Une seule remontée par session et par opération (pas de bruit à chaque envoi).
const reported = new Set<string>();
function reportOnce(error: unknown, operation: string): void {
  if (reported.has(operation)) return;
  reported.add(operation);
  captureServiceError(error, { service: "widgetSync", operation });
}

function getWidget(): WidgetHandle | null {
  if (handle !== undefined) return handle;
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    handle = null;
    return handle;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    handle = require("@/widgets/BebeMaintenant").default as WidgetHandle;
  } catch (error) {
    if (__DEV__) console.warn("[widget] module indisponible", error);
    reportOnce(error, "load");
    handle = null;
  }
  return handle;
}

/** Contenu comparé (sans l'horodatage de génération). */
export function widgetContentKey(props: NowWidgetProps): string {
  const { generatedAtMs: _ignored, ...content } = props;
  return JSON.stringify(content);
}

let lastChildId: string | undefined;
let childSwitchedAt = 0;
let pendingRun: (() => void) | null = null;

function write(props: NowWidgetProps, key: string): void {
  const widget = getWidget();
  if (!widget) return;
  try {
    // Android : noté AVANT l'écriture, pour qu'un message serveur arrivé
    // entre les deux ne revienne jamais avant elle, ni sur un autre bébé.
    if (props.childId) noteAppSnapshot(props.childId);
    widget.updateSnapshot(toNativeWidgetProps(props));
    lastKey = key;
    if (props.childId !== lastChildId) childSwitchedAt = Date.now();
    lastChildId = props.childId;
    if (__DEV__) console.log(`[widget] envoyé : ${props.childName}${props.loading ? " · chargement" : props.live ? ` · ${props.live.kind}` : ""}`);
  } catch (error) {
    // Extension indisponible : on réessaiera au prochain changement.
    if (__DEV__) console.warn("[widget] envoi impossible", error);
    reportOnce(error, "updateSnapshot");
  }
}

/**
 * Envoi au widget. Anti-rebond de 2 s, sauf :
 * - enfant affiché changé, ou données qui arrivent juste après (15 s) ;
 * - app hors premier plan : Android y suspend les minuteries JS, un envoi
 *   différé ne partirait qu'au retour dans l'app.
 */
export function pushNowWidget(props: NowWidgetProps): void {
  const key = widgetContentKey(props);
  if (key === lastKey) return;
  cancelPendingWidgetPush();
  const immediate =
    props.childId !== lastChildId ||
    lastKey.includes('"loading":true') ||
    Date.now() - childSwitchedAt < WIDGET_CHILD_SWITCH_WINDOW_MS ||
    AppState.currentState !== "active";
  if (immediate) {
    write(props, key);
    return;
  }
  pendingRun = () => write(props, key);
  pending = setTimeout(() => {
    pending = null;
    const run = pendingRun;
    pendingRun = null;
    run?.();
  }, WIDGET_SYNC_DEBOUNCE_MS);
}

/**
 * Enfant changé, données pas encore chargées : le widget montre tout de suite
 * le nouveau prénom avec « Mise à jour… », jamais l'ancien enfant.
 */
export function pushNowWidgetLoading(childId: string, childName: string): void {
  if (lastChildId === childId) return;
  pushNowWidget({ ...EMPTY_NOW_WIDGET, childId, childName, loading: true, generatedAtMs: Date.now() });
}

/** App mise en arrière-plan : l'envoi en attente part maintenant (pas dans 2 s). */
export function flushPendingWidgetPush(): void {
  if (!pending) return;
  clearTimeout(pending);
  pending = null;
  const run = pendingRun;
  pendingRun = null;
  run?.();
}

/**
 * Oublie le dernier contenu envoyé : le récepteur natif a pu réécrire le
 * widget entre-temps (message serveur), l'app doit pouvoir le réécrire même
 * à contenu égal. Appelé au retour au premier plan.
 */
export function invalidateWidgetKey(): void {
  lastKey = "";
}

/** Annule l'envoi en attente (changement de bébé, données pas encore prêtes). */
export function cancelPendingWidgetPush(): void {
  if (pending) clearTimeout(pending);
  pending = null;
  pendingRun = null;
}

/**
 * Déconnexion : le widget ne doit plus montrer le prénom ni les données de
 * santé de l'enfant sur un téléphone partagé. Immédiat (pas d'anti-rebond).
 */
export function clearNowWidget(): void {
  cancelPendingWidgetPush();
  lastKey = "";
  lastChildId = undefined;
  clearWidgetPush();
  const widget = getWidget();
  if (!widget) return;
  try {
    widget.updateSnapshot(EMPTY_NOW_WIDGET_NATIVE);
  } catch (error) {
    if (__DEV__) console.warn("[widget] effacement impossible", error);
    reportOnce(error, "clear");
  }
}

/** Tests uniquement. */
export function __resetWidgetSyncForTests(widget?: WidgetHandle | null): void {
  handle = widget === undefined ? undefined : widget;
  lastKey = "";
  lastChildId = undefined;
  childSwitchedAt = 0;
  reported.clear();
  cancelPendingWidgetPush();
}
