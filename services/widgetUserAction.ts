/**
 * Action de l'utilisateur (saisie, modification, suppression, échec annulé) :
 * le widget est écrit tout de suite, sans l'anti-rebond de 2 s réservé aux
 * vagues de données venues du serveur. Module sans dépendance (évite un
 * cycle entre le store optimiste et widgetSync).
 */
export const WIDGET_USER_ACTION_WINDOW_MS = 3000;
let until = 0;
// Génération de la saisie : deux saisies à la même milliseconde (suppression
// puis ajout) restent deux saisies.
let gen = 0;

export function markWidgetUserAction(nowMs = Date.now()): void {
  until = nowMs + WIDGET_USER_ACTION_WINDOW_MS;
  gen += 1;
}

// Une saisie ne déclenche qu'une écriture immédiate (timeline courte sur
// iPhone) : l'affichage optimiste puis la confirmation du serveur, dans la
// même fenêtre, en déclenchaient deux (jalon 4). La suivante passe par
// l'anti-rebond.
let takenGen = 0;
export function takeWidgetUserAction(nowMs = Date.now()): boolean {
  if (nowMs >= until || takenGen === gen) return false;
  takenGen = gen;
  return true;
}

/** Tests uniquement. */
export function __resetWidgetUserActionForTests(): void {
  until = 0;
  gen = 0;
  takenGen = 0;
}
