import fs from "fs";
import os from "os";
import path from "path";

import {
  buildFirebaseWebConfig,
  defaultStorageBucket,
  EXPECTED_PROJECT_IDS,
  FIREBASE_WEB_CONFIGS,
  getAppEnv,
  getSentryEnvironment,
  getFirebaseWebConfig,
  resolveAppEnv,
} from "@/config/firebaseEnv";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { run } = require("../scripts/easCopyFirebaseFiles.js");

describe("firebaseEnv", () => {
  it("defaults to production", () => {
    expect(resolveAppEnv(undefined)).toBe("production");
    expect(resolveAppEnv("anything")).toBe("production");
    expect(resolveAppEnv("staging")).toBe("staging");
    expect(getAppEnv()).toBe("production");
  });

  it("keeps the production web config unchanged", () => {
    const config = getFirebaseWebConfig();
    expect(config.projectId).toBe("samaye-53723");
    expect(config.storageBucket).toBe("samaye-53723-photos-eu");
    expect(config.appId).toBe("1:222899144223:web:bdec5b5754d15fc987372a");
    expect(defaultStorageBucket(config.projectId as string)).toBe(
      "samaye-53723.firebasestorage.app",
    );
  });

  it("refuses staging while placeholders remain", () => {
    expect(() => buildFirebaseWebConfig("staging")).toThrow(/placeholder/);
  });

  it("applies non-empty overrides", () => {
    const staging = Object.fromEntries(
      Object.keys(FIREBASE_WEB_CONFIGS.staging).map((k) => [k, `real-${k}`]),
    );
    staging.projectId = "samaye-staging";
    const config = buildFirebaseWebConfig("staging", staging);
    expect(config.apiKey).toBe("real-apiKey");
    // An empty override keeps the committed value (here still a placeholder).
    expect(() => buildFirebaseWebConfig("staging", { ...staging, apiKey: "" })).toThrow(
      /apiKey/,
    );
  });
});

describe("project id guard (revue ECC L7)", () => {
  const realStaging = () => ({
    ...Object.fromEntries(Object.keys(FIREBASE_WEB_CONFIGS.staging).map((k) => [k, `real-${k}`])),
    projectId: "samaye-staging",
  });

  it("expects the production project for production and the staging project for staging", () => {
    expect(EXPECTED_PROJECT_IDS).toEqual({ production: "samaye-53723", staging: "samaye-staging" });
  });

  it("refuses a production build pointed at another project", () => {
    expect(() => buildFirebaseWebConfig("production", { projectId: "samaye-staging" })).toThrow(
      /APP_ENV=production expects project "samaye-53723"/,
    );
  });

  it("refuses a staging build pointed at the production project", () => {
    expect(() =>
      buildFirebaseWebConfig("staging", { ...realStaging(), projectId: "samaye-53723" }),
    ).toThrow(/APP_ENV=staging expects project "samaye-staging"/);
  });

  it("accepts the matching project", () => {
    expect(buildFirebaseWebConfig("production").projectId).toBe("samaye-53723");
    expect(buildFirebaseWebConfig("staging", realStaging()).projectId).toBe("samaye-staging");
  });
});

describe("getSentryEnvironment", () => {
  it("is development in __DEV__, otherwise the build's APP_ENV", () => {
    expect(getSentryEnvironment(true)).toBe("development");
    expect(getSentryEnvironment(false)).toBe("production");
  });
});

describe("app.config.js (revue ECC L7)", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
    jest.resetModules();
  });
  const load = (env: Record<string, string>) => {
    process.env = { ...saved, APP_ENV: "", EXPO_PUBLIC_APP_ENV: "", EAS_BUILD: "", ...env };
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("../app.config.js")({ config: { plugins: [], android: {}, ios: {}, extra: {} } });
  };

  it("production by default, with the production project", () => {
    const cfg = load({});
    expect(cfg.extra.appEnv).toBe("production");
    expect(cfg.extra.firebase.projectId).toBe("samaye-53723");
  });

  it("rejects an override that points the build at the wrong project", () => {
    expect(() => load({ EXPO_PUBLIC_FIREBASE_PROJECT_ID: "samaye-staging" })).toThrow(
      /APP_ENV=production expects project "samaye-53723"/,
    );
  });

  it("rejects an unknown APP_ENV", () => {
    expect(() => load({ APP_ENV: "prod" })).toThrow(/APP_ENV must be one of/);
  });

  it("reads EXPO_PUBLIC_APP_ENV when APP_ENV is empty", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const cfg = load({ EXPO_PUBLIC_APP_ENV: "staging" });
    expect(cfg.extra.appEnv).toBe("staging");
    warn.mockRestore();
  });
});

describe("easCopyFirebaseFiles", () => {
  let root: string;
  const json = (projectId: string) =>
    JSON.stringify({ project_info: { project_id: projectId } });
  const log = () => {};

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "firebase-files-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("copies the EAS file variable into android/app", () => {
    const src = path.join(root, "staging.json");
    fs.writeFileSync(src, json("samaye-staging"));
    run({
      rootDir: root,
      env: { APP_ENV: "staging", EAS_BUILD: "true", EAS_BUILD_PLATFORM: "android", GOOGLE_SERVICES_JSON: src },
      log,
    });
    expect(
      fs.readFileSync(path.join(root, "android/app/google-services.json"), "utf8"),
    ).toBe(json("samaye-staging"));
  });

  it("fails an EAS build when the file is missing", () => {
    expect(() =>
      run({ rootDir: root, env: { EAS_BUILD: "true", EAS_BUILD_PLATFORM: "android" }, log }),
    ).toThrow(/GOOGLE_SERVICES_JSON/);
  });

  it("only warns outside EAS when the file is missing", () => {
    expect(() => run({ rootDir: root, env: {}, log })).not.toThrow();
  });

  it("rejects a file from the wrong project", () => {
    fs.mkdirSync(path.join(root, "android/app"), { recursive: true });
    fs.writeFileSync(path.join(root, "android/app/google-services.json"), json("samaye-53723"));
    expect(() =>
      run({ rootDir: root, env: { APP_ENV: "staging", EAS_BUILD_PLATFORM: "android" }, log }),
    ).toThrow(/expects "samaye-staging"/);
  });

  it("reads the iOS project id from the plist", () => {
    fs.mkdirSync(path.join(root, "ios/SuiviBaby"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "ios/SuiviBaby/GoogleService-Info.plist"),
      "<dict><key>PROJECT_ID</key>\n<string>samaye-53723</string></dict>",
    );
    expect(() =>
      run({ rootDir: root, env: { EAS_BUILD: "true", EAS_BUILD_PLATFORM: "ios" }, log }),
    ).not.toThrow();
  });

  it("rejects an unknown APP_ENV", () => {
    expect(() => run({ rootDir: root, env: { APP_ENV: "prod" }, log })).toThrow(/Unknown APP_ENV "prod"/);
  });

  it("reads EXPO_PUBLIC_APP_ENV like app.config.js when APP_ENV is empty", () => {
    fs.mkdirSync(path.join(root, "android/app"), { recursive: true });
    fs.writeFileSync(path.join(root, "android/app/google-services.json"), json("samaye-staging"));
    expect(() =>
      run({ rootDir: root, env: { APP_ENV: "", EXPO_PUBLIC_APP_ENV: "staging", EAS_BUILD_PLATFORM: "android" }, log }),
    ).not.toThrow();
    expect(() =>
      run({ rootDir: root, env: { EXPO_PUBLIC_APP_ENV: "prod", EAS_BUILD_PLATFORM: "android" }, log }),
    ).toThrow(/Unknown APP_ENV "prod"/);
  });

  it("fails when the file variable points to a file that does not exist", () => {
    expect(() =>
      run({
        rootDir: root,
        env: { EAS_BUILD_PLATFORM: "android", GOOGLE_SERVICES_JSON: path.join(root, "nope.json") },
        log,
      }),
    ).toThrow(/GOOGLE_SERVICES_JSON points to a missing file/);
  });

  it("missing file: an error on EAS, only a logged message locally", () => {
    const messages: string[] = [];
    expect(() => run({ rootDir: root, env: { EAS_BUILD: "1", EAS_BUILD_PLATFORM: "ios" }, log: (m: string) => messages.push(m) })).toThrow(
      /GOOGLE_SERVICES_PLIST/,
    );
    run({ rootDir: root, env: { EAS_BUILD_PLATFORM: "ios" }, log: (m: string) => messages.push(m) });
    expect(messages.join("\n")).toMatch(/GoogleService-Info\.plist is missing/);
  });

  it("rejects a plist without PROJECT_ID", () => {
    fs.mkdirSync(path.join(root, "ios/SuiviBaby"), { recursive: true });
    fs.writeFileSync(path.join(root, "ios/SuiviBaby/GoogleService-Info.plist"), "<dict><key>BUNDLE_ID</key><string>x</string></dict>");
    expect(() => run({ rootDir: root, env: { EAS_BUILD_PLATFORM: "ios" }, log })).toThrow(/no project id/);
  });

  it("rejects an invalid JSON file with a readable message", () => {
    fs.mkdirSync(path.join(root, "android/app"), { recursive: true });
    fs.writeFileSync(path.join(root, "android/app/google-services.json"), "{not json");
    expect(() => run({ rootDir: root, env: { EAS_BUILD_PLATFORM: "android" }, log })).toThrow(
      /android: android[\\/]app[\\/]google-services\.json cannot be read/,
    );
  });

  it("a JSON file without project_info is rejected too", () => {
    fs.mkdirSync(path.join(root, "android/app"), { recursive: true });
    fs.writeFileSync(path.join(root, "android/app/google-services.json"), "{}");
    expect(() => run({ rootDir: root, env: { EAS_BUILD_PLATFORM: "android" }, log })).toThrow(/no project id/);
  });

  it("checks both platforms when EAS_BUILD_PLATFORM is not set", () => {
    fs.mkdirSync(path.join(root, "android/app"), { recursive: true });
    fs.writeFileSync(path.join(root, "android/app/google-services.json"), json("samaye-53723"));
    fs.mkdirSync(path.join(root, "ios/SuiviBaby"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "ios/SuiviBaby/GoogleService-Info.plist"),
      "<dict><key>PROJECT_ID</key><string>samaye-staging</string></dict>",
    );
    expect(() => run({ rootDir: root, env: {}, log })).toThrow(/ios: .* belongs to project "samaye-staging"/);
  });
});
