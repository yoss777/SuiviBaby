// constants/featureFlags.ts
// Écrans d'aperçu internes (ex. croissance-fusion) : visibles en développement,
// ou dans un build interne dont la config porte `extra.showPreviews === true`
// (variable SHOW_PREVIEWS=true sur un profil EAS dédié, lue par app.config.js).
// Jamais dans un build de store par défaut.
import Constants from "expo-constants";

export function resolveShowPreviews(
  isDev: boolean,
  extra: Record<string, unknown> | undefined | null,
): boolean {
  return isDev || extra?.showPreviews === true;
}

export const SHOW_PREVIEWS = resolveShowPreviews(
  typeof __DEV__ !== "undefined" && __DEV__,
  Constants.expoConfig?.extra as Record<string, unknown> | undefined,
);

/** Routes d'aperçu temporaires (à supprimer avec leur écran). */
export const PREVIEW_ROUTES: ReadonlySet<string> = new Set(["/baby/croissance-fusion"]);

/** Une entrée de Plus pointant vers un aperçu n'apparaît que sous le drapeau. */
export function isPlusRouteVisible(route: string, showPreviews: boolean): boolean {
  return showPreviews || !PREVIEW_ROUTES.has(route);
}
