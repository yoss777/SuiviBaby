// utils/widgetSnapshot.ts
// Façade côté app du calcul du widget « Bébé maintenant ». Le code vit dans
// functions/shared/widget/ : un seul calcul pour l'app et le serveur (temps
// réel). Ne rien recopier ici : ajouter dans le module partagé.
import { localEnv } from "@/functions/shared/widget";

export {
  assembleNowWidgetInput,
  buildNowWidgetProps,
  CHANGE_GROUP_MS,
  countGroups,
  EMPTY_NOW_WIDGET,
  EMPTY_NOW_WIDGET_NATIVE,
  EVENT_ICON,
  formatDuration,
  localEnv,
  MEAL_GROUP_MS,
  nextSideFrom,
  otherEventIcon,
  otherEventLabel,
  toNativeWidgetProps,
  WIDGET_RECENT_MAX,
  zonedEnv,
} from "@/functions/shared/widget";
export type {
  MealKind,
  NowWidgetInput,
  NowWidgetProps,
  OtherDayEvent,
  WidgetAlerts,
  WidgetDay,
  WidgetEnv,
  WidgetEvent,
  WidgetLive,
  WidgetLiveKind,
  WidgetNursingState,
  WidgetSource,
} from "@/functions/shared/widget";

/** « 14:32 » (heure locale du téléphone). */
export const formatClock = (ms: number): string => localEnv.clock(ms);
