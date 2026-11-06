// utils/temperatureAlertDialog.ts
//
// Affiche l'alerte de température via la modale globale (ModalContext).
// Cette modale est non masquable : pas de fermeture par le fond ni par geste
// (ConfirmModal : onRequestClose vide, allowBackdropDismiss à false). Seuls
// les boutons la ferment.

import { Linking } from "react-native";

import { formatWarningSigns, type TemperatureAlert } from "@/utils/temperatureAlert";

export const EMERGENCY_NUMBER_URL = "tel:15";

type ShowAlert = (
  title: string,
  message?: string,
  buttons?: { text?: string; onPress?: () => void; style?: "default" | "cancel" | "destructive" }[],
) => void;

function callEmergency() {
  Linking.openURL(EMERGENCY_NUMBER_URL).catch(() => {
    // Appareil sans téléphonie : le message affiche déjà « appelez le 15 ».
  });
}

export function showTemperatureAlertDialog(showAlert: ShowAlert, alert: TemperatureAlert) {
  const message = `${alert.message}\n\n${formatWarningSigns(alert.signs)}`;
  const buttons = alert.callEmergency
    ? [
        { text: "J'ai compris", style: "cancel" as const },
        { text: "Appeler le 15", style: "destructive" as const, onPress: callEmergency },
      ]
    : [{ text: "J'ai compris" }];
  showAlert(alert.title, message, buttons);
}
