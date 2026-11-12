// Saisie : décimales françaises (P2-8), garde-fou de fermeture (P1-8),
// répétition des +/− (P1-6) et store du pied collant (P1-7).
import { isFormDirty, resolveDismissRequest } from "@/components/forms/formGuard";
import { createSheetFooterStore } from "@/components/forms/sheetFooterStore";
import { repeatIntervalMs } from "@/components/forms/useRepeatPress";
import {
  formatDecimalFr,
  formatTemperatureFr,
  parseDecimalFr,
  toDecimalInputFr,
} from "@/utils/frenchNumber";

describe("décimales françaises", () => {
  it("affiche une virgule et une espace insécable avant °C", () => {
    expect(formatDecimalFr(38.5)).toBe("38,5");
    expect(formatDecimalFr(37)).toBe("37,0");
    expect(formatTemperatureFr(38.5)).toBe("38,5 °C");
    expect(formatDecimalFr(-0.04)).toBe("0,0");
    expect(formatDecimalFr(-0.3)).toBe("-0,3");
    expect(formatDecimalFr(Number.NaN)).toBe("");
  });

  it("pré-remplit un champ sans zéros superflus", () => {
    expect(toDecimalInputFr(3.45)).toBe("3,45");
    expect(toDecimalInputFr(52)).toBe("52");
    expect(toDecimalInputFr(undefined)).toBe("");
  });

  it("lit la virgule comme le point, et refuse une saisie ambiguë", () => {
    expect(parseDecimalFr("3,45")).toBe(3.45);
    expect(parseDecimalFr("3.45")).toBe(3.45);
    expect(parseDecimalFr(" 52 ")).toBe(52);
    expect(parseDecimalFr(",5")).toBe(0.5);
    expect(parseDecimalFr("")).toBeUndefined();
    expect(parseDecimalFr("3,4,5")).toBeUndefined();
    expect(parseDecimalFr("abc")).toBeUndefined();
  });
});

describe("garde-fou de fermeture", () => {
  const base = { note: "", date: new Date(1000), tags: ["a"], n: 1 };

  it("formulaire intact : pas modifié (dates et tableaux comparés par valeur)", () => {
    expect(isFormDirty(base, { ...base, date: new Date(1000), tags: ["a"] })).toBe(false);
  });

  it("toute valeur changée rend le formulaire modifié", () => {
    expect(isFormDirty(base, { ...base, note: "fièvre" })).toBe(true);
    expect(isFormDirty(base, { ...base, date: new Date(2000) })).toBe(true);
    expect(isFormDirty(base, { ...base, tags: ["a", "b"] })).toBe(true);
    expect(isFormDirty(base, { ...base, n: 2 })).toBe(true);
  });

  it("confirme seulement si modifié, jamais pendant un enregistrement", () => {
    expect(resolveDismissRequest({ dirty: false, isSubmitting: false })).toBe("close");
    expect(resolveDismissRequest({ dirty: true, isSubmitting: false })).toBe("confirm");
    expect(resolveDismissRequest({ dirty: true, isSubmitting: true })).toBe("ignore");
  });
});

describe("appui long des +/−", () => {
  it("accélère progressivement", () => {
    expect(repeatIntervalMs(0)).toBe(150);
    expect(repeatIntervalMs(8)).toBe(80);
    expect(repeatIntervalMs(25)).toBe(40);
  });
});

describe("store du pied collant", () => {
  it("notifie le contenu et la hauteur, sans notifier une valeur identique", () => {
    const store = createSheetFooterStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    const node = "boutons";
    store.setNode(node);
    store.setNode(node);
    store.setHeight(80.4);
    store.setHeight(80.2);
    expect(store.getNode()).toBe(node);
    expect(store.getHeight()).toBe(80);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    store.setNode(null);
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
