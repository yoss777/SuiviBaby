// Allergies connues d'un enfant : règles de validation partagées (UI, PDF).
// Les mêmes bornes sont appliquées côté firestore.rules (children.allergies).
import { ALLERGENES_OPTIONS } from "@/constants/dashboardConfig";

export const MAX_ALLERGIES = 15;
export const MAX_ALLERGY_LENGTH = 40;

/** Suggestions : libellés de la liste des allergènes des repas. */
export const ALLERGY_SUGGESTIONS = ALLERGENES_OPTIONS.map((o) => ({
  label: o.label,
  emoji: o.emoji,
}));

export type AddAllergyResult =
  | { ok: true; list: string[] }
  | { ok: false; reason: "empty" | "duplicate" | "limit"; list: string[] };

const normalize = (s: string) => s.trim().toLocaleLowerCase("fr");

export function hasAllergy(list: string[], value: string): boolean {
  const key = normalize(value);
  return list.some((a) => normalize(a) === key);
}

/** Ajoute une allergie (trim, 40 car. max, sans doublon insensible à la casse, 15 max). */
export function addAllergy(list: string[], raw: string): AddAllergyResult {
  const value = raw.trim().slice(0, MAX_ALLERGY_LENGTH).trim();
  if (!value) return { ok: false, reason: "empty", list };
  if (hasAllergy(list, value)) return { ok: false, reason: "duplicate", list };
  if (list.length >= MAX_ALLERGIES) return { ok: false, reason: "limit", list };
  return { ok: true, list: [...list, value] };
}

export function removeAllergy(list: string[], value: string): string[] {
  const key = normalize(value);
  return list.filter((a) => normalize(a) !== key);
}

/** Nettoie une valeur lue en base (types, vides, doublons, bornes). */
export function sanitizeAllergies(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  let out: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const res = addAllergy(out, item);
    if (res.ok) out = res.list;
  }
  return out;
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Ligne « Allergies : … » du rapport PDF (HTML échappé), vide s'il n'y en a pas. */
export function buildAllergiesReportLine(allergies: unknown): string {
  const list = sanitizeAllergies(allergies);
  if (list.length === 0) return "";
  return `<div class="subtitle">Allergies : ${list.map(escapeHtml).join(", ")}</div>`;
}
