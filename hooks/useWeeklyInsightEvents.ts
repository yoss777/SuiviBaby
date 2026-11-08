// hooks/useWeeklyInsightEvents.ts
//
// S7.6 : lecture des 7 derniers jours d'événements pour le moteur d'insights
// de l'accueil. Différée après le premier rendu (InteractionManager), filtrée
// par les types utiles et mise en cache par enfant et par jour. Extraite de
// home.tsx pour être testable.

import { useEffect, useState } from "react";

import { obtenirEvenements } from "@/services/eventsService";
import {
  WEEKLY_INSIGHT_TYPES,
  getWeeklyEventsCache,
  isWeeklyEventsCacheFresh,
  setWeeklyEventsCache,
} from "@/services/weeklyEventsCache";
import { toDate } from "@/utils/date";
import { runAfterInteractions } from "@/utils/afterInteractions";

export type WeeklyInsightEvent = {
  id: string;
  type: string;
  date: Date;
  quality?: string;
  location?: string;
  isNap?: boolean;
  duree?: number;
  heureDebut?: Date;
  heureFin?: Date;
  typeSolide?: string;
  nouveauAliment?: boolean;
  nomNouvelAliment?: string;
  reaction?: string;
  quantiteMl?: number;
  valeur?: number;
  jalonType?: string;
  titre?: string;
  updatedAt?: unknown;
};

const EMPTY: WeeklyInsightEvent[] = [];

function mapEvents(events: any[]): WeeklyInsightEvent[] {
  return events.map((e) => ({
    id: e.id ?? "",
    type: e.type,
    date: toDate(e.date),
    quality: e.quality,
    location: e.location,
    isNap: e.isNap,
    duree: e.duree,
    heureDebut: e.heureDebut ? toDate(e.heureDebut) : undefined,
    heureFin: e.heureFin ? toDate(e.heureFin) : undefined,
    typeSolide: e.typeSolide,
    nouveauAliment: e.nouveauAliment,
    nomNouvelAliment: e.nomNouvelAliment,
    reaction: e.reaction,
    quantiteMl: e.quantiteMl,
    valeur: e.valeur,
    jalonType: e.typeJalon ?? e.jalonType,
    titre: e.titre,
    updatedAt: e.updatedAt,
  }));
}

/**
 * Semaine en cache + événements du jour reçus en temps réel. Le cache peut
 * avoir 15 min de retard : sans cette fusion, une température confirmée par
 * le serveur sortait du store optimiste sans être encore dans le cache, et
 * l'alerte fièvre de l'accueil disparaissait jusqu'au prochain rafraîchissement.
 * Pour aujourd'hui, seule la version temps réel compte (ajouts, modifications
 * et suppressions du jour à jour).
 */
export function withLiveToday(
  weekly: readonly WeeklyInsightEvent[],
  todayLive: readonly any[],
  now: Date = new Date(),
): WeeklyInsightEvent[] {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const before = weekly.filter((e) => e.date < startOfToday);
  const today = mapEvents(
    todayLive.filter((e) => e && WEEKLY_INSIGHT_TYPES.includes(e.type)),
  ).filter((e) => !Number.isNaN(e.date.getTime()) && e.date >= startOfToday);
  return [...before, ...today];
}

export function useWeeklyInsightEvents(
  childId: string | null | undefined,
  refreshKey = 0,
): WeeklyInsightEvent[] {
  // Événements rattachés à l'enfant qui les a produits : après un changement
  // d'enfant, ceux du précédent ne sont jamais renvoyés (même une frame).
  const [state, setState] = useState<{
    childId: string | null | undefined;
    events: WeeklyInsightEvent[];
  }>(() => ({
    childId,
    events: (childId ? getWeeklyEventsCache<WeeklyInsightEvent>(childId) : null) ?? EMPTY,
  }));

  useEffect(() => {
    if (!childId) {
      setState({ childId, events: EMPTY });
      return;
    }
    let cancelled = false;

    // Données du jour déjà connues : affichage immédiat, sans lecture si fraîches.
    const cached = getWeeklyEventsCache<WeeklyInsightEvent>(childId);
    setState({ childId, events: cached ?? EMPTY });
    if (cached && refreshKey === 0 && isWeeklyEventsCacheFresh(childId)) return;

    const task = runAfterInteractions(() => {
      if (cancelled) return;
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      obtenirEvenements(childId, { type: WEEKLY_INSIGHT_TYPES, depuis: sevenDaysAgo })
        .then((raw) => {
          const mapped = mapEvents(raw as any[]);
          // Le cache est rempli même si l'écran a changé d'enfant entre-temps.
          setWeeklyEventsCache(childId, mapped);
          if (cancelled) return;
          setState({ childId, events: mapped });
        })
        .catch(console.warn);
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [childId, refreshKey]);

  if (state.childId === childId) return state.events;
  // Rendu intermédiaire d'un changement d'enfant : cache du nouvel enfant ou rien.
  return (childId ? getWeeklyEventsCache<WeeklyInsightEvent>(childId) : null) ?? EMPTY;
}
