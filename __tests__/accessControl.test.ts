const { hasChildRole } = require("../functions/accessControl");

describe("hasChildRole", () => {
  const requiredRoles = ["owner", "admin"];

  it("allows owner", () => {
    expect(hasChildRole({ role: "owner" }, requiredRoles)).toBe(true);
  });

  it("allows admin", () => {
    expect(hasChildRole({ role: "admin" }, requiredRoles)).toBe(true);
  });

  it("rejects contributor", () => {
    expect(hasChildRole({ role: "contributor" }, requiredRoles)).toBe(false);
  });

  // S4: legacy write flags no longer grant anything, the role alone decides.
  it("rejects contributor even with canWriteEvents", () => {
    expect(
      hasChildRole({ role: "contributor", canWriteEvents: true }, requiredRoles),
    ).toBe(false);
  });

  it("rejects missing access data", () => {
    expect(hasChildRole(null, requiredRoles)).toBe(false);
  });
});
