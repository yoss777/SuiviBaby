/* global describe, it, expect */
// Daily voice counters reset at midnight in France, not at midnight UTC.
const { quotaDayKey, FREE_DAILY_VOICE_LIMIT, PREMIUM_DAILY_VOICE_LIMIT } = require("../src/billing/quotas");

describe("quotaDayKey (Europe/Paris)", () => {
  it("is already the next day at 00:30 in Paris (23:30 UTC in winter)", () => {
    expect(quotaDayKey(new Date("2026-11-11T23:30:00Z"))).toBe("2026-11-12");
  });
  it("is still the same day at 23:30 in Paris (22:30 UTC in winter)", () => {
    expect(quotaDayKey(new Date("2026-11-11T22:30:00Z"))).toBe("2026-11-11");
  });
  it("follows summer time (UTC+2)", () => {
    expect(quotaDayKey(new Date("2026-07-01T22:30:00Z"))).toBe("2026-07-02");
  });
});

describe("voice limits", () => {
  it("are 3 a day free and 50 a day Premium", () => {
    expect(FREE_DAILY_VOICE_LIMIT).toBe(3);
    expect(PREMIUM_DAILY_VOICE_LIMIT).toBe(50);
  });
});
