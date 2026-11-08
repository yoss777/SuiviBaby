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

describe("isConnectivityError", () => {
  const { isConnectivityError } = jest.requireActual("@/utils/networkError");

  it("recognises lost connections to Firebase", () => {
    expect(isConnectivityError({ code: "unavailable", message: "Failed to get documents from server. (However…)" })).toBe(true);
    expect(isConnectivityError({ code: "firestore/unavailable", message: "x" })).toBe(true);
    expect(isConnectivityError({ code: "auth/network-request-failed", message: "x" })).toBe(true);
    expect(isConnectivityError(new Error("Failed to get document because the client is offline."))).toBe(true);
  });

  it("leaves permission, server and app errors to Sentry", () => {
    expect(isConnectivityError({ code: "permission-denied", message: "Missing or insufficient permissions." })).toBe(false);
    expect(isConnectivityError({ code: "functions/internal", message: "internal" })).toBe(false);
    expect(isConnectivityError(new TypeError("Cannot read property 'color' of undefined"))).toBe(false);
  });
});
