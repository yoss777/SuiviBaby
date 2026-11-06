import {
  buildChildExportProfile,
  collectEventPhotoPaths,
} from "@/services/exportDataHelpers";
import {
  LEGACY_BACKEND_EVENT_TYPES,
  MODERN_UI_EVENT_TYPES,
  getExportEventTypes,
} from "@/services/eventTypeSupport";

describe("getExportEventTypes", () => {
  it("includes every modern and legacy type, nettoyage_nez included, without duplicates", () => {
    const types = getExportEventTypes();
    for (const t of [...MODERN_UI_EVENT_TYPES, ...LEGACY_BACKEND_EVENT_TYPES]) {
      expect(types).toContain(t);
    }
    expect(types).toContain("nettoyage_nez");
    expect(new Set(types).size).toBe(types.length);
  });
});

describe("buildChildExportProfile", () => {
  it("keeps allergies and notes, drops technical soft-delete fields", () => {
    expect(
      buildChildExportProfile({
        name: "Léa",
        allergies: ["arachide"],
        notes: "RAS",
        deletedAt: null,
        deletedBy: "u1",
        deletionRequestId: "r1",
      }),
    ).toEqual({ name: "Léa", allergies: ["arachide"], notes: "RAS" });
  });
  it("handles missing data", () => {
    expect(buildChildExportProfile(null)).toEqual({});
    expect(buildChildExportProfile(undefined)).toEqual({});
  });
});

describe("collectEventPhotoPaths", () => {
  it("returns storage paths, normalising legacy URLs and de-duplicating", () => {
    const url =
      "https://firebasestorage.googleapis.com/v0/b/b/o/children%2Fc1%2Fa.jpg?alt=media&token=t";
    const paths = collectEventPhotoPaths({
      photos: [url, "children/c1/a.jpg", "", 3 as any],
    });
    expect(paths).toEqual(["children/c1/a.jpg"]);
  });
  it("returns an empty list when there is no photo", () => {
    expect(collectEventPhotoPaths({})).toEqual([]);
    expect(collectEventPhotoPaths({ photos: "x" as any })).toEqual([]);
  });
});
