// Grades the raw LLM answers produced by run-llm.js. Skips when no run exists.
//   node evals/voice/run-llm.js claude-haiku-5-5 && npx jest --config evals/jest.config.js
import * as fs from "fs";
import * as path from "path";
import corpus from "./corpus.json";
import { gradeCase, type EvalCase } from "./grader";
import { printSummary, summarize, writeResult } from "./report";
import { mapLlmParseResult, type LlmParseResult } from "@/services/voice/llmMapper";

interface Run {
  id: string;
  attempt: number;
  ms: number;
  result?: LlmParseResult;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  error?: string;
}

const NOW = new Date(corpus.referenceNow);
const cases = corpus.cases as EvalCase[];
const resultsDir = path.join(__dirname, "results");
const runFiles = fs.readdirSync(resultsDir).filter((f) => /^llm-.*\.json$/.test(f));

// $/MTok: input, output, cache read, cache write (5 min).
const PRICES: Record<string, [number, number, number, number]> = {
  "claude-haiku-5-5": [0.1, 0.5, 0.01, 0.125],
  "claude-opus-5-5": [4, 20, 0.2, 5],
};

const percentile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};

function grade(run: Run, c: EvalCase) {
  if (!run.result) return { id: c.id, pass: false, reasons: [`erreur: ${run.error}`] };
  const { commands } = mapLlmParseResult(run.result, c.text, NOW);
  const action = run.result.action === "none" ? "add" : run.result.action;
  return gradeCase(c, action, commands, NOW);
}

(runFiles.length ? describe : describe.skip)("LLM parser", () => {
  for (const file of runFiles) {
    test(file, () => {
      const data = JSON.parse(fs.readFileSync(path.join(resultsDir, file), "utf8"));
      const runs: Run[] = data.runs;
      const graded = cases.filter((c) => runs.some((r) => r.id === c.id));

      // pass@1 on the first attempt of every case.
      const first = graded.map((c) => grade(runs.find((r) => r.id === c.id && r.attempt === 0)!, c));
      const summary = summarize(`LLM ${data.model}`, graded, first);

      // pass^3 on critical cases: every attempt must pass.
      const critical = graded.filter((c) => c.critical);
      const stable = critical.filter((c) =>
        runs.filter((r) => r.id === c.id).every((r) => grade(r, c).pass));

      const ms = runs.map((r) => r.ms);
      const price = PRICES[data.model];
      const cost = price
        ? runs.reduce((sum, r) => {
          const u = r.usage ?? {};
          return sum + ((u.input_tokens ?? 0) * price[0] + (u.output_tokens ?? 0) * price[1] +
            (u.cache_read_input_tokens ?? 0) * price[2] + (u.cache_creation_input_tokens ?? 0) * price[3]) / 1e6;
        }, 0) / runs.length
        : NaN;

      summary.extra = {
        "pass^3 (critiques)": `${stable.length}/${critical.length}`,
        "latence p50 / p95 (ms)": `${percentile(ms, 50)} / ${percentile(ms, 95)}`,
        "coût moyen par commande ($)": cost.toFixed(5),
        "cache lu (appels)": `${runs.filter((r) => (r.usage?.cache_read_input_tokens ?? 0) > 0).length}/${runs.length}`,
        "erreurs": runs.filter((r) => r.error).length,
      };
      // eslint-disable-next-line no-console
      console.log(printSummary(summary) + "\n" +
        Object.entries(summary.extra).map(([k, v]) => `${k}: ${v}`).join("\n"));
      writeResult(file.replace(/^llm-/, "graded-llm-").replace(/\.json$/, ""), summary);
      expect(first.length).toBe(graded.length);
    });
  }
});
