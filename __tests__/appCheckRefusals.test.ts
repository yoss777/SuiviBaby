// Suivi des refus App Check (ADR 0002) : fonctions pures de scripts/appCheckRefusals.mjs.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { windowToRange, platformOf, summarize, exitCodeOf } = require("../scripts/lib/appCheckRefusals.js");

const verif = (fn: string, app: string, trace: string, auth = "VALID") => ({
  timestamp: `2026-11-24T21:00:${trace.padStart(2, "0")}Z`,
  trace,
  labels: { "goog-drz-cloudfunctions-id": fn, "firebase-log-type": "callable-request-verification" },
  resource: { labels: { service_name: fn } },
  jsonPayload: { verifications: { app, auth } },
});
const req = (fn: string, status: number, ua: string, trace: string) => ({
  trace,
  resource: { labels: { service_name: fn } },
  httpRequest: { status, userAgent: ua },
});
const IOS = "SuiviBaby/60 CFNetwork/3826 Darwin/25.0.0";
const ANDROID = "okhttp/4.12.0";

describe("windowToRange", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  it("reads hours and days", () => {
    expect(windowToRange("2h", now).start).toBe("2026-11-24T10:00:00.000Z");
    expect(windowToRange("7d", now).start).toBe("2026-11-17T12:00:00.000Z");
    expect(windowToRange("7d", now).end).toBe(now.toISOString());
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

  it("marks the platform unknown when the request line is missing", () => {
    const s = summarize([verif("parseVoiceCommand", "VALID", "1")], []);
    expect(s.table[0].platform).toBe("autre");
  });
});
