// Garde-fou Reanimated 4 : withSpring sans configuration (ou avec une
// configuration partielle) prend le nouveau ressort « doux » de Reanimated 4.
// Les animations de l'app sont réglées pour le ressort de Reanimated 3 : chaque
// appel doit partir de SPRING_V3 (constants/motion.ts).
import fs from "fs";
import path from "path";

const ROOTS = ["app", "components", "hooks"].map((d) => path.join(__dirname, "..", d));

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : sourceFiles(full);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [full] : [];
  });
}

/** Contenu de chaque appel withSpring(...), parenthèses équilibrées. */
function springCalls(code: string): string[] {
  const calls: string[] = [];
  let i = code.indexOf("withSpring(");
  while (i >= 0) {
    let depth = 0;
    let j = i + "withSpring".length;
    do {
      if (code[j] === "(") depth++;
      else if (code[j] === ")") depth--;
      j++;
    } while (depth > 0 && j < code.length);
    calls.push(code.slice(i, j));
    i = code.indexOf("withSpring(", j);
  }
  return calls;
}

describe("withSpring part du ressort de Reanimated 3", () => {
  const files = ROOTS.flatMap(sourceFiles).filter((f) => fs.readFileSync(f, "utf8").includes("withSpring("));

  it("trouve des appels à vérifier", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [path.relative(path.join(__dirname, ".."), f), f]))("%s", (_name, file) => {
    const missing = springCalls(fs.readFileSync(file, "utf8")).filter((c) => !c.includes("SPRING_V3"));
    expect(missing).toEqual([]);
  });
});
