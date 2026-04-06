import { useReducedMotion } from "react-native-reanimated";

/**
 * Returns true if the user has enabled "Reduce Motion" in system settings.
 * Use this to conditionally skip or simplify animations.
 */
export function useReduceMotion(): boolean {
  return useReducedMotion() ?? false;
}
