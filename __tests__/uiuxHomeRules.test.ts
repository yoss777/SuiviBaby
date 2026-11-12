// Règles pures de l'audit UI/UX (Accueil, auth) : format « il y a … »,
// heures calmes du carrousel, validation du pseudo, messages d'erreur d'auth.
import { formatElapsedMinutes, formatTimeSince } from "@/utils/timeSince";
import { isTipsQuietHour, shouldAutoScrollTips } from "@/utils/tipsAutoScroll";
import { NICKNAME_MIN_LENGTH, validateNickname } from "@/utils/nickname";
import { getAuthErrorInfo } from "@/utils/authErrors";

const NBSP = " ";
const at = (h: number, m = 0) => new Date(2026, 10, 12, h, m, 0);

describe("formatTimeSince (P1-3)", () => {
  const now = at(12, 0);
  const minutesAgo = (n: number) => now.getTime() - n * 60_000;

  it("écrit les minutes sur deux chiffres après les heures : 2 h 05, pas 2h5", () => {
    expect(formatTimeSince(minutesAgo(125), now)).toBe(`il y a 2${NBSP}h${NBSP}05`);
    expect(formatTimeSince(minutesAgo(125), now)).not.toContain("2h5");
  });

  it("heures pleines sans minutes, minutes seules sous l'heure", () => {
    expect(formatTimeSince(minutesAgo(120), now)).toBe(`il y a 2${NBSP}h`);
    expect(formatTimeSince(minutesAgo(5), now)).toBe(`il y a 5${NBSP}min`);
    expect(formatTimeSince(minutesAgo(650), now)).toBe(`il y a 10${NBSP}h${NBSP}50`);
  });

  it("à l'instant, futur et valeurs absentes", () => {
    expect(formatTimeSince(now.getTime() - 30_000, now)).toBe("à l'instant");
    expect(formatTimeSince(now.getTime() + 60_000, now)).toBeNull();
    expect(formatTimeSince(undefined, now)).toBeNull();
    expect(formatTimeSince(Number.NaN, now)).toBeNull();
  });

  it("formatElapsedMinutes borne à 0", () => {
    expect(formatElapsedMinutes(-3)).toBe(`0${NBSP}min`);
    expect(formatElapsedMinutes(61)).toBe(`1${NBSP}h${NBSP}01`);
  });
});

describe("carrousel de conseils : défilement automatique (P1-2)", () => {
  const base = { reduceMotion: false, screenReaderEnabled: false };

  it.each([22, 23, 0, 3, 6])("jamais à %i h (heures calmes 22 h – 7 h)", (h) => {
    expect(isTipsQuietHour(at(h, 30))).toBe(true);
    expect(shouldAutoScrollTips({ ...base, now: at(h, 30) })).toBe(false);
  });

  it.each([7, 12, 21])("autorisé à %i h en journée", (h) => {
    expect(shouldAutoScrollTips({ ...base, now: at(h, 0) })).toBe(true);
  });

  it("bornes exactes : 21 h 59 défile, 22 h 00 non, 7 h 00 de nouveau", () => {
    expect(shouldAutoScrollTips({ ...base, now: at(21, 59) })).toBe(true);
    expect(shouldAutoScrollTips({ ...base, now: at(22, 0) })).toBe(false);
    expect(shouldAutoScrollTips({ ...base, now: at(6, 59) })).toBe(false);
    expect(shouldAutoScrollTips({ ...base, now: at(7, 0) })).toBe(true);
  });

  it("jamais avec Réduire les animations ni avec un lecteur d'écran, même de jour", () => {
    expect(shouldAutoScrollTips({ ...base, now: at(12), reduceMotion: true })).toBe(false);
    expect(
      shouldAutoScrollTips({ ...base, now: at(12), screenReaderEnabled: true }),
    ).toBe(false);
  });
});

describe("validateNickname (P1-23)", () => {
  it("accepte les prénoms courts : Léa, Tom, Jo", () => {
    expect(NICKNAME_MIN_LENGTH).toBe(2);
    expect(validateNickname("Léa")).toBeNull();
    expect(validateNickname("Tom")).toBeNull();
    expect(validateNickname("Jo")).toBeNull();
    // « é » décomposé (e + accent combinant) compte pour un caractère
    expect(validateNickname("Léa")).toBeNull();
  });

  it("refuse le vide et une seule lettre, avec un message clair", () => {
    expect(validateNickname("")).toMatch(/Entrez un pseudo/);
    expect(validateNickname("   ")).toMatch(/Entrez un pseudo/);
    expect(validateNickname(" L ")).toMatch(/au moins 2 caractères/);
  });
});

describe("getAuthErrorInfo (P1-23)", () => {
  it("rattache l'erreur au bon champ et dit quoi faire", () => {
    expect(getAuthErrorInfo("auth/email-already-in-use", "signup")).toEqual({
      field: "email",
      message: expect.stringMatching(/Connectez-vous/),
    });
    expect(getAuthErrorInfo("auth/invalid-credential", "login").field).toBe("form");
    expect(getAuthErrorInfo("auth/weak-password", "signup").field).toBe("password");
    expect(getAuthErrorInfo("auth/network-request-failed", "login").message).toMatch(
      /réessayez/,
    );
  });

  it("message de repli propre au mode", () => {
    expect(getAuthErrorInfo("unknown", "login").message).toMatch(/connexion/);
    expect(getAuthErrorInfo(undefined, "signup").message).toMatch(/création du compte/);
  });
});
