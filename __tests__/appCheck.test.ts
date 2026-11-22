const mockCaptureServiceError = jest.fn();
const mockJsGetToken = jest.fn();
const mockNativeGetToken = jest.fn();
const mockConfigure = jest.fn();
let mockProviderOptions: { getToken: () => Promise<unknown> };

jest.mock("@/utils/errorReporting", () => ({
  captureServiceError: (...args: unknown[]) => mockCaptureServiceError(...args),
}));
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { extra: { appCheck: { nativeConfigured: true } } } },
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
  loadNativeAppCheck: async () => ({
    ReactNativeFirebaseAppCheckProvider: class {
      configure = mockConfigure;
    },
    initializeAppCheck: jest.fn(() => ({ id: "native" })),
    getToken: (...args: unknown[]) => mockNativeGetToken(...args),
  }),
}));

const globals = globalThis as unknown as { __DEV__: boolean };

async function initApp() {
  let ensure!: (app: never) => Promise<void>;
  jest.isolateModules(() => {
    ensure = jest.requireActual("@/config/appCheck").ensureFirebaseAppCheck;
  });
  await ensure({} as never);
}

describe("App Check natif", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    globals.__DEV__ = false;
    process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_APPLE = "debug-apple";
    process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_ANDROID = "debug-android";
    mockJsGetToken.mockResolvedValue({ token: "t" });
  });

  afterAll(() => {
    globals.__DEV__ = true;
    delete process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_APPLE;
    delete process.env.EXPO_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN_ANDROID;
  });

  it("n'embarque aucun jeton de débogage en production", async () => {
    await initApp();
    const options = mockConfigure.mock.calls[0][0];
    expect(options.apple).toEqual(expect.objectContaining({ debugToken: undefined }));
    expect(options.android).toEqual(expect.objectContaining({ debugToken: undefined }));
  });

  it("remonte une seule fois un échec d'attestation et le relance", async () => {
    await initApp();
    const failure = Object.assign(new Error("attestation refusée"), { code: "appCheck/unknown" });
    mockNativeGetToken.mockRejectedValue(failure);
    await expect(mockProviderOptions.getToken()).rejects.toBe(failure);
    await expect(mockProviderOptions.getToken()).rejects.toBe(failure);
    expect(mockCaptureServiceError).toHaveBeenCalledTimes(1);
    expect(mockCaptureServiceError).toHaveBeenCalledWith(
      failure,
      expect.objectContaining({ service: "appCheck", operation: "getToken" }),
    );
  });

  it("ne remonte pas le délai normal du fournisseur au démarrage", async () => {
    await initApp();
    const failure = new Error("[appCheck/provider-not-ready] pas prêt");
    mockNativeGetToken.mockRejectedValue(failure);
    await expect(mockProviderOptions.getToken()).rejects.toBe(failure);
    expect(mockCaptureServiceError).not.toHaveBeenCalled();
  });

  it("n'expose jamais le jeton dans la remontée", async () => {
    await initApp();
    mockNativeGetToken.mockRejectedValue(new Error("échec"));
    await expect(mockProviderOptions.getToken()).rejects.toThrow("échec");
    const context = mockCaptureServiceError.mock.calls[0][1];
    expect(Object.keys(context.extra).sort()).toEqual(["code", "platform"]);
  });
});
