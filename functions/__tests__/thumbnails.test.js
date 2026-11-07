/* global describe, it, expect, jest, beforeEach, Buffer */
// S7.3 : miniatures des photos de jalons.
const mockSave = jest.fn(() => Promise.resolve());
const mockDownload = jest.fn(() => Promise.resolve([Buffer.from("original")]));
const mockDelete = jest.fn(() => Promise.resolve());
const mockFile = jest.fn(() => ({ download: mockDownload, save: mockSave, delete: mockDelete }));
const mockBucket = jest.fn(() => ({ file: mockFile }));
jest.mock("firebase-admin", () => ({ storage: () => ({ bucket: mockBucket }) }));

const mockPipeline = {
  rotate: jest.fn().mockReturnThis(),
  resize: jest.fn().mockReturnThis(),
  jpeg: jest.fn().mockReturnThis(),
  toBuffer: jest.fn(() => Promise.resolve(Buffer.from("thumb"))),
};
const mockSharp = jest.fn(() => mockPipeline);
jest.mock("sharp", () => mockSharp, { virtual: true });

const thumbs = require("../thumbnails");

const evt = (name, extra = {}) => ({ data: { name, bucket: "samaye-53723-photos-eu", contentType: "image/jpeg", ...extra } });

beforeEach(() => jest.clearAllMocks());

describe("thumbnailPathFor", () => {
  it("maps a milestone photo to children/{id}/thumbs/{name}.jpg", () => {
    expect(thumbs.thumbnailPathFor("children/c1/jalons/123-abc.jpg")).toBe("children/c1/thumbs/123-abc.jpg");
    expect(thumbs.thumbnailPathFor("children/c1/jalons/photo.png")).toBe("children/c1/thumbs/photo.jpg");
  });
  it("ignores everything else (thumbs themselves, other folders, nested paths)", () => {
    expect(thumbs.thumbnailPathFor("children/c1/thumbs/a.jpg")).toBeNull();
    expect(thumbs.thumbnailPathFor("children/c1/other/a.jpg")).toBeNull();
    expect(thumbs.thumbnailPathFor("children/c1/jalons/sub/a.jpg")).toBeNull();
    expect(thumbs.thumbnailPathFor(undefined)).toBeNull();
  });
});

describe("generateThumbnailHandler", () => {
  it("downloads the original, resizes to 400 px and saves a JPEG in thumbs/", async () => {
    const result = await thumbs.generateThumbnailHandler(evt("children/c1/jalons/a.jpg"));
    expect(result).toBe("children/c1/thumbs/a.jpg");
    expect(mockBucket).toHaveBeenCalledWith("samaye-53723-photos-eu");
    expect(mockPipeline.rotate).toHaveBeenCalled();
    expect(mockPipeline.resize).toHaveBeenCalledWith(expect.objectContaining({ width: 400, height: 400, fit: "outside", withoutEnlargement: true }));
    expect(mockFile).toHaveBeenCalledWith("children/c1/thumbs/a.jpg");
    expect(mockSave).toHaveBeenCalledWith(Buffer.from("thumb"), expect.objectContaining({ contentType: "image/jpeg" }));
  });

  it("does nothing for a thumbnail (no infinite loop) or a non-image", async () => {
    expect(await thumbs.generateThumbnailHandler(evt("children/c1/thumbs/a.jpg"))).toBeNull();
    expect(await thumbs.generateThumbnailHandler(evt("children/c1/jalons/a.txt", { contentType: "text/plain" }))).toBeNull();
    expect(mockDownload).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("lets the error out when the image cannot be decoded (the platform retries / logs it)", async () => {
    mockPipeline.toBuffer.mockRejectedValueOnce(new Error("Input buffer contains unsupported image format"));
    await expect(thumbs.generateThumbnailHandler(evt("children/c1/jalons/bad.jpg"))).rejects.toThrow(/unsupported/);
    expect(mockSave).not.toHaveBeenCalled();
  });
});

describe("deleteThumbnailHandler", () => {
  it("removes the thumbnail when the photo is deleted, ignoring a missing one", async () => {
    await thumbs.deleteThumbnailHandler(evt("children/c1/jalons/a.jpg"));
    expect(mockFile).toHaveBeenCalledWith("children/c1/thumbs/a.jpg");
    expect(mockDelete).toHaveBeenCalledWith({ ignoreNotFound: true });
  });
  it("ignores other deletions", async () => {
    expect(await thumbs.deleteThumbnailHandler(evt("children/c1/thumbs/a.jpg"))).toBeNull();
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

describe("exports", () => {
  it("exposes the two storage-triggered functions", () => {
    expect(thumbs.generatePhotoThumbnail).toBeDefined();
    expect(thumbs.deletePhotoThumbnail).toBeDefined();
  });
});
