/**
 * Tokens de mise en page partagés : espacement, rayons, échelle typographique
 * et élévation. Les couleurs vivent dans `constants/dashboardColors.ts`
 * (neutres, catégories) et `constants/theme.ts` (tint / onTint).
 *
 * Migration progressive : tout nouveau style utilise ces tokens ; les écrans
 * existants migrent au fil des retouches (valeurs choisies parmi les plus
 * fréquentes du code actuel pour que la migration ne change rien à l'œil).
 */

import { Platform, type TextStyle, type ViewStyle } from "react-native";

/** Espacement (pt), grille de 4. */
export const space = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

/** Rayons de bordure (pt). */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

/** Taille minimale d'une cible tactile (HIG 44 pt ; Material 48 dp). */
export const minTouchTarget = Platform.OS === "android" ? 48 : 44;

/**
 * Échelle typographique (HIG). La graisse fait partie du token : utiliser
 * des graisses numériques ("600", "700"), jamais "bold".
 */
export const typography = {
  caption: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  body: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  bodyStrong: { fontSize: 15, lineHeight: 20, fontWeight: "600" },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: "600" },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "700" },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: "700" },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
} as const satisfies Record<string, TextStyle>;

type Scheme = "light" | "dark" | null | undefined;

const NO_ELEVATION: ViewStyle = { elevation: 0, shadowOpacity: 0 };

const CARD_LIGHT: ViewStyle = Platform.select<ViewStyle>({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  default: { elevation: 2 },
});

const RAISED_LIGHT: ViewStyle = Platform.select<ViewStyle>({
  ios: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  default: { elevation: 6 },
});

/**
 * Élévation par niveau. En sombre : aucune ombre (Android dessine
 * `elevation` comme un cadre sombre sur #111827 ; iOS ne la montre pas) ;
 * la profondeur vient du ton de surface (`backgroundCard` plus clair que
 * `background`), comme le tonal elevation de Material 3 et la HIG.
 * Voir aussi `flatInDark` (constants/theme.ts) pour les styles existants.
 */
export const elevation = {
  none: (_scheme?: Scheme): ViewStyle => NO_ELEVATION,
  card: (scheme?: Scheme): ViewStyle => (scheme === "dark" ? NO_ELEVATION : CARD_LIGHT),
  raised: (scheme?: Scheme): ViewStyle => (scheme === "dark" ? NO_ELEVATION : RAISED_LIGHT),
} as const;
