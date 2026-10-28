// Deterministic grader for the voice-parsing eval.
// Compares a parser's ParsedCommandResult[] against a corpus case. Pure: no
// I/O, no clock — `now` is the corpus reference time, passed in.

import type { ParsedCommandResult } from "@/services/voice/types";

export type FieldMatcher =
  | string
  | number
  | boolean
  | { $contains: string | string[] }
  | { $in: string[] }
  | { $lteOrAbsent: number };

export type TimeExpect =
  | { ago: number }
  | { at: string; dayOffset?: number }
  | null;

export interface ExpectedEvent {
  type: string | string[];
  fields?: Record<string, FieldMatcher>;
  /** Absent = "now" (ago 0). null = not graded. */
  time?: TimeExpect;
  target?: { isLast?: boolean; at?: string };
}

export interface EvalCase {
  id: string;
  split: "dev" | "holdout";
  cat: string;
  critical?: boolean;
  text: string;
  expect: { action: "add" | "modify" | "delete"; events: ExpectedEvent[] };
}

export interface CaseResult {
  id: string;
  pass: boolean;
  reasons: string[];
}

const TIME_TOLERANCE_MS = 2 * 60 * 1000;

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function matchField(actual: unknown, matcher: FieldMatcher): boolean {
  if (typeof matcher === "object" && matcher !== null) {
    if ("$contains" in matcher) {
      const needles = Array.isArray(matcher.$contains) ? matcher.$contains : [matcher.$contains];
      return typeof actual === "string" && needles.some((n) => fold(actual).includes(fold(n)));
    }
    if ("$in" in matcher) {
      return typeof actual === "string" && matcher.$in.some((v) => fold(v) === fold(actual));
    }
    if ("$lteOrAbsent" in matcher) {
      return actual === undefined || actual === null ||
        (typeof actual === "number" && actual <= matcher.$lteOrAbsent);
    }
  }
  if (typeof matcher === "number") {
    return typeof actual === "number" && Math.abs(actual - matcher) <= 0.05;
  }
  if (typeof matcher === "string") {
    return typeof actual === "string" && fold(actual) === fold(matcher);
  }
  return actual === matcher;
}

/** Resolve "HH:MM" (+ dayOffset) against the reference day. */
function clockOn(now: Date, hhmm: string, dayOffset = 0): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(now);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

function expectedTime(now: Date, time: TimeExpect | undefined): Date | null {
  if (time === null) return null;
  if (time === undefined) return now;
  if ("ago" in time) return new Date(now.getTime() - time.ago * 60_000);
  return clockOn(now, time.at, time.dayOffset ?? 0);
}

function sameClock(a: Date, b: Date): boolean {
  return Math.abs(a.getTime() - b.getTime()) <= TIME_TOLERANCE_MS;
}

/** Returns the list of mismatches; empty = the actual command satisfies the expectation. */
function diffEvent(
  exp: ExpectedEvent,
  act: ParsedCommandResult,
  now: Date,
  action: string,
): string[] {
  const out: string[] = [];
  const types = Array.isArray(exp.type) ? exp.type : [exp.type];
  if (!types.includes(act.type)) return [`type ${act.type} ∉ [${types.join(",")}]`];

  // For modify, executeModify only writes `modifications`: grade that alone,
  // so a value present only at the top level counts as not applied.
  const source: Record<string, unknown> =
    action === "modify"
      ? ((act.modifications ?? {}) as Record<string, unknown>)
      : (act as unknown as Record<string, unknown>);

  for (const [key, matcher] of Object.entries(exp.fields ?? {})) {
    if (!matchField(source[key], matcher)) {
      out.push(`${act.type}.${key}=${JSON.stringify(source[key])} ≠ ${JSON.stringify(matcher)}`);
    }
  }

  if (exp.target) {
    const id = act.eventIdentifier;
    if (exp.target.isLast && !id?.isLast) out.push(`${act.type}: cible "dernier" absente`);
    if (exp.target.at) {
      const want = clockOn(now, exp.target.at);
      const got = id?.targetTime ? new Date(id.targetTime) : null;
      // Target times are matched on wall-clock only (the lookup is ±10 min).
      if (!got || got.getHours() !== want.getHours() || got.getMinutes() !== want.getMinutes()) {
        out.push(`${act.type}: cible ${exp.target.at} ≠ ${got ? `${got.getHours()}:${got.getMinutes()}` : "absente"}`);
      }
    }
  } else if (action === "add") {
    const want = expectedTime(now, exp.time);
    if (want && !sameClock(new Date(act.timestamp), want)) {
      out.push(`${act.type}: heure ${new Date(act.timestamp).toTimeString().slice(0, 5)} ≠ ${want.toTimeString().slice(0, 5)}`);
    }
  }
  return out;
}

export function gradeCase(
  c: EvalCase,
  action: string,
  commands: ParsedCommandResult[],
  now: Date,
): CaseResult {
  const reasons: string[] = [];
  if (c.expect.events.length > 0 && action !== c.expect.action) {
    reasons.push(`action ${action} ≠ ${c.expect.action}`);
  }

  // Greedy matching: each expected event claims the first actual command
  // that satisfies it fully; leftovers on either side are failures.
  const remaining = [...commands];
  for (const exp of c.expect.events) {
    const idx = remaining.findIndex((act) => diffEvent(exp, act, now, action).length === 0);
    if (idx >= 0) {
      remaining.splice(idx, 1);
      continue;
    }
    // Explain against the closest candidate of a compatible type.
    const types = Array.isArray(exp.type) ? exp.type : [exp.type];
    const near = remaining.find((a) => types.includes(a.type));
    reasons.push(near ? diffEvent(exp, near, now, action).join("; ") : `manquant: ${types.join("|")}`);
    if (near) remaining.splice(remaining.indexOf(near), 1);
  }
  for (const extra of remaining) reasons.push(`en trop: ${extra.type}`);

  return { id: c.id, pass: reasons.length === 0, reasons };
}
