// services/widgetPushIos.ts
// iPhone : temps réel du widget au mieux (E7, option 1). Le serveur envoie
// les données du widget en notification silencieuse (content-available) ;
// iOS réveille l'app en arrière-plan quelques secondes, cette tâche les écrit
// dans le widget. iOS limite ces réveils et n'en livre aucun si l'app a été
// fermée de force : le widget reste juste à la prochaine ouverture de l'app.
// Déclaré au chargement du module (portée globale), exigence de TaskManager.
import { AppState, Platform } from "react-native";

import { writeServerWidgetProps } from "@/services/widgetSync";
import { captureServiceError } from "@/utils/errorReporting";
import { decideWidgetPush, noteIosAppliedSeq, readWidgetPushIosState, type WidgetPushDecision } from "@/services/widgetPushIosState";
import type { NowWidgetProps } from "@/utils/widgetSnapshot";

export const WIDGET_PUSH_IOS_TASK = "suivibaby-widget-push";

type W1 = { t: "w1"; c?: string; s?: number; p?: NowWidgetProps & { v?: number } };

/** Le message « w1 », quelle que soit sa place dans les données reçues. */
export function readW1(data: unknown): W1 | null {
  const tryParse = (v: unknown): unknown => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  };
  const seen = [data];
  const d = tryParse(data) as Record<string, unknown> | null;
  if (d && typeof d === "object") seen.push(d, tryParse(d.dataString), tryParse(d.body), tryParse(d.data));
  for (const c of seen) {
    const o = tryParse(c) as W1 | null;
    if (o && typeof o === "object" && o.t === "w1") return o;
  }
  return null;
}

/** Applique un message serveur au widget si les gardes le permettent. */
export async function handleWidgetPushIos(data: unknown): Promise<WidgetPushDecision | "write"> {
  const msg = readW1(data);
  if (!msg) return "invalid";
  const state = await readWidgetPushIosState();
  const decision = decideWidgetPush({
    childId: msg.c,
    seq: Number(msg.s),
    propsVersion: Number(msg.p?.v ?? 0),
    state,
    foreground: AppState.currentState === "active",
  });
  if (decision !== "ok" || !msg.p) return decision;
  // Écriture ratée : la séquence n'avance pas (le message suivant pourra
  // s'appliquer) et iOS reçoit « échec », pas « nouvelles données ».
  if (!writeServerWidgetProps(msg.p)) return "write";
  await noteIosAppliedSeq(Number(msg.s));
  return "ok";
}

// Enregistrement de la tâche : résolu à vrai seulement s'il réussit. Un
// binaire sans le mode « remote-notification » (construit avant l'ajout de
// enableBackgroundRemoteNotifications) le refuse : l'app n'annonce alors
// aucune capacité au serveur.
let readyPromise: Promise<boolean> = Promise.resolve(false);

/** Capacité « widget temps réel » de l'iPhone : 1 si la tâche est enregistrée. */
export async function widgetPushIosCap(): Promise<number> {
  return (await readyPromise) ? 1 : 0;
}

if (Platform.OS === "ios") {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TaskManager = require("expo-task-manager") as typeof import("expo-task-manager");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications = require("expo-notifications") as typeof import("expo-notifications");
    const BackgroundNotificationResult = Notifications.BackgroundNotificationTaskResult;
    TaskManager.defineTask(WIDGET_PUSH_IOS_TASK, async ({ error, data }) => {
      // Le résultat règle le budget de réveils qu'iOS accorde à l'app.
      if (error) {
        captureServiceError(error, { service: "widgetPushIos", operation: "taskError" });
        return BackgroundNotificationResult.Failed;
      }
      try {
        const decision = await handleWidgetPushIos(data);
        if (decision === "ok") return BackgroundNotificationResult.NewData;
        return decision === "write" ? BackgroundNotificationResult.Failed : BackgroundNotificationResult.NoData;
      } catch (e) {
        captureServiceError(e, { service: "widgetPushIos", operation: "handle" });
        return BackgroundNotificationResult.Failed;
      }
    });
    readyPromise = Notifications.registerTaskAsync(WIDGET_PUSH_IOS_TASK).then(
      () => true,
      (e) => {
        // Visible : sinon widgetCap 0 et plus aucune mise à jour, sans savoir pourquoi.
        captureServiceError(e, { service: "widgetPushIos", operation: "registerTask" });
        return false;
      },
    );
  } catch (e) {
    // Client sans expo-task-manager (ancien client de développement) : pas de temps réel.
    captureServiceError(e, { service: "widgetPushIos", operation: "defineTask" });
  }
}
