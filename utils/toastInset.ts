// utils/toastInset.ts
// Où poser un toast du bas. L'inset de la barre d'onglets (et du dock vocal)
// ne vaut que lorsque les onglets sont réellement à l'écran : sur un écran
// empilé par-dessus (Réglages, Partager, modales de pile), les onglets restent
// montés mais masqués, et le toast doit revenir à la zone de sécurité du bas.

export const TOAST_GAP = 12;
export const TOAST_SAFE_AREA_MARGIN = 24;

/** Hauteur du chrome du bas à déclarer pour les toasts (0 = aucun). */
export function resolveTabChromeInset({
  focused,
  keyboardVisible,
  tabBarHeight,
  dockInset,
}: {
  /** L'écran à onglets est-il l'écran au premier plan ? */
  focused: boolean;
  /** Le clavier masque la barre d'onglets. */
  keyboardVisible: boolean;
  tabBarHeight: number;
  dockInset: number;
}): number {
  if (!focused || keyboardVisible || tabBarHeight <= 0) return 0;
  return tabBarHeight + Math.max(0, dockInset);
}

/** Distance du toast au bas de l'écran. */
export function toastBottomOffset({
  chromeInset,
  safeAreaBottom,
}: {
  chromeInset: number;
  safeAreaBottom: number;
}): number {
  return chromeInset > 0
    ? chromeInset + TOAST_GAP
    : safeAreaBottom + TOAST_SAFE_AREA_MARGIN;
}
