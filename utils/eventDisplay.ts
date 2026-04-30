// utils/eventDisplay.ts
//
// Pure formatting helpers for event display in the home tab's recent
// events list. Extracted from home.tsx (S3-T1e) — no React, no state,
// just `(event, …) => string | undefined`.

import { MOMENT_REPAS_LABELS, MOOD_EMOJIS } from "@/constants/dashboardConfig";
import { formatSleepLocationWithNote } from "@/utils/sleepDisplay";

export const BIBERON_TYPE_LABELS: Record<string, string> = {
  lait_maternel: "Lait maternel",
  lait_infantile: "Lait infantile",
  eau: "Eau",
  jus: "Jus",
  autre: "Autre",
};

interface BuildEventDetailsDeps {
  toDate: (value: unknown) => Date;
  formatDuration: (minutes: number) => string;
}

/**
 * Returns the multi-field detail string shown under each event in the
 * recent-events list. Receives `toDate` + `formatDuration` as injected
 * deps so this function stays pure (no module-level coupling with the
 * date-helpers cache layers).
 */
export function buildEventDetails(
  event: any,
  { toDate, formatDuration }: BuildEventDetailsDeps,
): string | undefined {
  switch (event.type) {
    case "biberon": {
      const typeLabel = event.typeBiberon
        ? BIBERON_TYPE_LABELS[event.typeBiberon]
        : null;
      const quantity = event.quantite ? `${event.quantite} ml` : null;
      const parts = [typeLabel, quantity].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    case "solide": {
      const typeLabels: Record<string, string> = {
        puree: "Purée",
        compote: "Compote",
        cereales: "Céréales",
        yaourt: "Yaourt",
        morceaux: "Morceaux",
        autre: "Autre",
      };
      const qtyLabels: Record<string, string> = {
        peu: "Un peu",
        moyen: "Moyen",
        beaucoup: "Beaucoup",
      };
      const momentLabel = event.momentRepas
        ? MOMENT_REPAS_LABELS[event.momentRepas]
        : null;
      const qtyLabel = event.quantite
        ? `Qté : ${qtyLabels[event.quantite]}`
        : null;
      const typeLabel = event.typeSolide
        ? typeLabels[event.typeSolide]
        : null;
      const line1Parts = [momentLabel, typeLabel, qtyLabel].filter(Boolean);
      const line1 = line1Parts.length > 0 ? line1Parts.join(" · ") : null;
      const ingredients =
        typeof event.ingredients === "string" ? event.ingredients.trim() : "";
      const newFood =
        event.nouveauAliment && typeof event.nomNouvelAliment === "string"
          ? event.nomNouvelAliment.trim()
          : "";
      const hasLike = typeof event.aime === "boolean";
      const likeTarget = ingredients || newFood;
      const likeSubject =
        !ingredients && newFood ? "ce nouveau plat" : "ce plat";
      const likeLabel = hasLike
        ? `${event.aime ? "A aimé" : "N'a pas aimé"} ${likeSubject}${
            likeTarget ? ` : ${likeTarget}` : ""
          }`
        : null;
      const parts = [
        line1,
        likeLabel,
        ingredients && (!hasLike || likeTarget !== ingredients)
          ? `Ingrédients : ${ingredients}`
          : null,
        newFood && (!hasLike || likeTarget !== newFood)
          ? `Nouvel aliment : ${newFood}`
          : null,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join("\n") : undefined;
    }
    case "tetee": {
      const left = event.dureeGauche ? `G ${event.dureeGauche} min` : null;
      const right = event.dureeDroite ? `D ${event.dureeDroite} min` : null;
      const parts = [left, right].filter(Boolean);
      return parts.length > 0 ? parts.join(" • ") : undefined;
    }
    case "pompage": {
      const left = event.quantiteGauche
        ? `G ${event.quantiteGauche} ml`
        : null;
      const right = event.quantiteDroite
        ? `D ${event.quantiteDroite} ml`
        : null;
      const parts = [left, right].filter(Boolean);
      return parts.length > 0 ? parts.join(" • ") : undefined;
    }
    case "croissance": {
      const parts = [
        event.poidsKg ? `${event.poidsKg} kg` : null,
        event.tailleCm ? `${event.tailleCm} cm` : null,
        event.teteCm ? `PC ${event.teteCm} cm` : null,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    case "miction":
      return event.volume ? `${event.volume} ml` : event.couleur;
    case "selle":
      return event.consistance || event.couleur;
    case "vitamine": {
      const name = event.nomVitamine || "Vitamine";
      return event.dosage ? `${name} · ${event.dosage}` : name;
    }
    case "sommeil": {
      const start = event.heureDebut
        ? toDate(event.heureDebut)
        : toDate(event.date);
      const end = event.heureFin ? toDate(event.heureFin) : null;
      const duration =
        event.duree ??
        (end ? Math.round((end.getTime() - start.getTime()) / 60000) : 0);

      const locationLabel = formatSleepLocationWithNote(
        event.location,
        event.note,
      );
      const parts = [
        end ? formatDuration(duration) : null, // Only show duration if sleep is finished
        locationLabel,
        event.quality,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    case "bain": {
      const parts = [
        event.duree ? `${event.duree} min` : null,
        event.temperatureEau ? `${event.temperatureEau}°C` : null,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    case "nettoyage_nez": {
      const methodeLabels: Record<string, string> = {
        serum: "Sérum",
        mouche_bebe: "Mouche-bébé",
        coton: "Coton",
        autre: "Autre",
      };
      const resultatLabels: Record<string, string> = {
        efficace: "Efficace",
        mucus_clair: "Clair",
        mucus_epais: "Épais",
        mucus_colore: "Coloré",
      };
      const parts = [
        event.methode ? methodeLabels[event.methode] : null,
        event.resultat ? resultatLabels[event.resultat] : null,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    case "temperature": {
      const value =
        typeof event.valeur === "number" ? `${event.valeur}°C` : undefined;
      const parts = [value, event.modePrise].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    case "medicament": {
      const name = event.nomMedicament || "Médicament";
      return event.dosage ? `${name} · ${event.dosage}` : name;
    }
    case "symptome": {
      const list = Array.isArray(event.symptomes)
        ? event.symptomes.join(", ")
        : undefined;
      const parts = [list, event.intensite].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    case "vaccin": {
      const name = event.nomVaccin || "Vaccin";
      return event.dosage ? `${name} · ${event.dosage}` : name;
    }
    case "activite": {
      const isOther = event.typeActivite === "autre";
      const parts = [
        event.duree ? formatDuration(event.duree) : null,
        isOther ? null : event.description,
      ].filter(Boolean);
      return parts.length > 0 ? parts.join(" · ") : undefined;
    }
    case "jalon": {
      if (event.typeJalon === "humeur") {
        return typeof event.humeur === "number"
          ? MOOD_EMOJIS[event.humeur as 1 | 2 | 3 | 4 | 5]
          : undefined;
      }
      return event.description || undefined;
    }
    default:
      return undefined;
  }
}

/**
 * Returns "Aujourd'hui" / "Hier" / a localised long-date label for a
 * given calendar day. Used as the section header in the recent-events
 * timeline.
 */
export function getDayLabel(date: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const eventDay = new Date(date);
  eventDay.setHours(0, 0, 0, 0);

  if (eventDay.getTime() === today.getTime()) {
    return "Aujourd'hui";
  }
  if (eventDay.getTime() === yesterday.getTime()) {
    return "Hier";
  }
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
