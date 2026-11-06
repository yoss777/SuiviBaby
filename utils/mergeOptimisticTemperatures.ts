// utils/mergeOptimisticTemperatures.ts
//
// Ajoute à la liste d'événements des insights les températures enregistrées
// mais pas encore confirmées par le serveur (optimistes ou en file hors ligne).
// Sans cela, une fièvre saisie hors ligne ne déclenche aucune alerte sur
// l'accueil. Lecture seule : ne touche jamais au store optimiste.

interface OptimisticLike {
  tempId: string;
  operation: "create" | "update";
  status: string;
  realId?: string;
  event: any;
}

interface InsightEventLike {
  id: string;
  type: string;
  date: Date;
  valeur?: number;
  [key: string]: unknown;
}

const SAME_INSTANT_MS = 2000;

export function mergeOptimisticTemperatures<T extends InsightEventLike>(
  events: readonly T[],
  entries: readonly OptimisticLike[],
  toDate: (value: any) => Date,
): T[] {
  const merged: T[] = [...events];

  for (const entry of entries) {
    if (entry.status === "failed") continue;
    const ev = entry.event;
    if (!ev || ev.type !== "temperature" || typeof ev.valeur !== "number") continue;
    const date = toDate(ev.date);
    if (Number.isNaN(date.getTime())) continue;

    if (entry.operation === "update") {
      const idx = merged.findIndex((e) => e.id === entry.realId);
      if (idx !== -1) merged[idx] = { ...merged[idx], valeur: ev.valeur, date };
      continue;
    }

    const alreadyThere = merged.some(
      (e) =>
        (entry.realId && e.id === entry.realId) ||
        (e.type === "temperature" &&
          e.valeur === ev.valeur &&
          Math.abs(e.date.getTime() - date.getTime()) < SAME_INSTANT_MS),
    );
    if (alreadyThere) continue;
    merged.push({ id: entry.realId ?? entry.tempId, type: "temperature", valeur: ev.valeur, date } as T);
  }
  return merged;
}
