jest.mock("@/config/firebase", () => ({ db: {} }));

import { DEFAULT_ROLE_PERMISSIONS, type ChildAccessDocument, type ChildRole } from "@/types/permissions";
import { canInteractWithEvent, canInteractWithPhotos, canManageEvents } from "@/utils/eventPermissions";
import { calculatePermissions } from "@/utils/permissions";

const accessFor = (role: ChildRole, overrides: Partial<ChildAccessDocument> = {}) =>
  ({
    userId: "u1",
    grantedBy: "owner",
    grantedAt: {} as any,
    ...DEFAULT_ROLE_PERMISSIONS[role],
    ...overrides,
  }) as ChildAccessDocument;

describe("canManageEvents (create / edit / delete)", () => {
  it.each([
    ["owner", true],
    ["admin", true],
    ["contributor", false],
    ["viewer", false],
    [null, false],
    [undefined, false],
    ["", false],
    ["superuser", false],
  ])("%p -> %p", (role, expected) => {
    expect(canManageEvents(role as any)).toBe(expected);
  });
});

describe("canInteractWithPhotos (like / comment)", () => {
  it.each([
    ["owner", true],
    ["admin", true],
    ["contributor", true],
    ["viewer", false],
    [null, false],
    [undefined, false],
    ["superuser", false],
  ])("%p -> %p", (role, expected) => {
    expect(canInteractWithPhotos(role as any)).toBe(expected);
  });
});

describe("canInteractWithEvent (like / comment per event)", () => {
  const withPhotos = { photos: ["children/c1/a.jpg"] };
  it.each([
    ["owner", withPhotos, true],
    ["owner", {}, true],
    ["admin", { photos: [] }, true],
    ["contributor", withPhotos, true],
    ["contributor", {}, false],
    ["contributor", { photos: [] }, false],
    ["contributor", { photos: null }, false],
    ["contributor", { photos: "x" }, false],
    ["contributor", null, false],
    ["contributor", undefined, false],
    ["viewer", withPhotos, false],
    [null, withPhotos, false],
    [undefined, withPhotos, false],
    ["superuser", withPhotos, false],
  ])("%p on %j -> %p", (role, event, expected) => {
    expect(canInteractWithEvent(role as any, event as any)).toBe(expected);
  });
});

describe("calculatePermissions", () => {
  it("contributor reads, likes and comments but cannot write events", () => {
    const p = calculatePermissions(accessFor("contributor"));
    expect(p).toMatchObject({
      hasAccess: true,
      canRead: true,
      canWriteEvents: false,
      canWriteLikes: true,
      canWriteComments: true,
      canManageAccess: false,
    });
  });

  it("ignores a legacy canWriteEvents=true stored on a contributor", () => {
    const p = calculatePermissions(accessFor("contributor", { canWriteEvents: true }));
    expect(p.canWriteEvents).toBe(false);
    expect(p.canWriteLikes).toBe(true);
  });

  it("viewer stays read-only", () => {
    const p = calculatePermissions(accessFor("viewer"));
    expect(p).toMatchObject({
      canRead: true,
      canWriteEvents: false,
      canWriteLikes: false,
      canWriteComments: false,
    });
  });

  it("owner and admin are unchanged", () => {
    expect(calculatePermissions(accessFor("owner"))).toMatchObject({
      canWriteEvents: true, canWriteLikes: true, canWriteComments: true, canManageAccess: true,
    });
    expect(calculatePermissions(accessFor("admin"))).toMatchObject({
      canWriteEvents: true, canWriteLikes: true, canWriteComments: true, canManageAccess: false,
    });
  });

  it("no access document means no access", () => {
    expect(calculatePermissions(null)).toMatchObject({ hasAccess: false, canRead: false, canWriteEvents: false });
  });
});
