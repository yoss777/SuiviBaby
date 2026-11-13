// services/widgetSync.ts
// Envoie les données du widget « Bébé maintenant » à l'extension (iOS) ou au
// widget Android. Jamais bloquant : sans module natif (Expo Go, tests, web),
// rien ne se passe. Anti-rebond de 2 s et envoi seulement si le contenu change,
// pour ne pas dépenser le budget de rechargement de WidgetKit.
import { Platform } from "react-native";

import type { NowWidgetProps } from "@/utils/widgetSnapshot";

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
  } catch {
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
      widget.updateSnapshot(props);
      lastKey = key;
    } catch {
      // Extension indisponible : on réessaiera au prochain changement.
    }
  }, WIDGET_SYNC_DEBOUNCE_MS);
}

/** Tests uniquement. */
export function __resetWidgetSyncForTests(widget?: WidgetHandle | null): void {
  handle = widget === undefined ? undefined : widget;
  lastKey = "";
  if (pending) clearTimeout(pending);
  pending = null;
}
