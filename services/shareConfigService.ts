// services/shareConfigService.ts
// Interrupteur distant du lien dans les partages de célébration :
// app_config/sharing { includeAppLink: boolean }. Coupé par défaut, et en cas
// d'erreur ou d'absence du document. Allumé à la MEP depuis la console, sans
// nouvelle version.

import { doc, getDoc } from "firebase/firestore";
import { db } from "../config/firebase";

let cached: Promise<boolean> | null = null;

/** Lu une fois par session ; toute erreur vaut « pas de lien ». */
export function isShareAppLinkEnabled(): Promise<boolean> {
  if (!cached) {
    cached = (async () => {
      // doc() peut lever de façon synchrone : tout est dans le try.
      try {
        const snap = await getDoc(doc(db, "app_config", "sharing"));
        return snap.exists() && snap.data()?.includeAppLink === true;
      } catch {
        cached = null; // nouvel essai au prochain affichage
        return false;
      }
    })();
  }
  return cached;
}

/** Tests uniquement. */
export function __resetShareConfigCache(): void {
  cached = null;
}
