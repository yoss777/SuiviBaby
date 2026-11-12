// Contraste réel des couleurs d'accent (audit V2 R-P0-1, N6, N7) : chaque type
// de saisie, dans les deux thèmes, doit porter un texte lisible (>= 4.5:1) sur
// son bouton principal (pied collant des formulaires) et sur ses puces.
import { getAccentColors, mixHex, withAlpha } from "@/components/ui/accentColors";
import { DESTRUCTIVE_COLOR } from "@/components/ui/ConfirmModal";
import {
  categoryColors,
  itemColors,
  neutralColors,
  neutralColorsDark,
} from "@/constants/dashboardColors";
import { EVENT_CONFIG } from "@/constants/dashboardConfig";
import { eventColors, type EventColorKey } from "@/constants/eventColors";
import { Colors, contrastRatio } from "@/constants/theme";

// Les 15 types de saisie (un formulaire / une feuille chacun).
const ENTRY_TYPES: EventColorKey[] = [
  "meal",
  "pumping",
  "miction",
  "selle",
  "vitamine",
  "vaccin",
  "sommeil",
  "bain",
  "temperature",
  "medicament",
  "symptome",
  "activite",
  "jalon",
  "croissance",
  "nettoyage_nez",
];

const SCHEMES = ["light", "dark"] as const;
const SURFACES = {
  light: [neutralColors.background, neutralColors.backgroundCard],
  dark: [neutralColorsDark.background, neutralColorsDark.backgroundCard],
} as const;

describe("couleurs d'accent des formulaires", () => {
  it("couvre bien les 15 types de saisie", () => {
    expect(ENTRY_TYPES).toHaveLength(15);
    expect(Object.keys(eventColors).filter((k) => k !== "default").sort()).toEqual(
      [...ENTRY_TYPES].sort(),
    );
  });

  it.each(SCHEMES)("bouton principal : filledText sur filledBg >= 4.5:1 (%s)", (scheme) => {
    for (const type of ENTRY_TYPES) {
      const ac = getAccentColors(eventColors[type].dark, scheme);
      const ratio = contrastRatio(ac.filledText, ac.filledBg);
      if (ratio < 4.5) throw new Error(`${type} (${scheme}) : ${ratio.toFixed(2)}:1`);
    }
  });

  it.each(SCHEMES)("puces : softText sur softBg >= 4.5:1 sur chaque surface (%s)", (scheme) => {
    for (const type of ENTRY_TYPES) {
      const accent = eventColors[type].dark;
      const ac = getAccentColors(accent, scheme);
      const alpha = scheme === "dark" ? 0.22 : 0.14;
      for (const surface of SURFACES[scheme]) {
        const composite = mixHex(surface, accent, alpha);
        const ratio = contrastRatio(ac.softText, composite);
        if (ratio < 4.5) {
          throw new Error(`${type} (${scheme}, ${surface}) : ${ratio.toFixed(2)}:1`);
        }
      }
    }
  });

  it("l'aplat clair garde la teinte de la catégorie (on ne fonce que si nécessaire)", () => {
    // Couleur déjà lisible sous du blanc : inchangée.
    expect(getAccentColors("#4f46e5", "light").filledBg).toBe("#4f46e5");
    // Corail : foncé, mais reste un corail (rouge dominant).
    const coral = getAccentColors(itemColors.biberon, "light").filledBg;
    expect(coral).not.toBe(itemColors.biberon);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(coral.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it("met en cache le résultat (même objet à chaque rendu)", () => {
    expect(getAccentColors(itemColors.bain, "dark")).toBe(getAccentColors(itemColors.bain, "dark"));
  });

  it("withAlpha ajoute un canal alpha à 2 chiffres", () => {
    expect(withAlpha("#000000", 0.5)).toBe("#00000080");
  });
});

describe("identité de catégorie cohérente (Accueil, FAB, Plus, formulaires)", () => {
  it("eventColors dérive des tokens de catégorie", () => {
    expect(eventColors.meal.dark).toBe(categoryColors.alimentation.primary);
    expect(eventColors.miction.dark).toBe(categoryColors.sante.primary);
    expect(eventColors.sommeil.dark).toBe(categoryColors.sommeil.primary);
    expect(eventColors.jalon.dark).toBe(categoryColors.moments.primary);
    const palette = new Set<string>(Object.values(itemColors));
    for (const type of ENTRY_TYPES) {
      expect(palette.has(eventColors[type].dark)).toBe(true);
    }
  });

  it("EVENT_CONFIG (listes) utilise la même palette", () => {
    const palette = new Set<string>(Object.values(itemColors));
    for (const [key, cfg] of Object.entries(EVENT_CONFIG)) {
      if (!palette.has(cfg.color)) throw new Error(`${key} : ${cfg.color} hors palette`);
    }
  });
});

describe("barre d'onglets et rouge destructif", () => {
  it.each(SCHEMES)("onglet actif (tint) >= 4.5:1 sur le fond de la barre (%s)", (scheme) => {
    // La barre prend le fond `card` du thème de navigation = nc.background.
    const nc = scheme === "dark" ? neutralColorsDark : neutralColors;
    expect(Colors[scheme].background).toBe(nc.background);
    expect(contrastRatio(Colors[scheme].tabIconSelected, nc.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(Colors[scheme].tabIconDefault, nc.background)).toBeGreaterThanOrEqual(4.5);
  });

  it("un seul rouge destructif, lisible sous du blanc", () => {
    expect(DESTRUCTIVE_COLOR).toBe(neutralColors.destructive);
    expect(neutralColorsDark.destructive).toBe(neutralColors.destructive);
    expect(contrastRatio(neutralColors.onDestructive, DESTRUCTIVE_COLOR)).toBeGreaterThanOrEqual(4.5);
  });
});
