// services/widgetSync.ts
// Envoie les données du widget « Bébé maintenant » à l'extension (iOS) ou au
// widget Android. Jamais bloquant : sans module natif (Expo Go, tests, web),
// rien ne se passe. Anti-rebond de 2 s et envoi seulement si le contenu change,
// pour ne pas dépenser le budget de rechargement de WidgetKit.
import { Platform } from "react-native";

import { noteAppSnapshot } from "@/modules/widget-push";
import { type NowWidgetProps, toNativeWidgetProps } from "@/utils/widgetSnapshot";

export const WIDGET_SYNC_DEBOUNCE_MS = 2000;

type WidgetHandle = { updateSnapshot: (props: NowWidgetProps) => void };

let handle: WidgetHandle | null | undefined;
let lastKey = "";
let pending: ReturnType<typeof setTimeout> | null = null;

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
    handle = null;
  }
  return handle;
}

/** Contenu comparé (sans l'horodatage de génération). */
export function widgetContentKey(props: NowWidgetProps): string {
  const { generatedAtMs: _ignored, ...content } = props;
  return JSON.stringify(content);
}

export function pushNowWidget(props: NowWidgetProps): void {
  const key = widgetContentKey(props);
  if (key === lastKey) return;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    const widget = getWidget();
    if (!widget) return;
    try {
      widget.updateSnapshot(toNativeWidgetProps(props));
      lastKey = key;
      // Android : le récepteur des messages serveur ne revient jamais avant
      // cette écriture, ni sur un autre bébé.
      if (props.childId) noteAppSnapshot(props.childId);
      if (__DEV__) console.log(`[widget] envoyé : ${props.childName}${props.live ? ` · ${props.live.kind}` : ""}`);
    } catch (error) {
      // Extension indisponible : on réessaiera au prochain changement.
      if (__DEV__) console.warn("[widget] envoi impossible", error);
    }
  }, WIDGET_SYNC_DEBOUNCE_MS);
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
}

/** Tests uniquement. */
export function __resetWidgetSyncForTests(widget?: WidgetHandle | null): void {
  handle = widget === undefined ? undefined : widget;
  lastKey = "";
  if (pending) clearTimeout(pending);
  pending = null;
}
