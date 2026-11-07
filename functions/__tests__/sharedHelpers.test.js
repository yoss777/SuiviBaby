/* global describe, it, expect, jest */
// Helpers partagés sortis des modules de déclencheurs : consentement santé et
// révocation du jeton Apple.
const { hasValidHealthConsent } = require("../src/shared/consent");

describe("hasValidHealthConsent", () => {
  it("accepte toute version tant que granted est true", () => {
    expect(hasValidHealthConsent({ healthDataConsent: { granted: true, version: "1.0" } })).toBe(true);
    expect(hasValidHealthConsent({ healthDataConsent: { granted: true } })).toBe(true);
  });

  it("refuse un consentement retiré, absent ou mal formé", () => {
    expect(hasValidHealthConsent({ healthDataConsent: { granted: false } })).toBe(false);
    expect(hasValidHealthConsent({ healthDataConsent: { granted: "true" } })).toBe(false);
    expect(hasValidHealthConsent({})).toBe(false);
    expect(hasValidHealthConsent(null)).toBe(false);
    expect(hasValidHealthConsent(undefined)).toBe(false);
  });
});

describe("shared/apple", () => {
  it("revokeAppleToken ne fait rien sans jeton enregistré", async () => {
    const { revokeAppleToken } = require("../src/shared/apple");
    const update = jest.fn();
    const db = { doc: () => ({ get: async () => ({ exists: false }), update }) };
    await expect(revokeAppleToken(db, "u1")).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });

  it("revokeAppleToken lève et compte l'échec quand les secrets Apple manquent", async () => {
    const { revokeAppleToken } = require("../src/shared/apple");
    const update = jest.fn(async () => {});
    const db = {
      doc: () => ({
        get: async () => ({ exists: true, data: () => ({ refreshToken: "rt", revokeFailures: 0 }) }),
        update,
      }),
    };
    await expect(revokeAppleToken(db, "u1")).rejects.toThrow(/Apple revocation failed \(1\/5\)/);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("revokeAppleToken abandonne sans lever à la 5e panne (STUCK_APPLE_REVOKE)", async () => {
    const { revokeAppleToken } = require("../src/shared/apple");
    const err = jest.spyOn(console, "error").mockImplementation(() => {});
    const update = jest.fn();
    const db = {
      doc: () => ({
        get: async () => ({ exists: true, data: () => ({ refreshToken: "rt", revokeFailures: 4 }) }),
        update,
      }),
    };
    await expect(revokeAppleToken(db, "u1")).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
    expect(err.mock.calls[0][0]).toContain("STUCK_APPLE_REVOKE");
    err.mockRestore();
  });
});
