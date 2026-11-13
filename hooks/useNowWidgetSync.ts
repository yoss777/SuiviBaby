// hooks/useNowWidgetSync.ts
// Tient le widget « Bébé maintenant » à jour depuis l'Accueil : à chaque
// changement des données du jour, des sessions en cours (y compris la tétée
// lancée sur un autre appareil du foyer) et au retour au premier plan.
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import {
  loadNursingTimer,
  type NursingTimerState,
  subscribeNursingTimer,
} from "@/components/forms/nursingTimer";
import { pushNowWidget } from "@/services/widgetSync";
import { buildNowWidgetProps, countGroups, type NowWidgetInput } from "@/utils/widgetSnapshot";

const MEAL_GROUP_MS = 30 * 60 * 1000;
const CHANGE_GROUP_MS = 2 * 60 * 1000;

type Dated = { date: unknown };

interface Params {
  childId: string | undefined;
  childName: string;
  /** Données du bébé chargées : rien n'est envoyé avant (pas de faux « 0 repas »). */
  ready: boolean;
  toMs: (value: unknown) => number;
  tetees: (Dated & { dureeGauche?: number; dureeDroite?: number })[];
  biberons: (Dated & { typeBiberon?: string; quantite?: number })[];
  solides: Dated[];
  mictions: Dated[];
  selles: Dated[];
  sleepStartMs: number | undefined;
  walkStartMs: number | undefined;
  sleepTotalMinutes: number;
  lastAbsoluteMealMs: number | undefined;
  isPremium: boolean;
  reminders: { enabled: boolean; thresholds: { repas: number; changes: number } };
}

function startOfToday(now: number): [number, number] {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return [start, start + 24 * 3600 * 1000];
}

export function useNowWidgetSync(p: Params): void {
  const [nursing, setNursing] = useState<NursingTimerState | null>(null);
  const [tick, setTick] = useState(0);

  // Tétée en cours : document partagé du foyer + brouillon local.
  useEffect(() => {
    if (!p.childId) return;
    let active = true;
    void loadNursingTimer(p.childId).then((s) => active && setNursing(s));
    const unsubscribe = subscribeNursingTimer(p.childId, (s) => active && setNursing(s));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [p.childId]);

  // Retour au premier plan : nouvel envoi (minuit passé, brouillon expiré…).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setTick((t) => t + 1);
    });
    return () => sub.remove();
  }, []);

  // Calculé dans un effet : l'heure courante n'a pas sa place dans le rendu.
  useEffect(() => {
    if (!p.childId || !p.ready) return;
    const now = Date.now();
    const [dayStart, dayEnd] = startOfToday(now);
    const inToday = (ms: number) => ms >= dayStart && ms < dayEnd;
    const ms = (e: Dated) => p.toMs(e.date);

    const mealBottles = p.biberons.filter(
      (e) => !e.typeBiberon || e.typeBiberon === "lait_maternel" || e.typeBiberon === "lait_infantile",
    );
    const meals: { ms: number; kind: "tetee" | "biberon" | "solide" }[] = [
      ...p.tetees.map((e) => ({ ms: ms(e), kind: "tetee" as const })),
      ...mealBottles.map((e) => ({ ms: ms(e), kind: "biberon" as const })),
      ...p.solides.map((e) => ({ ms: ms(e), kind: "solide" as const })),
    ].filter((m) => Number.isFinite(m.ms));
    const lastMealEvent = meals.reduce<(typeof meals)[number] | null>(
      (best, m) => (!best || m.ms > best.ms ? m : best),
      null,
    );
    const lastMeal = lastMealEvent
      ? lastMealEvent
      : p.lastAbsoluteMealMs
        ? { ms: p.lastAbsoluteMealMs, kind: "autre" as const }
        : null;

    const lastTetee = [...p.tetees].sort((a, b) => ms(b) - ms(a))[0];
    const todayMeals = meals.map((m) => m.ms).filter(inToday);
    const changes = [...p.mictions, ...p.selles].map(ms).filter((t) => Number.isFinite(t));
    const todayChanges = changes.filter(inToday);
    const bottleMl = mealBottles
      .filter((e) => inToday(ms(e)))
      .reduce((sum, e) => sum + (typeof e.quantite === "number" ? e.quantite : 0), 0);

    const input: NowWidgetInput = {
      childName: p.childName,
      nursing,
      sleepStartMs: p.sleepStartMs ?? null,
      walkStartMs: p.walkStartMs ?? null,
      lastMeal,
      lastNursing: lastTetee
        ? { leftMinutes: lastTetee.dureeGauche ?? 0, rightMinutes: lastTetee.dureeDroite ?? 0 }
        : null,
      day: {
        mealsCount: countGroups(todayMeals, MEAL_GROUP_MS),
        bottleMl,
        lastMealMs: lastMeal?.ms ?? null,
        diapersCount: countGroups(todayChanges, CHANGE_GROUP_MS),
        lastDiaperMs: changes.length ? Math.max(...changes) : null,
        sleepMinutes: p.sleepTotalMinutes,
      },
      isPremium: p.isPremium,
      reminders: {
        enabled: p.reminders.enabled,
        repasHours: p.reminders.thresholds.repas,
        changesHours: p.reminders.thresholds.changes,
      },
      now,
    };
    pushNowWidget(buildNowWidgetProps(input));
    // tick : nouvel envoi au retour au premier plan.
  }, [p, nursing, tick]);
}
