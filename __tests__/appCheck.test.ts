const mockCaptureServiceError = jest.fn();
const mockJsGetToken = jest.fn();
const mockNativeGetToken = jest.fn();
const mockConfigure = jest.fn();
const mockLoadNative = jest.fn();
const mockNetInfoFetch = jest.fn();
const mockSentryEnvironment = jest.fn();
const mockExtra: { appCheck: { nativeConfiguredAndroid: boolean; nativeConfiguredIos: boolean } } = {
  appCheck: { nativeConfiguredAndroid: true, nativeConfiguredIos: true },
};
let mockProviderOptions: { getToken: () => Promise<unknown> };

jest.mock("@/utils/errorReporting", () => ({
  captureServiceError: (...args: unknown[]) => mockCaptureServiceError(...args),
}));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: (...args: unknown[]) => mockNetInfoFetch(...args) },
}));
jest.mock("@/config/firebaseEnv", () => ({
  getSentryEnvironment: (...args: unknown[]) => mockSentryEnvironment(...args),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: mockExtra };
    },
  },
}));
jest.mock("firebase/app-check", () => ({
  CustomProvider: class {
    constructor(options: { getToken: () => Promise<unknown> }) {
      mockProviderOptions = options;
    }
  },
  ReCaptchaV3Provider: class {},
  initializeAppCheck: jest.fn(() => ({ id: "app-check" })),
  getToken: (...args: unknown[]) => mockJsGetToken(...args),
}));
jest.mock("@/config/loadNativeAppCheck", () => ({
  loadNativeAppCheck: (...args: unknown[]) => mockLoadNative(...args),
}));

const { Platform } = jest.requireActual("react-native") as { Platform: { OS: string } };
const originalPlatform = Platform.OS;
const globals = globalThis as unknown as { __DEV__: boolean };
const nativeModule = {
  ReactNativeFirebaseAppCheckProvider: class {
    configure = mockConfigure;
  },
  initializeAppCheck: jest.fn(() => ({ id: "native" })),
  getToken: (...args: unknown[]) => mockNativeGetToken(...args),
};
const notReady = () => new Error("[appCheck/provider-not-ready] pas prêt");

async function flush() {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
}

async function initApp() {
  let ensure!: (app: never) => Promise<void>;
  jest.isolateModules(() => {
    ensure = jest.requireActual("@/config/appCheck").ensureFirebaseAppCheck;
  });
  await ensure({} as never);
  await flush();
}

async function failProvider(error: Error) {
  mockNativeGetToken.mockRejectedValueOnce(error);
  await expect(mockProviderOptions.getToken()).rejects.toBe(error);
  await flush();
}

describe("App Check natif", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globals.__DEV__ = false;
    mockExtra.appCheck.nativeConfiguredAndroid = true;
    mockExtra.appCheck.nativeConfiguredIos = true;
    Platform.OS = "ios";
    process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_APPLE = "debug-apple";
    process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_ANDROID = "debug-android";
    delete process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE_DEV_ENABLED;
    mockJsGetToken.mockResolvedValue({ token: "t" });
    mockLoadNative.mockResolvedValue(nativeModule);
    mockNetInfoFetch.mockResolvedValue({ isConnected: true, isInternetReachable: true });
    mockSentryEnvironment.mockReturnValue("production");
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    Platform.OS = originalPlatform;
    globals.__DEV__ = true;
    delete process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_APPLE;
    delete process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_ANDROID;
  });

  it("utilise la vraie attestation sans jeton de débogage en production", async () => {
    await initApp();
    expect(mockConfigure.mock.calls[0][0]).toEqual({
      android: { provider: "playIntegrity", debugToken: undefined },
      apple: { provider: "appAttestWithDeviceCheckFallback", debugToken: undefined },
    });
  });

  it("garde le fournisseur de débogage en développement", async () => {
    globals.__DEV__ = true;
    process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_NATIVE_DEV_ENABLED = "true";
    await initApp();
    expect(mockConfigure.mock.calls[0][0]).toEqual({
      apple: { provider: "debug", debugToken: "debug-apple" },
      android: { provider: "debug", debugToken: "debug-android" },
    });
  });

  it("remonte une seule fois la même cause et relance l'erreur", async () => {
    await initApp();
    const failure = Object.assign(new Error("attestation refusée"), { code: "appCheck/unknown" });
    await failProvider(failure);
    await failProvider(failure);
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(1);
    expect(mockCaptureServiceError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "App Check getToken: appCheck/unknown" }),
      expect.objectContaining({ service: "appCheck", operation: "getToken" }),
    );
  });

  it("distingue deux causes qui partagent le même code", async () => {
    await initApp();
    await failProvider(Object.assign(new Error("droit absent"), { code: "appCheck/unknown" }));
    await failProvider(Object.assign(new Error("clé rejetée"), { code: "appCheck/unknown" }));
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(2);
  });

  it("plafonne les remontées par lancement", async () => {
    await initApp();
    for (const cause of ["a", "b", "c", "d", "e", "f", "g"]) {
      await failProvider(new Error(`cause ${cause}`));
    }
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(5);
  });

  it("ne classe pas une panne `unavailable` comme une coupure quand le réseau est là", async () => {
    await initApp();
    await failProvider(Object.assign(new Error("service indisponible"), { code: "appCheck/unavailable" }));
    const [reported] = mockCaptureServiceError.mock.calls[0];
    expect(reported.code).toBeUndefined();
    expect(reported.message).toBe("App Check getToken: appCheck/unavailable");
  });

  it("ignore un échec hors ligne, puis remonte la même cause une fois en ligne", async () => {
    await initApp();
    const failure = new Error("token-error");
    mockNetInfoFetch.mockResolvedValueOnce({ isConnected: false, isInternetReachable: false });
    await failProvider(failure);
    expect(mockCaptureServiceError).not.toHaveBeenCalled();
    await failProvider(failure);
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(1);
  });

  it.each([[false], [null]])(
    "remonte une panne quand le téléphone est connecté et que la sonde Internet vaut %s",
    async (isInternetReachable) => {
      await initApp();
      mockNetInfoFetch.mockResolvedValueOnce({ isConnected: true, isInternetReachable });
      await failProvider(new Error("attestation refusée"));
      expect(mockCaptureServiceError).toHaveBeenCalledTimes(1);
    },
  );

  it("remonte la panne même si la détection du réseau reste bloquée", async () => {
    await initApp();
    jest.useFakeTimers();
    mockNetInfoFetch.mockReturnValueOnce(new Promise(() => undefined));
    mockNativeGetToken.mockRejectedValueOnce(new Error("attestation refusée"));
    await expect(mockProviderOptions.getToken()).rejects.toThrow("attestation refusée");
    await jest.advanceTimersByTimeAsync(2000);
    await flush();
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(1);
  });

  it("garde un plafond par opération", async () => {
    jest.useFakeTimers();
    mockJsGetToken.mockRejectedValue(notReady());
    await initApp();
    for (const cause of ["a", "b", "c", "d", "e", "f"]) {
      await failProvider(new Error(`cause ${cause}`));
    }
    await jest.advanceTimersByTimeAsync(4000);
    await flush();
    const operations = mockCaptureServiceError.mock.calls.map(([, context]) => context.operation);
    expect(operations.filter((operation) => operation === "getToken")).toHaveLength(5);
    expect(operations).toContain("startupToken");
  });

  it("ignore une erreur réseau seulement si le téléphone est hors ligne", async () => {
    await initApp();
    const failure = Object.assign(new Error("réseau"), { code: "appCheck/network-request-failed" });
    mockNetInfoFetch.mockResolvedValueOnce({ isConnected: false });
    await failProvider(failure);
    expect(mockCaptureServiceError).not.toHaveBeenCalled();
    await failProvider(failure);
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(1);
  });

  it("remonte la panne si la détection du réseau échoue", async () => {
    await initApp();
    mockNetInfoFetch.mockRejectedValueOnce(new Error("netinfo"));
    await failProvider(new Error("attestation refusée"));
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(1);
  });

  it("ne lance qu'une vérification réseau pour une rafale identique", async () => {
    await initApp();
    mockNetInfoFetch.mockClear();
    const failure = new Error("attestation refusée");
    mockNativeGetToken.mockRejectedValue(failure);
    await Promise.allSettled([mockProviderOptions.getToken(), mockProviderOptions.getToken()]);
    await flush();
    expect(mockNetInfoFetch).toHaveBeenCalledTimes(1);
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(1);
  });

  it("reconnaît « pas prêt » par son seul code", async () => {
    jest.useFakeTimers();
    const failure = Object.assign(new Error("x"), { code: "appCheck/provider-not-ready" });
    mockJsGetToken.mockRejectedValueOnce(failure).mockResolvedValueOnce({ token: "t" });
    await initApp();
    await jest.advanceTimersByTimeAsync(2000);
    await flush();
    expect(mockJsGetToken).toHaveBeenCalledTimes(2);
    expect(mockCaptureServiceError).not.toHaveBeenCalled();
  });

  it("n'attend pas indéfiniment le premier jeton", async () => {
    jest.useFakeTimers();
    mockJsGetToken.mockReturnValue(new Promise(() => undefined));
    await initApp();
    await jest.advanceTimersByTimeAsync(20000);
    await flush();
    expect(mockCaptureServiceError.mock.calls[0][1].operation).toBe("startupToken");
  });

  it("ne charge pas le module natif en développement sans option explicite", async () => {
    globals.__DEV__ = true;
    mockSentryEnvironment.mockReturnValue("development");
    await initApp();
    expect(mockLoadNative).not.toHaveBeenCalled();
    expect(mockCaptureServiceError).not.toHaveBeenCalled();
  });

  it("masque toute valeur ressemblant à un jeton", async () => {
    await initApp();
    await failProvider(new Error("refus eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload code 403"));
    const context = mockCaptureServiceError.mock.calls[0][1];
    expect(Object.keys(context.extra).sort()).toEqual(["code", "detail", "platform"]);
    expect(context.extra.detail).toBe("refus [masqué] code #");
    expect(JSON.stringify(mockCaptureServiceError.mock.calls[0])).not.toContain("eyJ");
  });

  it("n'alerte pas pendant le délai normal du démarrage", async () => {
    jest.useFakeTimers();
    mockJsGetToken.mockRejectedValueOnce(notReady()).mockResolvedValueOnce({ token: "t" });
    await initApp();
    await failProvider(notReady());
    await jest.advanceTimersByTimeAsync(2000);
    await flush();
    expect(mockJsGetToken).toHaveBeenCalledTimes(2);
    expect(mockCaptureServiceError).not.toHaveBeenCalled();
  });

  it("alerte si le fournisseur n'est toujours pas prêt après trois essais", async () => {
    jest.useFakeTimers();
    mockJsGetToken.mockRejectedValue(notReady());
    await initApp();
    await jest.advanceTimersByTimeAsync(4000);
    await flush();
    expect(mockJsGetToken).toHaveBeenCalledTimes(3);
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(1);
    expect(mockCaptureServiceError.mock.calls[0][1].operation).toBe("startupToken");
  });

  it("n'insiste pas au démarrage sur une autre erreur", async () => {
    jest.useFakeTimers();
    mockJsGetToken.mockRejectedValue(new Error("attestation refusée"));
    await initApp();
    await jest.advanceTimersByTimeAsync(4000);
    expect(mockJsGetToken).toHaveBeenCalledTimes(1);
    await failProvider(notReady());
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(1);
    expect(mockCaptureServiceError.mock.calls[0][1].operation).toBe("getToken");
  });

  it("alerte sur « pas prêt » après la fin du démarrage", async () => {
    await initApp();
    await failProvider(notReady());
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(1);
    expect(mockCaptureServiceError.mock.calls[0][1].operation).toBe("getToken");
  });

  it("remonte l'échec de chargement du module natif sans planter", async () => {
    mockLoadNative.mockRejectedValue(new Error("module absent"));
    await initApp();
    expect(mockConfigure).not.toHaveBeenCalled();
    expect(mockCaptureServiceError.mock.calls[0][1].operation).toBe("nativeModule");
  });

  it.each([
    ["production", 1],
    ["staging", 0],
    ["development", 0],
  ])("build non configuré en %s : %i remontée", async (environment, expected) => {
    mockExtra.appCheck.nativeConfiguredIos = false;
    mockSentryEnvironment.mockReturnValue(environment);
    await initApp();
    expect(mockLoadNative).not.toHaveBeenCalled();
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(expected);
    if (expected) {
      expect(mockCaptureServiceError.mock.calls[0][1].operation).toBe("notConfigured");
    }
  });

  it.each([
    ["ios", { nativeConfiguredIos: true, nativeConfiguredAndroid: false }, 1],
    ["android", { nativeConfiguredIos: false, nativeConfiguredAndroid: true }, 1],
    ["ios", { nativeConfiguredIos: false, nativeConfiguredAndroid: true }, 0],
    ["android", { nativeConfiguredIos: true, nativeConfiguredAndroid: false }, 0],
  ])("sur %s, ne dépend que du fichier de sa plateforme (%j)", async (os, flags, loads) => {
    Platform.OS = os;
    Object.assign(mockExtra.appCheck, flags);
    await initApp();
    expect(mockLoadNative).toHaveBeenCalledTimes(loads);
  });

  it("demande un jeton neuf quand le jeton natif arrive en fin de vie", async () => {
    await initApp();
    const jwt = (minutes: number) =>
      `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + minutes * 60 })).toString("base64")}.s`;
    const fresh = jwt(60);
    mockNativeGetToken.mockResolvedValueOnce({ token: jwt(4) }).mockResolvedValueOnce({ token: fresh });
    await expect(mockProviderOptions.getToken()).resolves.toEqual(expect.objectContaining({ token: fresh }));
    expect(mockNativeGetToken.mock.calls.map((call) => call[1])).toEqual([false, true]);
  });

  it("garde le jeton natif tant qu'il reste assez de temps", async () => {
    await initApp();
    const token = `h.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3000 })).toString("base64")}.s`;
    mockNativeGetToken.mockResolvedValueOnce({ token });
    await mockProviderOptions.getToken();
    expect(mockNativeGetToken).toHaveBeenCalledTimes(1);
  });

  it("n'initialise qu'une fois", async () => {
    let ensure!: (app: never) => Promise<void>;
    jest.isolateModules(() => {
      ensure = jest.requireActual("@/config/appCheck").ensureFirebaseAppCheck;
    });
    await Promise.all([ensure({} as never), ensure({} as never)]);
    await ensure({} as never);
    expect(mockConfigure).toHaveBeenCalledTimes(1);
  });

  it("remonte un échec d'initialisation sans le propager", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const failure = new Error("init impossible");
    mockConfigure.mockImplementationOnce(() => {
      throw failure;
    });
    await expect(initApp()).resolves.toBeUndefined();
    expect(mockCaptureServiceError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "App Check initialize: unknown" }),
      expect.objectContaining({ service: "appCheck", operation: "initialize" }),
    );
    warn.mockRestore();
  });
});

describe("configuration iOS", () => {
  describe("câblage de app.config.js", () => {
    const fs = jest.requireActual("fs");
    const previous = { ...process.env };
    afterEach(() => {
      jest.restoreAllMocks();
      process.env = { ...previous };
    });

    function resolve(platform: string | undefined, files: string[]) {
      const original = fs.existsSync;
      jest.spyOn(fs, "existsSync").mockImplementation((...args: unknown[]) => {
        const file = String(args[0]);
        if (/google-services\.json$|GoogleService-Info\.plist$/.test(file)) {
          return files.some((name) => file.endsWith(name));
        }
        return original(file);
      });
      delete process.env.APP_ENV;
      delete process.env.GOOGLE_SERVICES_JSON;
      delete process.env.GOOGLE_SERVICES_PLIST;
      delete process.env.GOOGLE_SERVICE_INFO_PLIST;
      if (platform) process.env.EAS_BUILD_PLATFORM = platform;
      else delete process.env.EAS_BUILD_PLATFORM;
      const appJson = jest.requireActual("../app.json");
      return jest.requireActual("../app.config.js")({ config: appJson.expo });
    }

    it.each([
      ["ios", ["GoogleService-Info.plist"], true, true, false],
      ["android", ["google-services.json"], true, false, true],
      ["ios", ["google-services.json"], false, false, false],
      ["android", ["GoogleService-Info.plist"], false, false, false],
      [undefined, ["GoogleService-Info.plist"], false, false, false],
      [undefined, ["google-services.json", "GoogleService-Info.plist"], true, true, true],
    ])("%s avec %j : plugins=%s, iOS=%s, Android=%s", (platform, files, plugins, ios, android) => {
      const config = resolve(platform, files);
      expect(config.plugins.includes("@react-native-firebase/app-check")).toBe(plugins);
      expect(config.plugins.includes("./plugins/withFirebaseAppDelegate")).toBe(plugins);
      expect(config.extra.appCheck.nativeConfiguredIos).toBe(ios);
      expect(config.extra.appCheck.nativeConfiguredAndroid).toBe(android);
    });
  });

  it.each([
    ["ios", undefined, "plist", true],
    ["ios", "json", undefined, false],
    ["android", "json", undefined, true],
    ["android", undefined, "plist", false],
    [undefined, "json", "plist", true],
    [undefined, undefined, "plist", false],
  ])("plugins Firebase pour %s (json=%s, plist=%s) : %s", (platform, json, plist, expected) => {
    const { shouldApplyNativeFirebase } = jest.requireActual("../app.config.js");
    expect(shouldApplyNativeFirebase(platform, json, plist)).toBe(expected);
  });

  it("garde le droit App Attest en production dans la configuration finale", () => {
    const previousEnv = process.env.APP_ENV;
    delete process.env.APP_ENV;
    try {
      const appJson = jest.requireActual("../app.json");
      const createConfig = jest.requireActual("../app.config.js");
      const resolved = (createConfig.default ?? createConfig)({ config: appJson.expo });
      expect(resolved.ios.entitlements["com.apple.developer.devicecheck.appattest-environment"]).toBe("production");
    } finally {
      if (previousEnv === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = previousEnv;
    }
  });
});
