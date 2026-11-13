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
  fillMaxSize,
  height,
  padding,
  paddingAll,
  semantics,
  size,
  width,
} from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import { EMPTY_NOW_WIDGET_NATIVE, type NowWidgetProps, type WidgetLive } from "@/utils/widgetSnapshot";

const BebeMaintenant = (props: NowWidgetProps, environment: WidgetEnvironment) => {
  "widget";
  const dark = environment.colorScheme === "dark";
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
    nursing: { label: "Tétée", short: "Tétée", dot: "#D66B8F", tile: dark ? "#393243" : "#FDF0F4", text: dark ? "#E88FAE" : "#A63D62" },
    sleep: { label: "Sommeil", short: "Sommeil", dot: "#7C6BA4", tile: dark ? "#2c3246" : "#F5F3F8", text: dark ? "#A898D0" : "#5B4A85" },
    walk: { label: "Promenade", short: "Prom.", dot: "#8BC46B", tile: dark ? "#2e3f3e" : "#F3F9EF", text: dark ? "#8BC46B" : "#3F7A2A" },
    meal: { dot: "#E8785A", text: dark ? "#E8785A" : "#A83F23" },
    diaper: { dot: "#5BA4A4", text: dark ? "#5BA4A4" : "#2B6A6A" },
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

  const clock = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const sleepLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m} min`);
  const sideWord = (s: string | null | undefined) => (s === "G" ? "gauche" : s === "D" ? "droit" : "");
  const otherSide = (l: WidgetLive) =>
    l.otherSideLabel ? l.otherSideLabel.replace(/^G /, "gauche ").replace(/^D /, "droit ") : null;

  // Rendu à chaque envoi de l'app : l'heure du rendu fait foi pour les rappels.
  const now = Date.now();
  const mealLate = props.alerts.mealAtMs != null && now >= props.alerts.mealAtMs;
  const diaperLate = props.alerts.diaperAtMs != null && now >= props.alerts.diaperAtMs;
  const lives = props.lives ?? (props.live ? [props.live] : []);
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
  // Filet de fraîcheur : une session en cours sans mise à jour depuis 2 h peut
  // être finie ailleurs sans qu'on le sache ; on dit de quand date l'info.
  const STALE_LIVE_MS = 2 * HOUR;
  const generatedAt = props.generatedAtMs ?? 0;
  const liveStale = n > 0 && generatedAt > 0 && now - generatedAt > STALE_LIVE_MS;
  const day = props.day;

  // ----- Grille -----
  const env = environment as WidgetEnvironment & { widthDp?: number; heightDp?: number };
  const W = env.widthDp && env.widthDp > 0 ? env.widthDp : 420;
  const H = env.heightDp && env.heightDp > 0 ? env.heightDp : 222;
  const small = W < 250;
  const PAD = small ? 12 : 14;
  // En-tête : le prénom, dans une pastille, doit se lire avant tout le reste.
  const HEAD_H = small ? 22 : 26;
  const HEAD_GAP = small ? 4 : 6;
  const innerW = Math.floor(W - PAD * 2);
  const innerH = Math.floor(H - PAD * 2);
  const zoneH = innerH - HEAD_H - HEAD_GAP;
  const SEP = 25;
  const showDay = !small && day != null;
  const Rw = showDay ? Math.min(150, Math.max(112, Math.round(innerW * 0.36))) : 0;
  const zoneW = showDay ? innerW - Rw - SEP : innerW;
  const bandH = small && day && n <= 1 ? 26 : 0;

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
  const elapsed = (rawStartMs: number, color: string, sp: number, startMs = Math.min(rawStartMs, now)) =>
    nativeLevel >= 3 ? (
      <Elapsed startMs={startMs} pattern={now - startMs < HOUR ? "m' min'" : "H'h'mm"} color={color} fontSize={sp} />
    ) : (
      <Chrono startMs={startMs} color={color} fontSize={sp} />
    );
  // Les vues natives prennent toute la hauteur disponible : boîte de hauteur fixe.
  const fixedLine = (sp: number, child: React.ReactNode) => (
    <Box contentAlignment="centerStart" modifiers={[height(Math.ceil(sp * 1.25))]}>
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
        color={l.pausedAtMs != null ? C.softOnTile : C.strong}
        fontSize={sp}
      />
    ) : (
      elapsed(l.timerStartMs, C.strong, sp)
    );
  // Sommeil : « Sieste » ou « Nuit », comme sur l'Accueil.
  const labelOf = (l: WidgetLive) =>
    l.kind === "sleep" ? (l.nap === true ? "Sieste" : l.nap === false ? "Nuit" : "Sommeil") : CAT[l.kind].label;
  const sinceTime = (l: WidgetLive) => (l.sinceMs ? clock(l.sinceMs) : l.sinceLabel.replace("depuis ", ""));
  const MEAL_WORD: Record<string, string> = { tetee: "tétée", biberon: "biberon", solide: "repas solide" };
  const mealWord = props.lastMealKind ? MEAL_WORD[props.lastMealKind] ?? null : null;
  // Rappel réglé, pas encore dépassé : annoncé à l'avance.
  const upcoming = (atMs: number | null | undefined) => (atMs != null && atMs > now ? `rappel à ${clock(atMs)}` : null);

  // Au repos, dernier repas et dernier change côte à côte : les deux questions
  // de la nuit (« il a mangé quand ? », « changé quand ? »).
  const restDual = !small && n === 0 && (!!props.lastMealMs || !!day?.lastDiaperMs);
  const restDualZone = (h: number) => {
    const colGap = 10;
    const colW = Math.floor((zoneW - colGap) / 2);
    const big = zoneH < 108 ? 26 : 30;
    const sp = 12;
    const block = (
      label: string,
      accent: string,
      dotColor: string,
      ms: number | null | undefined,
      late: boolean,
      sub: string | null,
      ahead: string | null,
    ) => (
      <Column modifiers={[width(colW)]}>
        {labelRow(late ? C.alert : accent, late ? C.alert : dotColor, late ? `${label} · rappel` : label, sp)}
        {gap(2)}
        {ms ? fixedLine(big, elapsed(ms, late ? C.alert : C.strong, big)) : txt("—", C.soft, big, true)}
        {gap(2)}
        {txt(ms ? sub ?? `à ${clock(ms)}` : "pas encore", late ? C.alert : C.soft, sp)}
        {ahead ? txt(ahead, C.soft, sp) : null}
      </Column>
    );
    return (
      <Column verticalAlignment="center" modifiers={[size(zoneW, h)]}>
        <Row>
          {block(
            "Repas",
            CAT.meal.text,
            CAT.meal.dot,
            props.lastMealMs,
            mealLate,
            props.lastMealMs && mealWord && colW >= 120 ? `${mealWord} ${clock(props.lastMealMs)}` : null,
            upcoming(props.alerts.mealAtMs),
          )}
          <Spacer modifiers={[width(colGap)]} />
          {block("Change", CAT.diaper.text, CAT.diaper.dot, day?.lastDiaperMs, diaperLate, null, upcoming(props.alerts.diaperAtMs))}
        </Row>
        {props.nextSide ? gap(8) : null}
        {props.nextSide ? txt(`Prochain sein : ${sideWord(props.nextSide)}`, CAT.nursing.text, 13, true) : null}
      </Column>
    );
  };

  // ----- Zone « Maintenant » -----
  const restZone = () => {
    const h = zoneH - bandH;
    if (!props.lastMealMs) {
      return (
        <Column verticalAlignment="center" modifiers={[size(zoneW, h)]}>
          {txt("Pas encore de repas aujourd'hui", C.soft, small ? 12 : 14, false, 2)}
        </Column>
      );
    }
    if (restDual) return restDualZone(h);
    const big = small || zoneH < 108 ? 28 : 34;
    const sp = small ? 12 : 13;
    const at = `${mealWord && !small ? `${mealWord} ` : "à "}${clock(props.lastMealMs)}`;
    const ahead = upcoming(props.alerts.mealAtMs);
    return (
      <Column verticalAlignment="center" modifiers={[size(zoneW, h)]}>
        {labelRow(
          mealLate ? C.alert : CAT.meal.text,
          mealLate ? C.alert : CAT.meal.dot,
          mealLate ? "Dernier repas · rappel" : "Dernier repas",
          sp,
        )}
        {gap(2)}
        {fixedLine(big, elapsed(props.lastMealMs, mealLate ? C.alert : C.strong, big))}
        {gap(2)}
        {props.nextSide && small
          ? txt(`Prochain sein : ${props.nextSide}`, CAT.nursing.text, sp, true)
          : txt(ahead && !small ? `${at} · ${ahead}` : at, mealLate ? C.alert : C.soft, sp)}
        {props.nextSide && !small ? gap(2) : null}
        {props.nextSide && !small ? txt(`Prochain sein : ${sideWord(props.nextSide)}`, CAT.nursing.text, sp, true) : null}
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
    const chronoSp = small ? Math.min(28, Math.floor((zoneW - 20) / 4.3)) : Math.min(36, Math.floor((zoneW - 24) / 4.3));
    // Tétée : l'autre sein et l'heure de début passent sous le chrono (titre déjà long).
    const other = l.kind === "nursing" ? otherSide(l) : null;
    const under = l.kind === "nursing" ? (other ? `${other} · depuis ${sinceTime(l)}` : `depuis ${sinceTime(l)}`) : small ? `depuis ${sinceTime(l)}` : null;
    return (
      <Column
        verticalAlignment="center"
        modifiers={[size(zoneW, zoneH - bandH), background(k.tile), cornerRadius(16), paddingAll(small ? 10 : 12)]}
      >
        {labelRow(k.text, k.dot, tileTitle(l, false), small ? 12 : 13)}
        {gap(4)}
        {chrono(l, chronoSp)}
        {under ? gap(2) : null}
        {under ? txt(under, C.softOnTile, small ? 12 : 13) : null}
      </Column>
    );
  };

  const rowTile = (l: WidgetLive, h: number) => {
    const k = CAT[l.kind];
    return (
      <Column verticalAlignment="center" modifiers={[size(zoneW, h), background(k.tile), cornerRadius(12), padding(10, 6, 10, 6)]}>
        {labelRow(k.text, k.dot, tileTitle(l, !small), 12)}
        {chrono(l, small ? 22 : h >= 58 ? 26 : 22)}
      </Column>
    );
  };

  const compactTile = (l: WidgetLive, h: number) => {
    const k = CAT[l.kind];
    const labelW = small ? 56 : 74;
    const label =
      l.kind === "nursing" && l.side ? `${k.short} ${l.side}` : small && l.kind === "walk" ? k.short : labelOf(l);
    return (
      <Row verticalAlignment="center" modifiers={[size(zoneW, h), background(k.tile), cornerRadius(12), padding(10, 0, 10, 0)]}>
        <Row verticalAlignment="center" modifiers={[width(labelW)]}>
          {dot(k.dot)}
          <Spacer modifiers={[width(5)]} />
          {txt(label, k.text, small ? 11 : 12, true)}
        </Row>
        <Box contentAlignment="centerEnd" modifiers={[width(zoneW - 20 - labelW)]}>
          {chrono(l, small ? 16 : h >= 36 ? 20 : 16)}
        </Box>
      </Row>
    );
  };

  const nowZone = () => {
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

  // ----- Colonne « Aujourd'hui » (4×2) : liste qui défile -----
  // En haut, les trois résumés (repas, changes, sommeil) ; en dessous, les
  // événements du jour du plus récent au plus ancien. On fait défiler vers le
  // haut pour les voir.
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
    const ITEM_H = 40;
    const item = (key: string, dotColor: string, value: string, sub: string | null, late: boolean) => (
      <Row key={key} verticalAlignment="center" modifiers={[size(Rw, ITEM_H)]}>
        {dot(late ? C.alert : dotColor)}
        <Spacer modifiers={[width(8)]} />
        <Column>
          {txt(value, late ? C.alert : C.strong, 15, true)}
          {sub ? txt(sub, late ? C.alert : C.soft, 12) : null}
        </Column>
      </Row>
    );
    // Au repos côte à côte, les heures sont déjà à gauche : pas de doublon.
    const mealSub = restDual
      ? day.bottleMl > 0
        ? `${day.bottleMl} ml de lait`
        : null
      : day.lastMealMs
      ? mealLate
        ? `rappel · ${clock(day.lastMealMs)}`
        : Rw >= 140 && day.bottleMl > 0
          ? `${clock(day.lastMealMs)} · ${day.bottleMl} ml`
          : `dernier ${clock(day.lastMealMs)}`
      : null;
    const diaperSub = restDual
      ? null
      : day.lastDiaperMs
      ? diaperLate
        ? `rappel · ${clock(day.lastDiaperMs)}`
        : `dernier ${clock(day.lastDiaperMs)}`
      : null;
    const events = props.recent ?? [];
    return (
      <LazyColumn modifiers={[size(Rw, zoneH)]}>
        {item("meal", CAT.meal.dot, `${day.mealsCount} repas`, mealSub, mealLate && n > 0)}
        {item("diaper", CAT.diaper.dot, `${day.diapersCount} change${day.diapersCount > 1 ? "s" : ""}`, diaperSub, diaperLate)}
        {item("sleep", CAT.sleep.dot, sleepLabel(day.sleepMinutes), "de sommeil", false)}
        {events.length ? (
          <Column key="events-title" modifiers={[size(Rw, 26)]} verticalAlignment="bottom">
            {txt("Fil du jour", C.soft, 12)}
          </Column>
        ) : null}
        {events.map((e, i) => (
          <Row key={`ev-${i}-${e.ms}`} verticalAlignment="center" modifiers={[size(Rw, 24)]}>
            {e.icon ? (
              <Box modifiers={[size(18, 24)]} contentAlignment="center">
                {txt(e.icon, C.strong, 12)}
              </Box>
            ) : (
              dot(e.kind === "meal" ? CAT.meal.dot : e.kind === "diaper" ? CAT.diaper.dot : C.soft)
            )}
            <Spacer modifiers={[width(e.icon ? 4 : 8)]} />
            {txt(clock(e.ms), C.soft, 12)}
            <Spacer modifiers={[width(6)]} />
            {txt(e.label, C.strong, 12)}
          </Row>
        ))}
      </LazyColumn>
    );
  };

  // ----- Bande du bas (2×2, au plus une session) -----
  const band = () => {
    if (!bandH || !day || dayStale) return null;
    const colW = Math.floor(innerW / 3);
    const cell = (dotColor: string, value: string, late: boolean) => (
      <Row verticalAlignment="center" modifiers={[width(colW)]}>
        {dot(late ? C.alert : dotColor)}
        <Spacer modifiers={[width(4)]} />
        {txt(value, late ? C.alert : C.strong, 13, true)}
      </Row>
    );
    return (
      <Column>
        {gap(8)}
        <Row>
          {cell(CAT.meal.dot, `${day.mealsCount}`, mealLate && n > 0)}
          {cell(CAT.diaper.dot, `${day.diapersCount}`, diaperLate)}
          {cell(CAT.sleep.dot, sleepLabel(day.sleepMinutes).replace(" min", "m").replace(" h ", "h"), false)}
        </Row>
      </Column>
    );
  };

  // Prochain redessin utile : passage à 1 h d'une durée, rappel qui passe au rouge.
  const refreshCandidates = [
    ...lives.filter((l) => l.kind !== "nursing").map((l) => l.timerStartMs + HOUR),
    ...(n === 0 && props.lastMealMs ? [props.lastMealMs + HOUR] : []),
    nextMidnight,
    ...(n > 0 && generatedAt > 0 ? [generatedAt + STALE_LIVE_MS] : []),
    ...(restDual && day?.lastDiaperMs ? [day.lastDiaperMs + HOUR] : []),
    props.alerts.mealAtMs ?? 0,
    props.alerts.diaperAtMs ?? 0,
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
  const staleTag = liveStale ? (
    <Row verticalAlignment="center">
      <Spacer modifiers={[width(8)]} />
      {txt(`màj ${clock(generatedAt)}`, C.soft, small ? 11 : 12)}
    </Row>
  ) : null;

  // Libellé lu par TalkBack sur tout le widget (le clic ouvre l'app).
  const a11yLive = (l: WidgetLive) => {
    if (l.kind === "nursing") {
      const parts = [`Tétée${l.pausedAtMs != null ? " en pause" : " en cours"}`];
      if (l.side) parts.push(`sein ${sideWord(l.side)}`);
      if (l.otherSideLabel) parts.push(`autre sein ${otherSide(l)}`);
      parts.push(l.sinceLabel);
      return parts.join(", ");
    }
    return `${labelOf(l)} en cours, ${l.sinceLabel}`;
  };
  const a11yParts = [name];
  if (n > 0) a11yParts.push(...lives.map(a11yLive));
  // Le libellé n'est recalculé qu'à chaque rendu : on lit l'heure (toujours
  // juste) plutôt qu'une durée « il y a » qui vieillirait entre deux rendus.
  const a11yLast = (what: string, ms: number, late: boolean, atMs: number | null | undefined) =>
    `${what} à ${clock(ms)}${late ? ", rappel dépassé" : atMs != null && atMs > now ? `, rappel à ${clock(atMs)}` : ""}`;
  if (n === 0 && props.lastMealMs) a11yParts.push(a11yLast("Dernier repas", props.lastMealMs, mealLate, props.alerts.mealAtMs));
  if (restDual && day?.lastDiaperMs) a11yParts.push(a11yLast("Dernier change", day.lastDiaperMs, diaperLate, props.alerts.diaperAtMs));
  if (props.nextSide && n === 0) a11yParts.push(`Prochain sein : ${sideWord(props.nextSide)}`);
  if (day && !dayStale) {
    a11yParts.push(
      `Aujourd'hui : ${day.mealsCount} repas, ${day.diapersCount} change${day.diapersCount > 1 ? "s" : ""}${diaperLate ? " (rappel dépassé)" : ""}, ${sleepLabel(day.sleepMinutes)} de sommeil`,
    );
  }
  if (liveStale) a11yParts.push(`Informations mises à jour à ${clock(generatedAt)}`);
  a11yParts.push("Toucher pour ouvrir SuiviBaby");
  const a11y = semantics({ contentDescription: a11yParts.join(". ") });

  const container = [fillMaxSize(), background(C.bg), cornerRadius(20), paddingAll(PAD), a11y];

  if (small) {
    return (
      <Column modifiers={container}>
        <Row verticalAlignment="center" modifiers={[height(HEAD_H)]}>
          {pill(13)}
          {staleTag}
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
          <Column verticalAlignment="center" modifiers={[size(Rw, HEAD_H)]}>
            {txt("Aujourd'hui", C.soft, 12)}
          </Column>
        ) : null}
      </Row>
      {gap(HEAD_GAP)}
      <Row>
        {nowZone()}
        {showDay ? <Spacer modifiers={[width(12)]} /> : null}
        {showDay ? <Box modifiers={[size(1, zoneH), background(C.rule)]} /> : null}
        {showDay ? <Spacer modifiers={[width(12)]} /> : null}
        {showDay ? dayColumn() : null}
      </Row>
      {refresh}
    </Column>
  );
};

export default createWidget("BebeMaintenant", BebeMaintenant, EMPTY_NOW_WIDGET_NATIVE);
