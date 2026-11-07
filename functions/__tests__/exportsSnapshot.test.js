/* global __dirname, describe, it, expect, jest, beforeAll */
// Source of truth for the deployed function set. `firebase deploy --force`
// deletes any function whose export disappeared and recreates a renamed one,
// which breaks the clients that call it by name. This test loads the real
// entry point (real firebase-functions, no mocks) and compares every export
// and its trigger/options with exportsSnapshot.expected.json.
//
// Changing a function on purpose? Regenerate the fixture:
//   UPDATE_EXPORTS_SNAPSHOT=1 npx jest __tests__/exportsSnapshot.test.js
// and review the diff: an added line is a new function, a removed one is a
// deletion in production.
const fs = require("fs");
const path = require("path");

const FIXTURE = path.join(__dirname, "exportsSnapshot.expected.json");

/** Endpoint manifest of each export, without unset (null) options. */
function snapshotExports() {
  const fns = require("../index");
  const out = {};
  for (const name of Object.keys(fns).sort()) {
    const fn = fns[name];
    if (!fn || !fn.__endpoint) {
      out[name] = { nonTrigger: typeof fn };
      continue;
    }
    out[name] = JSON.parse(
      JSON.stringify(fn.__endpoint, (key, value) => {
        if (value === null) return undefined;
        // Params (bucket names, secrets) serialise as their parameter name.
        if (value && typeof value === "object" && !Array.isArray(value) &&
            value.constructor && value.constructor.name !== "Object") {
          return { param: String(value.name || value.value || value.constructor.name) };
        }
        return value;
      }),
    );
  }
  return out;
}

describe("exports snapshot (deployed function names, triggers, options)", () => {
  let actual;
  beforeAll(() => {
    jest.isolateModules(() => {
      actual = snapshotExports();
    });
  });

  it("matches the committed list exactly", () => {
    if (process.env.UPDATE_EXPORTS_SNAPSHOT === "1") {
      fs.writeFileSync(FIXTURE, JSON.stringify(actual, null, 2) + "\n");
    }
    const expected = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    expect(actual).toEqual(expected);
  });

  it("exports every function in europe-west1 except the legacy-bucket mirrors", () => {
    const regions = Object.entries(actual)
      .filter(([, e]) => e.region)
      .filter(([, e]) => !e.region.includes("europe-west1"))
      .map(([n]) => n);
    expect(regions).toEqual(["mirrorLegacyPhotoDelete", "mirrorLegacyPhotoUpload"]);
  });
});
