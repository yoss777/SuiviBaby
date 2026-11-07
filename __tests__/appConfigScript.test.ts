// Revue ECC L10 : fonctions pures de scripts/updateAppConfig.mjs et lecture des
// arguments de scripts/backfillLastEventAt.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const helpers = require("../scripts/lib/appConfigHelpers.js");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { parseArgs } = require("../scripts/backfillLastEventAt.js");

const { resolveMinVersion, parseServiceAccountKey, buildUpdateMask, updateMaskQuery } = helpers;

describe("resolveMinVersion", () => {
  it("MIN_VERSION wins", () => {
    expect(resolveMinVersion({ MIN_VERSION: "1.0.10" }, { minVersion: "1.0.5" })).toBe("1.0.10");
  });
  it("keeps the value already in Firestore (a manual force update is not reset)", () => {
    expect(resolveMinVersion({}, { minVersion: "1.0.9" })).toBe("1.0.9");
  });
  it("defaults to 1.0.0 without remote document or value", () => {
    expect(resolveMinVersion({}, null)).toBe("1.0.0");
    expect(resolveMinVersion({}, { minVersion: null })).toBe("1.0.0");
  });
  it("an empty MIN_VERSION counts as unset", () => {
    expect(resolveMinVersion({ MIN_VERSION: "" }, { minVersion: "1.0.9" })).toBe("1.0.9");
  });
  it("rejects a malformed MIN_VERSION instead of publishing it", () => {
    expect(() => resolveMinVersion({ MIN_VERSION: "latest" }, null)).toThrow(/MIN_VERSION/);
    expect(() => resolveMinVersion({ MIN_VERSION: "1.0" }, null)).toThrow(/MIN_VERSION/);
  });
});

describe("parseServiceAccountKey", () => {
  const key = { client_email: "a@b.iam.gserviceaccount.com", private_key: "-----BEGIN-----" };
  it("reads raw JSON, with surrounding whitespace", () => {
    expect(parseServiceAccountKey(`  ${JSON.stringify(key)}\n`)).toEqual(key);
  });
  it("reads base64-encoded JSON", () => {
    expect(parseServiceAccountKey(Buffer.from(JSON.stringify(key)).toString("base64"))).toEqual(key);
  });
  it("rejects empty or non-string input", () => {
    expect(() => parseServiceAccountKey("")).toThrow(/empty/);
    expect(() => parseServiceAccountKey(undefined)).toThrow(/empty/);
  });
  it("rejects garbage without echoing it", () => {
    expect(() => parseServiceAccountKey("not-json-secret-value")).toThrow(/neither valid JSON nor base64/);
    try {
      parseServiceAccountKey("not-json-secret-value");
    } catch (e) {
      expect((e as Error).message).not.toContain("secret-value");
    }
  });
  it("rejects a key without client_email or private_key", () => {
    expect(() => parseServiceAccountKey(JSON.stringify({ client_email: "x" }))).toThrow(/lacks/);
  });
});

describe("update mask", () => {
  const fields = {
    latestVersion: "1.0.10",
    minVersion: "1.0.0",
    releaseNotes: "n",
    storeUrl: { ios: "i", android: "a" },
  };
  it("lists every written field, maps leaf by leaf", () => {
    expect(buildUpdateMask(fields)).toEqual([
      "latestVersion",
      "minVersion",
      "releaseNotes",
      "storeUrl.ios",
      "storeUrl.android",
    ]);
  });
  it("builds the query string of the PATCH", () => {
    expect(updateMaskQuery(fields)).toBe(
      "updateMask.fieldPaths=latestVersion&updateMask.fieldPaths=minVersion&updateMask.fieldPaths=releaseNotes" +
        "&updateMask.fieldPaths=storeUrl.ios&updateMask.fieldPaths=storeUrl.android",
    );
  });
});

describe("backfillLastEventAt parseArgs", () => {
  it("dry run needs no project (reads nothing it could write)", () => {
    expect(parseArgs([])).toEqual({ apply: false, recompute: false, project: null });
  });
  it("--apply without --project is refused", () => {
    expect(() => parseArgs(["--apply"])).toThrow(/--project/);
    expect(() => parseArgs(["--apply", "--recompute"])).toThrow(/--project/);
    expect(() => parseArgs(["--apply", "--project="])).toThrow(/--project/);
  });
  it("--apply with an explicit project is accepted", () => {
    expect(parseArgs(["--apply", "--recompute", "--project=samaye-staging"])).toEqual({
      apply: true,
      recompute: true,
      project: "samaye-staging",
    });
  });
  it("a dry run may name a project", () => {
    expect(parseArgs(["--project=samaye-53723"]).project).toBe("samaye-53723");
  });
});
