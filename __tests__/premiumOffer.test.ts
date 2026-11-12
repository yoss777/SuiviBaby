import { freeTrialLabel, getDisplayPrices, purchaseDisclosure, storeName, type OfferProduct } from "@/utils/premiumOffer";

const product = (price: number, priceString: string, intro?: OfferProduct["introPrice"]): OfferProduct => ({
  price,
  priceString,
  currencyCode: "EUR",
  introPrice: intro ?? null,
});

describe("premiumOffer", () => {
  it("uses the store prices when the offerings are loaded", () => {
    const p = getDisplayPrices({
      monthly: product(4.49, "4,49 €"),
      annual: product(34.99, "34,99 €"),
      lifetime: product(89.99, "89,99 €"),
    });
    expect(p.monthly).toBe("4,49 €");
    expect(p.annual).toBe("34,99 €");
    expect(p.lifetime).toBe("89,99 €");
    expect(p.fromStore).toBe(true);
    expect(p.annualSavingsPercent).toBe(35);
  });

  it("falls back to the launch prices and computes 2,50 € a month (not 2,49)", () => {
    const p = getDisplayPrices({});
    expect(p.annual).toBe("29,99 €");
    expect(p.annualPerMonth.replace(/\s/g, " ")).toBe("2,50 €");
    expect(p.annualSavingsPercent).toBe(37);
    expect(p.fromStore).toBe(false);
    expect(p.annualTrial).toBeNull();
  });

  it("announces a trial only when the annual store product has a free intro period", () => {
    expect(freeTrialLabel(product(29.99, "29,99 €", { price: 0, priceString: "0 €", periodNumberOfUnits: 7, periodUnit: "DAY" }))).toBe("7 jours gratuits");
    expect(freeTrialLabel(product(29.99, "29,99 €", { price: 0, priceString: "0 €", periodNumberOfUnits: 1, periodUnit: "MONTH" }))).toBe("1 mois gratuit");
    // A paid intro offer is not a free trial.
    expect(freeTrialLabel(product(29.99, "29,99 €", { price: 19.99, priceString: "19,99 €", periodNumberOfUnits: 1, periodUnit: "YEAR" }))).toBeNull();
    expect(freeTrialLabel(product(29.99, "29,99 €", { price: 0, priceString: "0 €", periodNumberOfUnits: 3, periodUnit: "MONTH" }))).toBe("3 mois gratuits");
    expect(freeTrialLabel(undefined)).toBeNull();
  });

  it("shows no saving when a store price would be compared with a fallback price", () => {
    expect(getDisplayPrices({ annual: product(34.99, "34,99 €") }).annualSavingsPercent).toBeNull();
  });

  it("names only the user's store", () => {
    expect(storeName("ios")).toBe("l'App Store");
    expect(storeName("android")).toBe("Google Play");
  });

  it("discloses trial, price, renewal and cancellation next to the button", () => {
    const prices = getDisplayPrices({
      annual: product(29.99, "29,99 €", { price: 0, priceString: "0 €", periodNumberOfUnits: 7, periodUnit: "DAY" }),
    });
    const annual = purchaseDisclosure("annual", prices, "ios");
    expect(annual).toBe("7 jours gratuits, puis 29,99 €/an. Renouvellement automatique, résiliable à tout moment dans l'App Store au moins 24 h avant l'échéance.");
    expect(annual).not.toMatch(/Google/);

    const monthly = purchaseDisclosure("monthly", prices, "android");
    expect(monthly).toMatch(/^3,99 €\/mois\./);
    expect(monthly).not.toMatch(/gratuit/); // no trial on the monthly plan
    expect(monthly).toMatch(/Google Play/);

    expect(purchaseDisclosure("lifetime", prices, "ios")).toBe("Paiement unique de 79,99 €, sans renouvellement.");
  });
});
