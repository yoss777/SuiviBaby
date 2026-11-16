// widgets/BebeMaintenant.ios.tsx
// Widget iOS « Bébé maintenant » (expo-widgets, SwiftUI via @expo/ui).
// Le composant s'exécute dans l'extension, isolé de l'app : pas de hooks, pas
// d'import utilisable hors des composants Expo UI, et aucune valeur déclarée
// hors de la fonction (couleurs et libellés sont donc déclarés dedans).
// Les données viennent de utils/widgetSnapshot.ts (updateSnapshot depuis l'app).
// Le chrono défile seul (Text timerInterval) : aucun rechargement dépensé.
import { HStack, Image, Link, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  background,
  clipShape,
  contentShape,
  padding,
  shapes,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  privacySensitive,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import { EMPTY_NOW_WIDGET_NATIVE, type NowWidgetProps, type WidgetLive } from "@/utils/widgetSnapshot";

const BebeMaintenant = (props: NowWidgetProps, environment: WidgetEnvironment) => {
  "widget";
  const dark = environment.colorScheme === "dark";
  const C = {
    bg: dark ? "#1f2937" : "#ffffff",
    strong: dark ? "#f9fafb" : "#1f2937",
    soft: dark ? "#9ca3af" : "#6b7280",
    alert: dark ? "#f87171" : "#b91c1c",
    rule: dark ? "#374151" : "#e5e7eb",
    nursing: "#D66B8F",
    sleep: "#7C6BA4",
    walk: "#8BC46B",
    meal: "#E8785A",
    diaper: "#5BA4A4",
  };
  const KIND = {
    nursing: { label: "Tétée", symbol: "drop.fill", color: C.nursing, path: "nursing" },
    sleep: { label: "Sommeil", symbol: "moon.zzz.fill", color: C.sleep, path: "sleep" },
    walk: { label: "Balade", symbol: "figure.walk", color: C.walk, path: "walk" },
  };
  const now = environment.date ? new Date(environment.date).getTime() : Date.now();
  const family = environment.widgetFamily;
  // Tétée oubliée (brouillon expiré : 3 h sans action, 1 h en pause) : retirée, comme dans l'app.
  const alive = (l: WidgetLive | null | undefined) =>
    !!l && !(l.expiresAtMs != null && (environment.date ? new Date(environment.date).getTime() : Date.now()) >= l.expiresAtMs);
  const live = alive(props.live) ? props.live : (props.lives ?? []).find(alive) ?? null;
  // Toutes les sessions en cours (tétée, sommeil, promenade), comme sur Android.
  const lives: WidgetLive[] = (props.lives ?? (live ? [live] : [])).filter(alive);
  // Sommeil : « Sieste » ou « Nuit », comme sur l'Accueil.
  const labelOf = (l: WidgetLive) =>
    l.kind === "sleep" ? (l.nap === true ? "Sieste" : l.nap === false ? "Nuit" : "Sommeil") : KIND[l.kind].label;
  const info = live ? { ...KIND[live.kind], label: labelOf(live) } : null;
  const mealLate = props.alerts.mealAtMs != null && now >= props.alerts.mealAtMs;
  const diaperLate = props.alerts.diaperAtMs != null && now >= props.alerts.diaperAtMs;
  // Appui : la tétée en cours ou le formulaire repas (hooks/useWidgetDeepLink.ts).
  const child = props.childId ? `&child=${encodeURIComponent(props.childId)}` : "";
  // Proche (lecture seule) : l'appui ouvre l'Accueil, sans formulaire.
  const url =
    props.canWrite === false
      ? "suivibaby:///baby/home"
      : `suivibaby:///baby/home?widget=${live?.kind === "nursing" ? "nursing" : "meal"}${child}`;
  const bg = containerBackground(C.bg, "widget");
  // Démarrer / arrêter sieste-nuit et promenade (Parent, moyen et grand) :
  // le lien ouvre l'app, qui agit tout de suite. Nuit de 19:00 à 8:00.
  const canWrite = props.canWrite !== false;
  const napNow = (() => {
    const hour = new Date(environment.date ? new Date(environment.date).getTime() : Date.now()).getHours();
    return hour >= 8 && hour < 19;
  })();
  // Démarrer / arrêter : &k= porte la clé des liens de l'appareil (sinon l'app
  // demande confirmation, services/widgetLinkKey.ts).
  const actionUrl = (action: string) =>
    `suivibaby:///baby/home?widget=${action}${child}${action === "sleep-start" ? `&nap=${napNow ? 1 : 0}` : ""}${props.linkKey ? `&k=${props.linkKey}` : ""}`;
  // Écran d'accueil, comme Android : le fond ouvre l'Accueil ; seules certaines
  // zones ouvrent un formulaire (repas, change, tétée en cours).
  const homeUrl = "suivibaby:///baby/home";
  const zoneUrl = (action: "meal" | "diaper" | "nursing" | "sleep") => (canWrite ? `${homeUrl}?widget=${action}${child}` : homeUrl);
  const ZONE_SAY = { meal: "Noter un repas", diaper: "Noter un change", nursing: "Ouvrir la tétée en cours", sleep: "Noter un sommeil" };
  // Le lien enveloppe la zone : padding, fond et cadre sont posés sur l'enfant,
  // sinon (modificateurs posés hors du Link) les bords tombent sur le fond.
  const zone = (action: "meal" | "diaper" | "nursing" | "sleep", say: string, content: React.ReactElement, key?: string) => (
    <Link
      key={key ?? action}
      destination={zoneUrl(action)}
      modifiers={[accessibilityLabel(`${say}. ${canWrite ? ZONE_SAY[action] : "Consulter dans SuiviBaby"}`)]}
    >
      <VStack alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10000, alignment: "leading" }), contentShape(shapes.rectangle())]}>
        {content}
      </VStack>
    </Link>
  );
  // Tuile tétée : le lien couvre le contenu, pas « ■ Arrêter » (pas de lien dans un lien).
  const tileLink = (l: WidgetLive, content: React.ReactElement) =>
    l.kind === "nursing" && !small ? zone("nursing", a11yOf(l), content, `tile-${l.kind}`) : content;
  const far = new Date(now + 24 * 3600 * 1000);
  // Compteurs d'un jour passé (minuit franchi sans nouvel envoi) : masqués.
  const dayStart = props.dayStartMs ?? 0;
  const nextMidnight = dayStart > 0
    ? new Date(new Date(dayStart).getFullYear(), new Date(dayStart).getMonth(), new Date(dayStart).getDate() + 1).getTime()
    : 0;
  const dayStale = nextMidnight > 0 && now >= nextMidnight;
  // Sommeil en cours compté dans le total du jour (jusqu'à l'instant du rendu).
  const sleepFrom =
    props.day?.sleepRunningFromMs != null && lives.some((l) => l.kind === "sleep") ? Math.min(props.day.sleepRunningFromMs, now) : null;
  const sleepNowMin = (props.day?.sleepMinutes ?? 0) + (sleepFrom != null ? Math.max(0, Math.round((now - sleepFrom) / 60000)) : 0);
  // Info de plus de 2 h : on dit de quand elle date.
  const generatedAt = props.generatedAtMs ?? 0;
  const dataStale = generatedAt > 0 && now - generatedAt > 2 * 3600 * 1000;

  // Durées à la minute (« 45 min », « 1h08 ») comme Android, calculées depuis
  // l'heure de l'entrée de timeline (services/widgetSync.ts). Hors timeline
  // (ancienne app, timeline épuisée) : compteurs natifs d'iOS, avec secondes.
  const inTimeline = props.timelineEndMs != null && now < props.timelineEndMs;
  const minutesText = (startMs: number) => {
    const m = Math.max(0, Math.floor((now - startMs) / 60000));
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  };
  // Sommeil, promenade : « 0 min » dès le départ, comme Android (pas de
  // secondes la 1re minute : non fiable sur Android, même comportement voulu).
  const timerOf = (l: WidgetLive | null, size: number) =>
    l && l.kind !== "nursing" && inTimeline ? (
      <Text modifiers={[font({ size, weight: "bold" }), monospacedDigit(), foregroundStyle(dataStale ? C.soft : C.strong), minimumScaleFactor(0.7), lineLimit(1)]}>
        {minutesText(l.timerStartMs)}
      </Text>
    ) : l ? (
      <Text
        timerInterval={{ lower: new Date(l.timerStartMs), upper: far }}
        countsDown={false}
        pauseTime={l.pausedAtMs != null ? new Date(l.pausedAtMs) : undefined}
        modifiers={[font({ size, weight: "bold" }), monospacedDigit(), foregroundStyle(dataStale ? C.soft : C.strong), minimumScaleFactor(0.7), lineLimit(1)]}
      />
    ) : null;
  const timer = (size: number) => timerOf(live, size);

  const a11yOf = (l: WidgetLive) =>
    `${labelOf(l)} en cours${l.side ? `, sein ${l.side === "G" ? "gauche" : "droit"}` : ""}, ${l.sinceLabel}${l.pausedAtMs != null ? ", en pause" : ""}`;
  const liveA11y = lives.map(a11yOf).join(". ");

  // Données de plus de 24 h (membre retiré du foyer, consentement retiré,
  // app plus ouverte) : ni prénom ni données, seulement une invitation à
  // ouvrir l'app. Décidé par le widget à l'heure dite (entrée de timeline
  // préparée, services/widgetSync.ts) : garanti sans réseau ni notification.
  if (generatedAt > 0 && now - generatedAt > 24 * 3600 * 1000) {
    const msg = "Ouvrez SuiviBaby pour mettre à jour";
    if (family === "accessoryInline") return <Text modifiers={[widgetURL(homeUrl)]}>SuiviBaby</Text>;
    if (family === "accessoryRectangular" || family === "accessoryCircular") {
      return (
        <VStack alignment="leading" spacing={2} modifiers={[widgetURL(homeUrl)]}>
          <Text modifiers={[font({ size: 13, weight: "semibold" })]}>SuiviBaby</Text>
          {family === "accessoryRectangular" ? <Text modifiers={[font({ size: 12 })]}>{msg}</Text> : null}
        </VStack>
      );
    }
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[bg, widgetURL(homeUrl), frame({ maxWidth: 10000, maxHeight: 10000, alignment: "topLeading" }), accessibilityLabel(`SuiviBaby. ${msg}`)]}
      >
        <Text modifiers={[font({ size: 13, weight: "bold" }), foregroundStyle(C.strong)]}>SuiviBaby</Text>
        <Spacer />
        <Text modifiers={[font({ size: 14 }), foregroundStyle(C.soft)]}>{msg}</Text>
      </VStack>
    );
  }

  // ----- Écran verrouillé -----
  if (family === "accessoryInline") {
    return live ? (
      <Text modifiers={[widgetURL(url), privacySensitive()]}>{`${info?.label}${live.side ? ` ${live.side}` : ""} ${live.sinceLabel}`}</Text>
    ) : (
      <Text modifiers={[widgetURL(url), privacySensitive()]}>
        {props.lastMealMs ? `Repas à ${new Date(props.lastMealMs).toTimeString().slice(0, 5)}` : "SuiviBaby"}
      </Text>
    );
  }
  if (family === "accessoryRectangular") {
    return (
      <VStack alignment="leading" spacing={2} modifiers={[widgetURL(url), privacySensitive()]}>
        {live ? (
          <>
            <Text modifiers={[font({ size: 13, weight: "semibold" })]}>
              {`${info?.label}${live.side ? ` · ${live.side}` : ""}${live.pausedAtMs != null ? " · en pause" : ""}`}
            </Text>
            {timer(22)}
            {live.otherSideLabel ? <Text modifiers={[font({ size: 12 })]}>{live.otherSideLabel}</Text> : null}
          </>
        ) : (
          <>
            <Text modifiers={[font({ size: 13, weight: "semibold" })]}>{mealLate ? "Repas en retard" : "Dernier repas"}</Text>
            {props.lastMealMs ? (
              <Text date={new Date(props.lastMealMs)} dateStyle="relative" modifiers={[font({ size: 20, weight: "bold" }), monospacedDigit()]} />
            ) : (
              <Text modifiers={[font({ size: 15 })]}>—</Text>
            )}
          </>
        )}
      </VStack>
    );
  }

  // ===== Écran d'accueil : même structure qu'Android (widgets/BebeMaintenant.android.tsx) =====
  const T = {
    softOnTile: dark ? "#d1d5db" : "#4b5563",
    pillBg: dark ? "#1e3a5f" : "#e0f0f5",
    pillText: dark ? "#bfdbfe" : "#075f80",
  };
  const CAT = {
    nursing: { short: "Tétée", dot: "#D66B8F", tile: dark ? "#393243" : "#FBE1EA", text: dark ? "#E88FAE" : "#A63D62" },
    sleep: { short: "Sommeil", dot: "#7C6BA4", tile: dark ? "#2c3246" : "#ECE8F4", text: dark ? "#A898D0" : "#5B4A85" },
    walk: { short: "Balade", dot: "#8BC46B", tile: dark ? "#2e3f3e" : "#E6F2DE", text: dark ? "#8BC46B" : "#3F7A2A" },
    meal: { dot: "#E8785A", text: dark ? "#E8785A" : "#A83F23" },
    diaper: { dot: "#5BA4A4", text: dark ? "#5BA4A4" : "#2B6A6A" },
  };
  const small = family === "systemSmall";
  const day = props.day;
  const clock = (ms: number | null | undefined) => (ms ? new Date(ms).toTimeString().slice(0, 5) : "—");
  const sleepLabel = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`);
  const dayKey = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const daysAgo = (ms: number) => Math.round((dayKey(now) - dayKey(ms)) / 86400000);
  const ddmm = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const lastWhen = (ms: number) => {
    const k = daysAgo(ms);
    return k <= 0 ? `dernier à ${clock(ms)}` : k === 1 ? `dernier hier à ${clock(ms)}` : `dernier le ${ddmm(ms)}`;
  };
  const lateWhen = (ms: number) => {
    const k = daysAgo(ms);
    return k <= 0 ? `rappel · dernier à ${clock(ms)}` : k === 1 ? `rappel · dernier hier à ${clock(ms)}` : `rappel · dernier le ${ddmm(ms)}`;
  };
  const agoText = (ms: number) =>
    now - ms >= (23 * 60 + 50) * 60000 ? `${Math.max(1, Math.round((now - ms) / 86400000))} j` : minutesText(ms);
  const dotText = (color: string, size = 9) => <Text modifiers={[font({ size }), foregroundStyle(color)]}>●</Text>;
  const sideWord = (side: string | null | undefined) => (side === "G" ? "gauche" : side === "D" ? "droit" : "");
  const otherSide = (l: WidgetLive) =>
    l.otherSideLabel ? l.otherSideLabel.replace(/^G /, "gauche ").replace(/^D /, "droit ") : null;
  const sinceTime = (l: WidgetLive) => (l.sinceMs ? clock(l.sinceMs) : l.sinceLabel.replace("depuis ", ""));
  const stopOf = (l: WidgetLive) => (l.kind === "sleep" ? "sleep-stop" : l.kind === "walk" ? "walk-stop" : "nursing-stop");

  // Bouton « ■ Arrêter » (ou « ■ ») sur fond du widget, comme Android.
  const stopChip = (l: WidgetLive, compact: boolean) => (
    <Link key={`stop-${l.kind}`} destination={actionUrl(stopOf(l))} modifiers={[accessibilityLabel(`Arrêter : ${labelOf(l)}`)]}>
      <Text
        modifiers={[
          font({ size: 12, weight: "semibold" }),
          foregroundStyle(CAT[l.kind].text),
          lineLimit(1),
          padding({ top: 6, bottom: 6, leading: compact ? 10 : 12, trailing: compact ? 10 : 12 }),
          background(C.bg),
          clipShape("capsule"),
        ]}
      >
        {compact ? "■" : "■ Arrêter"}
      </Text>
    </Link>
  );
  const tileTitle = (l: WidgetLive, withOther: boolean) => {
    if (l.kind === "nursing") {
      const other = withOther ? otherSide(l) : null;
      return `Tétée${l.pausedAtMs != null ? " en pause" : ""}${l.side ? ` · ${sideWord(l.side)}` : ""}${other ? ` · ${other}` : ""}`;
    }
    return small ? labelOf(l) : `${labelOf(l)} · depuis ${sinceTime(l)}`;
  };
  const tileMods = (l: WidgetLive, radius: number, pad: number) => [
    padding({ top: pad, bottom: pad, leading: pad + 2, trailing: pad + 2 }),
    frame({ maxWidth: 10000, maxHeight: 10000, alignment: "leading" }),
    background(CAT[l.kind].tile),
    clipShape("roundedRectangle", radius),
  ];
  const titleRow = (l: WidgetLive, text: string, sp: number) => (
    <HStack spacing={5}>
      {dotText(CAT[l.kind].dot, 8)}
      <Text modifiers={[font({ size: sp, weight: "semibold" }), foregroundStyle(CAT[l.kind].text), lineLimit(1), minimumScaleFactor(0.8)]}>{text}</Text>
    </HStack>
  );
  // Une session : grande tuile (titre, chrono, autre sein, « ■ Arrêter »).
  const singleTile = (l: WidgetLive) => {
    const other = l.kind === "nursing" ? otherSide(l) : null;
    const under = l.kind === "nursing" ? (other ? `${other} · depuis ${sinceTime(l)}` : `depuis ${sinceTime(l)}`) : small ? `depuis ${sinceTime(l)}` : null;
    return (
      <VStack alignment="leading" spacing={3} modifiers={tileMods(l, 16, small ? 9 : 10)}>
        {tileLink(
          l,
          <VStack alignment="leading" spacing={3} modifiers={[accessibilityLabel(a11yOf(l))]}>
            {titleRow(l, tileTitle(l, false), small ? 12 : 13)}
            {timerOf(l, small ? 26 : 30)}
            {under ? <Text modifiers={[font({ size: small ? 11 : 12 }), monospacedDigit(), foregroundStyle(T.softOnTile), lineLimit(1)]}>{under}</Text> : null}
          </VStack>,
        )}
        {canWrite && !small ? stopChip(l, false) : null}
      </VStack>
    );
  };
  // Deux sessions : une tuile par session, chrono et « ■ » à droite.
  const rowTile = (l: WidgetLive) => (
    <HStack spacing={6} alignment="bottom" modifiers={tileMods(l, 12, 6)}>
      {tileLink(
        l,
        <VStack alignment="leading" spacing={1} modifiers={[accessibilityLabel(a11yOf(l)), frame({ maxWidth: 10000, alignment: "leading" })]}>
          {titleRow(l, tileTitle(l, !small), 12)}
          {timerOf(l, small ? 18 : 22)}
        </VStack>,
      )}
      {/* Petit format : un seul lien pour tout le widget, pas de « ■ ». */}
      {canWrite && !small ? stopChip(l, true) : null}
    </HStack>
  );
  // Trois sessions : lignes compactes.
  const compactTile = (l: WidgetLive) => (
    <HStack spacing={6} modifiers={tileMods(l, 12, 4)}>
      {tileLink(
        l,
        <HStack spacing={5} modifiers={[accessibilityLabel(a11yOf(l))]}>
          {dotText(CAT[l.kind].dot, 8)}
          <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(CAT[l.kind].text), lineLimit(1)]}>
            {l.kind === "nursing" && l.side ? `${CAT.nursing.short} ${l.side}` : labelOf(l)}
          </Text>
          <Spacer />
          {timerOf(l, 15)}
        </HStack>,
      )}
      {canWrite && !small ? stopChip(l, true) : null}
    </HStack>
  );

  // À droite du chiffre : « rappel / dépassé » (rouge) ou « rappel / 18:20 ».
  const reminderPile = (late: boolean, atMs: number | null | undefined) =>
    late || (atMs != null && atMs > now) ? (
      <VStack alignment="leading" spacing={0}>
        <Text modifiers={[font({ size: 12, weight: late ? "semibold" : "regular" }), foregroundStyle(late ? C.alert : C.soft)]}>rappel</Text>
        <Text modifiers={[font({ size: 12 }), monospacedDigit(), foregroundStyle(late ? C.alert : C.soft)]}>{late ? "dépassé" : clock(atMs)}</Text>
      </VStack>
    ) : null;
  const underHour = (ms: number) => now - ms < 3600000;
  const restSay = (label: string, ms: number | null | undefined, late: boolean) =>
    ms ? `${label} il y a ${agoText(ms)}${late ? ", rappel dépassé" : ""}` : `${label} : pas encore`;
  const restBlock = (label: string, cat: { dot: string; text: string }, ms: number | null | undefined, late: boolean, atMs: number | null | undefined, sp: number) => (
    <VStack alignment="leading" spacing={0}>
      <HStack spacing={5}>
        {dotText(late ? C.alert : cat.dot, 8)}
        <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(late ? C.alert : cat.text), lineLimit(1)]}>{label}</Text>
      </HStack>
      {ms ? (
        <HStack spacing={0} alignment="lastTextBaseline">
          <Text modifiers={[font({ size: 12 }), foregroundStyle(late ? C.alert : C.soft), padding({ trailing: 4 })]}>il y a</Text>
          {/* Boîte de largeur fixe (≈ 3 × la taille, « 14h52 »), comme Android :
              « rappel / dépassé » reste à la même place d'une ligne à l'autre. */}
          <Text
            modifiers={[
              font({ size: underHour(ms) ? Math.round(sp * 0.8) : sp, weight: "bold" }),
              monospacedDigit(),
              foregroundStyle(late ? C.alert : C.strong),
              minimumScaleFactor(0.7),
              lineLimit(1),
              frame({ width: underHour(ms) ? Math.ceil(sp * 0.8 * 3.8) : Math.ceil(sp * 3), alignment: "leading" }),
            ]}
          >
            {agoText(ms)}
          </Text>
          {reminderPile(late, atMs) ? <VStack modifiers={[padding({ leading: 6 })]}>{reminderPile(late, atMs)}</VStack> : null}
        </HStack>
      ) : (
        <Text modifiers={[font({ size: 15 }), foregroundStyle(C.soft)]}>pas encore</Text>
      )}
    </VStack>
  );

  // Zone « Maintenant » (gauche) : chargement, sessions ou repos.
  const nowZone = () => {
    if (props.loading) return <Text modifiers={[font({ size: small ? 12 : 14 }), foregroundStyle(C.soft)]}>Mise à jour…</Text>;
    if (lives.length === 1) return singleTile(lives[0]);
    if (lives.length > 1) {
      return (
        <VStack alignment="leading" spacing={6}>
          {lives.map((l) => (lives.length === 2 ? rowTile(l) : compactTile(l)))}
        </VStack>
      );
    }
    if (small) {
      return props.lastMealMs ? (
        restBlock("Dernier repas", CAT.meal, props.lastMealMs, mealLate, props.alerts.mealAtMs, 26)
      ) : (
        <Text modifiers={[font({ size: 12 }), foregroundStyle(C.soft)]}>Aucun repas noté</Text>
      );
    }
    return (
      <VStack alignment="leading" spacing={8}>
        {zone("meal", restSay("Dernier repas", props.lastMealMs, mealLate), restBlock("Dernier repas", CAT.meal, props.lastMealMs, mealLate, props.alerts.mealAtMs, 26))}
        {zone("diaper", restSay("Dernier change", day?.lastDiaperMs, diaperLate), restBlock("Dernier change", CAT.diaper, day?.lastDiaperMs, diaperLate, props.alerts.diaperAtMs, 26))}
      </VStack>
    );
  };

  // Colonne « Aujourd'hui » (droite), comme Android.
  const dayRow = (color: string, main: string, sub: string | null, late: boolean) => (
    <HStack spacing={8} alignment="center" modifiers={[frame({ minHeight: 32, alignment: "leading" })]}>
      {dotText(late ? C.alert : color)}
      <VStack alignment="leading" spacing={0}>
        <Text modifiers={[font({ size: 15, weight: "semibold" }), monospacedDigit(), foregroundStyle(late ? C.alert : C.strong), lineLimit(1)]}>{main}</Text>
        {sub ? <Text modifiers={[font({ size: 12 }), monospacedDigit(), foregroundStyle(late ? C.alert : C.soft), lineLimit(1), minimumScaleFactor(0.8)]}>{sub}</Text> : null}
      </VStack>
    </HStack>
  );
  const mealSub = day?.lastMealMs
    ? mealLate
      ? lateWhen(day.lastMealMs)
      : day.bottleMl > 0 && daysAgo(day.lastMealMs) <= 0
        ? `${clock(day.lastMealMs)} · ${day.bottleMl} ml`
        : lastWhen(day.lastMealMs)
    : day?.noMealEver
      ? "aucun noté"
      : null;
  const diaperSub = day?.lastDiaperMs ? (diaperLate ? lateWhen(day.lastDiaperMs) : lastWhen(day.lastDiaperMs)) : day?.noDiaperEver ? "aucun noté" : null;
  // Largeur fixe de la colonne, comme Android (38 % de l'intérieur, 112 à 156).
  const DAY_W = family === "systemLarge" ? 136 : 126;
  const dayColumn = () =>
    !day ? null : dayStale ? (
      <VStack alignment="leading" spacing={2} modifiers={[frame({ width: DAY_W, alignment: "topLeading" })]}>
        <Text modifiers={[font({ size: 14, weight: "semibold" }), foregroundStyle(C.strong)]}>Nouvelle journée</Text>
        <Text modifiers={[font({ size: 11 }), foregroundStyle(C.soft)]}>Mise à jour à la prochaine saisie</Text>
      </VStack>
    ) : (
      <VStack alignment="leading" spacing={0} modifiers={[frame({ minWidth: DAY_W, maxWidth: DAY_W, maxHeight: 10000, alignment: "topLeading" })]}>
        {zone("meal", `${day.mealsCount} repas${mealSub ? `, ${mealSub}` : ""}`, dayRow(CAT.meal.dot, `${day.mealsCount} repas`, mealSub, mealLate), "row-meal")}
        <Spacer />
        {zone(
          "diaper",
          `${day.diapersCount} change${day.diapersCount > 1 ? "s" : ""}${diaperSub ? `, ${diaperSub}` : ""}`,
          dayRow(CAT.diaper.dot, `${day.diapersCount} change${day.diapersCount > 1 ? "s" : ""}`, diaperSub, diaperLate),
          "row-diaper",
        )}
        <Spacer />
        {zone("sleep", `${sleepLabel(sleepNowMin)} de sommeil`, dayRow(CAT.sleep.dot, sleepLabel(sleepNowMin), "de sommeil", false), "row-sleep")}
      </VStack>
    );

  // En-tête : prénom seul dans une pastille, « màj HH:MM » si les données
  // datent de plus de 2 h, boutons « ▶ Sieste/Nuit » et « ▶ Balade » (Parent,
  // hors session du même type ; pas en petit format).
  const firstName = props.childName ? props.childName.trim().split(/\s+/)[0] : "SuiviBaby";
  const headChip = (label: string, action: string, cat: { tile: string; text: string }) => (
    <Link
      key={action}
      destination={actionUrl(action)}
      modifiers={[
        accessibilityLabel(
          action === "walk-start" ? "Démarrer une balade" : label.includes("Nuit") ? "Démarrer la nuit" : "Démarrer une sieste",
        ),
      ]}
    >
      <Text
        modifiers={[
          font({ size: 11, weight: "semibold" }),
          foregroundStyle(cat.text),
          lineLimit(1),
          padding({ top: 4, bottom: 4, leading: 9, trailing: 9 }),
          background(cat.tile),
          clipShape("capsule"),
        ]}
      >
        {label}
      </Text>
    </Link>
  );
  const header = (
    <HStack spacing={6}>
      <Text
        modifiers={[
          font({ size: small ? 12 : 13, weight: "bold" }),
          foregroundStyle(T.pillText),
          lineLimit(1),
          padding({ top: 3, bottom: 3, leading: 9, trailing: 9 }),
          background(T.pillBg),
          clipShape("capsule"),
        ]}
      >
        {firstName}
      </Text>
      {dataStale ? (
        <Text modifiers={[font({ size: 11 }), foregroundStyle(lives.length && !small ? C.alert : C.soft), lineLimit(1)]}>
          {`${lives.length && !small ? "à vérifier · " : ""}màj ${clock(generatedAt)}`}
        </Text>
      ) : null}
      <Spacer />
      {!small && canWrite && !props.loading && !lives.some((l) => l.kind === "sleep")
        ? headChip(napNow ? "▶ Sieste" : "▶ Nuit", "sleep-start", CAT.sleep)
        : null}
      {!small && canWrite && !props.loading && !lives.some((l) => l.kind === "walk") ? headChip("▶ Balade", "walk-start", CAT.walk) : null}
    </HStack>
  );
  // Petit format : bande « N rep. · N ch. · Xh dodo » sous la zone, comme Android 2×2.
  const band = () =>
    !day || dayStale ? null : (
      <HStack spacing={8}>
        <HStack spacing={3}>
          {dotText(mealLate && lives.length > 0 ? C.alert : CAT.meal.dot, 8)}
          <Text modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(C.strong), lineLimit(1)]}>{`${day.mealsCount} rep.`}</Text>
        </HStack>
        <HStack spacing={3}>
          {dotText(diaperLate ? C.alert : CAT.diaper.dot, 8)}
          <Text modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(diaperLate ? C.alert : C.strong), lineLimit(1)]}>{`${day.diapersCount} ch.`}</Text>
        </HStack>
        <HStack spacing={3}>
          {dotText(CAT.sleep.dot, 8)}
          <Text modifiers={[font({ size: 11, weight: "semibold" }), foregroundStyle(C.strong), lineLimit(1)]}>{`${sleepLabel(sleepNowMin).replace(" min", "m")} dodo`}</Text>
        </HStack>
      </HStack>
    );

  // Petit format : un seul lien (WidgetKit ignore les Link) — tétée en cours,
  // sinon repas si le bloc « Dernier repas » est affiché, sinon l'Accueil.
  const smallUrl =
    lives.some((l) => l.kind === "nursing") && lives.length === 1
      ? zoneUrl("nursing")
      : lives.length === 0 && !props.loading && props.lastMealMs
        ? zoneUrl("meal")
        : homeUrl;
  // privacySensitive : iPhone verrouillé (StandBy, écran verrouillé), iOS
  // masque le prénom et les données de santé du bébé.
  const container = [
    bg,
    widgetURL(small ? smallUrl : homeUrl),
    frame({ maxWidth: 10000, maxHeight: 10000, alignment: "topLeading" }),
    privacySensitive(),
  ];

  if (small) {
    return (
      <VStack alignment="leading" spacing={6} modifiers={container}>
        {header}
        {nowZone()}
        <Spacer />
        {band()}
      </VStack>
    );
  }

  const top = (
    <HStack spacing={9} alignment="top" modifiers={[frame({ maxWidth: 10000, maxHeight: family === "systemLarge" ? undefined : 10000, alignment: "topLeading" })]}>
      <VStack alignment="leading" modifiers={[frame({ maxWidth: 10000, maxHeight: 10000, alignment: "leading" })]}>
        {nowZone()}
      </VStack>
      {day ? <VStack modifiers={[frame({ minWidth: 1, maxWidth: 1, maxHeight: 10000 }), background(C.rule)]}>{null}</VStack> : null}
      {dayColumn()}
    </HStack>
  );

  if (family !== "systemLarge") {
    return (
      <VStack alignment="leading" spacing={6} modifiers={container}>
        {header}
        {top}
      </VStack>
    );
  }

  // ----- Grand : le haut du moyen, puis les événements récents (un widget
  // iOS ne défile pas : le fil n'a de place que dans cette taille) -----
  const TYPE_COLOR: Record<string, string> = {
    tetee: "#D66B8F", biberon: "#E8785A", solide: "#E89A5A", pompage: "#6BA47C", croissance: "#E8C45A",
    miction: "#5BA4A4", selle: "#A47C5B", medicament: "#5A8BE8", temperature: "#E85A5A", symptome: "#E85A8B",
    vaccin: "#8B7CB4", bain: "#5AADE8", nez: "#6BA4A4", activite: "#8BC46B", jalon: "#E8A85A",
    sieste: "#7C6BA4", nuit: "#5A6BA4",
  };
  const events = (props.recent ?? []).slice(0, 7);
  return (
    <VStack alignment="leading" spacing={10} modifiers={container}>
      {header}
      {top}
      {events.length ? (
        <VStack alignment="leading" spacing={5}>
          <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(C.soft)]}>Évènements récents</Text>
          {events.map((e, i) => (
            <HStack key={`${e.ms}-${i}`} spacing={6}>
              {dotText((e.icon && TYPE_COLOR[e.icon]) || (e.kind === "meal" ? C.meal : e.kind === "diaper" ? C.diaper : C.soft))}
              <Text modifiers={[font({ size: 13 }), monospacedDigit(), foregroundStyle(C.soft)]}>
                {`${daysAgo(e.ms) >= 1 ? "hier " : ""}${clock(e.ms)}`}
              </Text>
              <Text modifiers={[font({ size: 13 }), foregroundStyle(C.strong), lineLimit(1)]}>{e.label}</Text>
            </HStack>
          ))}
        </VStack>
      ) : null}
    </VStack>
  );
};

export default createWidget("BebeMaintenant", BebeMaintenant, EMPTY_NOW_WIDGET_NATIVE);
