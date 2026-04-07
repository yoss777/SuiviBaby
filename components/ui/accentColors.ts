export type AccentColorScheme = "light" | "dark";

export type AccentColors = {
  bg: string;
  border: string;
  text: string;
  filledBg: string;
  filledBorder: string;
  filledText: string;
  softBg: string;
  softBorder: string;
  softText: string;
};

const normalizeHex = (hex: string) => hex.replace("#", "").trim();

const hexToRgb = (hex: string) => {
  const value = normalizeHex(hex);
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

const mixHex = (hex: string, target: string, amount: number) => {
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

export const getAccentColors = (
  accent: string,
  colorScheme: AccentColorScheme,
): AccentColors => {
  const softText =
    colorScheme === "dark"
      ? mixHex(accent, "#ffffff", 0.45)
      : mixHex(accent, "#000000", 0.2);
  const softBg = withAlpha(accent, colorScheme === "dark" ? 0.22 : 0.14);

  return {
    bg: softBg,
    border: accent,
    text: softText,
    filledBg: accent,
    filledBorder: accent,
    filledText: "#ffffff",
    softBg,
    softBorder: accent,
    softText,
  };
};
