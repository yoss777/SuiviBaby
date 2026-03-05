// Service de transition — migration terminée (NEW_ONLY)
// Thin wrappers around eventsService, preserving import paths for consumers.

import {
  ajouterEvenement,
  ecouterEvenements,
  modifierEvenement,
  obtenirEvenement,
  obtenirEvenements,
  supprimerEvenement,
  type EventType,
} from "@/services/eventsService";
import { auth } from "@/config/firebase";

// ============================================
// HELPER
// ============================================

function removeUndefined<T extends Record<string, any>>(obj: T): Partial<T> {
  const cleaned: Partial<T> = {};
  for (const key in obj) {
    if (obj[key] !== undefined) {
      cleaned[key] = obj[key];
    }
  }
  return cleaned;
}

const toDate = (value?: any) => {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === "function") return value.toDate();
  return new Date(value);
};

const computeSleepDuration = (
  heureDebut?: Date,
  heureFin?: Date,
  duree?: number,
) => {
  if (typeof duree === "number") return duree;
  if (heureDebut && heureFin) {
    return Math.max(
      1,
      Math.round((heureFin.getTime() - heureDebut.getTime()) / 60000),
    );
  }
  return undefined;
};

// ============================================
// CONFIG (kept for MigrationProvider compat)
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

export function setMigrationConfig(_newConfig: any) {}
export function getMigrationConfig() {
  return { phase: "NEW_ONLY", readFrom: "NEW", failOnError: true };
}
export function getMigrationStats(): MigrationStats {
  return { phase: "NEW_ONLY", readFrom: "NEW", totalWrites: 0, successfulWrites: 0, failedWrites: 0, oldSystemErrors: 0, newSystemErrors: 0 };
}
export function resetMigrationStats() {}

// ============================================
// TÉTÉES
// ============================================

export async function ajouterTetee(childId: string, data: any) {
  const eventData = removeUndefined({
    type: "tetee" as EventType,
    coteGauche: data.coteGauche || false,
    coteDroit: data.coteDroit || false,
    dureeGauche: data.dureeGauche,
    dureeDroite: data.dureeDroite,
    date: data.date || new Date(),
    note: data.note,
  });
  return ajouterEvenement(childId, eventData as any);
}

export async function obtenirToutesLesTetees(childId: string) {
  return obtenirEvenements(childId, { type: "tetee" });
}

export function ecouterTetees(childId: string, callback: (docs: any[]) => void) {
  return ecouterEvenements(childId, callback, { type: "tetee" });
}

export async function modifierTetee(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerTetee(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// CROISSANCE
// ============================================

export async function ajouterCroissance(childId: string, data: any) {
  const eventData = removeUndefined({
    type: "croissance" as EventType,
    poids: data.poids,
    taille: data.taille,
    perimetreCranien: data.perimetreCranien,
    date: data.date || new Date(),
    note: data.note,
  });
  return ajouterEvenement(childId, eventData as any);
}

export async function obtenirToutesLesCroissances(childId: string) {
  return obtenirEvenements(childId, { type: "croissance" });
}

export function ecouterCroissances(childId: string, callback: (docs: any[]) => void) {
  return ecouterEvenements(childId, callback, { type: "croissance" });
}

export async function modifierCroissance(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerCroissance(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// BIBERONS
// ============================================

export async function ajouterBiberon(childId: string, data: any) {
  const eventData = removeUndefined({
    type: "biberons" as EventType,
    quantite: data.quantite || 0,
    typeBiberon: data.typeBiberon || "lait_infantile",
    unit: data.unit || "ml",
    date: data.date || new Date(),
    note: data.note,
  });
  return ajouterEvenement(childId, eventData as any);
}

export async function obtenirToutesLesBiberons(childId: string) {
  return obtenirEvenements(childId, { type: "biberon" });
}

export function ecouterBiberons(childId: string, callback: (docs: any[]) => void) {
  return ecouterEvenements(childId, callback, { type: "biberon" });
}

export async function modifierBiberon(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerBiberon(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// SOLIDES
// ============================================

export async function ajouterSolide(childId: string, data: any) {
  const eventData = removeUndefined({ type: "solide" as EventType, ...data });
  return ajouterEvenement(childId, eventData as any);
}

export function ecouterSolides(childId: string, callback: (docs: any[]) => void) {
  return ecouterEvenements(childId, callback, { type: "solide" });
}

export async function modifierSolide(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerSolide(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// MICTIONS
// ============================================

export async function ajouterMiction(childId: string, data: any) {
  const eventData = removeUndefined({
    type: "miction" as EventType,
    avecCouche: data.avecCouche !== undefined ? data.avecCouche : true,
    date: data.date || new Date(),
    note: data.note,
  });
  return ajouterEvenement(childId, eventData as any);
}

export async function obtenirToutesLesMictions(childId: string) {
  return obtenirEvenements(childId, { type: "miction" });
}

export function ecouterMictions(childId: string, callback: (docs: any[]) => void) {
  return ecouterEvenements(childId, callback, { type: "miction" });
}

export async function modifierMiction(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerMiction(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// SELLES
// ============================================

export async function ajouterSelle(childId: string, data: any) {
  const eventData = removeUndefined({
    type: "selle" as EventType,
    avecCouche: data.avecCouche !== undefined ? data.avecCouche : true,
    consistance: data.consistance,
    couleur: data.couleur,
    date: data.date || new Date(),
    note: data.note,
  });
  return ajouterEvenement(childId, eventData as any);
}

export async function obtenirToutesLesSelles(childId: string) {
  return obtenirEvenements(childId, { type: "selle" });
}

export function ecouterSelles(childId: string, callback: (docs: any[]) => void) {
  return ecouterEvenements(childId, callback, { type: "selle" });
}

export async function modifierSelle(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerSelle(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// SOMMEIL
// ============================================

export async function ajouterSommeil(childId: string, data: any) {
  const heureDebut = toDate(data.heureDebut || data.date);
  const heureFin = toDate(data.heureFin);
  const duree = computeSleepDuration(heureDebut, heureFin, data.duree);

  const eventData = removeUndefined({
    type: "sommeil" as EventType,
    heureDebut,
    heureFin,
    duree,
    isNap: data.isNap,
    location: data.location,
    quality: data.quality,
    date: heureDebut || new Date(),
    note: data.note,
  });
  return ajouterEvenement(childId, eventData as any);
}

export async function obtenirTousLesSommeils(childId: string) {
  return obtenirEvenements(childId, { type: "sommeil" });
}

export function ecouterSommeils(childId: string, callback: (docs: any[]) => void) {
  return ecouterEvenements(childId, callback, { type: "sommeil" });
}

export async function modifierSommeil(childId: string, id: string, data: any) {
  // Preserve null values for heureFin/duree — the CF converts null to deleteField()
  const heureFinIsNull = data.heureFin === null;
  const dureeIsNull = data.duree === null;

  const heureDebut = toDate(data.heureDebut);
  const heureFin = heureFinIsNull ? null : toDate(data.heureFin);
  const duree = dureeIsNull ? null : computeSleepDuration(heureDebut, heureFin ?? undefined, data.duree);

  const cleanedData = removeUndefined({ ...data, heureDebut, heureFin: heureFinIsNull ? undefined : heureFin, duree: dureeIsNull ? undefined : duree });

  // Re-add null values after removeUndefined so they reach the CF as deleteField
  if (heureFinIsNull) cleanedData.heureFin = null;
  if (dureeIsNull) cleanedData.duree = null;

  return modifierEvenement(childId, id, cleanedData);
}

export async function supprimerSommeil(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// POMPAGE
// ============================================

export async function ajouterPompage(childId: string, data: any) {
  const eventData = removeUndefined({
    type: "pompage" as EventType,
    quantiteGauche: data.quantiteGauche || 0,
    quantiteDroite: data.quantiteDroite || 0,
    quantiteTotale: (data.quantiteGauche || 0) + (data.quantiteDroite || 0),
    date: data.date || new Date(),
    note: data.note,
  });
  return ajouterEvenement(childId, eventData as any);
}

export async function obtenirTousLesPompages(childId: string) {
  return obtenirEvenements(childId, { type: "pompage" });
}

export async function modifierPompage(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerPompage(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// VACCINS
// ============================================

export async function ajouterVaccin(childId: string, data: any) {
  const eventData = removeUndefined({
    type: "vaccin" as EventType,
    nomVaccin: data.nomVaccin || data.nom,
    dateVaccin: data.dateVaccin || data.date,
    dose: data.dose,
    date: data.date || new Date(),
    note: data.note,
  });
  return ajouterEvenement(childId, eventData as any);
}

export async function obtenirToutesLesVaccins(childId: string) {
  return obtenirEvenements(childId, { type: "vaccin" });
}

export async function modifierVaccin(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerVaccin(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// VITAMINES
// ============================================

export async function ajouterVitamine(childId: string, data: any) {
  const eventData = removeUndefined({
    type: "vitamine" as EventType,
    nomVitamine: data.nomVitamine || "Vitamine D",
    date: data.date || new Date(),
    note: data.note,
  });
  return ajouterEvenement(childId, eventData as any);
}

export async function obtenirToutesLesVitamines(childId: string) {
  return obtenirEvenements(childId, { type: "vitamine" });
}

export async function modifierVitamine(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerVitamine(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// TEMPÉRATURE
// ============================================

export async function ajouterTemperature(childId: string, data: any) {
  return ajouterEvenement(childId, removeUndefined({ type: "temperature", ...data }) as any);
}

export async function modifierTemperature(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerTemperature(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// BAIN
// ============================================

export async function ajouterBain(childId: string, data: any) {
  return ajouterEvenement(childId, removeUndefined({ type: "bain", ...data }) as any);
}

export async function modifierBain(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerBain(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// MÉDICAMENT
// ============================================

export async function ajouterMedicament(childId: string, data: any) {
  return ajouterEvenement(childId, removeUndefined({ type: "medicament", ...data }) as any);
}

export async function modifierMedicament(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerMedicament(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// SYMPTÔME
// ============================================

export async function ajouterSymptome(childId: string, data: any) {
  return ajouterEvenement(childId, removeUndefined({ type: "symptome", ...data }) as any);
}

export async function modifierSymptome(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerSymptome(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// ACTIVITÉ
// ============================================

export async function ajouterActivite(childId: string, data: any) {
  return ajouterEvenement(childId, removeUndefined({ type: "activite", ...data }) as any);
}

export async function modifierActivite(childId: string, id: string, data: any) {
  return modifierEvenement(childId, id, removeUndefined(data));
}

export async function supprimerActivite(childId: string, id: string) {
  return supprimerEvenement(childId, id);
}

// ============================================
// JALON (with photo cleanup logic)
// ============================================

export async function ajouterJalon(childId: string, data: any) {
  return ajouterEvenement(childId, removeUndefined({ type: "jalon", ...data }) as any);
}

export async function modifierJalon(childId: string, id: string, data: any) {
  // Cleanup removed photos from Firebase Storage
  try {
    const existingEvent = await obtenirEvenement(childId, id);
    const oldPhotos: string[] = (existingEvent as any)?.photos ?? [];
    const newPhotos: string[] = data.photos ?? [];
    const removedPhotos = oldPhotos.filter(
      (oldUrl) =>
        oldUrl.startsWith("https://firebasestorage.googleapis.com") &&
        !newPhotos.includes(oldUrl)
    );
    for (const photoUrl of removedPhotos) {
      await deletePhotoFromStorage(photoUrl);
    }
  } catch (error) {
    console.error("[MODIFIER_JALON] Erreur lors de la gestion des photos:", error);
  }
  return modifierEvenement(childId, id, removeUndefined(data));
}

const FIREBASE_STORAGE_BUCKET = "samaye-53723.firebasestorage.app";

export async function deletePhotoFromStorage(photoUrl: string): Promise<void> {
  try {
    const match = photoUrl.match(/\/o\/([^?]+)/);
    if (!match) {
      console.warn("[DELETE_PHOTO] URL non reconnue:", photoUrl);
      return;
    }
    const encodedPath = match[1];
    const filePath = decodeURIComponent(encodedPath);
    console.log("[DELETE_PHOTO] Suppression de:", filePath);

    const user = auth.currentUser;
    if (!user) {
      console.warn("[DELETE_PHOTO] Utilisateur non connecté");
      return;
    }
    const token = await user.getIdToken();

    const deleteUrl = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedPath}`;
    const response = await fetch(deleteUrl, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.ok || response.status === 404) {
      console.log("[DELETE_PHOTO] Photo supprimée avec succès");
    } else {
      console.error("[DELETE_PHOTO] Erreur:", response.status, await response.text());
    }
  } catch (error) {
    console.error("[DELETE_PHOTO] Erreur:", error);
  }
}

export async function supprimerJalon(childId: string, id: string) {
  // Cleanup photos from Firebase Storage before deleting
  try {
    const event = await obtenirEvenement(childId, id);
    if ((event as any)?.photos && Array.isArray((event as any).photos)) {
      for (const photoUrl of (event as any).photos) {
        if (photoUrl?.startsWith("https://firebasestorage.googleapis.com")) {
          await deletePhotoFromStorage(photoUrl);
        }
      }
    }
  } catch (error) {
    console.error("[SUPPRIMER_JALON] Erreur récupération événement:", error);
  }
  return supprimerEvenement(childId, id);
}
