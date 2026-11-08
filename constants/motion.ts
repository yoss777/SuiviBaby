// constants/motion.ts — réglages communs des animations.
//
// Reanimated 4 (Expo 58) a changé les valeurs par défaut de withSpring : ressort
// « doux » sans rebond (damping 120, mass 4, stiffness 900) au lieu de celui de
// Reanimated 3 (damping 10, mass 1, stiffness 100). Toutes les animations de
// l'app ont été réglées avec l'ancien ressort : chaque withSpring part de cette
// base (un réglage partiel comme { damping: 12 } ne récupère donc pas la masse
// et la raideur de Reanimated 4).
import { Reanimated3DefaultSpringConfig } from "react-native-reanimated";

export const SPRING_V3 = Reanimated3DefaultSpringConfig;
