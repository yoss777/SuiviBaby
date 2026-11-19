const { setOptionalFeatures, OPTIONAL_FEATURES } = require("../plugins/withOptionalHardwareFeatures");

describe("plugin withOptionalHardwareFeatures (avertissement Play de la 1.0.22)", () => {
  it("déclare le portrait et le Wi-Fi facultatifs", () => {
    const m = setOptionalFeatures({ manifest: {} });
    for (const name of OPTIONAL_FEATURES) {
      expect(m.manifest["uses-feature"]).toContainEqual({ $: { "android:name": name, "android:required": "false" } });
    }
  });

  it("corrige une déclaration obligatoire existante, sans doublon (idempotent)", () => {
    const m = { manifest: { "uses-feature": [{ $: { "android:name": "android.hardware.wifi", "android:required": "true" } }] } };
    setOptionalFeatures(m);
    setOptionalFeatures(m);
    const wifi = m.manifest["uses-feature"].filter((f) => f.$["android:name"] === "android.hardware.wifi");
    expect(wifi).toHaveLength(1);
    expect(wifi[0].$["android:required"]).toBe("false");
    expect(m.manifest["uses-feature"]).toHaveLength(2);
  });
});
