import { isConflictError, isNetworkError, isNotFoundError } from "@/utils/networkError";

const err = (message: string, code?: string) => Object.assign(new Error(message), code ? { code } : {});

describe("isNetworkError (source unique, aussi utilisée par la file hors ligne)", () => {
  it.each([
    ["functions/unavailable", "x"],
    ["functions/internal", "INTERNAL"],
    ["functions/deadline-exceeded", "x"],
    ["functions/resource-exhausted", "x"],
    [undefined, "Network request failed"],
    [undefined, "The request was aborted because there was no available instance"],
    [undefined, "no internet connection"],
  ])("%s / %s est une erreur d'infrastructure", (code, message) => {
    expect(isNetworkError(err(message, code))).toBe(true);
  });

  it("reconnaît une erreur non-Error (objet simple) par son code et son message", () => {
    expect(isNetworkError({ code: "functions/unavailable", message: "down" })).toBe(true);
    expect(isNetworkError({ message: "network request failed" })).toBe(true);
  });

  it.each(["functions/invalid-argument", "functions/permission-denied", "functions/not-found"])(
    "%s est définitive",
    (code) => {
      expect(isNetworkError(err("Refusé", code))).toBe(false);
    },
  );

  it("un conflit de version n'est jamais une erreur réseau", () => {
    expect(isNetworkError(err("The request was aborted", "functions/aborted"))).toBe(false);
    expect(isConflictError(err("x", "aborted"))).toBe(true);
  });

  it("tolère null et undefined", () => {
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe("isNotFoundError", () => {
  it("reconnaît not-found avec ou sans préfixe, et rien d'autre", () => {
    expect(isNotFoundError(err("x", "functions/not-found"))).toBe(true);
    expect(isNotFoundError(err("x", "not-found"))).toBe(true);
    expect(isNotFoundError(err("x", "functions/permission-denied"))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
  });
});
