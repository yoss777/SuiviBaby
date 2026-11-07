// utils/chronoWindow.ts
//
// Fenêtre de lecture du journal. Élargir la fenêtre (14 -> 30 jours) ne relit
// plus les 14 jours déjà chargés : un second écouteur ne couvre que la
// tranche plus ancienne (jours 15 à 30). S7.7.

/** Début (minuit local) d'une fenêtre de `days` jours, aujourd'hui compris. */
export function windowStart(days: number, from: Date = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  d.setDate(d.getDate() - (days - 1));
  return d;
}

/**
 * Tranche plus ancienne à charger quand la fenêtre passe de `liveDays` (déjà
 * écoutée) à `maxDays`. `null` si rien à ajouter. `jusqu` est 1 ms avant le
 * début de la fenêtre déjà écoutée : les deux plages ne se chevauchent pas.
 */
export function olderSliceBounds(
  liveDays: number,
  maxDays: number,
  from: Date = new Date(),
): { depuis: Date; jusqu: Date } | null {
  if (maxDays <= liveDays) return null;
  const depuis = windowStart(maxDays, from);
  const jusqu = new Date(windowStart(liveDays, from).getTime() - 1);
  return { depuis, jusqu };
}
