/* global describe, it, expect, beforeEach, afterEach, jest */
// withAppCheck : enforcement global (APPCHECK_ENFORCE=true) ou par fonction
// (APPCHECK_ENFORCE_FUNCTIONS=a,b). Par défaut : surveillance seule.
const ENV_KEYS = ["APPCHECK_ENFORCE", "APPCHECK_ENFORCE_FUNCTIONS"];

describe("withAppCheck", () => {
  let saved;
  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      Reflect.deleteProperty(process.env, k);
    }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) Reflect.deleteProperty(process.env, k);
      else process.env[k] = saved[k];
    }
  });

  const load = () => {
    let mod;
    jest.isolateModules(() => {
      mod = require("../src/shared/appCheck");
    });
    return mod;
  };

  it("ne change rien par défaut (surveillance seule)", () => {
    const { withAppCheck } = load();
    expect(withAppCheck({ region: "europe-west1" }, "transcribeAudio")).toEqual({ region: "europe-west1" });
  });

  it("APPCHECK_ENFORCE=true impose App Check à toutes les fonctions", () => {
    process.env.APPCHECK_ENFORCE = "true";
    const { withAppCheck } = load();
    expect(withAppCheck({ region: "r" }, "a").enforceAppCheck).toBe(true);
    expect(withAppCheck({ region: "r" }, "b").enforceAppCheck).toBe(true);
  });

  it("APPCHECK_ENFORCE_FUNCTIONS n'impose que les fonctions listées", () => {
    process.env.APPCHECK_ENFORCE_FUNCTIONS = "transcribeAudio, parseVoiceCommand";
    const { withAppCheck } = load();
    expect(withAppCheck({}, "transcribeAudio").enforceAppCheck).toBe(true);
    expect(withAppCheck({}, "parseVoiceCommand").enforceAppCheck).toBe(true);
    expect(withAppCheck({}, "setMemberRole").enforceAppCheck).toBeUndefined();
  });

  it("ne confond pas les préfixes de noms", () => {
    process.env.APPCHECK_ENFORCE_FUNCTIONS = "transcribe";
    const { withAppCheck } = load();
    expect(withAppCheck({}, "transcribeAudio").enforceAppCheck).toBeUndefined();
  });

  it("liste vide ou valeurs vides : aucun enforcement", () => {
    process.env.APPCHECK_ENFORCE_FUNCTIONS = " , ,";
    const { withAppCheck } = load();
    expect(withAppCheck({}, "x").enforceAppCheck).toBeUndefined();
    expect(withAppCheck({})).toEqual({});
  });

  it("APPCHECK_ENFORCE=false avec une liste : seule la liste s'applique", () => {
    process.env.APPCHECK_ENFORCE = "false";
    process.env.APPCHECK_ENFORCE_FUNCTIONS = "a";
    const { withAppCheck } = load();
    expect(withAppCheck({}, "a").enforceAppCheck).toBe(true);
    expect(withAppCheck({}, "b").enforceAppCheck).toBeUndefined();
  });

  it("conserve les options d'origine sans les muter", () => {
    process.env.APPCHECK_ENFORCE = "true";
    const { withAppCheck } = load();
    const opts = { region: "r", memory: "256MiB" };
    expect(withAppCheck(opts, "a")).toEqual({ region: "r", memory: "256MiB", enforceAppCheck: true });
    expect(opts.enforceAppCheck).toBeUndefined();
  });

  it("monitorAppCheck indique l'enforcement propre à la fonction", () => {
    process.env.APPCHECK_ENFORCE_FUNCTIONS = "a";
    const { monitorAppCheck } = load();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    monitorAppCheck({ auth: { uid: "u" } }, "a");
    monitorAppCheck({ auth: { uid: "u" } }, "b");
    expect(warn.mock.calls[0][0]).toContain("enforcement=true");
    expect(warn.mock.calls[1][0]).toContain("enforcement=false");
    warn.mockRestore();
  });
});
