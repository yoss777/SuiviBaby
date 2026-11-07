import fs from "fs";
import os from "os";
import path from "path";

import {
  buildFirebaseWebConfig,
  defaultStorageBucket,
  FIREBASE_WEB_CONFIGS,
  getAppEnv,
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
    const config = buildFirebaseWebConfig("staging", staging);
    expect(config.apiKey).toBe("real-apiKey");
    // An empty override keeps the committed value (here still a placeholder).
    expect(() => buildFirebaseWebConfig("staging", { ...staging, apiKey: "" })).toThrow(
      /apiKey/,
    );
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
});
