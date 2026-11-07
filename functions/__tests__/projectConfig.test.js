/* global describe, it, expect, afterEach, __dirname */
// Revue ECC : plus aucun identifiant de projet codé en dur dans functions/.
const fs = require("node:fs");
const path = require("node:path");

const ENV_KEYS = ["GCLOUD_PROJECT", "GCP_PROJECT", "FIREBASE_CONFIG", "PHOTOS_BUCKET", "LEGACY_PHOTOS_BUCKET"];
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const cfg = () => require("../lib/projectConfig");
const clearEnv = () => ENV_KEYS.forEach((k) => delete process.env[k]);

/** Lit un fichier .env.<projet> (KEY=value, # commentaires). */
function readEnvFile(projectId) {
  const text = fs.readFileSync(path.join(__dirname, "..", `.env.${projectId}`), "utf8");
  return Object.fromEntries(
    text.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split("=")),
  );
}

describe("projectConfig, production", () => {
  it("resolves to today's production values from the project id alone", () => {
    clearEnv();
    process.env.GCLOUD_PROJECT = "samaye-53723";
    expect(cfg().photosBucket()).toBe("samaye-53723-photos-eu");
    expect(cfg().legacyPhotosBucket()).toBe("samaye-53723.firebasestorage.app");
    expect(cfg().photoBuckets()).toEqual(["samaye-53723-photos-eu", "samaye-53723.firebasestorage.app"]);
    expect(cfg().functionsBaseUrl()).toBe("https://europe-west1-samaye-53723.cloudfunctions.net");
  });

  it(".env.samaye-53723 holds exactly the production buckets", () => {
    expect(readEnvFile("samaye-53723")).toEqual({
      PHOTOS_BUCKET: "samaye-53723-photos-eu",
      LEGACY_PHOTOS_BUCKET: "samaye-53723.firebasestorage.app",
    });
  });

  it(".env.samaye-staging targets the staging project only", () => {
    const env = readEnvFile("samaye-staging");
    expect(env).toEqual({
      PHOTOS_BUCKET: "samaye-staging-photos-eu",
      LEGACY_PHOTOS_BUCKET: "samaye-staging.firebasestorage.app",
    });
    expect(JSON.stringify(env)).not.toContain("53723");
  });
});

describe("projectConfig, resolution order", () => {
  it("derives everything from the staging project", () => {
    clearEnv();
    process.env.GCLOUD_PROJECT = "samaye-staging";
    expect(cfg().photoBuckets()).toEqual(["samaye-staging-photos-eu", "samaye-staging.firebasestorage.app"]);
    expect(cfg().functionsBaseUrl()).toBe("https://europe-west1-samaye-staging.cloudfunctions.net");
  });

  it("falls back to GCP_PROJECT, then FIREBASE_CONFIG", () => {
    clearEnv();
    process.env.GCP_PROJECT = "from-gcp";
    expect(cfg().projectId()).toBe("from-gcp");
    clearEnv();
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: "from-config" });
    expect(cfg().projectId()).toBe("from-config");
  });

  it("lets the deployed param override the derived bucket", () => {
    clearEnv();
    process.env.GCLOUD_PROJECT = "samaye-staging";
    process.env.PHOTOS_BUCKET = "custom-photos";
    process.env.LEGACY_PHOTOS_BUCKET = "custom-legacy";
    expect(cfg().photoBuckets()).toEqual(["custom-photos", "custom-legacy"]);
  });

  it("throws instead of guessing when no project is known (never hit production by default)", () => {
    clearEnv();
    process.env.FIREBASE_CONFIG = "{not json";
    expect(() => cfg().projectId()).toThrow(/projet/i);
  });
});

describe("storage triggers use deploy-time params, not literals", () => {
  it("binds the thumbnail and mirror triggers to the PHOTOS_BUCKET / LEGACY_PHOTOS_BUCKET params", () => {
    const thumbs = require("../thumbnails");
    const bucketOf = (fn) => String(fn.__endpoint.eventTrigger.eventFilters.bucket);
    expect(bucketOf(thumbs.generatePhotoThumbnail)).toBe("params.PHOTOS_BUCKET");
    expect(bucketOf(thumbs.deletePhotoThumbnail)).toBe("params.PHOTOS_BUCKET");
    const fns = require("../index");
    expect(bucketOf(fns.mirrorLegacyPhotoUpload)).toBe("params.LEGACY_PHOTOS_BUCKET");
    expect(bucketOf(fns.mirrorLegacyPhotoDelete)).toBe("params.LEGACY_PHOTOS_BUCKET");
  });

  it("keeps the source free of the production project id", () => {
    const root = path.join(__dirname, "..");
    const files = ["index.js", "thumbnails.js", ...fs.readdirSync(path.join(root, "lib")).map((f) => `lib/${f}`)];
    for (const f of files) {
      expect(fs.readFileSync(path.join(root, f), "utf8")).not.toContain("samaye-53723");
    }
  });
});
