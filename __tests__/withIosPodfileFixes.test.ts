const { applyPodfileFixes } = require("../plugins/withIosPodfileFixes");

const PODFILE = `platform :ios, '15.1'
prepare_react_native_project!

target 'SuiviBaby' do
  use_expo_modules!

  post_install do |installer|
    react_native_post_install(installer)
  end
end
`;

describe("withIosPodfileFixes", () => {
  it("adds Firebase modular headers inside the target and the fmt fix after react_native_post_install", () => {
    const out = applyPodfileFixes(PODFILE);
    expect(out).toMatch(/target 'SuiviBaby' do\n  # @suivibaby\/podfile-fixes[^\n]*\n  pod 'GoogleUtilities', :modular_headers => true/);
    expect(out.indexOf("CLANG_CXX_LANGUAGE_STANDARD")).toBeGreaterThan(out.indexOf("react_native_post_install"));
    expect(out.trimEnd().endsWith("  end\nend")).toBe(true);
  });

  it("is idempotent", () => {
    const once = applyPodfileFixes(PODFILE);
    expect(applyPodfileFixes(once)).toBe(once);
  });

  it("fails loudly on an unknown Podfile layout", () => {
    expect(() => applyPodfileFixes("platform :ios\n")).toThrow(/not recognised/);
  });
});
