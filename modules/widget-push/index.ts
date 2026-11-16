// modules/widget-push : pont vers le récepteur natif des données du widget
// (Android). iPhone : même état, tenu en JS (services/widgetPushIosState.ts).
// Sans module natif (tests, Expo Go) : sans effet.
import { Platform } from "react-native";

import { clearIosWidgetPush, noteIosAppSnapshot } from "@/services/widgetPushIosState";

type WidgetPushNative = {
  noteAppSnapshot(childId: string): void;
  clear?(): void;
  readReceiveLog(): string;
  moveTaskToBack?(): Promise<boolean>;
};

let native: WidgetPushNative | null | undefined;

function getNative(): WidgetPushNative | null {
  if (native !== undefined) return native;
  native = null;
  if (Platform.OS !== "android") return native;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require("expo-modules-core") as typeof import("expo-modules-core");
    native = requireOptionalNativeModule<WidgetPushNative>("WidgetPush");
  } catch {
    native = null;
  }
  return native;
}

/** Enfant affiché et heure de l'écriture faite par l'app (gardes du récepteur). */
export function noteAppSnapshot(childId: string): void {
  if (Platform.OS === "ios") {
    void noteIosAppSnapshot(childId);
    return;
  }
  try {
    getNative()?.noteAppSnapshot(childId);
  } catch {
    // Module absent ou ancien : le récepteur garde ses autres gardes.
  }
}

/** Déconnexion : le récepteur n'applique plus rien avant la prochaine écriture de l'app. */
export function clearWidgetPush(): void {
  if (Platform.OS === "ios") {
    void clearIosWidgetPush();
    return;
  }
  try {
    getNative()?.clear?.();
  } catch {
    // Module absent ou ancien : les jetons de l'appareil sont supprimés à la déconnexion.
  }
}

export type WidgetPushLogEntry = { r: number; s: number; o: string };

/** Journal des derniers messages reçus (mesure de latence). */
export function readReceiveLog(): WidgetPushLogEntry[] {
  try {
    const raw = getNative()?.readReceiveLog();
    return raw ? (JSON.parse(raw) as WidgetPushLogEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Nombre de widgets SuiviBaby posés (Android : AppWidgetManager ; iPhone :
 * WidgetCenter, écran verrouillé compris). null : inconnu (module natif
 * absent, client de développement non reconstruit, erreur).
 */
let countErrorReported = false;
export async function installedWidgetCount(): Promise<number | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requireOptionalNativeModule } = require("expo-modules-core") as typeof import("expo-modules-core");
    const mod = requireOptionalNativeModule<{ installedWidgetCount?: () => number | Promise<number> }>("WidgetPush");
    if (!mod?.installedWidgetCount) return null;
    const n = await mod.installedWidgetCount();
    return typeof n === "number" && Number.isFinite(n) ? n : null;
  } catch (error) {
    if (!countErrorReported) {
      countErrorReported = true;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("@/utils/errorReporting").captureServiceError(error, { service: "widgetPush", operation: "installedWidgetCount" });
    }
    return null;
  }
}

/**
 * Android : renvoie l'app en arrière-plan (retour à l'écran d'accueil) après
 * une action lancée depuis le widget. Sans effet ailleurs ou si le module natif
 * est trop ancien (client de développement non reconstruit).
 */
export async function moveAppToBack(): Promise<boolean> {
  try {
    return (await getNative()?.moveTaskToBack?.()) ?? false;
  } catch {
    return false;
  }
}
