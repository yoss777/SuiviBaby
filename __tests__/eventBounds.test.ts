/**
 * Tests pour utils/eventBounds.ts (A.F3).
 * Garantit que les bornes UI restent strictement alignées sur celles
 * de validateEventData() côté CF. Une dérive ici = friction utilisateur
 * (rejet serveur tardif) ou bypass de défense (bornes UI plus larges).
 */
import {
  NUMERIC_BOUNDS,
  STRING_LENGTH_LIMITS,
  DATE_BOUNDS,
  getEventDateBounds,
  clampNumber,
  clampString,
} from "@/utils/eventBounds";

describe("NUMERIC_BOUNDS", () => {
  it("biberon quantite borne à 300ml (décision produit) bien que CF accepte 500", () => {
    expect(NUMERIC_BOUNDS.biberon.quantite.max).toBe(300);
  });

  it("sommeil duree min=1 (pas de sommeil de 0 minute)", () => {
    expect(NUMERIC_BOUNDS.sommeil.duree.min).toBe(1);
    expect(NUMERIC_BOUNDS.sommeil.duree.max).toBe(1440);
  });

  it("temperature 34-43°C aligné CF", () => {
    expect(NUMERIC_BOUNDS.temperature.valeur.min).toBe(34);
    expect(NUMERIC_BOUNDS.temperature.valeur.max).toBe(43);
  });

  it("croissance bornes alignées CF (poids 0.3-50, taille 20-200, tête 20-60)", () => {
    expect(NUMERIC_BOUNDS.croissance.poidsKg.min).toBe(0.3);
    expect(NUMERIC_BOUNDS.croissance.poidsKg.max).toBe(50);
    expect(NUMERIC_BOUNDS.croissance.tailleCm.min).toBe(20);
    expect(NUMERIC_BOUNDS.croissance.tailleCm.max).toBe(200);
    expect(NUMERIC_BOUNDS.croissance.teteCm.min).toBe(20);
    expect(NUMERIC_BOUNDS.croissance.teteCm.max).toBe(60);
  });

  it("humeur jalon bornée [1,5]", () => {
    expect(NUMERIC_BOUNDS.jalon.humeur.min).toBe(1);
    expect(NUMERIC_BOUNDS.jalon.humeur.max).toBe(5);
  });
});

describe("STRING_LENGTH_LIMITS", () => {
  it("note ≤ 1000 (parité CF)", () => {
    expect(STRING_LENGTH_LIMITS.note).toBe(1000);
  });

  it("nomMedicament/dosage/nomVaccin/nomVitamine ≤ 100 (parité CF)", () => {
    expect(STRING_LENGTH_LIMITS.nomMedicament).toBe(100);
    expect(STRING_LENGTH_LIMITS.dosage).toBe(100);
    expect(STRING_LENGTH_LIMITS.nomVaccin).toBe(100);
    expect(STRING_LENGTH_LIMITS.nomVitamine).toBe(100);
  });
});

describe("DATE_BOUNDS / getEventDateBounds", () => {
  it("maxFuture = 5 minutes (parité CF tolérance horloge)", () => {
    expect(DATE_BOUNDS.maxFutureMs).toBe(5 * 60 * 1000);
  });

  it("maxPast = 365 jours (parité CF)", () => {
    expect(DATE_BOUNDS.maxPastMs).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it("getEventDateBounds retourne des Date glissantes autour de now", () => {
    const { minDate, maxDate } = getEventDateBounds();
    const now = Date.now();
    expect(maxDate.getTime()).toBeGreaterThan(now);
    expect(maxDate.getTime()).toBeLessThanOrEqual(now + DATE_BOUNDS.maxFutureMs + 100);
    expect(minDate.getTime()).toBeLessThan(now);
    expect(now - minDate.getTime()).toBeGreaterThanOrEqual(DATE_BOUNDS.maxPastMs - 100);
  });
});

describe("clampNumber", () => {
  it("retourne min pour NaN/Infinity/null/undefined", () => {
    expect(clampNumber(NaN, 0, 100)).toBe(0);
    expect(clampNumber(Infinity, 0, 100)).toBe(0);
    expect(clampNumber(null, 0, 100)).toBe(0);
    expect(clampNumber(undefined, 0, 100)).toBe(0);
  });

  it("clamp en haut et en bas", () => {
    expect(clampNumber(150, 0, 100)).toBe(100);
    expect(clampNumber(-50, 0, 100)).toBe(0);
    expect(clampNumber(42, 0, 100)).toBe(42);
  });

  it("respecte les bornes inclusives", () => {
    expect(clampNumber(0, 0, 100)).toBe(0);
    expect(clampNumber(100, 0, 100)).toBe(100);
  });
});

describe("clampString", () => {
  it("retourne '' pour null/undefined", () => {
    expect(clampString(null, 100)).toBe("");
    expect(clampString(undefined, 100)).toBe("");
    expect(clampString("", 100)).toBe("");
  });

  it("trim + slice à maxLength", () => {
    expect(clampString("  hello  ", 100)).toBe("hello");
    const long = "x".repeat(200);
    expect(clampString(long, 100)).toBe("x".repeat(100));
  });

  it("ne tronque pas si déjà sous le max", () => {
    expect(clampString("short", 100)).toBe("short");
  });
});
