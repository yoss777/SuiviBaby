// utils/ageUtils.ts
// Centralized age calculation utilities for baby tracking

export type AgeTier =
  | "newborn" // 0-1 mois
  | "infant" // 1-6 mois
  | "older_infant" // 6-12 mois
  | "toddler" // 12-24 mois
  | "preschooler"; // 24+ mois

/**
 * Parse a birth date from DD/MM/YYYY string or Date object
 */
function parseBirthDate(birthDate: string | Date): Date {
  if (birthDate instanceof Date) return birthDate;
  const [day, month, year] = birthDate.split("/").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Get age in days
 */
export function getAgeInDays(birthDate: string | Date): number {
  const birth = parseBirthDate(birthDate);
  const now = new Date();
  const diffMs = now.getTime() - birth.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Get age in weeks (floored)
 */
export function getAgeInWeeks(birthDate: string | Date): number {
  return Math.floor(getAgeInDays(birthDate) / 7);
}

/**
 * Get age in months (calendar-based, same logic as existing calculateAge)
 */
export function getAgeInMonths(birthDate: string | Date): number {
  const birth = parseBirthDate(birthDate);
  const now = new Date();
  let totalMonths =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) {
    totalMonths -= 1;
  }
  return Math.max(0, totalMonths);
}

/**
 * Get the age tier based on age in months
 */
export function getAgeTier(birthDate: string | Date): AgeTier {
  const months = getAgeInMonths(birthDate);
  if (months < 1) return "newborn";
  if (months < 6) return "infant";
  if (months < 12) return "older_infant";
  if (months < 24) return "toddler";
  return "preschooler";
}

/**
 * Get formatted age label: "2 mois et 3 semaines", "1 an 4 mois", etc.
 */
export function getAgeLabel(birthDate: string | Date): string {
  const birth = parseBirthDate(birthDate);
  const now = new Date();

  let totalMonths =
    (now.getFullYear() - birth.getFullYear()) * 12 +
    (now.getMonth() - birth.getMonth());
  if (now.getDate() < birth.getDate()) {
    totalMonths -= 1;
  }
  if (totalMonths < 0) totalMonths = 0;

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  // Less than 1 month: show weeks
  if (totalMonths === 0) {
    const weeks = getAgeInWeeks(birthDate);
    if (weeks === 0) {
      const days = getAgeInDays(birthDate);
      return days <= 1 ? "1 jour" : `${days} jours`;
    }
    return weeks === 1 ? "1 semaine" : `${weeks} semaines`;
  }

  if (years === 0) {
    return `${totalMonths} mois`;
  }
  if (months === 0) {
    return years === 1 ? "1 an" : `${years} ans`;
  }
  const yearText = years === 1 ? "an" : "ans";
  return `${years} ${yearText} ${months} mois`;
}

/**
 * Get a short age label for compact display: "2m", "1a4m"
 */
export function getAgeShortLabel(birthDate: string | Date): string {
  const totalMonths = getAgeInMonths(birthDate);
  if (totalMonths === 0) {
    const weeks = getAgeInWeeks(birthDate);
    return `${weeks}s`;
  }
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (years === 0) return `${months}m`;
  if (months === 0) return `${years}a`;
  return `${years}a${months}m`;
}
