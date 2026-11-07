/* eslint-disable import/first */
// S7.3 : redimensionnement avant envoi (1600 px, JPEG) et chemin des miniatures.
const mockManipulate = jest.fn();
jest.mock("expo-image-manipulator", () => ({
  manipulateAsync: (...a: unknown[]) => mockManipulate(...a),
  SaveFormat: { JPEG: "jpeg" },
}));
jest.mock("@/config/firebase", () => ({ auth: {}, db: {} }));
import { Image } from "react-native";
const mockGetSize = jest.spyOn(Image, "getSize") as unknown as jest.Mock;

import { computeResizeAction, resizePhotoForUpload } from "@/utils/photoResize";
import { getThumbnailPath } from "@/utils/photoThumbnails";

beforeEach(() => jest.clearAllMocks());

describe("computeResizeAction", () => {
  it("fixes the long side to 1600 and keeps the ratio", () => {
    expect(computeResizeAction(4032, 3024)).toEqual({ resize: { width: 1600 } });
    expect(computeResizeAction(3024, 4032)).toEqual({ resize: { height: 1600 } });
  });
  it("does not touch an image that already fits", () => {
    expect(computeResizeAction(1600, 900)).toBeNull();
    expect(computeResizeAction(800, 600)).toBeNull();
  });
  it("ignores unreadable dimensions", () => {
    expect(computeResizeAction(0, 0)).toBeNull();
  });
});

describe("resizePhotoForUpload", () => {
  it("resizes a large landscape photo to 1600 px wide, JPEG 0.8", async () => {
    mockGetSize.mockImplementation((_u: string, ok: (w: number, h: number) => void) => ok(4032, 3024));
    mockManipulate.mockResolvedValue({ uri: "file:///cache/out.jpg" });
    const result = await resizePhotoForUpload("file:///in.heic");
    expect(mockManipulate).toHaveBeenCalledWith(
      "file:///in.heic",
      [{ resize: { width: 1600 } }],
      { compress: 0.8, format: "jpeg" },
    );
    expect(result).toEqual({ uri: "file:///cache/out.jpg", temporary: true });
  });

  it("still re-encodes a small photo as JPEG without resizing", async () => {
    mockGetSize.mockImplementation((_u: string, ok: (w: number, h: number) => void) => ok(800, 600));
    mockManipulate.mockResolvedValue({ uri: "file:///cache/small.jpg" });
    await resizePhotoForUpload("file:///small.png");
    expect(mockManipulate).toHaveBeenCalledWith("file:///small.png", [], expect.objectContaining({ format: "jpeg" }));
  });

  it("falls back to the original file when the manipulation fails", async () => {
    mockGetSize.mockImplementation((_u: string, ok: (w: number, h: number) => void) => ok(4000, 3000));
    mockManipulate.mockRejectedValue(new Error("boom"));
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = await resizePhotoForUpload("file:///in.jpg");
    expect(result).toEqual({ uri: "file:///in.jpg", temporary: false });
    warn.mockRestore();
  });

  it("falls back to the original when the size is unreadable but the manipulation works", async () => {
    mockGetSize.mockImplementation((_u: string, _ok: unknown, fail: () => void) => fail());
    mockManipulate.mockResolvedValue({ uri: "file:///cache/x.jpg" });
    const result = await resizePhotoForUpload("file:///in.jpg");
    expect(mockManipulate).toHaveBeenCalledWith("file:///in.jpg", [], expect.any(Object));
    expect(result.uri).toBe("file:///cache/x.jpg");
  });
});

describe("getThumbnailPath", () => {
  it("maps a milestone photo path to its thumbnail", () => {
    expect(getThumbnailPath("children/c1/jalons/1-a.jpg")).toBe("children/c1/thumbs/1-a.jpg");
  });
  it("handles legacy download URLs", () => {
    const url = "https://firebasestorage.googleapis.com/v0/b/samaye-53723.firebasestorage.app/o/children%2Fc1%2Fjalons%2F1-a.jpg?alt=media&token=x";
    expect(getThumbnailPath(url)).toBe("children/c1/thumbs/1-a.jpg");
  });
  it("returns null for local files, other URLs and empty refs", () => {
    expect(getThumbnailPath("file:///a.jpg")).toBeNull();
    expect(getThumbnailPath("https://example.com/a.jpg")).toBeNull();
    expect(getThumbnailPath(null)).toBeNull();
  });
});
