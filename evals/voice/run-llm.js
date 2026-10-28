#!/usr/bin/env node
// Runs the real LLM parser (functions/lib/voiceParse.js) over the eval corpus
// and stores raw sanitized answers + latency + token usage. Grading happens in
// llm.eval.ts, which maps the answers with the client mapper.
//
//   ANTHROPIC_API_KEY=… node evals/voice/run-llm.js [model] [--split=dev|holdout]
//
// Costs real money: ~0.05 $ per full run on Haiku 5.5, ~1.5 $ on Opus 5.5.

const fs = require("fs");
const path = require("path");
const Anthropic = require("../../functions/node_modules/@anthropic-ai/sdk").default;
const { parseWithClaude, DEFAULT_MODEL } = require("../../functions/lib/voiceParse");
const corpus = require("./corpus.json");

const args = process.argv.slice(2);
const model = args.find((a) => !a.startsWith("--")) || DEFAULT_MODEL;
const split = (args.find((a) => a.startsWith("--split=")) || "").split("=")[1];
const CRITICAL_REPEATS = 3;
const CONCURRENCY = 4;

// Same "now" as the grader: the corpus reference time, given as the phone's clock.
const localTime = corpus.referenceNow.slice(11, 16);

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY manquante : aucun appel lancé.");
  process.exit(1);
}
const client = new Anthropic();

async function runOne(c, attempt, timeoutMs) {
  const started = Date.now();
  try {
    const { result, usage } = await parseWithClaude({ client, text: c.text, localTime, model, timeoutMs });
    return { id: c.id, attempt, ms: Date.now() - started, result, usage };
  } catch (error) {
    return { id: c.id, attempt, ms: Date.now() - started, error: error.reason || error.message };
  }
}

async function main() {
  const cases = corpus.cases.filter((c) => !split || c.split === split);
  const jobs = cases.flatMap((c) =>
    Array.from({ length: c.critical ? CRITICAL_REPEATS : 1 }, (_, i) => [c, i]),
  );

  // Probe once: an account problem (no credit, bad key, unknown model) would
  // otherwise come back 87 times as "results".
  // Long timeout for the probe only: it must report an account problem, not
  // a slow first connection. Real runs use the production timeout.
  const probe = await runOne(cases[0], 0, 60_000);
  if (probe.error) {
    console.error(`Appel de sonde refusé, évaluation annulée : ${probe.error}`);
    process.exit(1);
  }
  console.log(`Sonde OK en ${probe.ms} ms.`);

  const runs = [];
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) {
      const [c, attempt] = jobs[next++];
      runs.push(await runOne(c, attempt));
      process.stdout.write(".");
    }
  }));
  process.stdout.write("\n");

  const out = { model, localTime, ranAt: new Date().toISOString(), runs };
  const file = path.join(__dirname, "results", `llm-${model}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`${runs.length} appels → ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
