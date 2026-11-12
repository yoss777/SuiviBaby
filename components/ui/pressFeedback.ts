import { Platform, type PressableAndroidRippleConfig, type ViewStyle } from "react-native";

import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";

/**
 * Borne le ripple Android aux coins arrondis d'un Pressable : à étaler dans
 * son style (`...RIPPLE_CLIP`). Android seulement : sur iOS, `overflow:
 * "hidden"` couperait l'ombre (shadow*) du bouton. Sous Android, l'ombre
 * d'`elevation` reste dessinée. Si un badge déborde du bouton, ne pas
 * l'utiliser sur le bouton : envelopper seulement la surface pressable dans
 * une vue `rippleContainerStyle(rayon)`.
 */
export const RIPPLE_CLIP: ViewStyle = Platform.OS === "android" ? { overflow: "hidden" } : {};

/** Enveloppe arrondie qui borne le ripple de la surface pressable qu'elle contient. */
export function rippleContainerStyle(radius: number): ViewStyle {
  return Platform.OS === "android"
    ? { borderRadius: radius, overflow: "hidden" }
    : { borderRadius: radius };
}

/**
 * Retour au toucher des boutons partagés : ripple sur Android (natif),
 * opacité sur iOS. À combiner avec `RIPPLE_CLIP` (ou `overflow: "hidden"`)
 * sur le bouton pour borner le ripple à ses coins arrondis.
 */
export function usePressRipple(): PressableAndroidRippleConfig {
  const scheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(scheme);
  return { color: scheme === "dark" ? nc.pressedLight : "rgba(0, 0, 0, 0.12)" };
}

const PRESSED_IOS: ViewStyle = { opacity: 0.7 };

/**
 * Opacité au toucher hors Android (où le ripple prend le relais). `opacity`
 * reprend l'ancien `activeOpacity` d'un TouchableOpacity migré (0.2 par
 * défaut côté RN) pour garder le même rendu iOS.
 */
export function pressedOpacity(pressed: boolean, opacity = 0.7): ViewStyle | null {
  if (!pressed || Platform.OS === "android") return null;
  return opacity === 0.7 ? PRESSED_IOS : { opacity };
}

/**
 * Retour au toucher qui garde la surface OPAQUE (iOS) : une teinte de fond au
 * lieu d'une opacité. À utiliser pour les cartes posées sur une action de
 * glissement (bouton « Supprimer » dessiné derrière la carte) : avec
 * pressedOpacity, le rouge transparaissait dès qu'on posait le doigt pour
 * glisser. Sur Android, le ripple fait déjà le retour : rien n'est ajouté.
 */
export function pressedTint(pressed: boolean, tint: string): ViewStyle | null {
  if (!pressed || Platform.OS === "android") return null;
  return { backgroundColor: tint };
}
