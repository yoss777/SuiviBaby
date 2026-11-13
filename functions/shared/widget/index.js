// functions/shared/widget/index.js
// Calcul des données du widget « Bébé maintenant ». UN SEUL code, utilisé par
// l'app (utils/widgetSnapshot.ts, hooks/useNowWidgetSync.ts) et par les Cloud
// Functions (temps réel, docs/strategie/widget/design/plan-temps-reel.md).
// Il vit dans functions/ parce que seul ce dossier est déployé (firebase.json).
//
// Règles : JavaScript CommonJS pur, AUCUN import (ni React, ni Expo, ni
// Firebase). Le temps local passe par `env` : heure locale du téléphone dans
// l'app (localEnv), fuseau IANA de l'appareil sur le serveur (zonedEnv).
//
// Règles produit (docs/strategie/widget/WIDGET_SPEC.md) :
// - toutes les sessions en cours sont listées (tétée, sommeil, promenade) ;
// - au repos : temps depuis le dernier repas, et le prochain sein quand il est
//   certain (dernière tétée sur un seul sein) ;
// - la journée est affichée pour tous ; Premium ajoute les rappels discrets
//   (sauf celui du repas, gratuit) ; aucune incitation à payer dans le widget ;
// - jamais d'auteur pour une tétée (seule la mère allaite).
"use strict";

const HOUR = 3600 * 1000;
const MEAL_GROUP_MS = 30 * 60 * 1000;
const CHANGE_GROUP_MS = 2 * 60 * 1000;
/** Nombre maximal d'événements du jour envoyés au widget. */
const WIDGET_RECENT_MAX = 15;

// ---------------------------------------------------------------------------
// Temps local

const pad = (n) => String(n).padStart(2, "0");

/** Heure locale du téléphone (app). */
const localEnv = {
  dayBounds(now) {
    const d = new Date(now);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    return [start, end];
  },
  clock(ms) {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  },
};

/** Fuseau IANA explicite (serveur), ex. « Europe/Paris ». Gère l'heure d'été. */
function zonedEnv(timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = (ms) => {
    const out = {};
    for (const p of fmt.formatToParts(new Date(ms))) if (p.type !== "literal") out[p.type] = Number(p.value);
    return out;
  };
  // Décalage du fuseau (ms) à l'instant ms.
  const offset = (ms) => {
    const p = parts(ms);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  };
  // Instant UTC du minuit local du jour (y, m, d) ; deux passes pour l'heure d'été.
  const midnight = (y, m, d) => {
    const guess = Date.UTC(y, m - 1, d);
    let ms = guess - offset(guess);
    ms = guess - offset(ms);
    return ms;
  };
  return {
    dayBounds(now) {
      const p = parts(now);
      return [midnight(p.year, p.month, p.day), midnight(p.year, p.month, p.day + 1)];
    },
    clock(ms) {
      const p = parts(ms);
      return `${pad(p.hour)}:${pad(p.minute)}`;
    },
  };
}

// ---------------------------------------------------------------------------
// Libellés et icônes du fil du jour

/** Emoji du type d'événement (fil du jour), à côté du libellé : le sens ne tient jamais à la seule icône. */
const EVENT_ICON = {
  tetee: "🤱",
  biberon: "🍼",
  solide: "🥣",
  miction: "💧",
  selle: "💩",
  vitamine: "💊",
  medicament: "💊",
  temperature: "🌡️",
  symptome: "🤒",
  vaccin: "💉",
  bain: "🛁",
  nettoyage_nez: "👃",
  pompage: "🥛",
  croissance: "📏",
  activite: "🧸",
  sieste: "😴",
  nuit: "🌙",
};

const ACTIVITY = {
  tummyTime: ["Tummy time", "🧸"],
  jeux: ["Jeux", "🧸"],
  lecture: ["Lecture", "📖"],
  promenade: ["Promenade", "🌳"],
  massage: ["Massage", "👐"],
  musique: ["Musique", "🎵"],
  eveil: ["Éveil", "🧸"],
  sortie: ["Sortie", "🌳"],
};

const text = (value) => (typeof value === "string" ? value.trim() : "");
const minutesLabel = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${pad(m % 60)}` : `${m} min`);

/**
 * Libellé court du fil du jour pour un événement hors repas et changes
 * (« Vitamine D », « Temp. 37,8 °C », « Sieste 1h20 »). null : non affiché
 * (session encore en cours, déjà montrée en tuile ; jalons).
 */
function otherEventLabel(e) {
  switch (e.type) {
    case "vitamine": {
      const name = text(e.nomVitamine);
      if (!name) return "Vitamines";
      return /^vit/i.test(name) ? name : `Vitamine ${name}`;
    }
    case "medicament":
      return text(e.nomMedicament) || "Médicament";
    case "temperature":
      return typeof e.valeur === "number" ? `Temp. ${e.valeur.toFixed(1).replace(".", ",")} °C` : "Température";
    case "symptome":
      return "Symptôme";
    case "vaccin": {
      const name = text(e.nomVaccin);
      return name ? `Vaccin ${name}` : "Vaccin";
    }
    case "bain":
      return "Bain";
    case "nettoyage_nez":
      return "Soin du nez";
    case "pompage":
      return "Tire-lait";
    case "croissance":
      return "Mesures";
    case "activite": {
      if (e.heureDebut != null && e.heureFin == null) return null;
      const label = (ACTIVITY[text(e.typeActivite)] || ["Activité"])[0];
      return typeof e.duree === "number" && e.duree > 0 ? `${label} ${minutesLabel(Math.round(e.duree))}` : label;
    }
    case "sommeil": {
      if (e.heureFin == null) return null;
      const label = e.isNap === false ? "Nuit" : "Sieste";
      return typeof e.duree === "number" && e.duree > 0 ? `${label} ${minutesLabel(Math.round(e.duree))}` : label;
    }
    default:
      return null;
  }
}

/** Emoji d'un événement hors repas et changes. */
function otherEventIcon(e) {
  if (e.type === "activite") return (ACTIVITY[text(e.typeActivite)] || [null, EVENT_ICON.activite])[1];
  if (e.type === "sommeil") return e.isNap === false ? EVENT_ICON.nuit : EVENT_ICON.sieste;
  return EVENT_ICON[e.type];
}

// ---------------------------------------------------------------------------
// Construction des props

const EMPTY_NOW_WIDGET = {
  v: 1,
  childName: "",
  live: null,
  lives: [],
  lastMealMs: null,
  lastMealLabel: null,
  lastMealKind: null,
  nextSide: null,
  isPremium: false,
  day: null,
  recent: [],
  alerts: { mealAtMs: null, diaperAtMs: null },
  dayStartMs: 0,
  generatedAtMs: 0,
};

/**
 * Version envoyée au natif : sans aucun `null` ni `undefined`, à aucun niveau.
 * Le pont Android d'expo-widgets (Map<String, Any?>) refuse une valeur nulle
 * dans un sous-objet. Le widget lit une clé absente comme « pas de valeur ».
 */
function toNativeWidgetProps(props) {
  return JSON.parse(JSON.stringify(props, (_key, value) => (value === null ? undefined : value)));
}

const EMPTY_NOW_WIDGET_NATIVE = toNativeWidgetProps(EMPTY_NOW_WIDGET);

/** « 4:10 » ou « 1:04:10 » (secondes). */
function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? pad(m) : String(m);
  const base = `${mm}:${pad(sec)}`;
  return h > 0 ? `${h}:${base}` : base;
}

const MEAL_LABEL = { tetee: "Tétée", biberon: "Biberon", solide: "Repas", autre: "Repas" };

/** Prochain sein, seulement quand il est certain : dernière tétée sur un seul sein. */
function nextSideFrom(lastNursing) {
  if (!lastNursing) return null;
  const left = lastNursing.leftMinutes > 0;
  const right = lastNursing.rightMinutes > 0;
  if (left && !right) return "D";
  if (right && !left) return "G";
  return null;
}

function nursingLive(state, now, env) {
  const side = state.runningSide;
  const left = state.leftSeconds + (side === "left" && state.runningSince ? (now - state.runningSince) / 1000 : 0);
  const right = state.rightSeconds + (side === "right" && state.runningSince ? (now - state.runningSince) / 1000 : 0);
  // Côté affiché : le côté actif ; en pause, celui qui a le plus de temps.
  const shown = side || (state.rightSeconds > state.leftSeconds ? "right" : "left");
  const shownBase = shown === "left" ? state.leftSeconds : state.rightSeconds;
  const otherSeconds = shown === "left" ? right : left;
  const timerStartMs = side && state.runningSince ? state.runningSince - shownBase * 1000 : now - shownBase * 1000;
  const startedAt = state.startedAt != null ? state.startedAt : timerStartMs;
  return {
    kind: "nursing",
    timerStartMs,
    pausedAtMs: side ? null : now,
    side: shown === "left" ? "G" : "D",
    otherSideLabel: otherSeconds >= 1 ? `${shown === "left" ? "D" : "G"} ${formatDuration(otherSeconds)}` : null,
    sinceMs: startedAt,
    sinceLabel: `depuis ${env.clock(startedAt)}`,
    alsoKind: null,
    nap: null,
  };
}

function simpleLive(kind, startMs, nap, env) {
  return {
    kind,
    timerStartMs: startMs,
    pausedAtMs: null,
    side: null,
    otherSideLabel: null,
    sinceMs: startMs,
    sinceLabel: `depuis ${env.clock(startMs)}`,
    alsoKind: null,
    nap: nap == null ? null : nap,
  };
}

/** Props du widget à partir d'une entrée déjà assemblée. */
function buildNowWidgetProps(input, env = localEnv) {
  const sessions = [];
  if (input.nursing) sessions.push(nursingLive(input.nursing, input.now, env));
  if (input.sleepStartMs != null) sessions.push(simpleLive("sleep", input.sleepStartMs, input.sleepIsNap, env));
  if (input.walkStartMs != null) sessions.push(simpleLive("walk", input.walkStartMs, null, env));
  const live = sessions[0] ? { ...sessions[0], alsoKind: sessions[1] ? sessions[1].kind : null } : null;
  const lives = sessions.map((session, index) => (index === 0 && live ? live : session));

  const { reminders } = input;
  const mealAtMs =
    reminders.enabled && reminders.repasHours > 0 && input.lastMeal ? input.lastMeal.ms + reminders.repasHours * HOUR : null;
  const diaperAtMs =
    input.isPremium && reminders.enabled && reminders.changesHours > 0 && input.day.lastDiaperMs != null
      ? input.day.lastDiaperMs + reminders.changesHours * HOUR
      : null;

  return {
    v: 1,
    childName: input.childName,
    live,
    lives,
    lastMealMs: input.lastMeal ? input.lastMeal.ms : null,
    lastMealLabel: input.lastMeal
      ? `${MEAL_LABEL[input.lastMeal.kind] || "Repas"} à ${env.clock(input.lastMeal.ms)}`
      : null,
    lastMealKind: input.lastMeal ? input.lastMeal.kind : null,
    nextSide: nextSideFrom(input.lastNursing),
    isPremium: input.isPremium,
    day: input.day,
    recent: [...(input.recent || [])].sort((a, b) => b.ms - a.ms).slice(0, WIDGET_RECENT_MAX),
    alerts: { mealAtMs, diaperAtMs },
    dayStartMs: env.dayBounds(input.now)[0],
    generatedAtMs: input.now,
  };
}

/** Nombre d'épisodes : des horodatages à moins de `gapMs` comptent pour un (repas 30 min, change 2 min). */
function countGroups(timestamps, gapMs) {
  const sorted = [...timestamps].sort((a, b) => a - b);
  let count = 0;
  let last = -Infinity;
  for (const ts of sorted) {
    if (ts - last > gapMs) {
      count++;
      last = ts;
    }
  }
  return count;
}

const isMealBottle = (e) => !e.typeBiberon || e.typeBiberon === "lait_maternel" || e.typeBiberon === "lait_infantile";

/**
 * Assemble l'entrée du widget à partir des événements bruts du bébé (chacun
 * avec `ms`, son heure en ms) : dernier repas, compteurs du jour, fil du jour.
 * Même résultat dans l'app et sur le serveur, à fuseau égal.
 */
function assembleNowWidgetInput(src, env = localEnv) {
  const now = src.now;
  const [dayStart, dayEnd] = env.dayBounds(now);
  const inToday = (ms) => ms >= dayStart && ms < dayEnd;
  const valid = (e) => Number.isFinite(e.ms);
  const tetees = (src.tetees || []).filter(valid);
  const biberons = (src.biberons || []).filter(valid);
  const solides = (src.solides || []).filter(valid);
  const mictions = (src.mictions || []).filter(valid);
  const selles = (src.selles || []).filter(valid);
  const others = (src.others || []).filter(valid);

  const mealBottles = biberons.filter(isMealBottle);
  const meals = [
    ...tetees.map((e) => ({ ms: e.ms, kind: "tetee" })),
    ...mealBottles.map((e) => ({ ms: e.ms, kind: "biberon" })),
    ...solides.map((e) => ({ ms: e.ms, kind: "solide" })),
  ];
  const lastMealEvent = meals.reduce((best, m) => (!best || m.ms > best.ms ? m : best), null);
  const lastMeal = lastMealEvent || (src.lastAbsoluteMealMs ? { ms: src.lastAbsoluteMealMs, kind: "autre" } : null);

  const lastTetee = [...tetees].sort((a, b) => b.ms - a.ms)[0];
  const changes = [...mictions, ...selles].map((e) => e.ms);
  const bottleMl = mealBottles
    .filter((e) => inToday(e.ms))
    .reduce((sum, e) => sum + (typeof e.quantite === "number" ? e.quantite : 0), 0);

  const recent = [
    ...tetees.map((e) => {
      const minutes = (e.dureeGauche || 0) + (e.dureeDroite || 0);
      return { ms: e.ms, kind: "meal", icon: EVENT_ICON.tetee, label: minutes > 0 ? `Tétée ${minutes} min` : "Tétée" };
    }),
    ...biberons.map((e) => ({
      ms: e.ms,
      kind: "meal",
      icon: EVENT_ICON.biberon,
      label: typeof e.quantite === "number" && e.quantite > 0 ? `Biberon ${e.quantite} ml` : "Biberon",
    })),
    ...solides.map((e) => ({ ms: e.ms, kind: "meal", icon: EVENT_ICON.solide, label: "Repas solide" })),
    ...mictions.map((e) => ({ ms: e.ms, kind: "diaper", icon: EVENT_ICON.miction, label: "Change · pipi" })),
    ...selles.map((e) => ({ ms: e.ms, kind: "diaper", icon: EVENT_ICON.selle, label: "Change · selle" })),
    ...others.flatMap((e) => {
      const label = otherEventLabel(e);
      return label ? [{ ms: e.ms, kind: "other", icon: otherEventIcon(e), label }] : [];
    }),
  ].filter((e) => inToday(e.ms));

  return {
    childName: src.childName,
    nursing: src.nursing || null,
    sleepStartMs: src.sleepStartMs != null ? src.sleepStartMs : null,
    sleepIsNap: src.sleepIsNap != null ? src.sleepIsNap : null,
    walkStartMs: src.walkStartMs != null ? src.walkStartMs : null,
    lastMeal,
    lastNursing: lastTetee ? { leftMinutes: lastTetee.dureeGauche || 0, rightMinutes: lastTetee.dureeDroite || 0 } : null,
    day: {
      mealsCount: countGroups(meals.map((m) => m.ms).filter(inToday), MEAL_GROUP_MS),
      bottleMl,
      lastMealMs: lastMeal ? lastMeal.ms : null,
      diapersCount: countGroups(changes.filter(inToday), CHANGE_GROUP_MS),
      lastDiaperMs: changes.length ? Math.max(...changes) : null,
      sleepMinutes: src.sleepTotalMinutes || 0,
    },
    recent,
    isPremium: !!src.isPremium,
    reminders: {
      enabled: !!src.reminders.enabled,
      repasHours: src.reminders.repasHours,
      changesHours: src.reminders.changesHours,
    },
    now,
  };
}

module.exports = {
  WIDGET_RECENT_MAX,
  MEAL_GROUP_MS,
  CHANGE_GROUP_MS,
  EVENT_ICON,
  EMPTY_NOW_WIDGET,
  EMPTY_NOW_WIDGET_NATIVE,
  localEnv,
  zonedEnv,
  otherEventLabel,
  otherEventIcon,
  toNativeWidgetProps,
  formatDuration,
  nextSideFrom,
  buildNowWidgetProps,
  countGroups,
  assembleNowWidgetInput,
};
