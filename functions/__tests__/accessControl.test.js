/* global describe, it, expect */
const { hasChildRole } = require("../accessControl");
describe("hasChildRole", () => {
  it("accepts a listed role", () => { expect(hasChildRole({ role: "admin" }, ["owner", "admin"])).toBe(true); });
  it("ignores the canWriteEvents fallback", () => { expect(hasChildRole({ role: "contributor", canWriteEvents: true }, ["owner", "admin"])).toBe(false); });
  it("rejects missing data or roles", () => { expect(hasChildRole(null, ["owner"])).toBe(false); expect(hasChildRole({ role: "owner" }, undefined)).toBe(false); });
});
