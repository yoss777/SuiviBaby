// plugins/withIosPodfileFixes.js — Podfile changes that used to be made by
// hand in the committed ios/ folder (before CNG, docs/adr/0004):
//   1. modular headers for the Firebase Swift pods pulled by
//      @react-native-firebase (App Check): without them `pod install` fails
//      on FirebaseCoreInternal / GoogleUtilities;
//   2. fmt compiled as C++17: fmt 11's consteval format strings fail with the
//      Xcode 26 clang (kept while React Native still pulls fmt 11).
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARK = "# @suivibaby/podfile-fixes";

const MODULAR_HEADERS = `  ${MARK}: modular headers for Firebase Swift pods
  pod 'GoogleUtilities', :modular_headers => true
  pod 'FirebaseCore', :modular_headers => true
  pod 'FirebaseCoreInternal', :modular_headers => true
  pod 'FirebaseCoreExtension', :modular_headers => true
`;

const FMT_CXX17 = `    ${MARK}: fmt 11 consteval vs Xcode 26 clang
    installer.pods_project.targets.each do |target|
      next unless target.name == 'fmt'
      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
      end
    end
`;

function applyPodfileFixes(podfile) {
  if (podfile.includes(MARK)) return podfile;
  const target = /^target '[^']+' do\n/m;
  // End of the post_install block (last lines of the Podfile): after
  // react_native_post_install, which sets the C++ standard of every pod.
  const postInstallEnd = /\n  end\nend\s*$/;
  if (!target.test(podfile) || !podfile.includes("post_install do |installer|") || !postInstallEnd.test(podfile)) {
    throw new Error("withIosPodfileFixes: Podfile layout not recognised");
  }
  return podfile
    .replace(target, (m) => m + MODULAR_HEADERS)
    .replace(postInstallEnd, `\n${FMT_CXX17}  end\nend\n`);
}

const withIosPodfileFixes = (config) =>
  withDangerousMod(config, [
    "ios",
    (cfg) => {
      const file = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      fs.writeFileSync(file, applyPodfileFixes(fs.readFileSync(file, "utf8")));
      return cfg;
    },
  ]);

module.exports = withIosPodfileFixes;
module.exports.applyPodfileFixes = applyPodfileFixes;
