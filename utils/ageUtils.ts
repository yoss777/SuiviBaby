// utils/ageUtils.ts
// Centralized age calculation utilities for baby tracking

export type AgeTier =
  | "newborn" // 0-1 mois
  | "infant" // 1-6 mois
  | "older_infant" // 6-12 mois
  | "toddler" // 12-24 mois
  | "preschooler"; // 24+ mois

/**
 * Accepts:
 * - Date object
 * - Firestore Timestamp ({ toDate() } or { seconds, nanoseconds })
 * - Legacy DD/MM/YYYY string (older docs in DB)
 */
export type BirthDateInput =
  | Date
  | string
  | { toDate: () => Date }
  | { seconds: number; nanoseconds?: number }
  | null
  | undefined;

export function parseBirthDateOrNull(birthDate: BirthDateInput): Date | null {
  const parsed = parseBirthDate(birthDate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseBirthDate(birthDate: BirthDateInput): Date {
  if (!birthDate) return new Date(NaN);
  if (birthDate instanceof Date) return birthDate;
  if (typeof birthDate === "object") {
    if ("toDate" in birthDate && typeof birthDate.toDate === "function") {
      return birthDate.toDate();
    }
    if ("seconds" in birthDate && typeof birthDate.seconds === "number") {
      return new Date(birthDate.seconds * 1000);
    }
    return new Date(NaN);
  }
  // Legacy DD/MM/YYYY string format
  const parts = birthDate.split("/").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
    return new Date(NaN);
  }
  const [day, month, year] = parts;
  return new Date(year, month - 1, day);
}

/**
 * Get age in days
 */
export function getAgeInDays(birthDate: BirthDateInput): number {
  const birth = parseBirthDate(birthDate);
  const now = new Date();
  const diffMs = now.getTime() - birth.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Get age in weeks (floored)
 */
export function getAgeInWeeks(birthDate: BirthDateInput): number {
  return Math.floor(getAgeInDays(birthDate) / 7);
}

/**
 * Get age in months (calendar-based, same logic as existing calculateAge)
 */
export function getAgeInMonths(birthDate: BirthDateInput): number {
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
export function getAgeTier(birthDate: BirthDateInput): AgeTier {
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
export function getAgeLabel(birthDate: BirthDateInput): string {
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
 * Format a birth date for display (handles legacy DD/MM/YYYY string and
 * Firestore Timestamp). Returns "" if the date can't be parsed.
 */
export function formatBirthDate(birthDate: BirthDateInput): string {
  // Keep legacy strings as-is — they're already in DD/MM/YYYY for display.
  if (typeof birthDate === "string") return birthDate;
  const parsed = parseBirthDate(birthDate);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleDateString("fr-FR");
}

/**
 * Get a short age label for compact display: "2m", "1a4m"
 */
export function getAgeShortLabel(birthDate: BirthDateInput): string {
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
