// utils/temperatureAlertDialog.ts
//
// Affiche l'alerte de température via la modale globale (ModalContext).
// Cette modale n'est fermée que par ses boutons (pas de fermeture par le fond
// ni par geste). Quand l'alerte est non masquable ou propose d'appeler le 15,
// elle est en plus PROTÉGÉE : une modale affichée plus tard ne la remplace pas,
// elle attend sa fermeture (voir ModalContext).

import { Linking } from "react-native";

import { formatWarningSigns, type TemperatureAlert } from "@/utils/temperatureAlert";

export const EMERGENCY_NUMBER_URL = "tel:15";

type ShowAlert = (
  title: string,
  message?: string,
  buttons?: { text?: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }[],
  options?: { dismissible?: boolean; callEmergency?: boolean },
) => void;

function callEmergency() {
  Linking.openURL(EMERGENCY_NUMBER_URL).catch(() => {
    // Appareil sans téléphonie : le message affiche déjà « appelez le 15 ».
  });
}

export function showTemperatureAlertDialog(
  showAlert: ShowAlert,
  alert: TemperatureAlert,
  /** Texte placé avant l'alerte (ex. résumé d'ajouts vocaux), dans la même modale. */
  preface?: string,
) {
  const body = `${alert.message}\n\n${formatWarningSigns(alert.signs)}`;
  const message = preface ? `${preface}\n\n${body}` : body;
  const buttons = alert.callEmergency
    ? [
        { text: "J'ai compris", style: "cancel" as const },
        { text: "Appeler le 15", style: "destructive" as const, onPress: callEmergency },
      ]
    : [{ text: "J'ai compris" }];
  showAlert(alert.title, message, buttons, {
    dismissible: alert.dismissible,
    callEmergency: alert.callEmergency,
  });
}
