/**
 * Dashboard Color Palette - "Pastel Moderne"
 *
 * Une palette douce et chaleureuse pour l'univers bébé,
 * avec suffisamment de contraste pour rester professionnelle.
 */

// ============================================
// CATEGORY COLORS (groupes principaux)
// ============================================

export const categoryColors = {
  alimentation: {
    primary: "#E8785A", // corail
    background: "#FEF5F3", // pêche très pâle
    border: "#FCEAE6",
  },
  sante: {
    primary: "#5BA4A4", // teal
    background: "#F0F7F7", // menthe très pâle
    border: "#E3EEEE",
  },
  sommeil: {
    primary: "#7C6BA4", // violet doux
    background: "#F5F3F8", // lavande très pâle
    border: "#EBE7F0",
  },
  moments: {
    primary: "#E8A85A", // doré
    background: "#FDF8F0", // crème
    border: "#F8EFE0",
  },
} as const;

// ============================================
// ITEM COLORS (sous-éléments)
// ============================================

export const itemColors = {
  // Alimentation
  tetee: "#D66B8F", // rose framboise
  biberon: "#E8785A", // corail (parent)
  solide: "#E89A5A", // orange pêche
  pompage: "#6BA47C", // vert sauge

  // Santé & Hygiène
  miction: "#5BA4A4", // teal (parent)
  selle: "#A47C5B", // brun doux
  vitamine: "#E8A85A", // doré
  vaccin: "#8B7CB4", // mauve
  temperature: "#E85A5A", // rouge doux
  medicament: "#5A8BE8", // bleu
  symptome: "#E85A8B", // rose vif

  // Sommeil
  sieste: "#7C6BA4", // violet (parent)
  nuit: "#5A6BA4", // bleu nuit

  // Moments
  jalon: "#E8A85A", // doré (parent)
  humeur: "#E8785A", // corail
  photo: "#6BA4A4", // teal

  // Autres
  bain: "#5AADE8", // bleu ciel
  activite: "#8BC46B", // vert pomme
  croissance: "#E8C45A", // jaune doré
} as const;

// ============================================
// NEUTRAL COLORS (textes, fonds, bordures)
// ============================================

export const neutralColors = {
  // Textes
  textStrong: "#1f2937", // gray-800
  textNormal: "#4b5563", // gray-600
  textLight: "#6b7280", // gray-500
  textMuted: "#9ca3af", // gray-400

  // Fonds
  background: "#f9fafb", // gray-50
  backgroundCard: "#ffffff",
  backgroundPressed: "#f3f4f6", // gray-100

  // Bordures
  border: "#e5e7eb", // gray-200
  borderLight: "#f3f4f6", // gray-100

  // États
  success: "#22c55e", // green-500
  warning: "#f59e0b", // amber-500
  error: "#ef4444", // red-500

  // Accents
  todayAccent: "#6366f1", // indigo-500

  // UI
  white: "#ffffff",
  shadow: "#000000",
  shimmerDark: "rgba(255, 255, 255, 0.08)",
  shimmerLight: "rgba(255, 255, 255, 0.4)",
  pressedLight: "rgba(0, 0, 0, 0.04)",
  pressedDark: "rgba(255, 255, 255, 0.08)",
  borderLightAlpha: "rgba(0, 0, 0, 0.08)",
  borderDarkAlpha: "rgba(255, 255, 255, 0.1)",

  // Metrics
  successBg: "#dcfce7",
  errorBg: "#fef2f2",
  successText: "#16a34a",
  errorText: "#dc2626",

  // Emotional screens (moments, gallery)
  backgroundWarm: "#FDF8F3",
} as const;

// ============================================
// DARK MODE VARIANTS
// ============================================

export const neutralColorsDark = {
  textStrong: "#f9fafb",
  textNormal: "#d1d5db",
  textLight: "#9ca3af",
  textMuted: "#6b7280",

  background: "#111827",
  backgroundCard: "#1f2937",
  backgroundPressed: "#374151",

  border: "#374151",
  borderLight: "#1f2937",

  success: "#22c55e",
  warning: "#f59e0b",
  error: "#ef4444",

  todayAccent: "#818cf8", // indigo-400 (brighter for dark bg)

  white: "#ffffff",
  shadow: "#000000",
  shimmerDark: "rgba(255, 255, 255, 0.08)",
  shimmerLight: "rgba(255, 255, 255, 0.4)",
  pressedLight: "rgba(255, 255, 255, 0.08)",
  pressedDark: "rgba(0, 0, 0, 0.04)",
  borderLightAlpha: "rgba(255, 255, 255, 0.1)",
  borderDarkAlpha: "rgba(0, 0, 0, 0.08)",

  successBg: "#052e16",
  errorBg: "#450a0a",
  successText: "#4ade80",
  errorText: "#f87171",

  // Emotional screens (moments, gallery)
  backgroundWarm: "#1A1714",
} as const;

export const categoryColorsDark = {
  alimentation: {
    primary: "#E8785A",
    background: "#2d1a14",
    border: "#3d2219",
  },
  sante: {
    primary: "#5BA4A4",
    background: "#162a2a",
    border: "#1f3636",
  },
  sommeil: {
    primary: "#7C6BA4",
    background: "#1a1526",
    border: "#231e33",
  },
  moments: {
    primary: "#E8A85A",
    background: "#2a1f0d",
    border: "#3a2c12",
  },
} as const;

export function getNeutralColors(scheme: "light" | "dark") {
  return scheme === "dark" ? neutralColorsDark : neutralColors;
}

export function getCategoryColors(scheme: "light" | "dark") {
  return scheme === "dark" ? categoryColorsDark : categoryColors;
}

// ============================================
// MOOD COLORS (moments components)
// ============================================

type MoodLevel = 1 | 2 | 3 | 4 | 5;

export const moodGradients = {
  light: {
    1: ["#fef2f2", "#fee2e2", "#fecaca"] as [string, string, string],
    2: ["#fffbeb", "#fef3c7", "#fde68a"] as [string, string, string],
    3: ["#eff6ff", "#dbeafe", "#bfdbfe"] as [string, string, string],
    4: ["#f0fdf4", "#dcfce7", "#bbf7d0"] as [string, string, string],
    5: ["#fdf2f8", "#fce7f3", "#fbcfe8"] as [string, string, string],
    empty: ["#f8f9fa", "#e9ecef", "#dee2e6"] as [string, string, string],
  },
  dark: {
    1: ["#450a0a", "#7f1d1d", "#991b1b"] as [string, string, string],
    2: ["#451a03", "#78350f", "#92400e"] as [string, string, string],
    3: ["#0c1929", "#172554", "#1e3a5f"] as [string, string, string],
    4: ["#052e16", "#14532d", "#166534"] as [string, string, string],
    5: ["#4a0d2e", "#831843", "#9d174d"] as [string, string, string],
    empty: ["#1f2937", "#374151", "#4b5563"] as [string, string, string],
  },
} as const;

export const moodFills: Record<"light" | "dark", Record<MoodLevel, string>> = {
  light: { 1: "#fecaca", 2: "#fde68a", 3: "#bfdbfe", 4: "#bbf7d0", 5: "#fbcfe8" },
  dark: { 1: "#991b1b", 2: "#92400e", 3: "#1e3a5f", 4: "#166534", 5: "#9d174d" },
};

export function getMoodGradients(scheme: "light" | "dark") {
  return moodGradients[scheme];
}

export function getMoodFills(scheme: "light" | "dark") {
  return moodFills[scheme];
}

// ============================================
// CHART COLORS (stats screen)
// ============================================

export function getChartColors(scheme: "light" | "dark") {
  const nc = scheme === "dark" ? neutralColorsDark : neutralColors;
  if (scheme === "dark") {
    return {
      // Tétées chart
      tetees: {
        surface: "#1f2937",
        ink: "#f9fafb",
        muted: "#9ca3af",
        border: "#374151",
        blue: "#60a5fa",
        blueDeep: "#93bbfc",
        cyan: "#22d3ee",
        green: "#34d399",
        orange: "#fb923c",
        gold: "#fbbf24",
        gradientStart: "#1e293b",
        gradientEnd: "#1f2937",
        gridLine: "rgba(148, 163, 184, 0.15)",
        emptyBar: "#374151",
        iconBadgeBg: "rgba(96, 165, 250, 0.15)",
        navButtonBg: "#374151",
        filterBg: "#374151",
        filterActiveBg: "#1f2937",
        metricBg: "#374151",
        insightBg: "rgba(96, 165, 250, 0.1)",
        insightText: "#93c5fd",
        tooltipBg: "#1f2937",
        tooltipBorder: "#4b5563",
      },
      // Pompages chart
      pompages: {
        surface: "#1f2937",
        ink: "#f9fafb",
        muted: "#9ca3af",
        border: "#374151",
        green: "#4ade80",
        greenDeep: "#86efac",
        greenGlow: "#22c55e",
        gold: "#d4a017",
        gradientStart: "#1a2e1e",
        gradientEnd: "#1f2937",
        gridLine: "rgba(74, 222, 128, 0.1)",
        emptyBar: "#374151",
        iconBadgeBg: "rgba(74, 222, 128, 0.15)",
        navButtonBg: "#374151",
        metricBg: "#374151",
        metricHighlightBg: "rgba(212, 160, 23, 0.15)",
        metricHighlightBorder: "rgba(212, 160, 23, 0.3)",
        fillGradientStart: "rgba(74, 222, 128, 0.25)",
        fillGradientEnd: "rgba(74, 222, 128, 0.02)",
        tooltipBg: "#1f2937",
        tooltipBorder: "#4b5563",
      },
    };
  }
  return {
    tetees: {
      surface: "#ffffff",
      ink: "#1e2a36",
      muted: "#6a7784",
      border: "#e5ecf2",
      blue: "#2f80ed",
      blueDeep: "#1b4f9c",
      cyan: "#0891b2",
      green: "#009e49",
      orange: "#e17832",
      gold: "#eab308",
      gradientStart: "#f5f9ff",
      gradientEnd: "#ffffff",
      gridLine: "rgba(30, 60, 90, 0.08)",
      emptyBar: "#eef2f7",
      iconBadgeBg: "#eaf1ff",
      navButtonBg: "#f2f6ff",
      filterBg: "#f5f6f8",
      filterActiveBg: "#ffffff",
      metricBg: "#f7f9fc",
      insightBg: "#eaf5fb",
      insightText: "#2f4c66",
      tooltipBg: "#ffffff",
      tooltipBorder: "#e5ecf2",
    },
    pompages: {
      surface: "#ffffff",
      ink: "#1f2a2e",
      muted: "#6b7a7f",
      border: "#e6ecef",
      green: "#2e7d32",
      greenDeep: "#1b5e20",
      greenGlow: "#7ee081",
      gold: "#b8860b",
      gradientStart: "#f4fbf5",
      gradientEnd: "#ffffff",
      gridLine: "rgba(34, 75, 44, 0.08)",
      emptyBar: "#e9eef1",
      iconBadgeBg: "#e7f4ea",
      navButtonBg: "#f2f6f5",
      metricBg: "#f6faf7",
      metricHighlightBg: "#fff9e6",
      metricHighlightBorder: "#f8e1a1",
      fillGradientStart: "rgba(46, 125, 50, 0.3)",
      fillGradientEnd: "rgba(46, 125, 50, 0.02)",
      tooltipBg: "#ffffff",
      tooltipBorder: "#d6e8da",
    },
  };
}

// ============================================
// HELPERS
// ============================================

/**
 * Génère une couleur de fond très légère à partir d'une couleur primaire
 * @param hex - Couleur hexadécimale (ex: "#E8785A")
 * @param opacity - Opacité de 0 à 1 (défaut: 0.1)
 */
export function getBackgroundTint(hex: string, opacity = 0.1): string {
  // Convertir hex en RGB
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Retourne la couleur de catégorie pour un type d'événement
 */
export function getCategoryForEventType(
  type: string,
): keyof typeof categoryColors {
  switch (type) {
    case "tetee":
    case "biberon":
    case "solide":
    case "pompage":
      return "alimentation";
    case "miction":
    case "selle":
    case "vitamine":
    case "vaccin":
    case "temperature":
    case "medicament":
    case "symptome":
      return "sante";
    case "sommeil":
    case "sieste":
    case "nuit":
    case "bain":
      return "sommeil";
    case "jalon":
    case "humeur":
    case "activite":
    case "croissance":
    default:
      return "moments";
  }
}
