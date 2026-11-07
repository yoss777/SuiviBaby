/**
 * @jest-environment node
 */
// Règle S13.3 : l'UI n'importe pas Firestore/Storage (statique, sous-chemins,
// SDK natif, require/import dynamiques). `import type` reste autorisé.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ESLint } = require("eslint");

// Config passée en objet : le chargeur de fichier d'ESLint utilise un import()
// dynamique, indisponible sous Jest.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require("../eslint.config.js");
const eslint = new ESLint({
  cwd: process.cwd(),
  overrideConfigFile: true,
  overrideConfig: config,
});

async function messages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m: { ruleId: string | null }) =>
    ["@typescript-eslint/no-restricted-imports", "no-restricted-syntax"].includes(m.ruleId ?? ""),
  );
}

const UI_FILE = "components/__lint_probe__.tsx";

describe("eslint : couche d'accès aux données", () => {
  jest.setTimeout(60000);

  it.each([
    ['import { getDoc } from "firebase/firestore";'],
    ['import { ref } from "firebase/storage";'],
    ['import { getDoc } from "firebase/firestore/lite";'],
    ['import firestore from "@react-native-firebase/firestore";'],
    ['import storage from "@react-native-firebase/storage";'],
    ['const fs = require("firebase/firestore"); export default fs;'],
    ['const fs = require("@react-native-firebase/firestore"); export default fs;'],
    ['export const load = () => import("firebase/firestore");'],
    ['export const load = () => import("@react-native-firebase/storage");'],
  ])("refuse dans l'UI : %s", async (code) => {
    expect((await messages(code, UI_FILE)).length).toBeGreaterThan(0);
  });

  it("autorise les imports de types seuls", async () => {
    expect(await messages('import type { Timestamp } from "firebase/firestore";\nexport type T = Timestamp;', UI_FILE)).toEqual([]);
  });

  it("autorise les autres modules (dynamiques compris)", async () => {
    expect(await messages('export const load = () => import("firebase/functions");', UI_FILE)).toEqual([]);
    expect(await messages('const x = require("react"); export default x;', UI_FILE)).toEqual([]);
  });

  it("n'applique pas la règle à services/", async () => {
    expect(await messages('import { getDoc } from "firebase/firestore";\nexport { getDoc };', "services/__lint_probe__.ts")).toEqual([]);
  });
});
