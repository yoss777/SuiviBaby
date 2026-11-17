// widgets/BebeMaintenant.android.tsx
// Widget Android « Bébé maintenant » (expo-widgets, Jetpack Glance via @expo/ui).
// Design : synthèse des propositions de docs/strategie/widget/design/ (base
// UI/UX Pro Max, couleurs vérifiées AA par la proposition accessibilité).
//
// Règles visuelles :
// - un fond teinté avec un gros chrono = une session tourne ; toutes les
//   sessions en cours sont affichées (tétée, sommeil, promenade), chacune avec
//   son chrono natif qui défile seul (nœud ChronometerView, patch expo-widgets) ;
// - on lit le nom de la session, puis le chrono, puis « depuis 14:32 » ;
// - durées à la minute comme sur l'Accueil (« 45 min », « 1h08 »), sauf la
//   tétée qui garde les secondes ; « Sieste » ou « Nuit » pour le sommeil ;
// - au repos, pas de fond : repas toujours à gauche, change à droite ; la durée
//   « il y a » en grand (la question de la nuit), l'heure en petit dessous ;
// - un rappel réglé est annoncé avant d'être dépassé (« rappel à 16:30 ») ;
// - après minuit, les compteurs de la veille sont masqués jusqu'au prochain envoi ;
// - la journée est une colonne de texte neutre ; le rouge ne sert qu'aux
//   rappels dépassés, toujours avec le mot « rappel ».
//
// Contraintes : tout est déclaré dans la fonction « widget » (runtime isolé).
// Pas de weight dans Glance : les largeurs sont calculées depuis la taille réelle
// du widget (widthDp / heightDp, transmis par le patch expo-widgets).
import { Box, Column, LazyColumn, Row, Spacer, Text } from "@expo/ui/jetpack-compose";
import {
  background,
  cornerRadius,
  createModifier,
  fillMaxSize,
  height,
  padding,
  paddingAll,
  semantics,
  size,
  width,
} from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import {
  EMPTY_NOW_WIDGET_NATIVE,
  type NowWidgetProps,
  type WidgetEventIcon,
  type WidgetLive,
} from "@/utils/widgetSnapshot";

const BebeMaintenant = (props: NowWidgetProps, environment: WidgetEnvironment) => {
  "widget";
  const dark = environment.colorScheme === "dark";
  // Échelle de police du système (patch expo-widgets) : les hauteurs et largeurs
  // fixes suivent le texte ; dès 1,3, présentation compacte.
  const FS = Math.min(2, (environment as WidgetEnvironment & { fontScale?: number }).fontScale ?? 1);
  const S = (v: number) => Math.ceil(v * FS);
  const C = {
    bg: dark ? "#1f2937" : "#ffffff",
    strong: dark ? "#f9fafb" : "#1f2937",
    soft: dark ? "#9ca3af" : "#6b7280",
    softOnTile: dark ? "#d1d5db" : "#4b5563",
    rule: dark ? "#374151" : "#e5e7eb",
    alert: dark ? "#f87171" : "#b91c1c",
    // Pastille du prénom : teinte de marque, contraste AA.
    pillBg: dark ? "#1e3a5f" : "#e0f0f5",
    pillText: dark ? "#bfdbfe" : "#075f80",
  };
  // Accent (pastille), tuile (session en cours) et texte de catégorie (AA).
  const CAT = {
    nursing: { label: "Tétée", short: "Tétée", dot: "#D66B8F", tile: dark ? "#393243" : "#FBE1EA", text: dark ? "#E88FAE" : "#A63D62" },
    sleep: { label: "Sommeil", short: "Sommeil", dot: "#7C6BA4", tile: dark ? "#2c3246" : "#ECE8F4", text: dark ? "#A898D0" : "#5B4A85" },
    walk: { label: "Balade", short: "Balade", dot: "#8BC46B", tile: dark ? "#2e3f3e" : "#E6F2DE", text: dark ? "#8BC46B" : "#386F26" },
    meal: { dot: "#E8785A", text: dark ? "#E8785A" : "#A83F23" },
    diaper: { dot: "#5BA4A4", text: dark ? "#5BA4A4" : "#2B6A6A" },
  };
  // Pastilles du fil : couleur du type, comme la frise de l'Accueil
  // (itemColors). Le libellé porte toujours le sens.
  const TYPE_COLOR: Record<WidgetEventIcon, string> = {
    tetee: "#D66B8F",
    biberon: "#E8785A",
    solide: "#E89A5A",
    pompage: "#6BA47C",
    croissance: "#E8C45A",
    miction: "#5BA4A4",
    selle: "#A47C5B",
    medicament: "#5A8BE8",
    temperature: "#E85A5A",
    symptome: "#E85A8B",
    vaccin: "#8B7CB4",
    bain: "#5AADE8",
    nez: "#6BA4A4",
    activite: "#8BC46B",
    jalon: "#E8A85A",
    sieste: "#7C6BA4",
    nuit: "#5A6BA4",
  };
  // Chrono natif Android (défile seul, même app fermée).
  const Chrono = "ChronometerView" as unknown as (p: {
    startMs: number;
    pausedAtMs?: number;
    color: string;
    fontSize: number;
  }) => null;
  // Durée à la minute (« 45 min », « 1h08 ») qui avance seule : sommeil,
  // promenade, « il y a ». Les secondes restent pour la tétée.
  const Elapsed = "ElapsedClockView" as unknown as (p: {
    startMs: number;
    pattern: string;
    color: string;
    fontSize: number;
  }) => null;
  // Redessin programmé (passage à 1 h, rappel dépassé) : ne rend rien.
  const RefreshAt = "RefreshAtView" as unknown as (p: { atMs: number }) => null;
  const HOUR = 3600 * 1000;
  // Appui sur une zone : ouvre le formulaire de la catégorie dans l'app
  // (hooks/useWidgetDeepLink.ts). Une version native sans « openUrl » l'ignore
  // et l'appui ouvre l'app, comme avant.
  const LINK_LABEL = { meal: "Noter un repas", diaper: "Noter un change", nursing: "Ouvrir la tétée en cours", sleep: "Noter un sommeil" };
  // Zone cliquable : son lien et son libellé TalkBack.
  // `say` : ce que TalkBack lit avant l'action (ex. « Dernier repas à 19:37 »).
  // Proche (lecture seule, canWrite=false) : l'appui ouvre l'Accueil, sans
  // formulaire, et TalkBack dit « Consulter dans SuiviBaby ».
  const canWrite = props.canWrite !== false;
  const linkMods = (action: "meal" | "diaper" | "nursing" | "sleep", say?: string) => {
    const label = canWrite ? LINK_LABEL[action] : "Consulter dans SuiviBaby";
    return [
      createModifier("openUrl", {
        url: canWrite
          ? `suivibaby:///baby/home?widget=${action}${props.childId ? `&child=${encodeURIComponent(props.childId)}` : ""}`
          : "suivibaby:///baby/home",
      }),
      semantics({ contentDescription: say ? `${say}. ${label}` : label }),
    ];
  };

  // Démarrer / arrêter sieste-nuit et promenade (Parent seulement) : l'appui
  // ouvre l'app, qui agit tout de suite (hooks/useWidgetDeepLink.ts).
  // Sieste ou nuit selon l'heure, même règle que utils/sleepPeriod.ts.
  const napNow = (() => {
    const h = new Date(Date.now()).getHours();
    return h >= 8 && h < 19;
  })();
  // Prochaine bascule Sieste/Nuit (8:00 ou 19:00 locale).
  const nextNapSwitch = (fromMs: number) => {
    const d = new Date(fromMs);
    const at = (h: number, plusDay = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + plusDay, h).getTime();
    return [at(8), at(19), at(8, 1)].find((t) => t > fromMs) ?? at(8, 1);
  };
  const ACTION_SAY = {
    "sleep-start": napNow ? "Démarrer une sieste" : "Démarrer la nuit",
    "sleep-stop": "Arrêter le sommeil",
    "walk-start": "Démarrer une balade",
    "walk-stop": "Arrêter la balade",
    "nursing-stop": "Arrêter la tétée",
  };
  // Même phrase que sur iPhone : « Arrêter la sieste », « la nuit », « la balade », « la tétée ».
  const stopSay = (l: WidgetLive) =>
    l.kind === "sleep"
      ? l.nap === true
        ? "Arrêter la sieste"
        : l.nap === false
          ? "Arrêter la nuit"
          : ACTION_SAY["sleep-stop"]
      : ACTION_SAY[stopOf(l) as "walk-stop"];
  const timedMods = (action: keyof typeof ACTION_SAY, say?: string) => [
    createModifier("openUrl", {
      // &k= : clé des liens de l'appareil (sinon l'app demande confirmation).
      url: `suivibaby:///baby/home?widget=${action}${props.childId ? `&child=${encodeURIComponent(props.childId)}` : ""}${action === "sleep-start" ? `&nap=${napNow ? 1 : 0}` : ""}${props.linkKey ? `&k=${props.linkKey}` : ""}`,
    }),
    semantics({ contentDescription: say ?? ACTION_SAY[action] }),
  ];
  const stopOf = (l: WidgetLive) =>
    l.kind === "sleep" ? "sleep-stop" : l.kind === "walk" ? "walk-stop" : l.kind === "nursing" ? "nursing-stop" : null;
  // Bouton « ■ Arrêter » (ou « ■ » quand la tuile est étroite), sur fond blanc
  // ou sombre pour se détacher de la tuile colorée.
  const stopChip = (l: WidgetLive, h: number, compact: boolean) => (
    <Box
      contentAlignment="center"
      modifiers={[height(h), background(C.bg), cornerRadius(h / 2), padding(compact ? 8 : 10, 0, compact ? 8 : 10, 0), ...timedMods(stopOf(l) as "sleep-stop", stopSay(l))]}
    >
      {txt(compact ? "■" : "■ Arrêter", CAT[l.kind].text, 12, true)}
    </Box>
  );

  const clock = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const sleepLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m} min`);
  // Durée dite par TalkBack : « 25 minutes », « 1 heure et 8 minutes », « 2 heures ».
  const spokenDur = (m: number) => {
    if (m < 60) return `${m} minute${m > 1 ? "s" : ""}`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return `${h} heure${h > 1 ? "s" : ""}${r ? ` et ${r} minute${r > 1 ? "s" : ""}` : ""}`;
  };
  const sideWord = (s: string | null | undefined) => (s === "G" ? "gauche" : s === "D" ? "droit" : "");
  const otherSide = (l: WidgetLive) =>
    l.otherSideLabel ? l.otherSideLabel.replace(/^G /, "gauche ").replace(/^D /, "droit ") : null;

  // Autre sein parlé, sans abréviation : « droit, 12 minutes » (jamais « droit 12 min »,
  // « droit 1h08 »), comme sur iPhone.
  const otherSay = (l: WidgetLive) => {
    const m = l.otherSideLabel ? /^([GD]) (.+)$/.exec(l.otherSideLabel) : null;
    if (!m) return otherSide(l);
    const dur = /^(\d+) min$/.exec(m[2]);
    const hm = /^(\d+)h(\d{2})$/.exec(m[2]);
    const said = dur ? spokenDur(Number(dur[1])) : hm ? spokenDur(Number(hm[1]) * 60 + Number(hm[2])) : m[2].replace(/\bmin\b/g, "minutes");
    return `${sideWord(m[1])}, ${said}`;
  };

  // Rendu à chaque envoi de l'app : l'heure du rendu fait foi pour les rappels.
  const now = Date.now();
  const DAY = 24 * HOUR;
  const mealLate = props.alerts.mealAtMs != null && now >= props.alerts.mealAtMs;
  const diaperLate = props.alerts.diaperAtMs != null && now >= props.alerts.diaperAtMs;
  // Tétée oubliée (brouillon expiré : 3 h sans action, 1 h en pause) : retirée
  // à l'heure dite, comme dans l'app, même sans nouvel envoi.
  const allLives = props.lives ?? (props.live ? [props.live] : []);
  const lives = allLives.filter((l) => !(l.expiresAtMs != null && now >= l.expiresAtMs));
  const n = lives.length;
  // Compteurs d'un jour passé (minuit franchi sans nouvel envoi) : masqués.
  const dayStart = props.dayStartMs ?? 0;
  const nextMidnight = dayStart > 0
    ? (() => {
        const d = new Date(dayStart);
        return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
      })()
    : 0;
  const dayStale = nextMidnight > 0 && now >= nextMidnight;
  // Prochain minuit local depuis maintenant (redessin : « hier », « le 11/11 »
  // restent vrais même la deuxième nuit sans ouvrir l'app).
  const nowDate = new Date(now);
  const midnightFromNow = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate() + 1).getTime();
  const todayStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate()).getTime();
  // Jour d'un « dernier » : « dernier 19:37 », « hier 19:37 », « le 11/11 ».
  const daysAgo = (ms: number) => {
    const d = new Date(ms);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return Math.round((todayStart - start) / DAY);
  };
  const ddmm = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  // Largeur estimée d'un texte en 12 sp (Roboto) : chiffres 6,9 dp, lettres ≈ 5,2.
  const textW12 = (t: string) =>
    FS *
    [...t].reduce((w, c) => w + (/[0-9]/.test(c) ? 6.9 : c === ":" ? 2.8 : c === "/" ? 3.6 : c === " " || c === "·" ? 3 : 5.2), 0);
  // « dernier à 19:37 », « dernier hier à 19:37 », « dernier le 11/11 » (L2,
  // choix de Yoss). Si ça ne tient pas : sans « dernier », puis sans « à » ;
  // jamais l'heure coupée (sans « … », elle serait fausse : « 19:3 »).
  const whenShort = (ms: number, room = Infinity) => {
    const k = daysAgo(ms);
    const t = clock(ms);
    const tries =
      k <= 0
        ? [`dernier à ${t}`, `à ${t}`, t]
        : k === 1
          ? [`dernier hier à ${t}`, `hier à ${t}`, `hier ${t}`]
          : [`dernier le ${ddmm(ms)}`, `le ${ddmm(ms)}`];
    return tries.find((x) => textW12(x) * 1.05 <= room) ?? tries[tries.length - 1];
  };
  const whenSpoken = (ms: number) => {
    const k = daysAgo(ms);
    return k <= 0 ? `à ${clock(ms)}` : k === 1 ? `hier à ${clock(ms)}` : `le ${ddmm(ms)} à ${clock(ms)}`;
  };
  // Au-delà de 23 h 50, la durée passe en jours (texte) : l'horloge native
  // repartirait de « 0h00 » à 24 h ; la marge couvre le retard de l'alarme.
  const DAYS_FROM_MS = 23 * HOUR + 50 * 60 * 1000;
  // Filet de fraîcheur : une session en cours sans mise à jour depuis 2 h peut
  // être finie ailleurs sans qu'on le sache ; on dit de quand date l'info.
  const STALE_LIVE_MS = 2 * HOUR;
  const generatedAt = props.generatedAtMs ?? 0;
  const EXPIRE_MS = 24 * HOUR;
  // Données vieilles de plus de 2 h : « màj HH:MM » ; avec une session en cours,
  // le chrono passe en gris (« à vérifier ») : elle a pu finir ailleurs.
  const dataStale = generatedAt > 0 && now - generatedAt > STALE_LIVE_MS;
  const liveStale = n > 0 && dataStale;
  const day = props.day;
  // Sommeil en cours : il compte dans « de sommeil » et la ligne avance seule
  // (horloge native partie de « début − sommeils terminés »).
  const sleepRunning =
    day?.sleepRunningFromMs != null && lives.some((l) => l.kind === "sleep") ? Math.min(day.sleepRunningFromMs, now) : null;
  const sleepBaseMs = day && sleepRunning != null ? sleepRunning - day.sleepMinutes * 60000 : null;
  const sleepNowMin = day ? day.sleepMinutes + (sleepRunning != null ? Math.max(0, Math.floor(now / 60000) - Math.floor(sleepRunning / 60000)) : 0) : 0;

  // ----- Grille -----
  const env = environment as WidgetEnvironment & { widthDp?: number; heightDp?: number };
  const W = env.widthDp && env.widthDp > 0 ? env.widthDp : 420;
  const H = env.heightDp && env.heightDp > 0 ? env.heightDp : 222;
  const small = W < 250 || FS >= 1.3;
  // Compact à cause du seul grand texte (largeur suffisante) : on garde le
  // démarrage et l'arrêt, sinon ces utilisateurs perdraient les boutons.
  const bigText = FS >= 1.3 && W >= 250;
  const PAD = small ? 12 : 14;
  // En-tête : le prénom, dans une pastille, doit se lire avant tout le reste.
  // 34 dp : les boutons « ▶ » de 32 dp tiennent dans l'en-tête.
  const HEAD_H = Math.max(S(small ? 22 : 34), bigText && canWrite ? 32 : 0);
  const HEAD_GAP = small ? 4 : 6;
  const innerW = Math.floor(W - PAD * 2);
  const innerH = Math.floor(H - PAD * 2);
  const zoneH = innerH - HEAD_H - HEAD_GAP;
  // Séparateur : 9 dp, filet, 9 dp.
  const SEP_GAP = 9;
  const SEP = SEP_GAP * 2 + 1;
  const showDay = !small && day != null;
  const Rw = showDay ? Math.min(156, Math.max(112, Math.round(innerW * 0.38))) : 0;
  const zoneW = showDay ? innerW - Rw - SEP : innerW;
  // Hauteur minimale d'une tuile seule (marges, titre, chrono de 10 sp) : si la
  // bande du bas la prive de cette place, la bande est retirée (plutôt qu'un débordement).
  const SINGLE_MIN = 2 * 10 + S(16) + 4 + Math.ceil(10 * 1.25 * FS);
  const bandWanted = small && day && n <= 1 ? S(26) : 0;
  const bandH = n === 1 && bandWanted > 0 && zoneH - bandWanted < SINGLE_MIN ? 0 : bandWanted;

  const txt = (text: string, color: string, sp: number, bold = false, lines = 1) => (
    <Text color={color} style={{ fontSize: sp, fontWeight: bold ? "bold" : "normal" }} maxLines={lines}>
      {text}
    </Text>
  );
  const dot = (color: string) => <Box modifiers={[size(8, 8), background(color), cornerRadius(4)]} />;
  const labelRow = (color: string, dotColor: string, text: string, sp: number) => (
    <Row verticalAlignment="center">
      {dot(dotColor)}
      <Spacer modifiers={[width(6)]} />
      {txt(text, color, sp, true)}
    </Row>
  );
  const gap = (h: number) => <Spacer modifiers={[height(h)]} />;
  // Comme l'Accueil : « 45 min » puis « 1h08 ». Le format change à 1 h :
  // un redessin est programmé à ce moment-là (RefreshAt).
  // Version native installée : sans les ajouts de niveau 3, repli sur le chrono.
  const nativeLevel = (environment as WidgetEnvironment & { nativeLevel?: number }).nativeLevel ?? 2;
  // Heure saisie dans le futur (repas noté à 15:45 à 15:44) : on part de maintenant,
  // sinon l'horloge native affiche « 59 min ».
  // L'horloge native arrondit le début à la minute la plus proche : un début à
  // 06:36:40 devenait 06:37, d'où « 59 min » jusqu'à 06:37. On l'envoie déjà
  // arrondi à la minute inférieure (jamais dans le futur).
  const elapsed = (
    rawStartMs: number,
    color: string,
    sp: number,
    startMs = Math.floor(Math.min(rawStartMs, now) / 60000) * 60000,
  ) =>
    nativeLevel >= 3 ? (
      <Elapsed startMs={startMs} pattern={now - startMs < HOUR ? "m' min'" : "H'h'mm"} color={color} fontSize={sp} />
    ) : (
      <Chrono startMs={startMs} color={color} fontSize={sp} />
    );
  // Les vues natives prennent toute la hauteur disponible : boîte de hauteur fixe.
  const fixedLine = (sp: number, child: React.ReactNode) => (
    <Box contentAlignment="centerStart" modifiers={[height(Math.ceil(sp * 1.25 * FS))]}>
      {child}
    </Box>
  );
  const chrono = (l: WidgetLive, sp: number) =>
    fixedLine(sp, chronoRaw(l, sp));
  const chronoRaw = (l: WidgetLive, sp: number) =>
    l.kind === "nursing" ? (
      <Chrono
        startMs={l.timerStartMs}
        pausedAtMs={l.pausedAtMs ?? undefined}
        color={l.pausedAtMs != null || liveStale ? C.softOnTile : C.strong}
        fontSize={sp}
      />
    ) : (
      // Sommeil, promenade : « 0 min », « 45 min », « 1h08 », horloge native
      // qui avance seule. Les secondes de la 1re minute ont été essayées : le
      // redessin à 1 min dépend d'une alarme Android non exacte, qui n'arrivait
      // pas (secondes restées affichées après 4 min sur le S21).
      elapsed(l.timerStartMs, liveStale ? C.softOnTile : C.strong, sp)
    );
  // Sommeil : « Sieste » ou « Nuit », comme sur l'Accueil.
  const labelOf = (l: WidgetLive) =>
    l.kind === "sleep" ? (l.nap === true ? "Sieste" : l.nap === false ? "Nuit" : "Sommeil") : CAT[l.kind].label;
  const sinceTime = (l: WidgetLive) => (l.sinceMs ? clock(l.sinceMs) : l.sinceLabel.replace("depuis ", ""));
  const MEAL_WORD: Record<string, string> = { tetee: "tétée", biberon: "biberon", solide: "repas solide" };
  const mealWord = props.lastMealKind ? MEAL_WORD[props.lastMealKind] ?? null : null;
  // Rappel réglé, pas encore dépassé : annoncé à l'avance.
  const upcoming = (atMs: number | null | undefined) => (atMs != null && atMs > now ? `rappel à ${clock(atMs)}` : null);

  // Libellés lus par TalkBack. Le libellé n'est recalculé qu'à chaque rendu : on
  // lit l'heure (toujours juste) plutôt qu'une durée « il y a » qui vieillirait.
  const a11yLive = (l: WidgetLive) => {
    if (l.kind === "nursing") {
      const parts = [`Tétée${l.pausedAtMs != null ? " en pause" : " en cours"}`];
      if (l.side) parts.push(`sein ${sideWord(l.side)}`);
      if (l.otherSideLabel) parts.push(`autre sein ${otherSay(l)}`);
      parts.push(l.sinceLabel);
      return parts.join(", ");
    }
    return `${labelOf(l)} en cours, ${l.sinceLabel}`;
  };
  // Sieste, nuit, balade : « Sieste en cours depuis 13:14, 25 minutes ».
  const liveSay = (l: WidgetLive) =>
    l.kind === "nursing"
      ? a11yLive(l)
      : `${labelOf(l)} en cours depuis ${sinceTime(l)}, ${spokenDur(Math.max(0, Math.floor(now / 60000) - Math.floor(l.timerStartMs / 60000)))}`;
  // Zone d'une session : tétée = lien + libellé ; sommeil, balade = libellé seul
  // (l'appui sur la tuile ouvre l'app).
  const tileMods = (l: WidgetLive) =>
    l.kind === "nursing" ? linkMods("nursing", a11yLive(l)) : [semantics({ contentDescription: liveSay(l) })];
  const a11yLast = (what: string, ms: number, late: boolean, atMs: number | null | undefined) =>
    `${what} ${whenSpoken(ms)}${late ? ", rappel dépassé" : atMs != null && atMs > now ? `, rappel à ${clock(atMs)}` : ""}`;

  // Au repos, dernier repas puis dernier change, l'un sous l'autre (P4,
  // cellule design 17/20) : les deux questions de la nuit. Par bloc :
  // « ● Dernier repas », puis « il y a 6h58 » ; à droite du chiffre, une
  // petite pile réservée au rappel. L'heure du dernier est dans la colonne de
  // droite (« dernier 19:37 »), comme pendant une session.
  const restDual = !small && n === 0 && (!!props.lastMealMs || !!day?.lastDiaperMs);
  const restDualZone = (h: number) => {
    const sp = 12;
    const big = h >= 150 ? 30 : h >= 120 ? 28 : 24;
    const bigH = Math.ceil(big * 1.2 * FS);
    // « 14h52 » mesuré ≈ 3 × la taille sur le S21 : colonne fixe, chiffres alignés.
    const numW = Math.ceil(big * 3 * FS);
    // Glance n'aligne pas les lignes de base : « il y a » remonté au pied du chiffre.
    const baseLift = big >= 28 ? 3 : 2;
    // Largeur fixe (« il y a » ≈ 20 dp en 12 sp, marge pour la police agrandie) :
    // sans elle, Glance place le chiffre différemment d'une ligne à l'autre.
    const AGO_W = S(28);
    const blockGap = h >= 120 ? 8 : 4;
    const blockH = Math.max(S(48), S(16) + 2 + bigH);
    const block = (
      label: string,
      accent: string,
      dotColor: string,
      ms: number | null | undefined,
      late: boolean,
      atMs: number | null | undefined,
      action: "meal" | "diaper",
    ) => {
      const ahead = ms && !late && atMs != null && atMs > now ? clock(atMs) : null;
      const say = ms
        ? `${label} ${whenSpoken(ms)}${late ? ", rappel dépassé" : ahead ? `, rappel à ${ahead}` : ""}`
        : `${label} : pas encore`;
      const old = ms != null && now - ms >= DAYS_FROM_MS;
      const tone = late ? C.alert : C.soft;
      // Moins d'1 h : « 16 min » est plus large que « 6h58 » ; dans la boîte
      // fixe, l'unité passait à la ligne et disparaissait (« 16 »). Chiffre un
      // peu plus petit et boîte plus large ; redessin prévu au passage à 1 h.
      const underHour = ms != null && !old && now - ms < HOUR;
      const numSp = underHour ? Math.round(big * 0.8) : big;
      const boxW = underHour ? Math.ceil(numSp * 3.8 * FS) : numW;
      return (
        <Column key={action} verticalAlignment="center" modifiers={[size(zoneW, blockH), ...linkMods(action, say)]}>
          {labelRow(late ? C.alert : accent, late ? C.alert : dotColor, label, sp)}
          {gap(2)}
          {ms ? (
            <Row verticalAlignment="bottom">
              <Box contentAlignment="bottomStart" modifiers={[size(AGO_W, bigH), padding(0, 0, 0, baseLift)]}>
                {txt("il y a", tone, sp)}
              </Box>
              <Spacer modifiers={[width(4)]} />
              <Box contentAlignment="bottomStart" modifiers={[size(boxW, bigH)]}>
                {old
                  ? txt(`${Math.max(1, Math.round((now - (ms as number)) / DAY))} j`, late ? C.alert : C.strong, big, true)
                  : elapsed(ms, late ? C.alert : C.strong, numSp)}
              </Box>
              {late || ahead ? <Spacer modifiers={[width(6)]} /> : null}
              {late || ahead ? (
                <Column>
                  {txt("rappel", tone, sp, late)}
                  {txt(late ? "dépassé" : (ahead as string), tone, sp)}
                </Column>
              ) : null}
            </Row>
          ) : (
            <Box contentAlignment="centerStart" modifiers={[height(bigH)]}>
              {txt("pas encore", C.soft, 15)}
            </Box>
          )}
        </Column>
      );
    };
    return (
      <Column verticalAlignment="center" modifiers={[size(zoneW, h)]}>
        {block("Dernier repas", CAT.meal.text, CAT.meal.dot, props.lastMealMs, mealLate, props.alerts.mealAtMs, "meal")}
        {gap(blockGap)}
        {block("Dernier change", CAT.diaper.text, CAT.diaper.dot, day?.lastDiaperMs, diaperLate, props.alerts.diaperAtMs, "diaper")}
      </Column>
    );
  };

  // ----- Zone « Maintenant » -----
  const restZone = () => {
    const h = zoneH - bandH;
    // Deux blocs dès qu'un repas OU un change est connu (comme l'iPhone) : sans
    // repas noté, le dernier change restait masqué.
    if (restDual) return restDualZone(h);
    if (!props.lastMealMs) {
      return (
        <Column verticalAlignment="center" modifiers={[size(zoneW, h)]}>
          {txt("Aucun repas noté", C.soft, small ? 12 : 14, false, 2)}
        </Column>
      );
    }
    const big = small || zoneH < 108 ? 28 : 34;
    const sp = small ? 12 : 13;
    const at = `${mealWord && !small ? `${mealWord} ` : "à "}${clock(props.lastMealMs)}`;
    const ahead = upcoming(props.alerts.mealAtMs);
    return (
      <Column verticalAlignment="center" modifiers={[size(zoneW, h), ...linkMods("meal", a11yLast("Dernier repas", props.lastMealMs, mealLate, props.alerts.mealAtMs))]}>
        {labelRow(
          mealLate ? C.alert : CAT.meal.text,
          mealLate ? C.alert : CAT.meal.dot,
          mealLate ? "Repas · rappel" : "Repas · il y a",
          sp,
        )}
        {gap(2)}
        {fixedLine(big, elapsed(props.lastMealMs, mealLate ? C.alert : C.strong, big))}
        {gap(2)}
        {txt(ahead && !small ? `${at} · ${ahead}` : at, mealLate ? C.alert : C.soft, sp)}
      </Column>
    );
  };

  // Même titre pour une ou deux sessions : « Sieste · depuis 13:14 », puis le chrono.
  const tileTitle = (l: WidgetLive, withOther: boolean) => {
    if (l.kind === "nursing") {
      const other = withOther ? otherSide(l) : null;
      return `Tétée${l.pausedAtMs != null ? " en pause" : ""}${l.side ? ` · ${sideWord(l.side)}` : ""}${other ? ` · ${other}` : ""}`;
    }
    const label = labelOf(l);
    return small ? label : zoneW < 200 ? `${label} · ${sinceTime(l)}` : `${label} · depuis ${sinceTime(l)}`;
  };

  const singleTile = (l: WidgetLive) => {
    const k = CAT[l.kind];
    // Tétée : l'autre sein et l'heure de début passent sous le chrono (titre déjà long).
    const other = l.kind === "nursing" ? otherSide(l) : null;
    const underWanted = l.kind === "nursing" ? (other ? `${other} · depuis ${sinceTime(l)}` : `depuis ${sinceTime(l)}`) : small ? `depuis ${sinceTime(l)}` : null;
    const availH = zoneH - bandH;
    // Texte en sp : il grandit avec la police, donc la taille se divise par FS.
    const widthSp = Math.max(10, Math.floor((zoneW - (small ? 20 : 24)) / (4.3 * FS)));
    const baseSp = Math.min(small ? 28 : 36, widthSp);
    const fullPad = small ? 10 : 12;
    // Zone vraiment trop basse (grand texte, 2×2) : le chrono seul, sans titre
    // (la description lue garde la session), sinon la tuile déborde.
    const tight = availH < 2 * fullPad + S(16) + 4 + Math.ceil(10 * 1.25 * FS);
    const tilePad = tight ? 4 : fullPad;
    const capFor = (extra: number) => Math.floor((availH - 2 * tilePad - (tight ? 0 : S(16) + 4) - extra) / (1.25 * FS));
    // La ligne « depuis » ne reste que si le chrono garde au moins 10 sp avec elle.
    const under = !tight && underWanted && capFor(2 + S(16)) >= 10 ? underWanted : null;
    const chronoSp = Math.max(6, Math.min(baseSp, capFor(under ? 2 + S(16) : 0)));
    // Bouton d'arrêt : 44 dp si la tuile a la place (tétée avec « depuis » : un peu moins).
    const chipRoom =
      availH - 2 * tilePad - S(16) - 4 - Math.ceil(chronoSp * 1.25 * FS) - (under ? 2 + S(16) : 0) - 6;
    // Moins de 32 dp de place : pas de bouton (la tuile reste un lien) plutôt qu'un débordement.
    const chipH = Math.min(44, chipRoom);
    const showChip = !tight && canWrite && (!small || bigText) && stopOf(l) != null && chipRoom >= 32;
    return (
      <Column
        verticalAlignment="center"
        modifiers={[
          size(zoneW, availH),
          background(k.tile),
          cornerRadius(16),
          paddingAll(tilePad),
          ...tileMods(l),
        ]}
      >
        {tight ? null : labelRow(k.text, k.dot, tileTitle(l, false), small ? 12 : 13)}
        {tight ? null : gap(4)}
        {chrono(l, chronoSp)}
        {under ? gap(2) : null}
        {under ? txt(under, C.softOnTile, small ? 12 : 13) : null}
        {showChip ? gap(6) : null}
        {showChip ? stopChip(l, chipH, false) : null}
      </Column>
    );
  };

  const rowTile = (l: WidgetLive, h: number) => {
    const k = CAT[l.kind];
    // Place pour le bouton : hauteur moins marges et titre ; sous 32 dp, pas de bouton.
    const chipRoom = h - 12 - S(16);
    const showChip = canWrite && stopOf(l) != null && chipRoom >= 32;
    // Largeur réelle du bouton compact « ■ » (marges 8 + glyphe en sp) et écart de 6.
    const chipWReal = 16 + Math.ceil(10 * FS);
    const chronoW = showChip ? zoneW - 20 - 6 - chipWReal : zoneW - 20;
    // Chrono en sp : divisé par FS en largeur ; sa hauteur tient dans la ligne (chipRoom).
    const baseSp = showChip ? (small ? 20 : h >= 58 ? 24 : 20) : small ? 22 : h >= 58 ? 26 : 22;
    const chronoSp = Math.max(6, Math.min(baseSp, Math.max(10, Math.floor(chronoW / (4.3 * FS))), Math.floor(chipRoom / (1.25 * FS))));
    return (
      <Column
        verticalAlignment="center"
        modifiers={[
          size(zoneW, h),
          background(k.tile),
          cornerRadius(12),
          padding(10, 6, 10, 6),
          ...tileMods(l),
        ]}
      >
        {labelRow(k.text, k.dot, tileTitle(l, !small), 12)}
        {showChip ? (
          <Row verticalAlignment="center">
            {/* Bouton compact « ■ » : « ■ Arrêter » prenait la place de l'unité
                (« 42 min » devenait « 42 »). */}
            <Box contentAlignment="centerStart" modifiers={[width(chronoW)]}>
              {chrono(l, chronoSp)}
            </Box>
            <Spacer modifiers={[width(6)]} />
            {stopChip(l, Math.min(40, chipRoom), true)}
          </Row>
        ) : (
          chrono(l, chronoSp)
        )}
      </Column>
    );
  };

  const compactTile = (l: WidgetLive, h: number) => {
    const k = CAT[l.kind];
    // Titre en sp : sa colonne suit la police, sans dépasser la moitié de la ligne.
    const labelW = Math.min(S(small ? 56 : 74), Math.floor((zoneW - 20) / 2));
    const label =
      l.kind === "nursing" && l.side ? `${k.short} ${l.side}` : small && l.kind === "walk" ? k.short : labelOf(l);
    const chronoW = zoneW - 20 - labelW;
    const baseSp = small ? 16 : h >= 36 ? 20 : 16;
    const chronoSp = Math.max(
      6,
      Math.min(baseSp, Math.max(10, Math.floor(chronoW / (4.3 * FS))), Math.floor((h - 4) / (1.25 * FS))),
    );
    // Ligne trop basse pour le titre et le chrono (grand texte) : le chrono seul.
    const chronoOnly = h < Math.ceil(10 * 1.25 * FS) + 4;
    return (
      <Row
        verticalAlignment="center"
        modifiers={[
          size(zoneW, h),
          background(k.tile),
          cornerRadius(12),
          padding(10, 0, 10, 0),
          ...tileMods(l),
        ]}
      >
        {chronoOnly ? null : (
          <Row verticalAlignment="center" modifiers={[width(labelW)]}>
            {dot(k.dot)}
            <Spacer modifiers={[width(5)]} />
            {txt(label, k.text, small ? 11 : 12, true)}
          </Row>
        )}
        {/* Pas de bouton d'arrêt à 3 sessions : trop petit pour le doigt ; l'appui
            sur la tuile ouvre l'app. */}
        <Box contentAlignment="centerEnd" modifiers={[width(chronoOnly ? zoneW - 20 : chronoW)]}>
          {chrono(l, chronoSp)}
        </Box>
      </Row>
    );
  };

  const nowZone = () => {
    // Enfant changé dans l'app, données en chargement : jamais l'ancien enfant.
    if (props.loading) {
      return (
        <Column verticalAlignment="center" modifiers={[size(zoneW, zoneH)]}>
          {txt("Mise à jour en cours", C.soft, small ? 12 : 14)}
        </Column>
      );
    }
    if (n === 0) return restZone();
    if (n === 1) return singleTile(lives[0]);
    const GAPR = 6;
    const rowH = Math.floor((zoneH - (n - 1) * GAPR) / n);
    return (
      <Column>
        {lives.map((l, i) => (
          <Column key={l.kind}>
            {i > 0 ? gap(GAPR) : null}
            {n === 2 ? rowTile(l, rowH) : compactTile(l, rowH)}
          </Column>
        ))}
      </Column>
    );
  };

  // ----- Colonne « Aujourd'hui » : liste qui défile -----
  // En haut, les trois résumés (repas, changes, sommeil) ; en dessous, les
  // 7 derniers évènements des 24 h (comme l'Accueil), le premier visible sans
  // défiler.
  const dayColumn = () => {
    if (!day) return null;
    if (dayStale) {
      return (
        <Column modifiers={[size(Rw, zoneH)]}>
          {gap(6)}
          {txt("Nouvelle journée", C.strong, 15, true)}
          {gap(2)}
          {txt("Mise à jour à la prochaine saisie", C.soft, 12, false, 3)}
        </Column>
      );
    }
    // Rythme unique (4×2 comme 4×3) : trois items de 48 dp (repas et change
    // ouvrent chacun leur formulaire), 8 dp entre eux et sous le sommeil, titre
    // de 28 dp : 20 dp visibles entre chaque bloc de texte. Lignes du fil de 24 dp.
    const ITEM_H = S(48);
    const ITEM_GAP = 8;
    const TITLE_H = S(28);
    const ROW_H = S(24);
    const item = (key: "meal" | "diaper" | "sleep", dotColor: string, value: string | React.ReactNode, sub: string | null, late: boolean, say: string) => (
      <Row
        key={key}
        verticalAlignment="center"
        modifiers={[size(Rw, ITEM_H), ...linkMods(key, say)]}
      >
        {dot(late ? C.alert : dotColor)}
        <Spacer modifiers={[width(8)]} />
        <Column>
          {typeof value === "string" ? txt(value, late ? C.alert : C.strong, 15, true) : value}
          {sub ? txt(sub, late ? C.alert : C.soft, 12) : null}
        </Column>
      </Row>
    );
    // Heure du dernier ici, au repos comme en session (à gauche : « il y a »).
    // Jour du dernier : « dernier 19:37 », « hier 19:37 », « le 11/11 ».
    // Place du texte de la sous-ligne : colonne moins pastille et écart.
    const room = Rw - 16;
    // Rappel dépassé : « rappel · 19:37 », « rappel · hier 19:37 », sinon « rappel · hier ».
    const lateSub = (ms: number) => {
      const k = daysAgo(ms);
      const t = clock(ms);
      // « rappel · dernier à 11:57 / dernier hier à 11:57 / dernier le 13/11 »
      // (demande de Yoss, 2026-11-15), raccourci si la colonne est étroite.
      const tries =
        k <= 0
          ? [`rappel · dernier à ${t}`, `rappel · à ${t}`, `rappel · ${t}`]
          : k === 1
            ? [`rappel · dernier hier à ${t}`, `rappel · hier à ${t}`, `rappel · hier ${t}`, "rappel · hier"]
            : [`rappel · dernier le ${ddmm(ms)}`, `rappel · le ${ddmm(ms)}`, "rappel"];
      return tries.find((x) => textW12(x) * 1.05 <= room) ?? tries[tries.length - 1];
    };
    // Aucun jamais noté (prouvé par la fiche de l'enfant) : « aucun noté » (la
    // 1re ligne nomme déjà le type) ; inconnu : rien.
    const NEVER = "aucun noté";
    const mealSub = day.lastMealMs
      ? mealLate
        ? lateSub(day.lastMealMs)
        : Rw >= 140 && day.bottleMl > 0 && daysAgo(day.lastMealMs) <= 0
          ? `${clock(day.lastMealMs)} · ${day.bottleMl} ml`
          : whenShort(day.lastMealMs, room)
      : day.noMealEver
        ? NEVER
        : null;
    const diaperSub = day.lastDiaperMs
      ? diaperLate
        ? lateSub(day.lastDiaperMs)
        : whenShort(day.lastDiaperMs, room)
      : day.noDiaperEver
        ? NEVER
        : null;
    // Sous-ligne parlée (comme l'iPhone) : « dernier hier à 19:37 », « à 14:00, 120 millilitres ».
    const lastSay = (ms: number) => {
      const k = daysAgo(ms);
      return k <= 0 ? `dernier à ${clock(ms)}` : k === 1 ? `dernier hier à ${clock(ms)}` : `dernier le ${ddmm(ms)}`;
    };
    const mealSpoken = day.lastMealMs
      ? mealLate
        ? `rappel dépassé, ${lastSay(day.lastMealMs)}`
        : day.bottleMl > 0 && daysAgo(day.lastMealMs) <= 0
          ? `à ${clock(day.lastMealMs)}, ${day.bottleMl} millilitres`
          : lastSay(day.lastMealMs)
      : day.noMealEver
        ? NEVER
        : null;
    const diaperSpoken = day.lastDiaperMs
      ? diaperLate
        ? `rappel dépassé, ${lastSay(day.lastDiaperMs)}`
        : lastSay(day.lastDiaperMs)
      : day.noDiaperEver
        ? NEVER
        : null;
    const events = props.recent ?? [];
    return (
      <LazyColumn modifiers={[size(Rw, zoneH)]}>
        {item("meal", CAT.meal.dot, `${day.mealsCount} repas`, mealSub, mealLate, `${day.mealsCount} repas${mealSpoken ? `, ${mealSpoken}` : mealLate ? ", rappel dépassé" : ""}`)}
        <Spacer key="gap-meal-diaper" modifiers={[size(Rw, ITEM_GAP)]} />
        {item(
          "diaper",
          CAT.diaper.dot,
          `${day.diapersCount} change${day.diapersCount > 1 ? "s" : ""}`,
          diaperSub,
          diaperLate,
          `${day.diapersCount} change${day.diapersCount > 1 ? "s" : ""}${diaperSpoken ? `, ${diaperSpoken}` : diaperLate ? ", rappel dépassé" : ""}`,
        )}
        <Spacer key="gap-diaper-sleep" modifiers={[size(Rw, ITEM_GAP)]} />
        {item(
          "sleep",
          CAT.sleep.dot,
          sleepBaseMs != null ? fixedLine(15, elapsed(sleepBaseMs, C.strong, 15)) : sleepLabel(day.sleepMinutes),
          "de sommeil",
          false,
          `${spokenDur(sleepNowMin)} de sommeil`,
        )}
        {events.length ? <Spacer key="gap-sleep-title" modifiers={[size(Rw, ITEM_GAP)]} /> : null}
        {events.length ? (
          <Column key="events-title" modifiers={[size(Rw, TITLE_H)]} verticalAlignment="center">
            {txt("Évènements récents", C.soft, 12)}
          </Column>
        ) : null}
        {events.flatMap((e, i) => {
          const row = (
            <Row
              key={`ev-${i}-${e.ms}`}
              verticalAlignment="center"
              modifiers={[
                size(Rw, ROW_H),
                semantics({
                  contentDescription: `${e.ms < dayStart ? "hier " : ""}à ${clock(e.ms)}, ${e.icon === "jalon" && /^\p{Extended_Pictographic}/u.test(e.label) ? `humeur ${e.label}` : e.label}`,
                }),
              ]}
            >
              {dot((e.icon && TYPE_COLOR[e.icon]) || (e.kind === "meal" ? CAT.meal.dot : e.kind === "diaper" ? CAT.diaper.dot : C.soft))}
              <Spacer modifiers={[width(6)]} />
              {txt(clock(e.ms), C.soft, 12)}
              <Spacer modifiers={[width(6)]} />
              {txt(e.label, C.strong, 12)}
            </Row>
          );
          // Comme le home : les événements d'avant minuit sous « Hier ».
          const firstOfYesterday = e.ms < dayStart && (i === 0 || events[i - 1].ms >= dayStart);
          return firstOfYesterday
            ? [
                <Column key="events-yesterday" modifiers={[size(Rw, TITLE_H)]} verticalAlignment="center">
                  {txt("Hier", C.soft, 12)}
                </Column>,
                row,
              ]
            : [row];
        })}
      </LazyColumn>
    );
  };

  // ----- Bande du bas (2×2, au plus une session) -----
  const band = () => {
    if (!bandH || !day || dayStale) return null;
    const colW = Math.floor(innerW / 3);
    // Description complète : « rep. », « ch. », « dodo » ne sont pas lus tels quels.
    const cell = (dotColor: string, value: string, late: boolean, say: string) => (
      <Row verticalAlignment="center" modifiers={[width(colW), semantics({ contentDescription: say })]}>
        {dot(late ? C.alert : dotColor)}
        <Spacer modifiers={[width(4)]} />
        {txt(value, late ? C.alert : C.strong, 12, true)}
      </Row>
    );
    return (
      <Column>
        {gap(8)}
        <Row>
          {cell(CAT.meal.dot, `${day.mealsCount} rep.`, mealLate && n > 0, `${day.mealsCount} repas${mealLate && n > 0 ? ", rappel dépassé" : ""}`)}
          {cell(CAT.diaper.dot, `${day.diapersCount} ch.`, diaperLate, `${day.diapersCount} change${day.diapersCount > 1 ? "s" : ""}${diaperLate ? ", rappel dépassé" : ""}`)}
          {cell(CAT.sleep.dot, `${sleepLabel(sleepNowMin).replace(" min", "m")} dodo`, false, `${spokenDur(sleepNowMin)} de sommeil`)}
        </Row>
      </Column>
    );
  };

  // Prochain redessin utile : passage à 1 h d'une durée, rappel qui passe au rouge.
  const refreshCandidates = [
    // Début arrondi à la minute, comme le compteur natif (« 60 min » évité).
    ...lives.filter((l) => l.kind !== "nursing").map((l) => Math.floor(l.timerStartMs / 60000) * 60000 + HOUR),
    // Expiration d'une tétée oubliée : redessin pour la retirer.
    ...lives.filter((l) => l.expiresAtMs != null).map((l) => l.expiresAtMs as number),
    // Total de sommeil qui passe 1 h : le format change (« 59 min » → « 1h00 »).
    ...(sleepBaseMs != null ? [Math.floor(sleepBaseMs / 60000) * 60000 + HOUR] : []),
    ...(n === 0 && props.lastMealMs ? [props.lastMealMs + HOUR] : []),
    nextMidnight,
    midnightFromNow,
    // Passage en jours (23 h 50) puis à chaque nouveau jour.
    ...(restDual
      ? [props.lastMealMs, day?.lastDiaperMs].flatMap((ms) => {
          if (!ms) return [];
          const el = now - ms;
          if (el < DAYS_FROM_MS) return [ms + DAYS_FROM_MS];
          const k = Math.max(1, Math.round(el / DAY));
          return [ms + (k + 0.5) * DAY];
        })
      : []),
    ...(generatedAt > 0 ? [generatedAt + STALE_LIVE_MS] : []),
    ...(restDual && day?.lastDiaperMs ? [day.lastDiaperMs + HOUR] : []),
    props.alerts.mealAtMs ?? 0,
    props.alerts.diaperAtMs ?? 0,
    // Expiration à 24 h : widget masqué (voir plus bas).
    ...(generatedAt > 0 ? [generatedAt + EXPIRE_MS + 60_000] : []),
    // Bascule « ▶ Sieste » / « ▶ Nuit » à 8:00 et 19:00 (même règle que l'app).
    nextNapSwitch(now),
  ].filter((t) => t > now);
  const nextRefresh = refreshCandidates.length ? Math.min(...refreshCandidates) : null;
  const refresh = nextRefresh && nativeLevel >= 3 ? <RefreshAt atMs={nextRefresh} /> : null;

  // Le prénom seul : « Samaye » se distingue mieux d'« Abebech » qu'un nom complet.
  const name = props.childName ? props.childName.trim().split(/\s+/)[0] : "SuiviBaby";
  const pill = (sp: number) => (
    <Box
      contentAlignment="center"
      modifiers={[height(HEAD_H), background(C.pillBg), cornerRadius(HEAD_H / 2), padding(small ? 8 : 10, 0, small ? 8 : 10, 0)]}
    >
      {txt(name, C.pillText, sp, true)}
    </Box>
  );

  // « màj 14:02 » à côté du prénom : l'info date de cette heure-là.
  const staleTag = dataStale ? (
    <Row
      verticalAlignment="center"
      modifiers={[semantics({ contentDescription: `${liveStale ? "À vérifier, mis" : "Mis"} à jour à ${clock(generatedAt)}` })]}
    >
      <Spacer modifiers={[width(8)]} />
      {txt(`${liveStale && !small ? "à vérifier · " : ""}màj ${clock(generatedAt)}`, liveStale ? C.alert : C.soft, small ? 11 : 12)}
    </Row>
  ) : null;

  const a11yParts = [name];
  // Sessions et fraîcheur sont lues par leurs propres nœuds : pas de doublon ici.
  if (props.loading) a11yParts.push("Mise à jour en cours");
  // Le détail (sessions, fraîcheur, repas, change, journée, fil) est lu zone par zone : un nœud par zone.
  const a11y = semantics({ contentDescription: a11yParts.join(". ") });

  // Boutons « ▶ Sieste / ▶ Nuit » et « ▶ Promenade » dans l'en-tête de la
  // colonne de droite (à la place de « Aujourd'hui »), pour un Parent, hors
  // session du même type. L'arrêt est dans la tuile de la session.
  const CHIP_SP = 11;
  const CHIP_PAD = 7;
  const CHIP_GAP = 4;
  const chipW = (label: string) => Math.ceil(textW12(label) * (CHIP_SP / 12) * 1.25) + 2 * CHIP_PAD;
  // Place des boutons ▶ : colonne de droite, ou (grand texte seul) reste de la ligne d'en-tête.
  const startAvail = showDay
    ? Rw
    : bigText
      ? Math.floor(innerW - (textW12(name) * (13 / 12) + 16) - (dataStale ? 8 + textW12(`màj ${clock(generatedAt)}`) * (11 / 12) + 4 : 0) - 8)
      : 0;
  const startChips = (() => {
    if (!canWrite || props.loading) return [] as { action: "sleep-start" | "walk-start"; label: string; tile: string; text: string }[];
    const sleepOn = lives.some((l) => l.kind === "sleep");
    const walkOn = lives.some((l) => l.kind === "walk");
    const sleepChip = sleepOn ? null : { action: "sleep-start" as const, label: napNow ? "▶ Sieste" : "▶ Nuit", tile: CAT.sleep.tile, text: CAT.sleep.text };
    for (const walkLabel of ["▶ Balade"]) {
      const walkChip = walkOn ? null : { action: "walk-start" as const, label: walkLabel, tile: CAT.walk.tile, text: CAT.walk.text };
      const chips = [sleepChip, walkChip].filter(Boolean) as { action: "sleep-start" | "walk-start"; label: string; tile: string; text: string }[];
      const total = chips.reduce((sum, c, i) => sum + chipW(c.label) + (i ? CHIP_GAP : 0), 0);
      if (total <= startAvail) return chips;
    }
    return sleepChip && chipW(sleepChip.label) <= startAvail ? [sleepChip] : [];
  })();

  const chipH = bigText ? HEAD_H : HEAD_H - 2;
  const startChipsRow = (w: number) => (
    <Row verticalAlignment="center" modifiers={[size(w, HEAD_H)]}>
      {startChips.map((c, i) => (
        <Row key={c.action} verticalAlignment="center">
          {i > 0 ? <Spacer modifiers={[width(CHIP_GAP)]} /> : null}
          <Box
            contentAlignment="center"
            modifiers={[height(chipH), background(c.tile), cornerRadius(chipH / 2), padding(CHIP_PAD, 0, CHIP_PAD, 0), ...timedMods(c.action)]}
          >
            {txt(c.label, c.text, CHIP_SP, true)}
          </Box>
        </Row>
      ))}
    </Row>
  );

  const container = [fillMaxSize(), background(C.bg), cornerRadius(20), paddingAll(PAD), a11y];

  // Données de plus de 24 h (membre retiré du foyer, consentement retiré, app
  // plus ouverte) : ni prénom ni données, seulement une invitation à ouvrir
  // l'app. Redessin programmé à l'heure dite (RefreshAt), comme l'iPhone.
  if (generatedAt > 0 && now - generatedAt > EXPIRE_MS) {
    const msg = "Ouvrez SuiviBaby pour mettre à jour";
    return (
      <Column
        modifiers={[fillMaxSize(), background(C.bg), cornerRadius(20), paddingAll(PAD), semantics({ contentDescription: `SuiviBaby. ${msg}` })]}
      >
        {txt("SuiviBaby", C.strong, 14, true)}
        {gap(8)}
        {txt(msg, C.soft, small ? 12 : 14, false, 2)}
      </Column>
    );
  }

  if (small) {
    return (
      <Column modifiers={container}>
        <Row verticalAlignment="center" modifiers={[height(HEAD_H)]}>
          {pill(13)}
          {staleTag}
          {bigText && startChips.length ? <Spacer modifiers={[width(8)]} /> : null}
          {bigText && startChips.length ? startChipsRow(startAvail) : null}
        </Row>
        {gap(HEAD_GAP)}
        {nowZone()}
        {band()}
        {refresh}
      </Column>
    );
  }

  return (
    <Column modifiers={container}>
      <Row verticalAlignment="center" modifiers={[height(HEAD_H)]}>
        <Row verticalAlignment="center" modifiers={[width(zoneW)]}>
          {pill(14)}
          {staleTag}
        </Row>
        {showDay ? <Spacer modifiers={[width(SEP)]} /> : null}
        {showDay ? (
          startChips.length ? (
            startChipsRow(Rw)
          ) : (
            <Column verticalAlignment="center" modifiers={[size(Rw, HEAD_H)]}>
              {txt("Aujourd'hui", C.soft, 12)}
            </Column>
          )
        ) : null}
      </Row>
      {gap(HEAD_GAP)}
      <Row>
        {nowZone()}
        {showDay ? <Spacer modifiers={[width(SEP_GAP)]} /> : null}
        {showDay ? <Box modifiers={[size(1, zoneH), background(C.rule)]} /> : null}
        {showDay ? <Spacer modifiers={[width(SEP_GAP)]} /> : null}
        {showDay ? dayColumn() : null}
      </Row>
      {refresh}
    </Column>
  );
};

export default createWidget("BebeMaintenant", BebeMaintenant, EMPTY_NOW_WIDGET_NATIVE);
