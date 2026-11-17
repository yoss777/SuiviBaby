/**
 * Action de l'utilisateur (saisie, modification, suppression, échec annulé) :
 * le widget est écrit tout de suite, sans l'anti-rebond de 2 s réservé aux
 * vagues de données venues du serveur. Module sans dépendance (évite un
 * cycle entre le store optimiste et widgetSync).
 */
export const WIDGET_USER_ACTION_WINDOW_MS = 3000;
let until = 0;

export function markWidgetUserAction(nowMs = Date.now()): void {
  until = nowMs + WIDGET_USER_ACTION_WINDOW_MS;
}

export function isWidgetUserActionRecent(nowMs = Date.now()): boolean {
  return nowMs < until;
}

/** Tests uniquement. */
export function __resetWidgetUserActionForTests(): void {
  until = 0;
}
