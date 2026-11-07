import {
  AccessibilityInfo,
  LayoutAnimation,
  type Animated,
  type LayoutAnimationConfig,
} from "react-native";

/**
 * Réglage système « Réduire les animations » (iOS) / « Supprimer les
 * animations » (Android) pour les animations React Native classiques
 * (Animated.loop, LayoutAnimation), qui ne le respectent pas d'elles-mêmes.
 *
 * Cache au niveau du module, initialisé une seule fois et tenu à jour par un
 * écouteur : les appels restent synchrones (utilisables dans un useEffect ou
 * un gestionnaire d'appui sans hook). Pour Reanimated, utiliser
 * `useReduceMotion` (hooks/useReduceMotion.ts).
 */
let reduceMotionEnabled = false;
let initialized = false;

function setReduceMotion(value: boolean) {
  reduceMotionEnabled = value;
}

export function initReduceMotion(): void {
  if (initialized) return;
  initialized = true;
  try {
    AccessibilityInfo.isReduceMotionEnabled?.()
      ?.then((v) => setReduceMotion(!!v))
      .catch(() => {});
    AccessibilityInfo.addEventListener?.("reduceMotionChanged", (v) =>
      setReduceMotion(!!v),
    );
  } catch {
    // Environnement sans AccessibilityInfo (tests) : animations conservées
  }
}

export function isReduceMotionEnabled(): boolean {
  initReduceMotion();
  return reduceMotionEnabled;
}

/** Réservé aux tests. */
export function __setReduceMotionForTests(value: boolean): void {
  initialized = true;
  reduceMotionEnabled = value;
}

/**
 * Démarre une animation en boucle sauf si l'utilisateur a demandé moins
 * d'animations : la valeur animée reste alors à sa valeur initiale (indicateur
 * de chargement visible mais statique). Renvoie l'animation pour que l'appelant
 * puisse toujours appeler `.stop()` au démontage.
 */
export function startLoop<T extends Animated.CompositeAnimation>(
  animation: T,
  reduceMotion: boolean = isReduceMotionEnabled(),
): T {
  if (!reduceMotion) animation.start();
  return animation;
}

/**
 * `LayoutAnimation.configureNext` ignoré quand les animations sont réduites :
 * le changement de mise en page s'applique alors immédiatement.
 */
export function configureLayoutAnimation(
  config: LayoutAnimationConfig = LayoutAnimation.Presets.easeInEaseOut,
  reduceMotion: boolean = isReduceMotionEnabled(),
): void {
  if (reduceMotion) return;
  LayoutAnimation.configureNext(config);
}

initReduceMotion();
