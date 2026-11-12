import { contrastRatio } from "@/constants/theme";

export type AccentColorScheme = "light" | "dark";

export type AccentColors = {
  bg: string;
  border: string;
  text: string;
  /** Aplat plein (bouton principal du pied de formulaire, puce active). */
  filledBg: string;
  filledBorder: string;
  /** Texte/icône posé sur `filledBg` : toujours >= 4.5:1 (WCAG 1.4.3). */
  filledText: string;
  softBg: string;
  softBorder: string;
  /** Texte sur `softBg` : >= 4.5:1 sur la surface du thème. */
  softText: string;
};

/** Contraste minimal d'un texte normal (WCAG 2.2 AA, 1.4.3). */
export const MIN_TEXT_CONTRAST = 4.5;

/**
 * Couleurs « on » des aplats d'accent. Clair : texte blanc sur un aplat foncé
 * au besoin. Sombre : texte gris-900 sur un aplat éclairci au besoin (même
 * logique que `Colors[scheme].onTint`).
 */
export const ON_FILL = {
  light: "#ffffff",
  dark: "#111827",
} as const;

/** Surfaces sur lesquelles les aplats translucides (`softBg`) sont posés. */
const SOFT_SURFACE = {
  light: "#f9fafb", // nc.background (le plus défavorable des deux fonds clairs)
  dark: "#1f2937", // ncDark.backgroundCard (le plus défavorable des fonds sombres)
} as const;

const normalizeHex = (hex: string) => hex.replace("#", "").trim();

const hexToRgb = (hex: string) => {
  let value = normalizeHex(hex);
  if (value.length === 3) {
    value = value
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (value.length !== 6) {
    return null;
  }

  const parsed = Number.parseInt(value, 16);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return {
    r: (parsed >> 16) & 255,
    g: (parsed >> 8) & 255,
    b: parsed & 255,
  };
};

const componentToHex = (value: number) =>
  Math.round(Math.max(0, Math.min(255, value)))
    .toString(16)
    .padStart(2, "0");

const rgbToHex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${componentToHex(r)}${componentToHex(g)}${componentToHex(b)}`;

export const mixHex = (hex: string, target: string, amount: number) => {
  const baseRgb = hexToRgb(hex);
  const targetRgb = hexToRgb(target);
  if (!baseRgb || !targetRgb) {
    return hex;
  }

  return rgbToHex({
    r: baseRgb.r + (targetRgb.r - baseRgb.r) * amount,
    g: baseRgb.g + (targetRgb.g - baseRgb.g) * amount,
    b: baseRgb.b + (targetRgb.b - baseRgb.b) * amount,
  });
};

export const withAlpha = (hex: string, alpha: number) => {
  const value = normalizeHex(hex);
  if (value.length !== 6) {
    return hex;
  }

  return `#${value}${componentToHex(alpha * 255)}`;
};

/**
 * Mélange `color` vers `target` par pas de 2 % jusqu'à atteindre
 * `MIN_TEXT_CONTRAST` contre `against`. Retourne la première teinte lisible
 * (la plus proche de la couleur d'origine).
 */
const STEPS = 50;

const readableMixAmount = (color: string, target: string, against: string) => {
  for (let step = 0; step <= STEPS; step++) {
    const candidate = step === 0 ? color : mixHex(color, target, step / STEPS);
    if (contrastRatio(candidate, against) >= MIN_TEXT_CONTRAST) {
      return step / STEPS;
    }
  }
  return 1;
};

const adjustUntilReadable = (color: string, target: string, against: string) => {
  if (!hexToRgb(color)) return color;
  const amount = readableMixAmount(color, target, against);
  return amount === 0 ? color : mixHex(color, target, amount);
};

/**
 * Au-delà de 30 % de noir, une couleur claire (doré, vert pomme) vire au
 * brun : on garde alors la teinte et on passe le texte en gris-900.
 */
const MAX_LIGHT_DARKENING = 0.3;

const getFilled = (accent: string, colorScheme: AccentColorScheme) => {
  if (colorScheme === "light" && hexToRgb(accent)) {
    const amount = readableMixAmount(accent, "#000000", ON_FILL.light);
    if (amount <= MAX_LIGHT_DARKENING) {
      return { bg: amount === 0 ? accent : mixHex(accent, "#000000", amount), text: ON_FILL.light };
    }
    return { bg: adjustUntilReadable(accent, "#ffffff", ON_FILL.dark), text: ON_FILL.dark };
  }
  // Sombre : on éclaircit l'aplat sous du gris-900 (comme onTint).
  return { bg: adjustUntilReadable(accent, "#ffffff", ON_FILL.dark), text: ON_FILL.dark };
};

const SOFT_ALPHA = { light: 0.14, dark: 0.22 } as const;

const cache = new Map<string, AccentColors>();

/**
 * Jeu de couleurs dérivé d'une couleur d'accent (catégorie / type d'événement),
 * lisible dans les deux thèmes. Source unique des couleurs « on » des aplats :
 * ne jamais poser de blanc en dur sur `filledBg`, utiliser `filledText`.
 */
export const getAccentColors = (
  accent: string,
  colorScheme: AccentColorScheme,
): AccentColors => {
  const key = `${accent}|${colorScheme}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const filled = getFilled(accent, colorScheme);

  const softAlpha = SOFT_ALPHA[colorScheme];
  const softBg = withAlpha(accent, softAlpha);
  const softComposite = mixHex(SOFT_SURFACE[colorScheme], accent, softAlpha);
  const softText =
    colorScheme === "dark"
      ? adjustUntilReadable(mixHex(accent, "#ffffff", 0.45), "#ffffff", softComposite)
      : adjustUntilReadable(mixHex(accent, "#000000", 0.2), "#000000", softComposite);

  const colors: AccentColors = {
    bg: softBg,
    border: accent,
    text: softText,
    filledBg: filled.bg,
    filledBorder: filled.bg,
    filledText: filled.text,
    softBg,
    softBorder: accent,
    softText,
  };
  cache.set(key, colors);
  return colors;
};
