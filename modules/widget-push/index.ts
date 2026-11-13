// modules/widget-push : pont vers le récepteur natif des données du widget
// (Android seulement). Sans module natif (iOS, tests, Expo Go) : sans effet.
import { Platform } from "react-native";

type WidgetPushNative = {
  noteAppSnapshot(childId: string): void;
  readReceiveLog(): string;
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
  try {
    getNative()?.noteAppSnapshot(childId);
  } catch {
    // Module absent ou ancien : le récepteur garde ses autres gardes.
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
