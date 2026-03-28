const { hasRequiredChildAccess } = require("../functions/accessControl");

describe("hasRequiredChildAccess", () => {
  const requiredRoles = ["owner", "admin"];

  it("allows owner", () => {
    expect(
      hasRequiredChildAccess({ role: "owner" }, requiredRoles),
    ).toBe(true);
  });

  it("allows admin", () => {
    expect(
      hasRequiredChildAccess({ role: "admin" }, requiredRoles),
    ).toBe(true);
  });

  it("rejects contributor without canWriteEvents", () => {
    expect(
      hasRequiredChildAccess({ role: "contributor" }, requiredRoles),
    ).toBe(false);
  });

  it("allows contributor with canWriteEvents", () => {
    expect(
      hasRequiredChildAccess(
        { role: "contributor", canWriteEvents: true },
        requiredRoles,
      ),
    ).toBe(true);
  });

  it("rejects missing access data", () => {
    expect(hasRequiredChildAccess(null, requiredRoles)).toBe(false);
  });
});
