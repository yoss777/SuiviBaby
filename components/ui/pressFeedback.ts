import { Platform, type PressableAndroidRippleConfig, type ViewStyle } from "react-native";

import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";

/**
 * Retour au toucher des boutons partagés : ripple sur Android (natif),
 * opacité sur iOS. À combiner avec `overflow: "hidden"` sur le bouton pour
 * borner le ripple à ses coins arrondis.
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
