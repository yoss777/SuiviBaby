describe("Firebase config security", () => {
  it("should NOT expose AssemblyAI API key in client bundle", () => {
    // This test ensures the API key was properly removed (A1 fix)
    expect(process.env.EXPO_PUBLIC_ASSEMBLYAI_API_KEY).toBeUndefined();
  });

  it("should have firebase/functions mock available", () => {
    const { httpsCallable } = require("firebase/functions");
    expect(httpsCallable).toBeDefined();
    expect(typeof httpsCallable).toBe("function");
  });

  it("should have firebase/app-check mock available", () => {
    const { initializeAppCheck } = require("firebase/app-check");
    expect(initializeAppCheck).toBeDefined();
    expect(typeof initializeAppCheck).toBe("function");
  });

  it("should have Sentry mock available for crash reporting", () => {
    const Sentry = require("@sentry/react-native");
    expect(Sentry.init).toBeDefined();
    expect(Sentry.captureException).toBeDefined();
    expect(Sentry.wrap).toBeDefined();
  });
});
