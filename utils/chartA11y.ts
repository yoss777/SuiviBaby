/**
 * Aides d'accessibilité des graphiques : libellés de jours en toutes lettres
 * et phrases de résumé lues par VoiceOver / TalkBack.
 * Pas d'Intl : sortie déterministe (tests) et identique sur tous les moteurs.
 */

const JOURS_LONGS = [
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
  "Dimanche",
] as const;

const MOIS_LONGS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

/** « Mardi 4 novembre » pour chaque jour de la semaine (lundi → dimanche). */
export function getWeekDayLabels(weekStartMs: number): string[] {
  return JOURS_LONGS.map((jour, index) => {
    const d = new Date(weekStartMs);
    d.setDate(d.getDate() + index);
    return `${jour} ${d.getDate()} ${MOIS_LONGS[d.getMonth()]}`;
  });
}

/** Accord simple : « 1 repas », « 6 repas ». Pas de pluriel à 0 ou 1. */
export function pluralize(count: number, singular: string, plural?: string) {
  const word = count > 1 ? (plural ?? `${singular}s`) : singular;
  return `${count} ${word}`;
}

/** 450 → « 7 heures 30 », 60 → « 1 heure », 0 → « 0 minute ». */
export function formatMinutesSpoken(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return pluralize(m, "minute");
  const hours = pluralize(h, "heure");
  return m === 0 ? hours : `${hours} ${m}`;
}

/** Phrase par jour : « Mardi 4 novembre : 6 repas, 720 ml ». */
export function buildDayEntries(
  dayLabels: string[],
  details: string[],
): string[] {
  return dayLabels.map((label, i) => `${label} : ${details[i] ?? "aucune donnée"}`);
}
