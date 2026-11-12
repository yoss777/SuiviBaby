/**
 * Couleur d'identité de chaque type de saisie, dérivée des tokens de
 * catégorie (`itemColors` / `categoryColors` dans dashboardColors.ts) pour
 * qu'un même type garde la même couleur sur l'Accueil, le FAB, Plus, les
 * listes et les formulaires (Repas = corail partout).
 *
 * - `dark` : la couleur d'accent (icônes, pastilles, bordures). Pour un aplat
 *   portant du texte, passer par `getAccentColors(accent, scheme).filledBg`
 *   + `.filledText` (components/ui/accentColors.ts) : jamais de blanc en dur.
 * - `light` : fond pâle (thème clair) associé.
 */
import { itemColors, neutralColors } from "./dashboardColors";

export type EventColor = { dark: string; light: string };

const c = (dark: string, light: string): EventColor => ({ dark, light });

export const eventColors = {
  meal: c(itemColors.biberon, "#FEF5F3"),
  pumping: c(itemColors.pompage, "#F0F6F2"),
  miction: c(itemColors.miction, "#F0F7F7"),
  selle: c(itemColors.selle, "#F6F1EC"),
  vitamine: c(itemColors.vitamine, "#FDF8F0"),
  vaccin: c(itemColors.vaccin, "#F4F2F8"),
  sommeil: c(itemColors.sieste, "#F5F3F8"),
  bain: c(itemColors.bain, "#EEF6FD"),
  temperature: c(itemColors.temperature, "#FDF0F0"),
  medicament: c(itemColors.medicament, "#EFF3FD"),
  symptome: c(itemColors.symptome, "#FDF0F4"),
  activite: c(itemColors.activite, "#F3F9EF"),
  jalon: c(itemColors.jalon, "#FDF8F0"),
  croissance: c(itemColors.croissance, "#FDF9EE"),
  nettoyage_nez: c(itemColors.nez, "#F0F6F6"),
  default: c(neutralColors.textLight, neutralColors.backgroundPressed),
};

export type EventColorKey = Exclude<keyof typeof eventColors, "default">;
