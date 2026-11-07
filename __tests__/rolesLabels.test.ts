import { ROLE_LABELS, ROLE_DESCRIPTIONS, OFFERED_MEMBER_ROLES } from "@/types/permissions";

describe("role labels (Sprint 12.6)", () => {
  it("shows Parent for admin and Proche for contributor", () => {
    expect(ROLE_LABELS.admin).toBe("Parent");
    expect(ROLE_LABELS.contributor).toBe("Proche");
    expect(ROLE_LABELS.owner).toBe("Propriétaire");
  });

  it("offers only Parent and Proche; viewer stays in the type but is not offered", () => {
    expect(OFFERED_MEMBER_ROLES).toEqual(["admin", "contributor"]);
    expect(ROLE_LABELS.viewer).toBeDefined();
  });

  it("describes what each role can do", () => {
    expect(ROLE_DESCRIPTIONS.admin).toMatch(/saisit|modifie|exporte/i);
    expect(ROLE_DESCRIPTIONS.contributor).toMatch(/like|comment/i);
  });
});
