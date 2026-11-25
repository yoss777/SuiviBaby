// Suivi des refus App Check (ADR 0002) : fonctions pures de scripts/appCheckRefusals.mjs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { EXEMPT_FUNCTIONS, windowToRange, platformOf, summarize, exitCodeOf } = require("../scripts/lib/appCheckRefusals.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("node:fs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require("node:path");

const verif = (fn: string, app: string, trace: string, auth = "VALID") => ({
  timestamp: `2026-11-24T21:00:${trace.padStart(2, "0")}Z`,
  trace,
  labels: { "goog-drz-cloudfunctions-id": fn, "firebase-log-type": "callable-request-verification" },
  resource: { labels: { service_name: fn } },
  jsonPayload: { verifications: { app, auth } },
});
const req = (fn: string, status: number, ua: string, trace?: string, timestamp = "2026-11-24T21:00:30Z") => ({
  trace,
  timestamp,
  resource: { labels: { service_name: fn } },
  httpRequest: { status, userAgent: ua },
});
const IOS = "SuiviBaby/60 CFNetwork/3826 Darwin/25.0.0";
const ANDROID = "okhttp/4.12.0";

describe("windowToRange", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  it("reads hours and days, ending 2 minutes ago, verifications read 2 minutes earlier", () => {
    expect(windowToRange("2h", now)).toEqual({
      start: "2026-11-24T09:58:00.000Z",
      end: "2026-11-24T11:58:00.000Z",
      verificationStart: "2026-11-24T09:56:00.000Z",
    });
    expect(windowToRange("7d", now).start).toBe("2026-11-17T11:58:00.000Z");
  });
  it("rejects bad or out-of-range windows", () => {
    expect(() => windowToRange("2x", now)).toThrow(/invalide/);
    expect(() => windowToRange("0h", now)).toThrow(/bornes/);
    expect(() => windowToRange("31d", now)).toThrow(/bornes/);
  });
});

describe("platformOf", () => {
  it("tells iOS, Android and others apart", () => {
    expect(platformOf(IOS)).toBe("ios");
    expect(platformOf(ANDROID)).toBe("android");
    expect(platformOf("Google-Cloud-Scheduler")).toBe("autre");
    expect(platformOf(undefined)).toBe("autre");
  });
});

describe("summarize", () => {
  it("is OK when every call is VALID", () => {
    const s = summarize(
      [verif("parseVoiceCommand", "VALID", "1"), verif("validateAndCreateEvent", "VALID", "2")],
      [req("parsevoicecommand", 200, IOS, "1"), req("validateandcreateevent", 200, ANDROID, "2")],
    );
    expect(s.total).toBe(2);
    expect(s.notVerified).toEqual([]);
    expect(exitCodeOf(s)).toBe(0);
    expect(s.table.map((r: { fn: string; platform: string }) => `${r.fn}/${r.platform}`)).toEqual([
      "parsevoicecommand/ios",
      "validateandcreateevent/android",
    ]);
  });

  it("counts MISSING and INVALID, and 401 refused by App Check", () => {
    const s = summarize(
      [verif("parseVoiceCommand", "MISSING", "1"), verif("parseVoiceCommand", "INVALID", "2"), verif("parseVoiceCommand", "VALID", "3")],
      [req("parsevoicecommand", 401, ANDROID, "1"), req("parsevoicecommand", 401, ANDROID, "2"), req("parsevoicecommand", 200, ANDROID, "3")],
    );
    expect(s.table).toEqual([
      { fn: "parsevoicecommand", platform: "android", VALID: 1, MISSING: 1, INVALID: 1, other: 0, refused401: 2, other401: 0 },
    ]);
    expect(s.notVerified).toHaveLength(2);
    expect(exitCodeOf(s)).toBe(1);
  });

  it("flags a not-yet-enforced MISSING call (would be refused after the switch)", () => {
    const s = summarize([verif("transcribeAudio", "MISSING", "1")], [req("transcribeaudio", 200, IOS, "1")]);
    expect(s.notVerified[0]).toMatchObject({ fn: "transcribeaudio", platform: "ios", app: "MISSING", status: 200 });
    expect(exitCodeOf(s)).toBe(1);
  });

  it("keeps a 401 with a valid App Check token apart (auth refusal)", () => {
    const s = summarize([verif("getUsageQuotaStatus", "VALID", "1", "MISSING")], [req("getusagequotastatus", 401, IOS, "1")]);
    expect(s.table[0]).toMatchObject({ refused401: 0, other401: 1 });
    expect(exitCodeOf(s)).toBe(0);
  });

  it("leaves the three exempt functions out of the verdict", () => {
    const s = summarize(
      [verif("revokeDeviceToken", "MISSING", "1"), verif("resolveReport", "MISSING", "2"), verif("setAdminClaim", "INVALID", "3")],
      [],
    );
    expect(s.exempt).toEqual({ total: 3, notValid: 3 });
    expect(s.table).toEqual([]);
    expect(exitCodeOf(s)).toBe(0);
  });

  it("flags a 401 on a callable function without a verification line", () => {
    const s = summarize([verif("parseVoiceCommand", "VALID", "1")], [req("parsevoicecommand", 200, IOS, "1"), req("parsevoicecommand", 401, IOS, "9")]);
    expect(s.orphan401).toBe(1);
    expect(exitCodeOf(s)).toBe(1);
  });

  it("flags any 401 without a matched verification, whatever the service, except exempt ones", () => {
    const all401 = [
      req("validateandcreateevent", 401, ANDROID, "x1"), // fonction sans aucun appel vérifié
      req("parsevoicecommand", 401, IOS, undefined), // trace absente
      req("resolvereport", 401, IOS, "x3"), // exception : hors verdict
    ];
    const s = summarize([verif("parseVoiceCommand", "VALID", "1")], [req("parsevoicecommand", 200, IOS, "1")], all401);
    expect(s.orphan401).toBe(2);
    expect(exitCodeOf(s)).toBe(1);
  });

  it("uses verifications read before the window only to match a request inside it", () => {
    const early = { ...verif("parseVoiceCommand", "MISSING", "1"), timestamp: "2026-11-24T20:59:00Z" };
    const earlyOutside = { ...verif("parseVoiceCommand", "MISSING", "2"), timestamp: "2026-11-24T20:58:00Z" };
    const s = summarize(
      [early, earlyOutside],
      [req("parsevoicecommand", 401, IOS, "1", "2026-11-24T21:00:05Z"), req("parsevoicecommand", 401, IOS, "2", "2026-11-24T20:58:10Z")],
      [req("parsevoicecommand", 401, IOS, "1", "2026-11-24T21:00:05Z")],
      { start: "2026-11-24T21:00:00Z" },
    );
    expect(s.total).toBe(1);
    expect(s.table[0]).toMatchObject({ MISSING: 1, refused401: 1 });
    expect(s.orphan401).toBe(0);
  });

  it("matches the exemptions declared in functions/src/shared/appCheck.js", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "functions", "src", "shared", "appCheck.js"), "utf8");
    const declared = /APP_CHECK_EXEMPT_FUNCTIONS = new Set\(\[([^\]]+)\]/.exec(src);
    expect(declared).not.toBeNull();
    const names = [...declared![1].matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase()).sort();
    expect(names).toEqual([...EXEMPT_FUNCTIONS].sort());
  });

  it("marks the platform unknown when the request line is missing", () => {
    const s = summarize([verif("parseVoiceCommand", "VALID", "1")], []);
    expect(s.table[0].platform).toBe("autre");
  });
});
