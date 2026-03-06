// Lecture hybride — migration terminée (NEW_ONLY)
// Thin wrappers around eventsService, preserving import paths for consumers.

import {
  ecouterEvenements,
  obtenirEvenements,
  EventType,
} from "@/services/eventsService";

import { getTodayTypes } from "@/services/todayEventsCache";

// ============================================
// CONFIG (kept for MigrationProvider compat)
// ============================================

export interface HybridStats {
  mode: string;
  totalReads: number;
  oldSourceReads: number;
  newSourceReads: number;
  duplicatesFound: number;
  mergedEvents: number;
}

export function setHybridConfig(_newConfig: any) {}
export function getHybridStats(): HybridStats {
  return { mode: "NEW_ONLY", totalReads: 0, oldSourceReads: 0, newSourceReads: 0, duplicatesFound: 0, mergedEvents: 0 };
}
export function resetHybridStats() {}

// ============================================
// HELPERS
// ============================================

function getTodayRange() {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const endOfDayInclusive = new Date(endOfDay.getTime() - 1);
  return { startOfDay, endOfDayInclusive };
}

function getRecentRange() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const endOfDayInclusive = new Date(endOfDay.getTime() - 1);
  return { startOfYesterday, endOfDayInclusive };
}

// ============================================
// GENERAL
// ============================================

export async function obtenirEvenementsDuJourHybrid(childId: string) {
  const { startOfDay, endOfDayInclusive } = getTodayRange();
  const types = getTodayTypes() as EventType[];
  return obtenirEvenements(childId, { type: types, depuis: startOfDay, jusqu: endOfDayInclusive });
}

export async function hasMoreEventsBeforeHybrid(
  childId: string,
  types: EventType | EventType[],
  beforeDate: Date
) {
  const events = await obtenirEvenements(childId, { type: types, jusqu: beforeDate, limite: 1 });
  return events.length > 0;
}

export async function getNextEventDateBeforeHybrid(
  childId: string,
  types: EventType | EventType[],
  beforeDate: Date
): Promise<Date | null> {
  const events = await obtenirEvenements(childId, { type: types, jusqu: beforeDate, limite: 1 });
  if (events.length === 0) return null;
  const eventDate = events[0].date;
  if (eventDate && typeof (eventDate as any).toDate === 'function') return (eventDate as any).toDate();
  return eventDate instanceof Date ? eventDate : new Date(eventDate as any);
}

export function ecouterEvenementsDuJourHybrid(
  childId: string,
  callback: (events: any[]) => void,
  options?: { waitForServer?: boolean }
): () => void {
  const { startOfYesterday, endOfDayInclusive } = getRecentRange();
  const types = getTodayTypes() as EventType[];
  return ecouterEvenements(childId, callback, {
    type: types, depuis: startOfYesterday, jusqu: endOfDayInclusive, waitForServer: options?.waitForServer,
  });
}

export function ecouterEvenementsHybrid(
  childId: string,
  callback: (events: any[]) => void,
  options: { types: EventType[]; depuis: Date; jusqu?: Date; waitForServer?: boolean }
): () => void {
  return ecouterEvenements(childId, callback, {
    type: options.types, depuis: options.depuis, jusqu: options.jusqu, waitForServer: options.waitForServer,
  });
}

// ============================================
// TYPE-SPECIFIC (all delegate to eventsService)
// ============================================

type ListenerOptions = { waitForServer?: boolean; depuis?: Date; jusqu?: Date; limite?: number };

function makeObtenir(type: EventType) {
  return (childId: string) => obtenirEvenements(childId, { type });
}

function makeEcouter(type: EventType) {
  return (childId: string, callback: (events: any[]) => void, options?: ListenerOptions, onError?: (error: Error) => void): (() => void) =>
    ecouterEvenements(childId, callback, {
      type, waitForServer: options?.waitForServer, depuis: options?.depuis, jusqu: options?.jusqu, limite: options?.limite,
    }, onError);
}

// Tétées
export const obtenirToutesLesTeteesHybrid = makeObtenir("tetee");
export const ecouterTeteesHybrid = makeEcouter("tetee");

// Mictions
export const obtenirToutesLesMictionsHybrid = makeObtenir("miction");
export const ecouterMictionsHybrid = makeEcouter("miction");

// Selles
export const obtenirToutesLesSellesHybrid = makeObtenir("selle");
export const ecouterSellesHybrid = makeEcouter("selle");

// Sommeil
export const obtenirTousLesSommeilsHybrid = makeObtenir("sommeil");
export const ecouterSommeilsHybrid = makeEcouter("sommeil");

// Pompages
export const obtenirTousLesPompagesHybrid = makeObtenir("pompage");
export const ecouterPompagesHybrid = makeEcouter("pompage");

// Croissances
export const obtenirToutesLesCroissancesHybrid = makeObtenir("croissance");
export const ecouterCroissancesHybrid = makeEcouter("croissance");

// Vaccins
export const obtenirToutesLesVaccinsHybrid = makeObtenir("vaccin");
export const ecouterVaccinsHybrid = makeEcouter("vaccin");

// Vitamines
export const obtenirToutesLesVitaminesHybrid = makeObtenir("vitamine");
export const ecouterVitaminesHybrid = makeEcouter("vitamine");

// Biberons
export const obtenirTousLesBiberonsHybrid = makeObtenir("biberon");
export const ecouterBiberonsHybrid = makeEcouter("biberon");

// Températures
export const ecouterTemperaturesHybrid = makeEcouter("temperature");

// Bains
export const ecouterBainsHybrid = makeEcouter("bain");

// Médicaments
export const ecouterMedicamentsHybrid = makeEcouter("medicament");

// Symptômes
export const ecouterSymptomesHybrid = makeEcouter("symptome");

// Activités
export const ecouterActivitesHybrid = makeEcouter("activite");

// Jalons
export const ecouterJalonsHybrid = makeEcouter("jalon");

// Solides
export const ecouterSolidesHybrid = makeEcouter("solide");
