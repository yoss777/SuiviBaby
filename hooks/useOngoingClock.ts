// hooks/useOngoingClock.ts
//
// Horloge à la minute PARTAGÉE, réservée aux composants qui affichent un temps
// écoulé (sieste ou promenade en cours dans le journal). Le journal ne garde
// plus de `currentTime` dans son état : avant, chaque minute re-rendait l'écran
// puis toutes les lignes (la prop changeait pour tout le monde). Ici seule la
// ligne qui s'abonne (`enabled`) se re-rend ; les autres ne payent rien.
//
// Un seul minuteur pour tous les abonnés, recalé sur la minute pleine, démarré
// au premier abonné et arrêté au dernier. Au retour au premier plan, l'heure
// est re-synchronisée (les libellés ne mentent pas après un long arrière-plan).

import { useCallback, useSyncExternalStore } from "react";
import { AppState } from "react-native";

let now = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let appStateSub: { remove: () => void } | null = null;

function emit() {
  now = Date.now();
  listeners.forEach((l) => l());
}

function scheduleNext() {
  if (timer) clearTimeout(timer);
  const d = new Date();
  const msUntilNextMinute = (60 - d.getSeconds()) * 1000 - d.getMilliseconds();
  timer = setTimeout(() => {
    emit();
    scheduleNext();
  }, msUntilNextMinute);
}

function start() {
  now = Date.now();
  scheduleNext();
  appStateSub = AppState.addEventListener("change", (state) => {
    if (state !== "active") return;
    emit();
    scheduleNext();
  });
}

function stop() {
  if (timer) clearTimeout(timer);
  timer = null;
  appStateSub?.remove();
  appStateSub = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

const noopSubscribe = () => () => {};
// Sans abonné, `now` n'est plus tenu à jour (aucun minuteur) : au premier rendu
// après une longue pause il serait périmé. On le rafraîchit s'il a plus d'une
// seconde (valeur stable le temps d'un rendu, comme l'exige useSyncExternalStore).
const STALE_NOW_MS = 1000;
const getNow = () => {
  if (listeners.size === 0) {
    const current = Date.now();
    if (current - now > STALE_NOW_MS) now = current;
  }
  return now;
};
const getZero = () => 0;

/** Nombre d'abonnés actifs (tests). */
export function __ongoingClockListenerCount() {
  return listeners.size;
}

/**
 * Renvoie l'heure courante (ms), rafraîchie chaque minute, UNIQUEMENT si
 * `enabled`. Désactivé : aucun abonnement, aucun re-rendu, renvoie 0.
 */
export function useOngoingClock(enabled: boolean): number {
  const sub = useCallback(
    (l: () => void) => (enabled ? subscribe(l) : noopSubscribe()),
    [enabled],
  );
  return useSyncExternalStore(sub, enabled ? getNow : getZero, enabled ? getNow : getZero);
}
