// utils/premiumOffer.ts
// Prices and trial text shown on the Premium screen. Store prices (RevenueCat
// packages) always win over the fallback constants: the price displayed must be
// the price charged (App Store 3.1.2, Google Play subscription policy, French
// consumer law on price display).

export type BillingCycle = "monthly" | "annual" | "lifetime";

/** Shape of the RevenueCat StoreProduct fields we use (keeps this file testable). */
export interface OfferProduct {
  price: number;
  priceString: string;
  currencyCode: string;
  introPrice?: {
    price: number;
    priceString: string;
    periodNumberOfUnits: number;
    periodUnit: string; // "DAY" | "WEEK" | "MONTH" | "YEAR"
  } | null;
}

/** Launch prices (TTC, France). Only shown until the store offerings load. */
export const FALLBACK_PRICES: Record<BillingCycle, { price: number; label: string }> = {
  monthly: { price: 3.99, label: "3,99 €" },
  annual: { price: 29.99, label: "29,99 €" },
  lifetime: { price: 79.99, label: "79,99 €" },
};

export interface DisplayPrices {
  monthly: string;
  annual: string;
  lifetime: string;
  /** Annual price divided by 12, in the store currency. */
  annualPerMonth: string;
  /** Saving of the annual plan versus 12 monthly payments, in % (rounded). */
  annualSavingsPercent: number | null;
  /** « 7 jours gratuits », only when the annual store product has a free trial. */
  annualTrial: string | null;
  /** True when every price comes from the store. */
  fromStore: boolean;
}

function formatMoney(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", { style: "currency", currency: currencyCode }).format(amount);
  } catch {
    return `${amount.toFixed(2).replace(".", ",")} ${currencyCode}`;
  }
}

const UNIT_LABELS: Record<string, [string, string]> = {
  DAY: ["jour", "jours"],
  WEEK: ["semaine", "semaines"],
  MONTH: ["mois", "mois"],
  YEAR: ["an", "ans"],
};

/** « 7 jours gratuits » for a free introductory period, null otherwise. */
export function freeTrialLabel(product: OfferProduct | undefined): string | null {
  const intro = product?.introPrice;
  if (!intro || intro.price !== 0 || intro.periodNumberOfUnits <= 0) return null;
  const labels = UNIT_LABELS[intro.periodUnit];
  if (!labels) return null;
  const n = intro.periodNumberOfUnits;
  const unit = n > 1 ? labels[1] : labels[0];
  return `${n} ${unit} ${n > 1 && intro.periodUnit !== "MONTH" ? "gratuits" : "gratuit"}`;
}

export function getDisplayPrices(products: Partial<Record<BillingCycle, OfferProduct>>): DisplayPrices {
  const { monthly, annual, lifetime } = products;
  const currency = annual?.currencyCode ?? monthly?.currencyCode ?? "EUR";
  const monthlyPrice = monthly?.price ?? FALLBACK_PRICES.monthly.price;
  const annualPrice = annual?.price ?? FALLBACK_PRICES.annual.price;
  const sameCurrency = !monthly || !annual || monthly.currencyCode === annual.currencyCode;
  const savings =
    sameCurrency && monthlyPrice > 0 ? Math.round((1 - annualPrice / (monthlyPrice * 12)) * 100) : null;

  return {
    monthly: monthly?.priceString ?? FALLBACK_PRICES.monthly.label,
    annual: annual?.priceString ?? FALLBACK_PRICES.annual.label,
    lifetime: lifetime?.priceString ?? FALLBACK_PRICES.lifetime.label,
    annualPerMonth: formatMoney(Math.round((annualPrice / 12) * 100) / 100, currency),
    annualSavingsPercent: savings !== null && savings > 0 ? savings : null,
    annualTrial: freeTrialLabel(annual),
    fromStore: !!(monthly && annual && lifetime),
  };
}

/** Store name for the user's platform (App Store guideline 2.3.10: no other platform). */
export function storeName(os: string): string {
  return os === "ios" ? "l'App Store" : "Google Play";
}

/** One-line disclosure shown right under the purchase button. */
export function purchaseDisclosure(cycle: BillingCycle, prices: DisplayPrices, os: string): string {
  if (cycle === "lifetime") {
    return `Paiement unique de ${prices.lifetime}, sans renouvellement.`;
  }
  const amount = cycle === "annual" ? `${prices.annual}/an` : `${prices.monthly}/mois`;
  const start = cycle === "annual" && prices.annualTrial ? `${capitalize(prices.annualTrial)}, puis ${amount}.` : `${amount}.`;
  return `${start} Renouvellement automatique, résiliable à tout moment dans ${storeName(os)} au moins 24 h avant l'échéance.`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
