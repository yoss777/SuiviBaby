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

export function pressedOpacity(pressed: boolean): ViewStyle | null {
  return pressed && Platform.OS !== "android" ? PRESSED_IOS : null;
}
