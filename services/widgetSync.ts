// services/widgetSync.ts
// Envoie les données du widget « Bébé maintenant » à l'extension (iOS) ou au
// widget Android. Jamais bloquant : sans module natif (Expo Go, tests, web),
// rien ne se passe. Anti-rebond de 2 s et envoi seulement si le contenu change,
// pour ne pas dépenser le budget de rechargement de WidgetKit ; immédiat au
// changement d'enfant et à la mise en arrière-plan.
import { AppState, Platform } from "react-native";

import { clearWidgetPush, noteAppSnapshot } from "@/modules/widget-push";
import { captureServiceError } from "@/utils/errorReporting";
import { takeWidgetUserAction } from "@/services/widgetUserAction";
import {
  EMPTY_NOW_WIDGET,
  EMPTY_NOW_WIDGET_NATIVE,
  type NowWidgetProps,
  toNativeWidgetProps,
} from "@/utils/widgetSnapshot";

export const WIDGET_SYNC_DEBOUNCE_MS = 2000;
/** Après un changement d'enfant, ses données arrivent par vagues : envois immédiats pendant ce délai. */
export const WIDGET_CHILD_SWITCH_WINDOW_MS = 15000;

type WidgetHandle = {
  updateSnapshot: (props: NowWidgetProps) => void;
  updateTimeline?: (entries: { date: Date; props: NowWidgetProps }[]) => void;
};

/**
 * iPhone : entrées de timeline. Le compteur natif d'iOS affiche toujours les
 * secondes ; pour « 45 min » / « 1h08 » (comme Android), l'app prépare une
 * entrée par minute pendant 1 h (à la minute de la pendule), puis toutes les 5 min jusqu'à 4 h : c'est la
 * fenêtre de comptage (`countingEndMs`). Au-delà, le widget reprend le
 * compteur natif (il ne reste jamais figé).
 * S'y ajoutent des entrées exactes, hors comptage : heure d'un rappel, minuit,
 * bascule Sieste/Nuit (8:00, 19:00) et expiration à 24 h (widget masqué).
 * Les entrées préparées ne consomment pas le budget de rechargement d'iOS.
 */
export function widgetTimelinePlan(props: NowWidgetProps, now = Date.now()): { dates: number[]; countingEndMs: number } {
  const dates = new Set<number>([now]);
  // Option D (jalon 4) : une entrée par minute seulement tant que c'est utile
  // (session en cours, repas ou change de moins d'une heure : « 45 min »
  // doit avancer à la minute, aligné sur l'Accueil). Le reste du temps, tout
  // affichage est au-delà d'une heure et « il y a » est arrondi à 5 min
  // (BebeMaintenant.ios.tsx) : une entrée toutes les 5 min suffit. ~70
  // entrées au lieu de ~123 quand rien ne bouge (préparation et batterie).
  const minuteUntil = minutePrecisionUntil(props, now);
  // Grille à la minute de la pendule (hh:mm:00) : les durées sont comptées « à
  // la pendule » (secondes du début ignorées), comme Android et l'Accueil ; une
  // seule grille, quel que soit le nombre de sessions en cours.
  const firstMinute = Math.floor(now / 60_000) * 60_000 + 60_000;
  for (let k = 0; k < 60; k++) {
    const t = firstMinute + k * 60_000;
    if (t <= minuteUntil) dates.add(t);
  }
  // Ensuite (et la première heure sans besoin de la minute) : toutes les
  // 5 min de la pendule (hh:00, hh:05…) jusqu'à 4 h.
  const firstFive = Math.floor(now / 300_000) * 300_000 + 300_000;
  for (let t = firstFive; t <= now + 4 * 3600_000; t += 300_000) {
    if (t > minuteUntil) dates.add(t);
  }
  const countingEndMs = Math.max(...dates);

  // Au-delà du comptage : une entrée par heure jusqu'à 24 h, sinon « il y a
  // 4h00 » (dernier repas, dernier change, « màj ») restait figé jusqu'à
  // l'entrée exacte suivante (parfois 10 h). Les chronos de session, eux,
  // passent au compteur natif.
  addExactEntries(dates, props, now, countingEndMs, 3600_000);
  return { dates: [...dates].sort((a, b) => a - b), countingEndMs };
}

/**
 * Jusqu'à quand une entrée par minute est utile (au plus 1 h) : session en
 * cours (chrono), ou repas / change de moins d'une heure (« il y a 45 min »).
 * Sinon `now` : aucune entrée à la minute.
 */
export function minutePrecisionUntil(props: NowWidgetProps, now: number): number {
  const cap = now + 60 * 60_000;
  const lives = props.lives ?? (props.live ? [props.live] : []);
  // Seules les sessions qui avancent : pas une tétée en pause (chrono figé).
  // Une session « oubliée ? » avance toujours (chrono et total de sommeil) :
  // seul son style change, elle reste comptée à la minute.
  const ticking = lives.some(
    (l) => l.pausedAtMs == null && !(typeof l.expiresAtMs === "number" && l.expiresAtMs <= now),
  );
  if (ticking) return cap;
  let until = now;
  for (const ms of [props.lastMealMs, props.day?.lastDiaperMs]) {
    if (typeof ms === "number" && Number.isFinite(ms) && now - ms < 3600_000) {
      // Minute de la pendule où « il y a » atteint 1 h (puis arrondi à 5 min).
      until = Math.max(until, Math.floor(ms / 60_000) * 60_000 + 3600_000);
    }
  }
  return Math.min(until, cap);
}

/**
 * Entrées exactes (hors comptage), dans les 24 h : une toutes les `stepMs`
 * après `fromMs`, rappel qui passe au rouge, session « oubliée ? », minuit, bascule Sieste/Nuit,
 * expiration à 24 h.
 */
function addExactEntries(dates: Set<number>, props: NowWidgetProps, now: number, fromMs: number, stepMs: number | null): void {
  const horizon = now + 24 * 3600_000 + 2 * 60_000;
  const exact = (ms: number | null | undefined) => {
    if (typeof ms === "number" && Number.isFinite(ms) && ms > now && ms <= horizon) dates.add(ms);
  };
  if (stepMs) for (let t = fromMs + stepMs; t < horizon; t += stepMs) exact(t);
  // Rappel qui passe au rouge.
  exact(props.alerts?.mealAtMs);
  exact(props.alerts?.diaperAtMs);
  // Session oubliée ? : la tuile passe à l'ambre à l'instant dit.
  // et session expirée (tétée en pause trop longue) : retirée à l'instant dit.
  for (const l of props.lives ?? (props.live ? [props.live] : [])) {
    exact(l.staleAtMs);
    exact(l.expiresAtMs);
  }
  // Minuit local (compteurs du jour masqués) et bascule Sieste/Nuit.
  const d = new Date(now);
  for (const [plusDay, h] of [[1, 0], [0, 8], [0, 19], [1, 8]] as const) {
    exact(new Date(d.getFullYear(), d.getMonth(), d.getDate() + plusDay, h).getTime());
  }
  // Données de plus de 2 h : « màj HH:MM » et grisé (BebeMaintenant.ios.tsx).
  if (props.generatedAtMs) exact(props.generatedAtMs + 2 * 3600_000 + 1000);
  // Expiration à 24 h : widget masqué (BebeMaintenant.ios.tsx).
  if (props.generatedAtMs) exact(props.generatedAtMs + 24 * 3600_000 + 60_000);
}

/**
 * iPhone : timeline courte (maintenant + 8 minutes de la pendule), écrite au
 * démarrage ou à l'arrêt d'une session. iOS prépare chaque entrée avant
 * d'afficher la première : avec ~120 entrées, l'appui mettait plus de 5 s à
 * se voir (mesuré sur iPhone 13, 16/11). La timeline complète suit
 * (`WIDGET_IOS_FULL_TIMELINE_DELAY_MS`), ou au retour dans l'app si celle-ci a
 * été quittée avant. Entre-temps, la courte reste juste là où ça compte :
 * chronos au compteur natif après 8 min, rappel au rouge, minuit,
 * Sieste/Nuit, expiration à 24 h ; seuls les « il y a » attendent la
 * complète. ~15 entrées au lieu de ~120 (29 restait lent, mesuré le 16/11).
 */
export const WIDGET_IOS_QUICK_ENTRIES = 8;
export function widgetQuickTimelinePlan(props: NowWidgetProps, now = Date.now()): { dates: number[]; countingEndMs: number } {
  const dates = new Set<number>([now]);
  const firstMinute = Math.floor(now / 60_000) * 60_000 + 60_000;
  for (let k = 0; k < WIDGET_IOS_QUICK_ENTRIES; k++) dates.add(firstMinute + k * 60_000);
  const countingEndMs = firstMinute + (WIDGET_IOS_QUICK_ENTRIES - 1) * 60_000;
  addExactEntries(dates, props, now, countingEndMs, null);
  return { dates: [...dates].sort((a, b) => a - b), countingEndMs };
}

/** Dates seules (tests, compatibilité). */
export function widgetTimelineDates(props: NowWidgetProps, now = Date.now()): number[] {
  return widgetTimelinePlan(props, now).dates;
}

let handle: WidgetHandle | null | undefined;
let lastKey = "";
// Sessions affichées au dernier envoi (démarrage, arrêt, pause) : écrites sans
// attendre, l'appui sur le widget doit se voir tout de suite.
let lastLivesSig: string | null = null;
export function livesSignature(props: NowWidgetProps): string {
  return JSON.stringify((props.lives ?? []).map((l) => [l.kind, l.timerStartMs, l.pausedAtMs ?? null]));
}
let pending: ReturnType<typeof setTimeout> | null = null;
// Une seule remontée par session et par opération (pas de bruit à chaque envoi).
const reported = new Set<string>();
function reportOnce(error: unknown, operation: string): void {
  if (reported.has(operation)) return;
  reported.add(operation);
  captureServiceError(error, { service: "widgetSync", operation });
}

function getWidget(): WidgetHandle | null {
  if (handle !== undefined) return handle;
  if (Platform.OS !== "ios" && Platform.OS !== "android") {
    handle = null;
    return handle;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    handle = require("@/widgets/BebeMaintenant").default as WidgetHandle;
  } catch (error) {
    if (__DEV__) console.warn("[widget] module indisponible", error);
    reportOnce(error, "load");
    handle = null;
  }
  return handle;
}

/** Contenu comparé (sans l'horodatage de génération). */
export function widgetContentKey(props: NowWidgetProps): string {
  const { generatedAtMs: _ignored, ...content } = props;
  return JSON.stringify(content);
}

let lastChildId: string | undefined;
/**
 * Écritures suspendues (déconnexion) : un rendu de l'Accueil pendant la
 * déconnexion ne réaffiche pas le prénom ni les données. Reprise à la
 * prochaine connexion (resumeWidgetWrites).
 */
let writesSuspended = false;
export function resumeWidgetWrites(): void {
  writesSuspended = false;
}
/** Jour calendaire (local) du dernier contenu écrit dans le widget. */
let lastWrittenDay = "";
const dayOf = (ms: number) => new Date(ms).toDateString();
let childSwitchedAt = 0;
let pendingRun: (() => void) | null = null;
/** L'envoi en attente est un contenu « pas encore chargé » : jamais forcé. */
let pendingUnloaded = false;

/**
 * iPhone, retour dans l'app (jalon 4) : la timeline complète n'est pas
 * réécrite si le contenu n'a pas changé et qu'elle date de moins de 30 min
 * (ses entrées couvrent encore la première heure). Avant : 15 à 30
 * réécritures lourdes par jour pour rien.
 */
export const WIDGET_IOS_FRESH_TIMELINE_MS = 30 * 60_000;
let lastFullTimelineAt = 0;
/** Contenu écrit par l'app avant le retour au premier plan (iPhone). */
let keyBeforeInvalidate = "";

/** Délai avant la timeline complète, après une timeline courte (iPhone). */
export const WIDGET_IOS_FULL_TIMELINE_DELAY_MS = 4000;
let fullTimelineTimer: ReturnType<typeof setTimeout> | null = null;
/** Timeline complète due après une courte (contenu, widget). */
let pendingFull: { props: NowWidgetProps; widget: WidgetHandle } | null = null;
function cancelFullTimeline(): void {
  if (fullTimelineTimer) clearTimeout(fullTimelineTimer);
  fullTimelineTimer = null;
  pendingFull = null;
}
/**
 * Programme la complète due. Un envoi en attente (anti-rebond) l'écrira et
 * l'annulera ; s'il est abandonné sans écrire, la complète repasse ensuite.
 */
function scheduleFullTimeline(delayMs: number): void {
  if (fullTimelineTimer) clearTimeout(fullTimelineTimer);
  fullTimelineTimer = setTimeout(() => {
    fullTimelineTimer = null;
    if (!pendingFull) return;
    if (pending) {
      scheduleFullTimeline(WIDGET_SYNC_DEBOUNCE_MS + 500);
      return;
    }
    runPendingFull();
  }, delayMs);
}
/** Écrit tout de suite la timeline complète due. */
function runPendingFull(): void {
  const due = pendingFull;
  cancelFullTimeline();
  if (!due || writesSuspended) return;
  try {
    writeIosTimeline(due.widget, due.props);
  } catch (error) {
    reportOnce(error, "fullTimeline");
  }
}

function writeIosTimeline(widget: WidgetHandle, props: NowWidgetProps, quick = false): void {
  const { dates, countingEndMs } = quick ? widgetQuickTimelinePlan(props) : widgetTimelinePlan(props);
  // Fin du comptage à la minute = la dernière entrée de comptage (4 h), PAS
  // la dernière entrée : dès elle, le widget reprend le compteur natif. Avec
  // l'expiration (24 h) ou une marge, le chrono restait figé (« 4h00 »).
  const timelineProps = toNativeWidgetProps({ ...props, timelineEndMs: countingEndMs });
  widget.updateTimeline!(dates.map((ms) => ({ date: new Date(ms), props: timelineProps })));
  lastFullTimelineAt = quick ? 0 : Date.now();
}

/**
 * iPhone : données reçues du serveur (notification silencieuse, app en
 * arrière-plan). Pas notées comme écriture de l'app ; la prochaine écriture
 * de l'app repart d'une clé vide (contenu jamais ignoré comme « identique »).
 */
export function writeServerWidgetProps(props: NowWidgetProps): boolean {
  if (writesSuspended) return false;
  const widget = getWidget();
  if (!widget?.updateTimeline || props.loading) return false;
  try {
    // Données du serveur plus récentes : la timeline complète en attente
    // (contenu de l'app) ne doit pas les remplacer.
    cancelFullTimeline();
    writeIosTimeline(widget, props);
    lastKey = "";
    // Le widget montre maintenant le contenu du serveur : le retour dans l'app
    // doit le réécrire avec celui de l'app.
    keyBeforeInvalidate = "";
    // Sessions affichées par l'envoi serveur : un démarrage ou un arrêt qui suit
    // reste écrit tout de suite.
    lastLivesSig = livesSignature(props);
    return true;
  } catch (error) {
    reportOnce(error, "serverTimeline");
    return false;
  }
}

function write(props: NowWidgetProps, key: string, opts: { quick?: boolean } = {}): void {
  if (writesSuspended) return;
  const widget = getWidget();
  if (!widget) return;
  cancelFullTimeline();
  try {
    // Android : noté AVANT l'écriture, pour qu'un message serveur arrivé
    // entre les deux ne revienne jamais avant elle, ni sur un autre bébé.
    if (props.childId) noteAppSnapshot(props.childId);
    if (Platform.OS === "ios" && widget.updateTimeline && !props.loading) {
      writeIosTimeline(widget, props, opts.quick);
      if (opts.quick) {
        // Annulée par toute écriture suivante, l'effacement ou un envoi serveur.
        pendingFull = { props, widget };
        scheduleFullTimeline(WIDGET_IOS_FULL_TIMELINE_DELAY_MS);
      }
    } else {
      widget.updateSnapshot(toNativeWidgetProps(props));
      // Plus de timeline complète affichée (chargement…) : pas de saut au retour.
      lastFullTimelineAt = 0;
    }
    lastKey = key;
    keyBeforeInvalidate = "";
    lastLivesSig = props.loading ? null : livesSignature(props);
    lastWrittenDay = dayOf(Date.now());
    if (props.childId !== lastChildId) childSwitchedAt = Date.now();
    lastChildId = props.childId;
    if (__DEV__) console.log(`[widget] envoyé : ${props.childName}${props.loading ? " · chargement" : props.live ? ` · ${props.live.kind}` : ""}`);
  } catch (error) {
    // Extension indisponible : on réessaiera au prochain changement.
    if (__DEV__) console.warn("[widget] envoi impossible", error);
    reportOnce(error, "updateSnapshot");
  }
}

/**
 * Envoi au widget. Anti-rebond de 2 s, sauf :
 * - enfant affiché changé, ou données qui arrivent juste après (15 s) ;
 * - session démarrée, arrêtée ou mise en pause (retour visible tout de suite) ;
 * - app hors premier plan : Android y suspend les minuteries JS, un envoi
 *   différé ne partirait qu'au retour dans l'app.
 */
/**
 * Données manifestement pas encore chargées : un repas ou un change dans les
 * dernières 24 h (fiche de l'enfant) mais un fil vide et des compteurs à 0.
 * Au lancement, l'écouteur peut livrer un cache vide avant la réponse du
 * serveur ; le widget affichait alors « 0 repas » quelques secondes.
 */
export function looksUnloaded(props: NowWidgetProps, now = Date.now()): boolean {
  const day = props.day;
  if (!day || (props.recent?.length ?? 0) > 0 || (props.lives?.length ?? 0) > 0) return false;
  if (day.mealsCount > 0 || day.diapersCount > 0 || day.sleepMinutes > 0) return false;
  const recentMs = [props.lastMealMs, day.lastDiaperMs].filter((ms): ms is number => typeof ms === "number");
  return recentMs.some((ms) => now - ms < 24 * 3600 * 1000);
}

/** Attente avant d'écrire un contenu « pas encore chargé » (remplacé si les données arrivent). */
export const WIDGET_UNLOADED_GRACE_MS = 5000;

export function pushNowWidget(props: NowWidgetProps): void {
  const key = widgetContentKey(props);
  if (key === lastKey) {
    // Retour au contenu déjà affiché : l'envoi en attente (intermédiaire)
    // n'a plus lieu d'être, sinon il écrirait un état périmé dans 2 s.
    cancelPendingWidgetPush();
    return;
  }
  cancelPendingWidgetPush();
  // iPhone, retour dans l'app sans changement : la timeline complète écrite il
  // y a moins de 30 min reste juste, on ne la réécrit pas. (Chargement puis
  // contenu identique : couvert par l'égalité des clés, le widget l'affiche déjà.)
  if (
    keyBeforeInvalidate !== "" &&
    key === keyBeforeInvalidate &&
    !pendingFull &&
    lastFullTimelineAt > 0 &&
    // Horloge du téléphone reculée (fuseau, réglage manuel) : on réécrit.
    Date.now() >= lastFullTimelineAt &&
    Date.now() - lastFullTimelineAt < WIDGET_IOS_FRESH_TIMELINE_MS &&
    lastWrittenDay === dayOf(Date.now())
  ) {
    lastKey = key;
    keyBeforeInvalidate = "";
    return;
  }
  if (looksUnloaded(props)) {
    // Hors premier plan, la réponse du serveur ne peut plus arriver (réseau
    // suspendu) : le délai expirait et écrivait « 0 repas » au passage en
    // arrière-plan. Le widget garde ses données précédentes, plus justes.
    // Exception : le widget montre encore un autre jour (minuit passé) ; les
    // compteurs d'hier seraient faux aussi, on écrit le nouveau jour tout de
    // suite (minuteries suspendues hors premier plan).
    if (AppState.currentState !== "active") {
      if (lastWrittenDay && lastWrittenDay !== dayOf(Date.now())) write(props, key);
      return;
    }
    // Écrit seulement si rien de mieux n'arrive entre-temps (vraie journée vide).
    pendingUnloaded = true;
    pendingRun = () => write(props, key);
    pending = setTimeout(() => {
      pending = null;
      const run = pendingRun;
      pendingRun = null;
      run?.();
    }, WIDGET_UNLOADED_GRACE_MS);
    return;
  }
  const livesChanged = lastLivesSig != null && livesSignature(props) !== lastLivesSig;
  // Saisie de l'utilisateur à l'instant (repas, change…) : écrite tout de suite,
  // en timeline courte sur iPhone, comme un démarrage ou un arrêt de session.
  // Une seule écriture immédiate par saisie (voir takeWidgetUserAction).
  const userAction = takeWidgetUserAction();
  const immediate =
    props.childId !== lastChildId ||
    lastKey.includes('"loading":true') ||
    Date.now() - childSwitchedAt < WIDGET_CHILD_SWITCH_WINDOW_MS ||
    AppState.currentState !== "active" ||
    livesChanged ||
    userAction;
  if (immediate) {
    // Démarrage / arrêt dans l'app au premier plan : timeline courte d'abord
    // (affichage rapide sur iPhone), la complète ensuite.
    write(props, key, { quick: (livesChanged || userAction) && AppState.currentState === "active" });
    return;
  }
  pendingRun = () => write(props, key);
  pending = setTimeout(() => {
    pending = null;
    const run = pendingRun;
    pendingRun = null;
    run?.();
  }, WIDGET_SYNC_DEBOUNCE_MS);
}

/**
 * Enfant changé, données pas encore chargées : le widget montre tout de suite
 * le nouveau prénom avec « Mise à jour… », jamais l'ancien enfant.
 */
export function pushNowWidgetLoading(childId: string, childName: string): void {
  if (lastChildId === childId) return;
  pushNowWidget({ ...EMPTY_NOW_WIDGET, childId, childName, loading: true, generatedAtMs: Date.now() });
}

/** App mise en arrière-plan : l'envoi en attente part maintenant (pas dans 2 s). */
export function flushPendingWidgetPush(): void {
  // iPhone : timeline complète encore due (saisie puis départ avant 4 s).
  // Le minuteur ne tourne plus une fois l'app suspendue : sans elle, le
  // widget n'a plus d'entrée au-delà de 8 min et les « il y a » restent figés.
  if (!pending) {
    if (pendingFull) runPendingFull();
    return;
  }
  // Contenu « pas encore chargé » : on ne le force pas en partant, le widget
  // garde ses données précédentes (plus justes).
  if (pendingUnloaded) return;
  clearTimeout(pending);
  pending = null;
  const run = pendingRun;
  pendingRun = null;
  run?.();
  // L'envoi qui vient de partir a pu être une courte : la complète part aussi.
  if (pendingFull) runPendingFull();
}

/**
 * Oublie le dernier contenu envoyé : le récepteur natif a pu réécrire le
 * widget entre-temps (message serveur), l'app doit pouvoir le réécrire même
 * à contenu égal. Appelé au retour au premier plan.
 */
export function invalidateWidgetKey(): void {
  // Timeline complète restée due (app quittée avant 4 s) : l'envoi qui suit le
  // retour l'écrit (et l'annule) ; sinon (écran pas prêt) elle part après
  // l'anti-rebond. Jamais deux timelines lourdes coup sur coup.
  if (pendingFull) scheduleFullTimeline(WIDGET_SYNC_DEBOUNCE_MS + 1000);
  // iPhone : contenu de l'app encore affiché (aucun envoi serveur depuis).
  if (Platform.OS === "ios" && lastKey !== "") keyBeforeInvalidate = lastKey;
  // Seule la clé de contenu : la signature des sessions garde l'écriture
  // immédiate d'un démarrage ou d'un arrêt au retour au premier plan.
  lastKey = "";
}

/** Annule l'envoi en attente (changement de bébé, données pas encore prêtes). */
export function cancelPendingWidgetPush(): void {
  if (pending) clearTimeout(pending);
  pending = null;
  pendingRun = null;
  pendingUnloaded = false;
}

/**
 * Déconnexion : le widget ne doit plus montrer le prénom ni les données de
 * santé de l'enfant sur un téléphone partagé. Immédiat (pas d'anti-rebond).
 */
/** @returns vrai si le widget a bien été vidé. */
export function clearNowWidget(opts: { suspend?: boolean } = {}): boolean {
  if (opts.suspend) writesSuspended = true;
  cancelPendingWidgetPush();
  cancelFullTimeline();
  lastKey = "";
  keyBeforeInvalidate = "";
  lastFullTimelineAt = 0;
  lastLivesSig = null;
  lastChildId = undefined;
  clearWidgetPush();
  const widget = getWidget();
  if (!widget) return false;
  try {
    widget.updateSnapshot(EMPTY_NOW_WIDGET_NATIVE);
    return true;
  } catch (error) {
    if (__DEV__) console.warn("[widget] effacement impossible", error);
    reportOnce(error, "clear");
    return false;
  }
}

/** Tests uniquement. */
export function __resetWidgetSyncForTests(widget?: WidgetHandle | null): void {
  handle = widget === undefined ? undefined : widget;
  lastKey = "";
  keyBeforeInvalidate = "";
  lastFullTimelineAt = 0;
  lastLivesSig = null;
  lastChildId = undefined;
  lastWrittenDay = "";
  writesSuspended = false;
  childSwitchedAt = 0;
  reported.clear();
  cancelPendingWidgetPush();
  cancelFullTimeline();
}
