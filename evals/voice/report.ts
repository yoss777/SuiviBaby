// Aggregation + console report shared by every parser eval.
import * as fs from "fs";
import * as path from "path";
import type { CaseResult, EvalCase } from "./grader";

export interface Summary {
  parser: string;
  total: { pass: number; n: number };
  bySplit: Record<string, { pass: number; n: number }>;
  byCat: Record<string, { pass: number; n: number }>;
  failures: { id: string; text: string; reasons: string[] }[];
  extra?: Record<string, unknown>;
}

const bump = (m: Record<string, { pass: number; n: number }>, k: string, ok: boolean) => {
  m[k] ??= { pass: 0, n: 0 };
  m[k].n++;
  if (ok) m[k].pass++;
};

export function summarize(parser: string, cases: EvalCase[], results: CaseResult[]): Summary {
  const s: Summary = { parser, total: { pass: 0, n: 0 }, bySplit: {}, byCat: {}, failures: [] };
  results.forEach((r, i) => {
    const c = cases[i];
    s.total.n++;
    if (r.pass) s.total.pass++;
    bump(s.bySplit, c.split, r.pass);
    bump(s.byCat, c.cat, r.pass);
    if (!r.pass) s.failures.push({ id: c.id, text: c.text, reasons: r.reasons });
  });
  return s;
}

const pct = ({ pass, n }: { pass: number; n: number }) =>
  `${pass}/${n} (${n ? Math.round((100 * pass) / n) : 0} %)`;

export function printSummary(s: Summary): string {
  const lines = [
    `=== ${s.parser} ===`,
    `Total    : ${pct(s.total)}`,
    ...Object.entries(s.bySplit).map(([k, v]) => `  ${k.padEnd(8)}: ${pct(v)}`),
    "Par catégorie :",
    ...Object.entries(s.byCat).map(([k, v]) => `  ${k.padEnd(10)}: ${pct(v)}`),
    "Échecs :",
    ...s.failures.map((f) => `  ${f.id} « ${f.text} » → ${f.reasons.join(" | ")}`),
  ];
  return lines.join("\n");
}

export function writeResult(name: string, s: Summary): string {
  const file = path.join(__dirname, "results", `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(s, null, 2));
  return file;
}
