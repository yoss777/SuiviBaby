// Baseline: the current rule-based parser, scored on the eval corpus.
jest.mock("@/config/firebase", () => ({ functions: {}, auth: { currentUser: null } }));
jest.mock("@/utils/errorReporting", () => ({ captureServiceError: jest.fn() }));

import corpus from "./corpus.json";
import { gradeCase, type EvalCase } from "./grader";
import { printSummary, summarize, writeResult } from "./report";
import { parseMultipleCommandsWithMeta } from "@/services/voice/commandParser";

const NOW = new Date(corpus.referenceNow);
const cases = corpus.cases as EvalCase[];

test("regex parser baseline", () => {
  jest.useFakeTimers().setSystemTime(NOW);
  const results = cases.map((c) => {
    const { commands } = parseMultipleCommandsWithMeta(c.text);
    const action = commands[0]?.action ?? "add";
    return gradeCase(c, action, commands, NOW);
  });
  jest.useRealTimers();

  const summary = summarize("Parseur à règles (actuel)", cases, results);
  // eslint-disable-next-line no-console
  console.log(printSummary(summary));
  writeResult("regex-baseline", summary);
  expect(results).toHaveLength(cases.length);
});
