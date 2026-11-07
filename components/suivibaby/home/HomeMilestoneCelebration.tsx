// components/suivibaby/home/HomeMilestoneCelebration.tsx
// Célébration d'un jalon à l'ouverture de l'accueil.
//
// Règles : au plus une par jour et par enfant ; jamais rejouée (marquée dès
// l'affichage) ; après le premier rendu (InteractionManager) ; jamais par-dessus
// l'alerte fièvre ni une feuille/modale déjà ouverte (le jalon n'est alors pas
// consommé : il reviendra à une prochaine ouverture). L'alerte fièvre qui
// arrive pendant la célébration la remplace.
// Lectures : voir findMilestoneForToday (une passe par enfant et par jour).

import { MilestoneCelebrationModal } from "@/components/suivibaby/MilestoneCelebrationModal";
import { useModal } from "@/contexts/ModalContext";
import { usePremium } from "@/contexts/PremiumContext";
import { useSheetState } from "@/contexts/SheetContext";
import {
  commitMilestoneShown,
  computeLongestNightSleepMin,
  computeStreak,
  findMilestoneForToday,
  type MilestoneCelebration,
} from "@/services/milestoneCelebrationService";
import { useEffect, useRef, useState } from "react";
import { InteractionManager } from "react-native";

interface Props {
  childId: string | null | undefined;
  childName?: string;
  /** Événements déjà chargés sur l'accueil : 7 derniers jours + temps réel du jour. */
  events: readonly any[];
  /** Vrai quand la semaine d'événements est chargée (sinon série et nuits seraient sous-estimées). */
  weeklyLoaded: boolean;
  /** Autre surface modale de l'accueil ouverte (guide, jalons, confirmation). */
  blocked: boolean;
}

export function HomeMilestoneCelebration({
  childId,
  childName,
  events,
  weeklyLoaded,
  blocked,
}: Props) {
  const { checkFeatureAccess, isLoading: premiumLoading } = usePremium();
  const { isOpen: sheetOpen } = useSheetState();
  const { hasOpenModal, subscribeProtectedModal } = useModal();
  const [shown, setShown] = useState<{ childId: string; milestone: MilestoneCelebration } | null>(null);

  // Premium : l'accès au jalon de série passe par la même porte que les autres
  // fonctions Premium de jalons (les anciens abonnés « grandfathered » exclus).
  const premium = checkFeatureAccess("milestones_capsule");

  // Valeurs lues au moment d'afficher, sans relancer l'effet à chaque rendu.
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const blockedRef = useRef(false);
  blockedRef.current = blocked || sheetOpen;

  useEffect(() => {
    if (!childId || !weeklyLoaded || premiumLoading || blocked || sheetOpen || shown) return;
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      const now = new Date();
      findMilestoneForToday({
        childId,
        premium,
        now,
        local: {
          currentStreak: computeStreak(eventsRef.current, now),
          longestNightSleepMin: computeLongestNightSleepMin(eventsRef.current),
        },
      })
        .then((selection) => {
          if (cancelled || !selection) return;
          // Dernière vérification : une alerte santé ou une feuille a pu s'ouvrir.
          if (blockedRef.current || hasOpenModal()) return;
          setShown({ childId, milestone: selection.milestone });
          commitMilestoneShown(childId, selection, now).catch(() => {});
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [childId, weeklyLoaded, premiumLoading, blocked, sheetOpen, premium, shown, hasOpenModal]);

  // L'alerte fièvre est prioritaire : elle prend la place de la célébration.
  useEffect(() => subscribeProtectedModal(() => setShown(null)), [subscribeProtectedModal]);

  const current = shown && shown.childId === childId ? shown.milestone : null;
  return (
    <MilestoneCelebrationModal
      milestone={current}
      childName={childName}
      onDismiss={() => setShown(null)}
    />
  );
}
