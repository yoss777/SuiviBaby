// hooks/useNowWidgetSync.ts
// Tient le widget « Bébé maintenant » à jour depuis l'Accueil : à chaque
// changement des données du jour, des sessions en cours (y compris la tétée
// lancée sur un autre appareil du foyer) et au retour au premier plan.
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import {
  loadNursingTimer,
  type NursingTimerState,
  subscribeNursingTimer,
} from "@/components/forms/nursingTimer";
import { setWidgetChild } from "@/services/pushTokenService";
import {
  cancelPendingWidgetPush,
  flushPendingWidgetPush,
  invalidateWidgetKey,
  pushNowWidget,
  pushNowWidgetLoading,
} from "@/services/widgetSync";
import {
  assembleNowWidgetInput,
  buildNowWidgetProps,
  localEnv,
  type OtherDayEvent,
} from "@/utils/widgetSnapshot";

// childId : chaque événement porte son enfant (garde contre les données d'un autre bébé).
type Dated = { date: unknown; childId?: string };

interface Params {
  childId: string | undefined;
  childName: string;
  /** Données du bébé chargées : rien n'est envoyé avant (pas de faux « 0 repas »). */
  ready: boolean;
  toMs: (value: unknown) => number;
  tetees: (Dated & { dureeGauche?: number; dureeDroite?: number; coteGauche?: boolean; coteDroit?: boolean })[];
  biberons: (Dated & { typeBiberon?: string; quantite?: number })[];
  solides: Dated[];
  mictions: Dated[];
  selles: Dated[];
  /** Autres événements (vitamines, soins, santé, activités, sommeils, jalons) : fil du jour. */
  others?: (Dated & OtherDayEvent)[];
  sleepStartMs: number | undefined;
  /** Enfant du sommeil en cours (garde au changement de bébé). */
  sleepChildId?: string;
  /** Sommeil en cours : sieste ou nuit. */
  sleepIsNap: boolean | undefined;
  walkStartMs: number | undefined;
  /** Enfant de la promenade en cours (garde au changement de bébé). */
  walkChildId?: string;
  sleepTotalMinutes: number;
  lastAbsoluteMealMs: number | undefined;
  isPremium: boolean;
  reminders: { enabled: boolean; thresholds: { repas: number; changes: number } };
}

export function useNowWidgetSync(p: Params): void {
  // Tétée rangée avec son enfant : au changement de bébé, celle de l'ancien
  // n'est jamais envoyée dans le widget du nouveau.
  const [nursingOf, setNursingOf] = useState<{ childId: string; state: NursingTimerState | null } | null>(null);
  const [tick, setTick] = useState(0);
  // Enfant précédent dans cette session : un vrai changement d'enfant (pas le
  // démarrage) fait passer le widget tout de suite sur le nouveau prénom.
  const prevChildRef = useRef<string | undefined>(undefined);
  const switchedRef = useRef(false);

  // Tétée en cours : document partagé du foyer + brouillon local.
  useEffect(() => {
    const childId = p.childId;
    if (!childId) return;
    let active = true;
    const set = (state: NursingTimerState | null) => active && setNursingOf({ childId, state });
    // Lecture impossible : pas de tétée connue, le widget part quand même.
    void loadNursingTimer(childId).then(set, () => set(null));
    const unsubscribe = subscribeNursingTimer(childId, set);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [p.childId]);

  // Retour au premier plan : nouvel envoi (minuit passé, brouillon expiré…).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        invalidateWidgetKey();
        setTick((t) => t + 1);
      } else {
        // Retour rapide à l'écran d'accueil : rien ne reste en attente.
        flushPendingWidgetPush();
      }
    });
    return () => sub.remove();
  }, []);

  // Calculé dans un effet : l'heure courante n'a pas sa place dans le rendu.
  useEffect(() => {
    if (p.childId && prevChildRef.current && prevChildRef.current !== p.childId) switchedRef.current = true;
    if (p.childId) prevChildRef.current = p.childId;
    // Enfant changé, données pas encore prêtes : « Mise à jour… » au nom du
    // nouvel enfant, jamais l'ancien enfant dans le widget.
    const waitForData = () => {
      cancelPendingWidgetPush();
      if (switchedRef.current && p.childId) pushNowWidgetLoading(p.childId, p.childName);
    };
    if (!p.childId || !p.ready) {
      waitForData();
      return;
    }
    // Juste après un changement de bébé, l'Accueil affiche un instant le nom du
    // nouveau bébé avec les données de l'ancien : on n'envoie rien tant qu'une
    // seule donnée appartient à un autre enfant.
    const otherChild = (id: string | undefined) => id != null && id !== p.childId;
    const stale =
      [...p.tetees, ...p.biberons, ...p.solides, ...p.mictions, ...p.selles, ...(p.others ?? [])].some((e) => otherChild(e.childId)) ||
      otherChild(p.sleepChildId) ||
      otherChild(p.walkChildId);
    // Tétée pas encore lue pour ce bébé : on attend (sinon un faux « pas de tétée »).
    if (stale || nursingOf?.childId !== p.childId) {
      waitForData();
      return;
    }
    const nursing = nursingOf.state;
    // Le calcul lui-même vit dans le module partagé avec le serveur.
    const timed = <T extends Dated>(list: T[]) => list.map((e) => ({ ...e, ms: p.toMs(e.date) }));
    const input = assembleNowWidgetInput(
      {
        childName: p.childName,
        nursing,
        tetees: timed(p.tetees),
        biberons: timed(p.biberons),
        solides: timed(p.solides),
        mictions: timed(p.mictions),
        selles: timed(p.selles),
        others: timed(p.others ?? []),
        sleepStartMs: p.sleepStartMs ?? null,
        sleepIsNap: p.sleepIsNap ?? null,
        walkStartMs: p.walkStartMs ?? null,
        sleepTotalMinutes: p.sleepTotalMinutes,
        lastAbsoluteMealMs: p.lastAbsoluteMealMs ?? null,
        isPremium: p.isPremium,
        reminders: {
          enabled: p.reminders.enabled,
          repasHours: p.reminders.thresholds.repas,
          changesHours: p.reminders.thresholds.changes,
        },
        now: Date.now(),
      },
      localEnv,
    );
    pushNowWidget({ ...buildNowWidgetProps(input, localEnv), childId: p.childId });
    setWidgetChild(p.childId);
    // tick : nouvel envoi au retour au premier plan.
  }, [p, nursingOf, tick]);
}
