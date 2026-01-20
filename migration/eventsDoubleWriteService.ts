// Service de transition avec DOUBLE ÉCRITURE
// Écrit dans les anciennes ET nouvelles collections simultanément

import {
  ajouterEvenementAvecId,
  ajouterEvenement as ajouterEventNouveau,
  ecouterEvenements,
  modifierEvenement as modifierEventNouveau,
  obtenirEvenements,
  supprimerEvenement as supprimerEventNouveau,
  type EventType,
} from "@/services/eventsService";

// Import des anciens services
import * as mictionsService from "@/services/mictionsService";
import * as pompagesService from "@/services/pompagesService";
import * as sellesService from "@/services/sellesService";
import * as teteesService from "@/services/teteesService";
import * as vaccinsService from "@/services/vaccinsService";
import * as vitaminesService from "@/services/vitaminesService";
import * as croissanceService from "@/services/croissanceService";

// ============================================
// HELPER - Remove undefined
// ============================================

/**
 * Supprime les champs undefined d'un objet (Firestore n'accepte pas undefined)
 */
function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const cleaned: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      cleaned[key] = obj[key];
    }
  }
  return cleaned;
}

// ============================================
// CONFIGURATION
// ============================================

interface MigrationConfig {
  // Phase de migration
  phase: "OLD_ONLY" | "DOUBLE_WRITE" | "NEW_ONLY";
  
  // Lecture depuis quelle source
  readFrom: "OLD" | "NEW";
  
  // En cas d'erreur sur une écriture, continuer ou échouer ?
  failOnError: boolean;
}

// Configuration globale (à ajuster selon l'avancement)
let config: MigrationConfig = {
  phase: "NEW_ONLY",     // 🎯 MIGRATION TERMINÉE - Nouveau système uniquement
  readFrom: "NEW",       // Lire depuis la nouvelle collection
  failOnError: true,     // Les erreurs sont critiques maintenant
};

// Fonction pour changer la config (utile pour tests A/B)
export function setMigrationConfig(newConfig: Partial<MigrationConfig>) {
  config = { ...config, ...newConfig };
  console.log("🔧 Config migration mise à jour:", config);
}

export function getMigrationConfig() {
  return { ...config };
}

// ============================================
// DOUBLE ÉCRITURE - TÉTÉES
// ============================================

export async function ajouterTetee(childId: string, data: any) {
  const errors: Error[] = [];

  // Préparer les données pour le nouveau format
  const newEventData = removeUndefined({
    type: "tetee" as EventType,
    coteGauche: data.coteGauche || false,
    coteDroit: data.coteDroit || false,
    dureeGauche: data.dureeGauche,
    dureeDroite: data.dureeDroite,
    date: data.date || new Date(),
    note: data.note,
  });

  let sharedId: string | null = null;
  let oldRef: any = null;

  // Phase 1: Écriture dans ANCIEN système (génère l'ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      oldRef = await teteesService.ajouterTetee(childId, data);
      sharedId = oldRef.id;
      console.log("✅ Tétée ajoutée dans OLD:", sharedId);
    } catch (error) {
      console.error("❌ Erreur OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Phase 2: Écriture dans NOUVEAU système (utilise le même ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      if (sharedId) {
        // Double write: utiliser l'ID de OLD
        await ajouterEvenementAvecId(childId, sharedId, newEventData as any);
        console.log("✅ Tétée ajoutée dans NEW avec ID:", sharedId);
      } else {
        // NEW_ONLY: générer un nouvel ID
        sharedId = await ajouterEventNouveau(childId, newEventData as any);
        console.log("✅ Tétée ajoutée dans NEW:", sharedId);
      }
    } catch (error) {
      console.error("❌ Erreur NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error(
      `Erreurs lors de la double écriture: ${errors.map((e) => e.message).join(", ")}`
    );
  }

  return sharedId;
}

export async function obtenirToutesLesTetees(childId: string) {
  if (config.readFrom === "NEW") {
    return obtenirEvenements(childId, { type: "tetee" });
  } else {
    return teteesService.obtenirToutesLesTetees(childId);
  }
}

export function ecouterTetees(childId: string, callback: (docs: any[]) => void) {
  if (config.readFrom === "NEW") {
    return ecouterEvenements(childId, callback, { type: "tetee" });
  } else {
    return teteesService.ecouterTetees(childId, callback);
  }
}

export async function modifierTetee(
  childId: string,
  id: string,
  data: any
) {
  const errors: Error[] = [];

  // Modifier dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await modifierEventNouveau(childId, id, data);
      console.log("✅ Tétée modifiée dans NEW");
    } catch (error) {
      console.error("❌ Erreur modification NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Modifier dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await teteesService.modifierTetee(childId, id, data);
      console.log("✅ Tétée modifiée dans OLD");
    } catch (error) {
      console.error("❌ Erreur modification OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la modification");
  }
}

export async function supprimerTetee(childId: string, id: string) {
  const errors: Error[] = [];

  // Supprimer dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await supprimerEventNouveau(childId, id);
      console.log("✅ Tétée supprimée dans NEW");
    } catch (error) {
      console.error("❌ Erreur suppression NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Supprimer dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await teteesService.supprimerTetee(childId, id);
      console.log("✅ Tétée supprimée dans OLD");
    } catch (error) {
      console.error("❌ Erreur suppression OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la suppression");
  }
}

// ============================================
// DOUBLE ÉCRITURE - CROISSANCE
// ============================================

export async function ajouterCroissance(childId: string, data: any) {
  const errors: Error[] = [];

  const newEventData = removeUndefined({
    type: "croissance" as EventType,
    tailleCm: data.tailleCm,
    poidsKg: data.poidsKg,
    teteCm: data.teteCm,
    date: data.date || new Date(),
    note: data.note,
  });

  let sharedId: string | null = null;
  let oldRef: any = null;

  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      oldRef = await croissanceService.ajouterCroissance(childId, data);
      sharedId = oldRef.id;
      console.log("✅ Croissance ajoutée dans OLD:", sharedId);
    } catch (error) {
      console.error("❌ Erreur OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      if (sharedId) {
        await ajouterEvenementAvecId(childId, sharedId, newEventData as any);
        console.log("✅ Croissance ajoutée dans NEW avec ID:", sharedId);
      } else {
        sharedId = await ajouterEventNouveau(childId, newEventData as any);
        console.log("✅ Croissance ajoutée dans NEW:", sharedId);
      }
    } catch (error) {
      console.error("❌ Erreur NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error(
      `Erreurs lors de la double écriture: ${errors.map((e) => e.message).join(", ")}`
    );
  }

  return sharedId;
}

export async function obtenirToutesLesCroissances(childId: string) {
  if (config.readFrom === "NEW") {
    return obtenirEvenements(childId, { type: "croissance" });
  }
  return croissanceService.obtenirToutesLesCroissances(childId);
}

export function ecouterCroissances(
  childId: string,
  callback: (docs: any[]) => void
) {
  if (config.readFrom === "NEW") {
    return ecouterEvenements(childId, callback, { type: "croissance" });
  }
  return croissanceService.ecouterCroissances(childId, callback);
}

export async function modifierCroissance(
  childId: string,
  id: string,
  data: any
) {
  const errors: Error[] = [];

  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await modifierEventNouveau(childId, id, data);
      console.log("✅ Croissance modifiée dans NEW");
    } catch (error) {
      console.error("❌ Erreur modification NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await croissanceService.modifierCroissance(childId, id, data);
      console.log("✅ Croissance modifiée dans OLD");
    } catch (error) {
      console.error("❌ Erreur modification OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la modification");
  }
}

export async function supprimerCroissance(childId: string, id: string) {
  const errors: Error[] = [];

  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await supprimerEventNouveau(childId, id);
      console.log("✅ Croissance supprimée dans NEW");
    } catch (error) {
      console.error("❌ Erreur suppression NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await croissanceService.supprimerCroissance(childId, id);
      console.log("✅ Croissance supprimée dans OLD");
    } catch (error) {
      console.error("❌ Erreur suppression OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la suppression");
  }
}

// ============================================
// DOUBLE ÉCRITURE - BIBERONS
// ============================================

export async function ajouterBiberon(childId: string, data: any) {
  const errors: Error[] = [];

  console.log("Ajout Biberon - Données reçues:", data);

  // Préparer les données pour le nouveau format
  const newEventData = removeUndefined({
    type: "biberon" as EventType,
    quantite: data.quantite,
    date: data.date || new Date(),
    note: data.note,
  });

  let sharedId: string | null = null;
  let oldRef: any = null;

  // Phase 1: Écriture dans ANCIEN système (génère l'ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      oldRef = await teteesService.ajouterTetee(childId, data);
      sharedId = oldRef.id;
      console.log("✅ Biberon ajouté dans OLD:", sharedId);
    } catch (error) {
      console.error("❌ Erreur OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Phase 2: Écriture dans NOUVEAU système (utilise le même ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      if (sharedId) {
        // Double write: utiliser l'ID de OLD
        await ajouterEvenementAvecId(childId, sharedId, newEventData as any);
        console.log("✅ Biberon ajouté dans NEW avec ID:", sharedId);
      } else {
        // NEW_ONLY: générer un nouvel ID
        sharedId = await ajouterEventNouveau(childId, newEventData as any);
        console.log("✅ Biberon ajouté dans NEW:", sharedId);
      }
    } catch (error) {
      console.error("❌ Erreur NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error(
      `Erreurs lors de la double écriture: ${errors.map((e) => e.message).join(", ")}`
    );
  }

  return sharedId;
}

export async function obtenirToutesLesBiberons(childId: string) {
  if (config.readFrom === "NEW") {
    return obtenirEvenements(childId, { type: "biberon" });
  } else {
    return teteesService.obtenirToutesLesTetees(childId);
  }
}

export function ecouterBiberons(childId: string, callback: (docs: any[]) => void) {
  if (config.readFrom === "NEW") {
    return ecouterEvenements(childId, callback, { type: "biberon" });
  } else {
    return teteesService.ecouterTetees(childId, callback);
  }
}

export async function modifierBiberon(
  childId: string,
  id: string,
  data: any
) {
  const errors: Error[] = [];

  // Modifier dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await modifierEventNouveau(childId, id, data);
      console.log("✅ Biberon modifié dans NEW");
    } catch (error) {
      console.error("❌ Erreur modification NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Modifier dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await teteesService.modifierTetee(childId, id, data);
      console.log("✅ Biberon modifié dans OLD");
    } catch (error) {
      console.error("❌ Erreur modification OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la modification");
  }
}

export async function supprimerBiberon(childId: string, id: string) {
  const errors: Error[] = [];

  // Supprimer dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await supprimerEventNouveau(childId, id);
      console.log("✅ Biberon supprimé dans NEW");
    } catch (error) {
      console.error("❌ Erreur suppression NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Supprimer dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await teteesService.supprimerTetee(childId, id);
      console.log("✅ Biberon supprimé dans OLD");
    } catch (error) {
      console.error("❌ Erreur suppression OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la suppression");
  }
}

// ============================================
// DOUBLE ÉCRITURE - MICTIONS
// ============================================

export async function ajouterMiction(childId: string, data: any) {
  const errors: Error[] = [];
  let sharedId: string | null = null;
  let oldRef: any = null;

  // Nouveau format
  const newEventData = removeUndefined({
    type: "miction" as EventType,
    volume: data.volume,
    couleur: data.couleur,
    avecCouche: data.avecCouche,
    date: data.date || new Date(),
    note: data.note,
  });

  // Phase 1: Écriture dans ANCIEN système (génère l'ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      oldRef = await mictionsService.ajouterMiction(childId, data);
      sharedId = oldRef.id;
      console.log("✅ Miction ajoutée dans OLD:", sharedId);
    } catch (error) {
      console.error("❌ Erreur OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Phase 2: Écriture dans NOUVEAU système (utilise le même ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      if (sharedId) {
        // Double write: utiliser l'ID de OLD
        await ajouterEvenementAvecId(childId, sharedId, newEventData as any);
        console.log("✅ Miction ajoutée dans NEW avec ID:", sharedId);
      } else {
        // NEW_ONLY: générer un nouvel ID
        sharedId = await ajouterEventNouveau(childId, newEventData as any);
        console.log("✅ Miction ajoutée dans NEW:", sharedId);
      }
    } catch (error) {
      console.error("❌ Erreur NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  return sharedId;
}

export async function obtenirToutesLesMictions(childId: string) {
  if (config.readFrom === "NEW") {
    return obtenirEvenements(childId, { type: "miction" });
  } else {
    return mictionsService.obtenirToutesLesMictions(childId);
  }
}

export function ecouterMictions(childId: string, callback: (docs: any[]) => void) {
  if (config.readFrom === "NEW") {
    return ecouterEvenements(childId, callback, { type: "miction" });
  } else {
    return mictionsService.ecouterMictions(childId, callback);
  }
}

export async function modifierMiction(
  childId: string,
  id: string,
  data: any
) {
  const errors: Error[] = [];

  // Modifier dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await modifierEventNouveau(childId, id, data);
      console.log("✅ Miction modifiée dans NEW");
    } catch (error) {
      console.error("❌ Erreur modification NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Modifier dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await mictionsService.modifierMiction(childId, id, data);
      console.log("✅ Miction modifiée dans OLD");
    } catch (error) {
      console.error("❌ Erreur modification OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la modification");
  }
}

export async function supprimerMiction(childId: string, id: string) {
  const errors: Error[] = [];

  // Supprimer dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await supprimerEventNouveau(childId, id);
      console.log("✅ Miction supprimée dans NEW");
    } catch (error) {
      console.error("❌ Erreur suppression NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Supprimer dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await mictionsService.supprimerMiction(childId, id);
      console.log("✅ Miction supprimée dans OLD");
    } catch (error) {
      console.error("❌ Erreur suppression OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la suppression");
  }
}

// ============================================
// DOUBLE ÉCRITURE - SELLES
// ============================================

export async function ajouterSelle(childId: string, data: any) {
  const errors: Error[] = [];
  let sharedId: string | null = null;
  let oldRef: any = null;

  const newEventData = removeUndefined({
    type: "selle" as EventType,
    consistance: data.consistance,
    couleur: data.couleur,
    quantite: data.quantite,
    avecCouche: data.avecCouche,
    date: data.date || new Date(),
    note: data.note,
  });

  // Phase 1: Écriture dans ANCIEN système (génère l'ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      oldRef = await sellesService.ajouterSelle(childId, data);
      sharedId = oldRef.id;
      console.log("✅ Selle ajoutée dans OLD:", sharedId);
    } catch (error) {
      console.error("❌ Erreur OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Phase 2: Écriture dans NOUVEAU système (utilise le même ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      if (sharedId) {
        // Double write: utiliser l'ID de OLD
        await ajouterEvenementAvecId(childId, sharedId, newEventData as any);
        console.log("✅ Selle ajoutée dans NEW avec ID:", sharedId);
      } else {
        // NEW_ONLY: générer un nouvel ID
        sharedId = await ajouterEventNouveau(childId, newEventData as any);
        console.log("✅ Selle ajoutée dans NEW:", sharedId);
      }
    } catch (error) {
      console.error("❌ Erreur NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  return sharedId;
}

export async function obtenirToutesLesSelles(childId: string) {
  if (config.readFrom === "NEW") {
    return obtenirEvenements(childId, { type: "selle" });
  } else {
    return sellesService.obtenirToutesLesSelles(childId);
  }
}

export function ecouterSelles(childId: string, callback: (docs: any[]) => void) {
  if (config.readFrom === "NEW") {
    return ecouterEvenements(childId, callback, { type: "selle" });
  } else {
    return sellesService.ecouterSelles(childId, callback);
  }
}

export async function modifierSelle(
  childId: string,
  id: string,
  data: any
) {
  const errors: Error[] = [];

  // Modifier dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await modifierEventNouveau(childId, id, data);
      console.log("✅ Selle modifiée dans NEW");
    } catch (error) {
      console.error("❌ Erreur modification NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Modifier dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await sellesService.modifierSelle(childId, id, data);
      console.log("✅ Selle modifiée dans OLD");
    } catch (error) {
      console.error("❌ Erreur modification OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la modification");
  }
}

export async function supprimerSelle(childId: string, id: string) {
  const errors: Error[] = [];

  // Supprimer dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await supprimerEventNouveau(childId, id);
      console.log("✅ Selle supprimée dans NEW");
    } catch (error) {
      console.error("❌ Erreur suppression NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Supprimer dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await sellesService.supprimerSelle(childId, id);
      console.log("✅ Selle supprimée dans OLD");
    } catch (error) {
      console.error("❌ Erreur suppression OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la suppression");
  }
}

// ============================================
// DOUBLE ÉCRITURE - POMPAGES
// ============================================

export async function ajouterPompage(childId: string, data: any) {
  const errors: Error[] = [];
  let sharedId: string | null = null;
  let oldRef: any = null;

  const newEventData = removeUndefined({
    type: "pompage" as EventType,
    quantiteGauche: data.quantiteGauche,
    quantiteDroite: data.quantiteDroite,
    duree: data.duree,
    date: data.date || new Date(),
    note: data.note,
  });

  // Phase 1: Écriture dans ANCIEN système (génère l'ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      oldRef = await pompagesService.ajouterPompage(childId, data);
      sharedId = oldRef.id;
      console.log("✅ Pompage ajouté dans OLD:", sharedId);
    } catch (error) {
      console.error("❌ Erreur OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Phase 2: Écriture dans NOUVEAU système (utilise le même ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      if (sharedId) {
        // Double write: utiliser l'ID de OLD
        await ajouterEvenementAvecId(childId, sharedId, newEventData as any);
        console.log("✅ Pompage ajouté dans NEW avec ID:", sharedId);
      } else {
        // NEW_ONLY: générer un nouvel ID
        sharedId = await ajouterEventNouveau(childId, newEventData as any);
        console.log("✅ Pompage ajouté dans NEW:", sharedId);
      }
    } catch (error) {
      console.error("❌ Erreur NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  return sharedId;
}

export async function obtenirTousLesPompages(childId: string) {
  if (config.readFrom === "NEW") {
    return obtenirEvenements(childId, { type: "pompage" });
  } else {
    return pompagesService.obtenirTousLesPompages(childId);
  }
}

export async function modifierPompage(
  childId: string,
  id: string,
  data: any
) {
  const errors: Error[] = [];

  // Modifier dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await modifierEventNouveau(childId, id, data);
      console.log("✅ Pompage modifié dans NEW");
    } catch (error) {
      console.error("❌ Erreur modification NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Modifier dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await pompagesService.modifierPompage(childId, id, data);
      console.log("✅ Pompage modifié dans OLD");
    } catch (error) {
      console.error("❌ Erreur modification OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la modification");
  }
}

export async function supprimerPompage(childId: string, id: string) {
  const errors: Error[] = [];

  // Supprimer dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await supprimerEventNouveau(childId, id);
      console.log("✅ Pompage supprimé dans NEW");
    } catch (error) {
      console.error("❌ Erreur suppression NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Supprimer dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await pompagesService.supprimerPompage(childId, id);
      console.log("✅ Pompage supprimé dans OLD");
    } catch (error) {
      console.error("❌ Erreur suppression OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la suppression");
  }
}

// ============================================
// DOUBLE ÉCRITURE - VACCINS
// ============================================

export async function ajouterVaccin(childId: string, data: any) {
  const errors: Error[] = [];
  let sharedId: string | null = null;
  let oldRef: any = null;

  const newEventData = removeUndefined({
    type: "vaccin" as EventType,
    nomVaccin: data.nomVaccin || data.nom,
    lieu: data.lieu,
    date: data.date || new Date(),
    note: data.note,
  });

  // Phase 1: Écriture dans ANCIEN système (génère l'ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      oldRef = await vaccinsService.ajouterVaccin(childId, data);
      sharedId = oldRef.id;
      console.log("✅ Vaccin ajouté dans OLD:", sharedId);
    } catch (error) {
      console.error("❌ Erreur OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Phase 2: Écriture dans NOUVEAU système (utilise le même ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      if (sharedId) {
        // Double write: utiliser l'ID de OLD
        await ajouterEvenementAvecId(childId, sharedId, newEventData as any);
        console.log("✅ Vaccin ajouté dans NEW avec ID:", sharedId);
      } else {
        // NEW_ONLY: générer un nouvel ID
        sharedId = await ajouterEventNouveau(childId, newEventData as any);
        console.log("✅ Vaccin ajouté dans NEW:", sharedId);
      }
    } catch (error) {
      console.error("❌ Erreur NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  return sharedId;
}

export async function obtenirToutesLesVaccins(childId: string) {
  if (config.readFrom === "NEW") {
    return obtenirEvenements(childId, { type: "vaccin" });
  } else {
    return vaccinsService.obtenirToutesLesVaccins(childId);
  }
}

export async function modifierVaccin(
  childId: string,
  id: string,
  data: any
) {
  const errors: Error[] = [];

  // Modifier dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await modifierEventNouveau(childId, id, data);
      console.log("✅ Vaccin modifié dans NEW");
    } catch (error) {
      console.error("❌ Erreur modification NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Modifier dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await vaccinsService.modifierVaccin(childId, id, data);
      console.log("✅ Vaccin modifié dans OLD");
    } catch (error) {
      console.error("❌ Erreur modification OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la modification");
  }
}

export async function supprimerVaccin(childId: string, id: string) {
  const errors: Error[] = [];

  // Supprimer dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await supprimerEventNouveau(childId, id);
      console.log("✅ Vaccin supprimé dans NEW");
    } catch (error) {
      console.error("❌ Erreur suppression NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Supprimer dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await vaccinsService.supprimerVaccin(childId, id);
      console.log("✅ Vaccin supprimé dans OLD");
    } catch (error) {
      console.error("❌ Erreur suppression OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la suppression");
  }
}

// ============================================
// DOUBLE ÉCRITURE - VITAMINES
// ============================================

export async function ajouterVitamine(childId: string, data: any) {
  const errors: Error[] = [];
  let sharedId: string | null = null;
  let oldRef: any = null;

  const newEventData = removeUndefined({
    type: "vitamine" as EventType,
    nomVitamine: data.nomVitamine || data.nom,
    dosage: data.dosage,
    date: data.date || new Date(),
    note: data.note,
  });

  // Phase 1: Écriture dans ANCIEN système (génère l'ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      oldRef = await vitaminesService.ajouterVitamine(childId, data);
      sharedId = oldRef.id;
      console.log("✅ Vitamine ajoutée dans OLD:", sharedId);
    } catch (error) {
      console.error("❌ Erreur OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Phase 2: Écriture dans NOUVEAU système (utilise le même ID)
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      if (sharedId) {
        // Double write: utiliser l'ID de OLD
        await ajouterEvenementAvecId(childId, sharedId, newEventData as any);
        console.log("✅ Vitamine ajoutée dans NEW avec ID:", sharedId);
      } else {
        // NEW_ONLY: générer un nouvel ID
        sharedId = await ajouterEventNouveau(childId, newEventData as any);
        console.log("✅ Vitamine ajoutée dans NEW:", sharedId);
      }
    } catch (error) {
      console.error("❌ Erreur NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  return sharedId;
}

export async function obtenirToutesLesVitamines(childId: string) {
  if (config.readFrom === "NEW") {
    return obtenirEvenements(childId, { type: "vitamine" });
  } else {
    return vitaminesService.obtenirToutesLesVitamines(childId);
  }
}

export async function modifierVitamine(
  childId: string,
  id: string,
  data: any
) {
  const errors: Error[] = [];

  // Modifier dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await modifierEventNouveau(childId, id, data);
      console.log("✅ Vitamine modifiée dans NEW");
    } catch (error) {
      console.error("❌ Erreur modification NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Modifier dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await vitaminesService.modifierVitamine(childId, id, data);
      console.log("✅ Vitamine modifiée dans OLD");
    } catch (error) {
      console.error("❌ Erreur modification OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la modification");
  }
}

export async function supprimerVitamine(childId: string, id: string) {
  const errors: Error[] = [];

  // Supprimer dans NOUVEAU
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      await supprimerEventNouveau(childId, id);
      console.log("✅ Vitamine supprimée dans NEW");
    } catch (error) {
      console.error("❌ Erreur suppression NEW:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  // Supprimer dans ANCIEN
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      await vitaminesService.supprimerVitamine(childId, id);
      console.log("✅ Vitamine supprimée dans OLD");
    } catch (error) {
      console.error("❌ Erreur suppression OLD:", error);
      errors.push(error as Error);
      if (config.failOnError) throw error;
    }
  }

  if (errors.length > 0 && config.failOnError) {
    throw new Error("Erreurs lors de la suppression");
  }
}

// ============================================
// MONITORING & DEBUG
// ============================================

export interface MigrationStats {
  phase: string;
  readFrom: string;
  totalWrites: number;
  successfulWrites: number;
  failedWrites: number;
  oldSystemErrors: number;
  newSystemErrors: number;
}

let stats: MigrationStats = {
  phase: config.phase,
  readFrom: config.readFrom,
  totalWrites: 0,
  successfulWrites: 0,
  failedWrites: 0,
  oldSystemErrors: 0,
  newSystemErrors: 0,
};

export function getMigrationStats() {
  return { ...stats };
}

export function resetMigrationStats() {
  stats = {
    phase: config.phase,
    readFrom: config.readFrom,
    totalWrites: 0,
    successfulWrites: 0,
    failedWrites: 0,
    oldSystemErrors: 0,
    newSystemErrors: 0,
  };
}

// ============================================
// EXEMPLE D'UTILISATION
// ============================================

/*
// Phase 1: Migration initiale des données historiques
setMigrationConfig({
  phase: "OLD_ONLY",
  readFrom: "OLD"
});
await migrerToutesLesCollections(userId, childId);

// Phase 2: Activer double écriture (lecture depuis NEW)
setMigrationConfig({
  phase: "DOUBLE_WRITE",
  readFrom: "NEW",
  failOnError: false // Continuer même si OLD échoue
});
// À partir de maintenant, tout nouvel event est écrit dans les 2

// Phase 3: Après quelques jours de stabilité
setMigrationConfig({
  phase: "NEW_ONLY",
  readFrom: "NEW"
});
// On écrit plus que dans NEW, on peut supprimer les anciennes collections

// En cas de problème, rollback immédiat:
setMigrationConfig({
  phase: "OLD_ONLY",
  readFrom: "OLD"
});
*/
