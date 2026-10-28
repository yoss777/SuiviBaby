// Maps the sanitized answer of the parseVoiceCommand Cloud Function onto the
// ParsedCommandResult contract the rest of the voice pipeline already uses
// (confirmation messages, executeCommand, formatDataForFirebase).
//
// Time references are resolved here, on the phone, so "à 13h" means 13:00 in
// the parent's timezone — the server and the model never compute dates.

import type { CommandAction, CommandType, EventIdentifier, ParsedCommandResult } from "./types";

export type LlmTimeRef =
  | { kind: "now" }
  | { kind: "ago"; minutesAgo: number }
  | { kind: "at"; clock: string; dayOffset?: number };

export type LlmTargetRef =
  | { kind: "last" }
  | { kind: "ago"; minutesAgo: number }
  | { kind: "at"; clock: string; dayOffset?: number };

export interface LlmEvent {
  type: string;
  time?: LlmTimeRef;
  target?: LlmTargetRef;
  quantiteMl?: number;
  typeBiberon?: string;
  coteGauche?: boolean;
  coteDroit?: boolean;
  dureeMin?: number;
  quantiteGaucheMl?: number;
  quantiteDroiteMl?: number;
  pipi?: boolean;
  popo?: boolean;
  consistance?: string;
  couleur?: string;
  nomVitamine?: string;
  typeActivite?: string;
  typeJalon?: string;
  humeur?: number;
  poidsKg?: number;
  tailleCm?: number;
  perimetreCranienCm?: number;
  typeSolide?: string;
  momentRepas?: string;
  quantiteSolide?: string;
  temperatureC?: number;
  nomMedicament?: string;
  dosage?: string;
  description?: string;
  nomVaccin?: string;
  methode?: string;
  note?: string;
  /** Server-side: fields the model returned out of bounds, dropped. */
  ignored?: string[];
}

export interface LlmParseResult {
  action: CommandAction | "none";
  events: LlmEvent[];
  truncated: boolean;
}

/** A clock time this far ahead of "now" is still read as today (clock skew). */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

function atClock(base: Date, clock: string, dayOffset = 0): Date {
  const [h, m] = clock.split(":").map(Number);
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * "à 22h" said at 14:30 means yesterday 22:00: voice entries record what
 * happened, and the server rejects dates more than 5 minutes ahead.
 */
export function resolveTimeRef(ref: LlmTimeRef | undefined, now: Date): Date {
  if (!ref || ref.kind === "now") return new Date(now);
  if (ref.kind === "ago") return new Date(now.getTime() - ref.minutesAgo * 60_000);
  const d = atClock(now, ref.clock, ref.dayOffset ?? 0);
  if (d.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) d.setDate(d.getDate() - 1);
  return d;
}

function toIdentifier(type: CommandType, target: LlmTargetRef | undefined, now: Date): EventIdentifier {
  if (target?.kind === "at") return { type, targetTime: resolveTimeRef(target, now) };
  // "celui que je viens de donner" → ago 0; the finder treats relativeTime 0
  // as "no identifier", so map it to the latest event instead.
  if (target?.kind === "ago" && target.minutesAgo > 0) return { type, relativeTime: target.minutesAgo };
  return { type, isLast: true };
}

/** Value fields in the legacy ParsedCommandResult vocabulary. */
function valueFields(e: LlmEvent, action: CommandAction): Partial<ParsedCommandResult> {
  const v: Partial<ParsedCommandResult> = {
    typeBiberon: e.typeBiberon,
    quantiteGauche: e.quantiteGaucheMl,
    quantiteDroite: e.quantiteDroiteMl,
    consistance: e.consistance,
    couleur: e.couleur,
    nomVitamine: e.nomVitamine,
    typeActivite: e.typeActivite,
    typeJalon: e.typeJalon,
    humeur: e.humeur,
    poids: e.poidsKg,
    taille: e.tailleCm,
    perimetreCranien: e.perimetreCranienCm,
    typeSolide: e.typeSolide,
    momentRepas: e.momentRepas,
    quantiteSolide: e.quantiteSolide,
    valeurTemperature: e.temperatureC,
    nomMedicament: e.nomMedicament,
    dosage: e.dosage,
    descriptionSymptome: e.description,
    nomVaccin: e.nomVaccin,
    methode: e.methode,
  };
  // Legacy quirks kept on purpose: biberon volume and, for a new tetee, its
  // duration live in `quantite` (firebaseFormatter turns the latter into
  // `duree`). executeModify writes `modifications.quantite` as-is, though, so
  // a tetee correction must target `duree`, the stored field.
  if (e.type === "biberon") v.quantite = e.quantiteMl;
  if (e.type === "tetee" && action === "add") v.quantite = e.dureeMin;
  else v.duree = e.dureeMin;

  for (const key of Object.keys(v) as (keyof typeof v)[]) {
    if (v[key] === undefined) delete v[key];
  }
  return v;
}

function diaperFlags(e: LlmEvent): Partial<Pick<ParsedCommandResult, "pipi" | "popo">> {
  switch (e.type) {
    case "miction": return { pipi: true, popo: false };
    case "selle": return { pipi: false, popo: true };
    case "couche": return { pipi: e.pipi ?? !e.popo, popo: e.popo ?? false };
    default: return {};
  }
}

function sideFlags(e: LlmEvent): Partial<Pick<ParsedCommandResult, "coteGauche" | "coteDroit">> {
  if (e.type !== "tetee") return {};
  const gauche = e.coteGauche === true;
  const droit = e.coteDroit === true;
  // Same default as detectTetee: no side said → left breast.
  return gauche || droit ? { coteGauche: gauche, coteDroit: droit } : { coteGauche: true, coteDroit: false };
}

export function mapLlmParseResult(
  result: LlmParseResult,
  rawText: string,
  now: Date = new Date(),
): { commands: ParsedCommandResult[]; truncated: boolean } {
  if (result.action === "none") return { commands: [], truncated: false };
  const action: CommandAction = result.action;

  const commands = result.events.map((e): ParsedCommandResult => {
    const type = e.type as CommandType;
    const values = valueFields(e, action);
    const timestamp = action === "add" ? resolveTimeRef(e.time, now) : new Date(now);
    const cmd: ParsedCommandResult = {
      type,
      action,
      rawText,
      childId: "",
      timestamp,
      timeOffset: Math.max(0, Math.round((now.getTime() - timestamp.getTime()) / 60_000)),
      isFuture: false,
      ...values,
      ...diaperFlags(e),
      ...sideFlags(e),
    };
    if (e.note) cmd.contextNote = e.note;
    if (e.ignored?.length) cmd.ignoredFields = e.ignored;
    if (action !== "add") {
      cmd.eventIdentifier = toIdentifier(type, e.target, now);
      if (action === "modify") cmd.modifications = values;
    }
    return cmd;
  });

  return { commands, truncated: result.truncated };
}
