/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

import { neutralColors, neutralColorsDark } from './dashboardColors';

// #08739a (et non plus #0a7ea4) : la barre d'onglets est posée sur
// nc.background (#f9fafb), où #0a7ea4 ne faisait que 4.43:1 ; #08739a y fait
// 5.11:1 (5.34:1 sur blanc), à l'œil quasi identique.
const tintColorLight = '#08739a';
const tintColorDark = '#60a5fa'; // blue-400 — cohérent avec stats/charts en dark

type ThemeColors = {
  text: string;
  /**
   * Fond d'écran. Source unique : `nc.background` (dashboardColors.ts), le
   * même que l'en-tête, la barre d'onglets et les écrans.
   */
  background: string;
  /**
   * Fond des feuilles, calendriers, sélecteurs et listes de modales : blanc en
   * clair (posé sur `background`), fond nuit en sombre.
   */
  surface: string;
  tint: string;
  /**
   * Texte/icône posé sur un aplat `tint` (bouton plein). Blanc en clair
   * (5.34:1 sur #08739a), gris-900 en sombre : le blanc n'atteint que 2.54:1
   * sur #60a5fa, #111827 y fait 6.98:1.
   */
  onTint: string;
  icon: string;
  tabIconDefault: string;
  tabIconSelected: string;
};

export const Colors: Record<string, ThemeColors> = {
  light: {
    text: '#11181C',
    background: neutralColors.background,
    surface: neutralColors.backgroundCard,
    tint: tintColorLight,
    onTint: '#ffffff',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: neutralColorsDark.background, // bleu nuit (gray-900)
    surface: neutralColorsDark.background,
    tint: tintColorDark,
    onTint: '#111827',
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});

/**
 * Cards are flat in dark mode. On Android, `elevation` is drawn by the system
 * (it ignores shadowOpacity/shadowRadius) and shows as a dark frame around
 * cards on the dark background, while iOS shadows stay invisible. Spread it
 * after the card style: `style={[styles.card, flatInDark(colorScheme)]}`.
 */
const DARK_FLAT = { elevation: 0, shadowOpacity: 0 } as const;
export function flatInDark(scheme: string | null | undefined) {
  return scheme === "dark" ? DARK_FLAT : null;
}

// ============================================
// CONTRASTE (WCAG 2.2)
// ============================================

function srgbChannel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function parseHex(color: string): [number, number, number] | null {
  if (!color || !color.startsWith("#")) return null;
  let hex = color.slice(1);
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  // #rrggbbaa : on ignore l'alpha (couleur supposée opaque)
  if (hex.length === 8) hex = hex.slice(0, 6);
  if (hex.length !== 6 || !/^[0-9a-fA-F]{6}$/.test(hex)) return null;
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ];
}

/** Luminance relative WCAG d'une couleur hexadécimale (null si illisible). */
export function relativeLuminance(color: string): number | null {
  const rgb = parseHex(color);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(srgbChannel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ratio de contraste WCAG entre deux couleurs hexadécimales (1 à 21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return 1;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

const READABLE_LIGHT = "#ffffff";
const READABLE_DARK = "#111827";

/**
 * Couleur de texte lisible sur un aplat quelconque : blanc ou gris-900,
 * celui qui contraste le plus (WCAG). Pour les aplats `tint`/`todayAccent`,
 * préférer les tokens `Colors[scheme].onTint` / `nc.onTodayAccent`.
 */
export function getReadableTextColor(background: string, fallback = READABLE_LIGHT): string {
  if (relativeLuminance(background) === null) return fallback;
  return contrastRatio(READABLE_LIGHT, background) >= contrastRatio(READABLE_DARK, background)
    ? READABLE_LIGHT
    : READABLE_DARK;
}
