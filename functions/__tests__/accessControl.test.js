const { hasRequiredChildAccess } = require("../accessControl");
describe("hasRequiredChildAccess", () => {
  it("returns false for null/undefined", () => { expect(hasRequiredChildAccess(null, ["owner"])).toBe(false); expect(hasRequiredChildAccess(undefined, ["owner"])).toBe(false); });
  it("returns true when no roles required", () => { expect(hasRequiredChildAccess({ role: "viewer" }, null)).toBe(true); expect(hasRequiredChildAccess({ role: "viewer" }, [])).toBe(true); });
  it("returns true when role matches", () => { expect(hasRequiredChildAccess({ role: "owner" }, ["owner", "admin"])).toBe(true); });
  it("returns false when role does not match", () => { expect(hasRequiredChildAccess({ role: "viewer" }, ["owner"])).toBe(false); });
  it("falls back to canWriteEvents", () => { expect(hasRequiredChildAccess({ role: "x", canWriteEvents: true }, ["owner"])).toBe(true); expect(hasRequiredChildAccess({ role: "x", canWriteEvents: false }, ["owner"])).toBe(false); });
});
