// services/widgetInfoNotice.ts
// Information à la pose du widget (registre RGPD, traitement 5, point ouvert
// du lot 5) : affichée une fois par appareil, à la première détection d'un
// widget posé. Comme l'information de la commande vocale : l'écran de
// consentement était le seul endroit qui en parlait.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { captureServiceError } from "@/utils/errorReporting";

/** Version du texte : la changer réaffiche le message une fois. */
export const WIDGET_INFO_VERSION = "1";
const KEY = "widgetInfoShown";

export const WIDGET_INFO_TITLE = "Votre widget SuiviBaby";

/** Texte de l'information (le même que la politique, en court). */
export function widgetInfoMessage(os: string = Platform.OS): string {
  const screen =
    os === "ios"
      ? "Toute personne qui voit votre écran peut le lire. Sur l'écran verrouillé, il est masqué tant que l'iPhone est verrouillé par un code."
      : "Toute personne qui voit votre écran peut le lire : Android ne le masque pas.";
  return [
    "Il affiche le prénom de votre bébé, ses derniers repas, changes et sommeils, les sessions en cours et, selon sa taille, les derniers soins (dont la température).",
    screen,
    `Pour le tenir à jour quand un autre aidant saisit, notre serveur envoie ce résumé à votre téléphone par Expo, puis ${os === "ios" ? "Apple" : "Google"}.`,
    "Retirez le widget à tout moment : plus rien n'est alors envoyé. Il est aussi vidé à la déconnexion.",
  ].join("\n\n");
}

/** Vrai si l'information n'a pas encore été vue sur cet appareil. */
export async function shouldShowWidgetInfo(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) !== WIDGET_INFO_VERSION;
  } catch (error) {
    // Stockage illisible : on ne la montre pas en boucle à chaque ouverture.
    captureServiceError(error, { service: "widgetInfo", operation: "read" });
    return false;
  }
}

export async function markWidgetInfoShown(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, WIDGET_INFO_VERSION);
  } catch (error) {
    captureServiceError(error, { service: "widgetInfo", operation: "write" });
  }
}

let showing = false;

/**
 * Widget détecté : montre l'information si elle n'a jamais été vue. Notée vue
 * dès l'affichage (une fermeture forcée de l'app ne la fait pas revenir en
 * boucle) ; `show` reçoit le titre, le texte et l'action « En savoir plus ».
 */
export async function maybeShowWidgetInfo(
  show: (title: string, message: string) => void,
): Promise<boolean> {
  if (showing) return false;
  showing = true;
  try {
    if (!(await shouldShowWidgetInfo())) return false;
    await markWidgetInfoShown();
    show(WIDGET_INFO_TITLE, widgetInfoMessage());
    return true;
  } finally {
    showing = false;
  }
}

/** Tests uniquement. */
export function __resetWidgetInfoForTests(): void {
  showing = false;
}
