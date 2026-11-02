/* global describe, it, expect */
const { hasRequiredChildAccess, hasChildRole } = require("../accessControl");
describe("hasRequiredChildAccess", () => {
  it("returns false for null/undefined", () => { expect(hasRequiredChildAccess(null, ["owner"])).toBe(false); expect(hasRequiredChildAccess(undefined, ["owner"])).toBe(false); });
  it("returns true when no roles required", () => { expect(hasRequiredChildAccess({ role: "viewer" }, null)).toBe(true); expect(hasRequiredChildAccess({ role: "viewer" }, [])).toBe(true); });
  it("returns true when role matches", () => { expect(hasRequiredChildAccess({ role: "owner" }, ["owner", "admin"])).toBe(true); });
  it("returns false when role does not match", () => { expect(hasRequiredChildAccess({ role: "viewer" }, ["owner"])).toBe(false); });
  it("falls back to canWriteEvents", () => { expect(hasRequiredChildAccess({ role: "x", canWriteEvents: true }, ["owner"])).toBe(true); expect(hasRequiredChildAccess({ role: "x", canWriteEvents: false }, ["owner"])).toBe(false); });
});
describe("hasChildRole", () => {
  it("accepts a listed role", () => { expect(hasChildRole({ role: "admin" }, ["owner", "admin"])).toBe(true); });
  it("ignores the canWriteEvents fallback", () => { expect(hasChildRole({ role: "contributor", canWriteEvents: true }, ["owner", "admin"])).toBe(false); });
  it("rejects missing data or roles", () => { expect(hasChildRole(null, ["owner"])).toBe(false); expect(hasChildRole({ role: "owner" }, undefined)).toBe(false); });
});
