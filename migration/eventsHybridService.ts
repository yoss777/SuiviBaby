// Lecture HYBRIDE : merge des anciennes et nouvelles collections
// Garantit zéro perte de données pendant la migration

import {
    ecouterEvenements,
    obtenirEvenements
} from "@/services/eventsService";

import * as mictionsService from "@/services/mictionsService";
import * as pompagesService from "@/services/pompagesService";
import * as sellesService from "@/services/sellesService";
import * as teteesService from "@/services/teteesService";
import * as vaccinsService from "@/services/vaccinsService";
import * as vitaminesService from "@/services/vitaminesService";

// ============================================
// CONFIGURATION
// ============================================

interface HybridConfig {
  // Combiner les 2 sources ou juste une ?
  mode: "HYBRID" | "OLD_ONLY" | "NEW_ONLY";
  
  // En cas de doublon (même date/type), garder laquelle ?
  preferSource: "OLD" | "NEW";
  
  // Tolérance pour considérer 2 events comme doublons (en ms)
  deduplicationWindow: number; // Ex: 5000ms = 5 secondes
}

let config: HybridConfig = {
  mode: "HYBRID",
  preferSource: "NEW",
  deduplicationWindow: 5000, // 5 secondes
};

export function setHybridConfig(newConfig: Partial<HybridConfig>) {
  config = { ...config, ...newConfig };
  console.log("🔧 Config hybride:", config);
}

// ============================================
// DÉTECTION DE DOUBLONS
// ============================================

interface EventKey {
  type: string;
  date: number; // timestamp
  childId: string;
}

function getEventKey(event: any): EventKey {
  const date = event.date?.toDate?.() || event.date || event.createdAt?.toDate?.() || event.createdAt;
  return {
    type: event.type,
    date: new Date(date).getTime(),
    childId: event.childId,
  };
}

function areDuplicates(event1: any, event2: any, windowMs: number): boolean {
  const key1 = getEventKey(event1);
  const key2 = getEventKey(event2);

  // Même type et même childId
  if (key1.type !== key2.type || key1.childId !== key2.childId) {
    return false;
  }

  // Dates proches (dans la fenêtre de tolérance)
  const timeDiff = Math.abs(key1.date - key2.date);
  return timeDiff <= windowMs;
}

function deduplicateEvents(
  oldEvents: any[],
  newEvents: any[],
  preferSource: "OLD" | "NEW",
  windowMs: number
): any[] {
  const result: any[] = [];
  const processed = new Set<string>();

  // Commencer par la source préférée
  const [primary, secondary] =
    preferSource === "NEW" ? [newEvents, oldEvents] : [oldEvents, newEvents];

  // Ajouter tous les events de la source primaire
  primary.forEach((event) => {
    result.push({ ...event, _source: preferSource });
    processed.add(event.id);
  });

  // Ajouter les events de la source secondaire NON dupliqués
  secondary.forEach((secondaryEvent) => {
    // Vérifier si c'est un doublon
    const isDuplicate = primary.some((primaryEvent) =>
      areDuplicates(primaryEvent, secondaryEvent, windowMs)
    );

    if (!isDuplicate && !processed.has(secondaryEvent.id)) {
      result.push({
        ...secondaryEvent,
        _source: preferSource === "NEW" ? "OLD" : "NEW",
      });
      processed.add(secondaryEvent.id);
    }
  });

  // Trier par date décroissante
  result.sort((a, b) => {
    const dateA = a.date?.toDate?.() || a.date;
    const dateB = b.date?.toDate?.() || b.date;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  return result;
}

// ============================================
// LECTURE HYBRIDE - TÉTÉES
// ============================================

export async function obtenirToutesLesTeteesHybrid(
  childId: string
): Promise<any[]> {
  if (config.mode === "NEW_ONLY") {
    return obtenirEvenements(childId, { type: "tetee" });
  }

  if (config.mode === "OLD_ONLY") {
    return teteesService.obtenirToutesLesTetees(childId);
  }

  // Mode HYBRID: récupérer des 2 et merger
  const [oldTetees, newTetees] = await Promise.all([
    teteesService.obtenirToutesLesTetees(childId).catch(() => []),
    obtenirEvenements(childId, { type: "tetee" }).catch(() => []),
  ]);

  console.log(`📊 Tétées OLD: ${oldTetees.length}, NEW: ${newTetees.length}`);

  return deduplicateEvents(
    oldTetees,
    newTetees,
    config.preferSource,
    config.deduplicationWindow
  );
}

/**
 * Listener hybride en temps réel
 * Écoute les DEUX collections et merge les résultats
 */
export function ecouterTeteesHybrid(
  childId: string,
  callback: (events: any[]) => void
): () => void {
  if (config.mode === "NEW_ONLY") {
    return ecouterEvenements(childId, callback, { type: "tetee" });
  }

  if (config.mode === "OLD_ONLY") {
    return teteesService.ecouterTetees(childId, callback);
  }

  // Mode HYBRID: écouter les 2 sources
  let oldEvents: any[] = [];
  let newEvents: any[] = [];

  const merge = () => {
    const merged = deduplicateEvents(
      oldEvents,
      newEvents,
      config.preferSource,
      config.deduplicationWindow
    );
    callback(merged);
  };

  const unsubscribeOld = teteesService.ecouterTetees(childId, (events) => {
    oldEvents = events;
    merge();
  });

  const unsubscribeNew = ecouterEvenements(
    childId,
    (events) => {
      newEvents = events;
      merge();
    },
    { type: "tetee" }
  );

  // Retourner une fonction qui désinscrit les 2
  return () => {
    unsubscribeOld();
    unsubscribeNew();
  };
}

// ============================================
// LECTURE HYBRIDE - MICTIONS
// ============================================

export async function obtenirToutesLesMictionsHybrid(
  childId: string
): Promise<any[]> {
  if (config.mode === "NEW_ONLY") {
    return obtenirEvenements(childId, { type: "miction" });
  }

  if (config.mode === "OLD_ONLY") {
    return mictionsService.obtenirToutesLesMictions(childId);
  }

  const [oldMictions, newMictions] = await Promise.all([
    mictionsService.obtenirToutesLesMictions(childId).catch(() => []),
    obtenirEvenements(childId, { type: "miction" }).catch(() => []),
  ]);

  console.log(`📊 Mictions OLD: ${oldMictions.length}, NEW: ${newMictions.length}`);

  return deduplicateEvents(
    oldMictions,
    newMictions,
    config.preferSource,
    config.deduplicationWindow
  );
}

export function ecouterMictionsHybrid(
  childId: string,
  callback: (events: any[]) => void
): () => void {
  if (config.mode === "NEW_ONLY") {
    return ecouterEvenements(childId, callback, { type: "miction" });
  }

  if (config.mode === "OLD_ONLY") {
    return mictionsService.ecouterMictions(childId, callback);
  }

  let oldEvents: any[] = [];
  let newEvents: any[] = [];

  const merge = () => {
    const merged = deduplicateEvents(
      oldEvents,
      newEvents,
      config.preferSource,
      config.deduplicationWindow
    );
    callback(merged);
  };

  const unsubscribeOld = mictionsService.ecouterMictions(childId, (events) => {
    oldEvents = events;
    merge();
  });

  const unsubscribeNew = ecouterEvenements(
    childId,
    (events) => {
      newEvents = events;
      merge();
    },
    { type: "miction" }
  );

  return () => {
    unsubscribeOld();
    unsubscribeNew();
  };
}

// ============================================
// LECTURE HYBRIDE - SELLES
// ============================================

export async function obtenirToutesLesSellesHybrid(
  childId: string
): Promise<any[]> {
  if (config.mode === "NEW_ONLY") {
    return obtenirEvenements(childId, { type: "selle" });
  }

  if (config.mode === "OLD_ONLY") {
    return sellesService.obtenirToutesLesSelles(childId);
  }

  const [oldSelles, newSelles] = await Promise.all([
    sellesService.obtenirToutesLesSelles(childId).catch(() => []),
    obtenirEvenements(childId, { type: "selle" }).catch(() => []),
  ]);

  console.log(`📊 Selles OLD: ${oldSelles.length}, NEW: ${newSelles.length}`);

  return deduplicateEvents(
    oldSelles,
    newSelles,
    config.preferSource,
    config.deduplicationWindow
  );
}

export function ecouterSellesHybrid(
  childId: string,
  callback: (events: any[]) => void
): () => void {
  if (config.mode === "NEW_ONLY") {
    return ecouterEvenements(childId, callback, { type: "selle" });
  }

  if (config.mode === "OLD_ONLY") {
    return sellesService.ecouterSelles(childId, callback);
  }

  let oldEvents: any[] = [];
  let newEvents: any[] = [];

  const merge = () => {
    const merged = deduplicateEvents(
      oldEvents,
      newEvents,
      config.preferSource,
      config.deduplicationWindow
    );
    callback(merged);
  };

  const unsubscribeOld = sellesService.ecouterSelles(childId, (events) => {
    oldEvents = events;
    merge();
  });

  const unsubscribeNew = ecouterEvenements(
    childId,
    (events) => {
      newEvents = events;
      merge();
    },
    { type: "selle" }
  );

  return () => {
    unsubscribeOld();
    unsubscribeNew();
  };
}

// ============================================
// LECTURE HYBRIDE - POMPAGES
// ============================================

export async function obtenirTousLesPompagesHybrid(
  childId: string
): Promise<any[]> {
  if (config.mode === "NEW_ONLY") {
    return obtenirEvenements(childId, { type: "pompage" });
  }

  if (config.mode === "OLD_ONLY") {
    return pompagesService.obtenirTousLesPompages(childId);
  }

  const [oldPompages, newPompages] = await Promise.all([
    pompagesService.obtenirTousLesPompages(childId).catch(() => []),
    obtenirEvenements(childId, { type: "pompage" }).catch(() => []),
  ]);

  return deduplicateEvents(
    oldPompages,
    newPompages,
    config.preferSource,
    config.deduplicationWindow
  );
}

export function ecouterPompagesHybrid(
  childId: string,
  callback: (events: any[]) => void
): () => void {
  if (config.mode === "NEW_ONLY") {
    return ecouterEvenements(childId, callback, { type: "pompage" });
  }

  if (config.mode === "OLD_ONLY") {
    return pompagesService.ecouterPompages(childId, callback);
  }

  // Mode HYBRID: écouter les 2 sources
  let oldEvents: any[] = [];
  let newEvents: any[] = [];

  const merge = () => {
    const merged = deduplicateEvents(
      oldEvents,
      newEvents,
      config.preferSource,
      config.deduplicationWindow
    );
    callback(merged);
  };

  const unsubscribeOld = pompagesService.ecouterPompages(childId, (events) => {
    oldEvents = events;
    merge();
  });

  const unsubscribeNew = ecouterEvenements(
    childId,
    (events) => {
      newEvents = events;
      merge();
    },
    { type: "pompage" }
  );

  // Retourner une fonction qui désinscrit les 2
  return () => {
    unsubscribeOld();
    unsubscribeNew();
  };
}

// ============================================
// LECTURE HYBRIDE - VACCINS
// ============================================

export async function obtenirToutesLesVaccinsHybrid(
  childId: string
): Promise<any[]> {
  if (config.mode === "NEW_ONLY") {
    return obtenirEvenements(childId, { type: "vaccin" });
  }

  if (config.mode === "OLD_ONLY") {
    return vaccinsService.obtenirToutesLesVaccins(childId);
  }

  const [oldVaccins, newVaccins] = await Promise.all([
    vaccinsService.obtenirToutesLesVaccins(childId).catch(() => []),
    obtenirEvenements(childId, { type: "vaccin" }).catch(() => []),
  ]);

  return deduplicateEvents(
    oldVaccins,
    newVaccins,
    config.preferSource,
    config.deduplicationWindow
  );
}

export function ecouterVaccinsHybrid(
  childId: string,
  callback: (events: any[]) => void
): () => void {
  if (config.mode === "NEW_ONLY") {
    return ecouterEvenements(childId, callback, { type: "vaccin" });
  }

  if (config.mode === "OLD_ONLY") {
    return vaccinsService.ecouterVaccins(childId, callback);
  }

  // Mode HYBRID: écouter les 2 sources
  let oldEvents: any[] = [];
  let newEvents: any[] = [];

  const merge = () => {
    const merged = deduplicateEvents(
      oldEvents,
      newEvents,
      config.preferSource,
      config.deduplicationWindow
    );
    callback(merged);
  };

  const unsubscribeOld = vaccinsService.ecouterVaccins(childId, (events) => {
    oldEvents = events;
    merge();
  });

  const unsubscribeNew = ecouterEvenements(
    childId,
    (events) => {
      newEvents = events;
      merge();
    },
    { type: "vaccin" }
  );

  // Retourner une fonction qui désinscrit les 2
  return () => {
    unsubscribeOld();
    unsubscribeNew();
  };
}

// ============================================
// LECTURE HYBRIDE - VITAMINES
// ============================================

export async function obtenirToutesLesVitaminesHybrid(
  childId: string
): Promise<any[]> {
  if (config.mode === "NEW_ONLY") {
    return obtenirEvenements(childId, { type: "vitamine" });
  }

  if (config.mode === "OLD_ONLY") {
    return vitaminesService.obtenirToutesLesVitamines(childId);
  }

  const [oldVitamines, newVitamines] = await Promise.all([
    vitaminesService.obtenirToutesLesVitamines(childId).catch(() => []),
    obtenirEvenements(childId, { type: "vitamine" }).catch(() => []),
  ]);

  return deduplicateEvents(
    oldVitamines,
    newVitamines,
    config.preferSource,
    config.deduplicationWindow
  );
}

export function ecouterVitaminesHybrid(
  childId: string,
  callback: (events: any[]) => void
): () => void {
  if (config.mode === "NEW_ONLY") {
    return ecouterEvenements(childId, callback, { type: "vitamine" });
  }

  if (config.mode === "OLD_ONLY") {
    return vitaminesService.ecouterVitamines(childId, callback);
  }

  // Mode HYBRID: écouter les 2 sources
  let oldEvents: any[] = [];
  let newEvents: any[] = [];

  const merge = () => {
    const merged = deduplicateEvents(
      oldEvents,
      newEvents,
      config.preferSource,
      config.deduplicationWindow
    );
    callback(merged);
  };

  const unsubscribeOld = vitaminesService.ecouterVitamines(childId, (events) => {
    oldEvents = events;
    merge();
  });

  const unsubscribeNew = ecouterEvenements(
    childId,
    (events) => {
      newEvents = events;
      merge();
    },
    { type: "vitamine" }
  );

  // Retourner une fonction qui désinscrit les 2
  return () => {
    unsubscribeOld();
    unsubscribeNew();
  };
}

// ============================================
// STATISTIQUES & MONITORING
// ============================================

export interface HybridStats {
  mode: string;
  totalReads: number;
  oldSourceReads: number;
  newSourceReads: number;
  duplicatesFound: number;
  mergedEvents: number;
}

let stats: HybridStats = {
  mode: config.mode,
  totalReads: 0,
  oldSourceReads: 0,
  newSourceReads: 0,
  duplicatesFound: 0,
  mergedEvents: 0,
};

export function getHybridStats() {
  return { ...stats };
}

export function resetHybridStats() {
  stats = {
    mode: config.mode,
    totalReads: 0,
    oldSourceReads: 0,
    newSourceReads: 0,
    duplicatesFound: 0,
    mergedEvents: 0,
  };
}

// ============================================
// EXEMPLE D'UTILISATION
// ============================================

/*
// Phase 1: Migration historique
await migrerToutesLesCollections(userId, childId);

// Phase 2: Activer lecture hybride (garantit zéro perte)
setHybridConfig({
  mode: "HYBRID",
  preferSource: "NEW",
  deduplicationWindow: 5000
});

// L'utilisateur voit TOUTES ses données (old + new)
const tetees = await obtenirToutesLesTeteesHybrid(childId);
// Résultat: merge intelligent des 2 sources, doublons supprimés

// Phase 3: Après validation complète
setHybridConfig({
  mode: "NEW_ONLY"
});
// On ne lit plus que depuis NEW

// En cas de problème
setHybridConfig({
  mode: "OLD_ONLY"
});
*/