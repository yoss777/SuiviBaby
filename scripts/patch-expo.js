const fs = require("fs");
const path = require("path");

const filePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "expo",
  "android",
  "src",
  "main",
  "java",
  "expo",
  "modules",
  "ReactActivityDelegateWrapper.kt"
);

if (!fs.existsSync(filePath)) {
  console.log("patch-expo: expo not installed yet, skipping.");
  process.exit(0);
}

const contents = fs.readFileSync(filePath, "utf8");

if (contents.includes("isBridgelessEnabled")) {
  console.log("patch-expo: already patched.");
  process.exit(0);
}

const target =
  "        if (ReactNativeFeatureFlags.enableBridgelessArchitecture) {";
const replacement = [
  "        val isBridgelessEnabled = if (isNewArchitectureEnabled) {",
  "          try {",
  "            ReactNativeFeatureFlags.enableBridgelessArchitecture",
  "          } catch (_: Throwable) {",
  "            false",
  "          }",
  "        } else {",
  "          false",
  "        }",
  "        if (isBridgelessEnabled) {",
].join("\n");

if (!contents.includes(target)) {
  console.error("patch-expo: target snippet not found; aborting.");
  process.exit(1);
}

const updated = contents.replace(target, replacement);
fs.writeFileSync(filePath, updated);
console.log("patch-expo: patched expo ReactActivityDelegateWrapper.kt");
