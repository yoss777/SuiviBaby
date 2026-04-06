// services/revenueCatService.ts
// Service wrapper pour RevenuCat — initialisation, achats, restore, listener.

import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
  LOG_LEVEL,
} from "react-native-purchases";
import { captureServiceError } from "@/utils/errorReporting";

// ============================================
// CONFIG
// ============================================

// Clés RevenuCat par plateforme
// TODO: remplacer par les vraies clés quand les apps seront créées dans App Store Connect / Google Play Console
const RC_API_KEYS: Record<string, string> = {
  ios: "appl_PLACEHOLDER", // Remplacer par la clé iOS RevenuCat
  android: "goog_PLACEHOLDER", // Remplacer par la clé Android RevenuCat
  test: "test_BHbHbhlPMXdgMEKwlhISZchIPkO", // Test Store (simulateur uniquement)
};

function getApiKey(): string | null {
  if (__DEV__) {
    // En dev sur simulateur, utiliser la clé test
    return RC_API_KEYS.test;
  }
  const key = Platform.OS === "ios" ? RC_API_KEYS.ios : RC_API_KEYS.android;
  // Ne pas initialiser si la clé est un placeholder
  if (key.includes("PLACEHOLDER")) return null;
  return key;
}

// Entitlement IDs (doivent matcher ceux configurés dans RevenuCat dashboard)
export const ENTITLEMENT_PREMIUM = "premium";
export const ENTITLEMENT_FAMILY = "family";

// ============================================
// INITIALIZATION
// ============================================

let isInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Initialise le SDK RevenuCat. À appeler une seule fois au démarrage.
 * Les appels suivants retournent la même promesse (singleton).
 */
export function initRevenueCat(userId?: string): Promise<void> {
  if (isInitialized) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const apiKey = getApiKey();
      if (!apiKey) {
        console.warn("[RevenueCat] No valid API key for this platform — skipping init");
        isInitialized = false;
        return;
      }

      if (__DEV__) {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);
      }

      Purchases.configure({
        apiKey,
        appUserID: userId ?? undefined,
      });

      isInitialized = true;
    } catch (error) {
      console.error("[RevenueCat] Init failed:", error);
      captureServiceError(error, { service: "revenueCat", operation: "initRevenueCat" });
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Identifie l'utilisateur après login (merge anonymous → authenticated).
 */
export async function loginRevenueCat(userId: string): Promise<CustomerInfo | null> {
  if (!isInitialized) return null;
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    return customerInfo;
  } catch (error) {
    console.error("[RevenueCat] Login failed:", error);
    captureServiceError(error, { service: "revenueCat", operation: "loginRevenueCat" });
    return null;
  }
}

/**
 * Déconnecte l'utilisateur (retour à anonymous).
 */
export async function logoutRevenueCat(): Promise<void> {
  if (!isInitialized) return;
  try {
    await Purchases.logOut();
  } catch (error) {
    console.error("[RevenueCat] Logout failed:", error);
    captureServiceError(error, { service: "revenueCat", operation: "logoutRevenueCat" });
  }
}

// ============================================
// CUSTOMER INFO
// ============================================

/**
 * Récupère les infos d'abonnement actuelles.
 */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!isInitialized) return null;
  try {
    return await Purchases.getCustomerInfo();
  } catch (error) {
    console.error("[RevenueCat] getCustomerInfo failed:", error);
    captureServiceError(error, { service: "revenueCat", operation: "getCustomerInfo" });
    return null;
  }
}

/**
 * Vérifie si l'utilisateur a un entitlement actif.
 */
export function hasEntitlement(
  customerInfo: CustomerInfo,
  entitlementId: string
): boolean {
  return customerInfo.entitlements.active[entitlementId]?.isActive === true;
}

/**
 * Détermine le tier à partir des entitlements actifs.
 */
export function getTierFromCustomerInfo(
  customerInfo: CustomerInfo
): "free" | "premium" | "family" {
  if (hasEntitlement(customerInfo, ENTITLEMENT_FAMILY)) return "family";
  if (hasEntitlement(customerInfo, ENTITLEMENT_PREMIUM)) return "premium";
  return "free";
}

/**
 * Détermine le status de l'abonnement.
 */
export function getStatusFromCustomerInfo(
  customerInfo: CustomerInfo
): "active" | "trial" | "expired" | "billing_issue" | "cancelled" {
  const premiumEntitlement =
    customerInfo.entitlements.active[ENTITLEMENT_FAMILY] ??
    customerInfo.entitlements.active[ENTITLEMENT_PREMIUM];

  if (!premiumEntitlement) return "expired";

  if (premiumEntitlement.periodType === "TRIAL") return "trial";

  // Check billing issue via managementURL or willRenew
  if (premiumEntitlement.willRenew === false) return "cancelled";

  return "active";
}

/**
 * Détermine le billing period (monthly, annual, lifetime) depuis CustomerInfo.
 */
export function getBillingPeriodFromCustomerInfo(
  customerInfo: CustomerInfo
): "monthly" | "annual" | "lifetime" | "unknown" {
  const entitlement =
    customerInfo.entitlements.active[ENTITLEMENT_FAMILY] ??
    customerInfo.entitlements.active[ENTITLEMENT_PREMIUM];

  if (!entitlement) return "unknown";

  const productId = entitlement.productIdentifier;
  if (productId.includes("lifetime")) return "lifetime";
  if (productId.includes("annual")) return "annual";
  if (productId.includes("monthly")) return "monthly";
  return "unknown";
}

// ============================================
// OFFERINGS & PURCHASES
// ============================================

/**
 * Récupère les offerings disponibles (plans + prix localisés).
 */
export async function getOfferings(): Promise<{
  default: PurchasesOffering | null;
  family: PurchasesOffering | null;
}> {
  try {
    // S'assurer que le SDK est initialisé avant d'appeler
    await initRevenueCat();
    const offerings = await Purchases.getOfferings();
    return {
      default: offerings.current,
      family: offerings.all["family"] ?? null,
    };
  } catch (error) {
    console.error("[RevenueCat] getOfferings failed:", error);
    captureServiceError(error, { service: "revenueCat", operation: "getOfferings" });
    return { default: null, family: null };
  }
}

/**
 * Achète un package (déclenche le flow natif Apple/Google).
 */
export async function purchasePackage(
  pkg: PurchasesPackage
): Promise<{ success: boolean; customerInfo: CustomerInfo | null }> {
  try {
    await initRevenueCat();
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { success: true, customerInfo };
  } catch (error: any) {
    if (error.userCancelled) {
      // L'utilisateur a annulé — pas une erreur
      return { success: false, customerInfo: null };
    }
    console.error("[RevenueCat] Purchase failed:", error);
    captureServiceError(error, { service: "revenueCat", operation: "purchasePackage" });
    throw error;
  }
}

/**
 * Restaure les achats précédents (obligatoire Apple/Google).
 */
export async function restorePurchases(): Promise<CustomerInfo | null> {
  try {
    await initRevenueCat();
    return await Purchases.restorePurchases();
  } catch (error) {
    console.error("[RevenueCat] Restore failed:", error);
    captureServiceError(error, { service: "revenueCat", operation: "restorePurchases" });
    throw error;
  }
}

// ============================================
// LISTENER
// ============================================

/**
 * Ajoute un listener pour les changements d'abonnement en temps réel.
 * Retourne une fonction pour retirer le listener.
 */
export function addCustomerInfoListener(
  callback: (info: CustomerInfo) => void
): () => void {
  if (!isInitialized) return () => {};
  Purchases.addCustomerInfoUpdateListener(callback);
  return () => {
    Purchases.removeCustomerInfoUpdateListener(callback);
  };
}
