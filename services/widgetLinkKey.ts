// services/widgetLinkKey.ts
// Clé des liens du widget : tirée au hasard une fois par installation, gardée
// dans le trousseau. L'app la met dans les données du widget, le widget
// l'ajoute à ses liens (&k=…) ; une action qui démarre ou arrête une session
// n'est faite sans confirmation que si la clé correspond. Une autre app ou une
// page web peut ouvrir suivibaby://… mais ne peut pas lire les données du
// widget (espace privé de l'app) : sans la clé, l'app demande confirmation.
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";

import { captureServiceError } from "@/utils/errorReporting";

const STORE_KEY = "widgetLinkKey.v1";

let cached: string | null = null;
let loading: Promise<string | null> | null = null;

function newKey(): string {
  return Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Clé de l'installation (créée au premier appel). null si le trousseau est indisponible. */
export function getWidgetLinkKey(): Promise<string | null> {
  if (cached) return Promise.resolve(cached);
  if (!loading) {
    loading = (async () => {
      try {
        let key = await SecureStore.getItemAsync(STORE_KEY);
        if (!key) {
          key = newKey();
          await SecureStore.setItemAsync(STORE_KEY, key);
        }
        cached = key;
        return key;
      } catch (error) {
        // Sans clé, les liens du widget demandent une confirmation : rien ne casse.
        captureServiceError(error, { service: "widgetLinkKey", operation: "load" });
        return null;
      } finally {
        loading = null;
      }
    })();
  }
  return loading;
}

/** Vrai si le lien porte la clé de cette installation. */
export async function isWidgetLinkKeyValid(k: string | null | undefined): Promise<boolean> {
  if (!k) return false;
  const key = await getWidgetLinkKey();
  return !!key && key === k;
}

/** Tests uniquement. */
export function __resetWidgetLinkKeyForTests(): void {
  cached = null;
  loading = null;
}
