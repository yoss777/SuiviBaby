import { AccessibilityInfo, Platform } from "react-native";

/**
 * Annonce un message d'erreur aux lecteurs d'écran.
 * - iOS : `accessibilityLiveRegion` est ignoré, on passe par une annonce.
 * - Android : la zone live (`accessibilityLiveRegion="assertive"` sur le
 *   texte d'erreur) lit déjà le message ; une annonce en plus le doublerait.
 * Le texte d'erreur reste de toute façon affiché à l'écran.
 */
export function announceError(message: string): void {
  if (Platform.OS === "ios") {
    AccessibilityInfo.announceForAccessibility(message);
  }
}
