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

// Options passées à onCall par fonction exportée. Le manifest de l'endpoint
// n'expose pas enforceAppCheck / consumeAppCheckToken / cors : on enveloppe
// onCall (vrai SDK en dessous) pour les enregistrer.
const mockCallableOptions = new WeakMap();
jest.mock("firebase-functions/v2/https", () => {
  const actual = jest.requireActual("firebase-functions/v2/https");
  return {
    ...actual,
    onCall: (opts, handler) => {
      const fn = actual.onCall(opts, handler);
      mockCallableOptions.set(fn, opts || {});
      return fn;
    },
  };
});

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
    const opts = mockCallableOptions.get(fn);
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
    if (opts) {
      out[name].callableOptions = {
        enforceAppCheck: opts.enforceAppCheck === true,
        consumeAppCheckToken: opts.consumeAppCheckToken === true,
        cors: opts.cors === undefined ? "default" : opts.cors,
      };
    }
  }
  return out;
}

/** Charge l'entry point dans un registre isolé, avec l'environnement donné. */
function snapshotWithEnv(env) {
  const keys = ["APPCHECK_ENFORCE", "APPCHECK_ENFORCE_FUNCTIONS"];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  keys.forEach((k) => Reflect.deleteProperty(process.env, k));
  Object.assign(process.env, env);
  try {
    let out;
    jest.isolateModules(() => {
      out = snapshotExports();
    });
    return out;
  } finally {
    keys.forEach((k) => {
      if (saved[k] === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = saved[k];
    });
  }
}

describe("exports snapshot (deployed function names, triggers, options)", () => {
  let actual;
  beforeAll(() => {
    // Environnement par défaut : surveillance App Check seule.
    actual = snapshotWithEnv({});
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

  it("par défaut, aucun callable n'impose App Check (surveillance seule)", () => {
    const callables = Object.entries(actual).filter(([, e]) => e.callableOptions);
    expect(callables.length).toBeGreaterThan(0);
    expect(callables.filter(([, e]) => e.callableOptions.enforceAppCheck)).toEqual([]);
  });

  it("APPCHECK_ENFORCE_FUNCTIONS=transcribeAudio : seule cette fonction impose App Check", () => {
    const partial = snapshotWithEnv({ APPCHECK_ENFORCE_FUNCTIONS: "transcribeAudio" });
    const enforced = Object.entries(partial)
      .filter(([, e]) => e.callableOptions && e.callableOptions.enforceAppCheck)
      .map(([n]) => n);
    expect(enforced).toEqual(["transcribeAudio"]);
  });

  it("APPCHECK_ENFORCE=true : tous les callables imposent App Check", () => {
    const all = snapshotWithEnv({ APPCHECK_ENFORCE: "true" });
    const callables = Object.entries(all).filter(([, e]) => e.callableOptions);
    expect(callables.filter(([, e]) => !e.callableOptions.enforceAppCheck)).toEqual([]);
  });
});
