// widgets/BebeMaintenant.ios.tsx
// Widget iOS « Bébé maintenant » (expo-widgets, SwiftUI via @expo/ui).
// Le composant s'exécute dans l'extension, isolé de l'app : pas de hooks, pas
// d'import utilisable hors des composants Expo UI, et aucune valeur déclarée
// hors de la fonction (couleurs et libellés sont donc déclarés dedans).
// Les données viennent de utils/widgetSnapshot.ts (updateSnapshot depuis l'app).
// Le chrono défile seul (Text timerInterval) : aucun rechargement dépensé.
// Accessibilité : chaque tuile se lit comme une phrase (accessibilityElement
// "ignore" + libellé parlé, sans abréviation), polices en styles de texte
// (Dynamic Type, plafonné), cibles tactiles ≥ 40-44 pt quand la place le permet.
import { HStack, Image, Link, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
  accessibilityElement,
  accessibilityHidden,
  accessibilityHint,
  accessibilityLabel,
  background,
  clipShape,
  contentShape,
  dynamicTypeSize,
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
    // « Oubliée ? » : ambre. #8A4B00 ≥ 5,5:1 sur les tuiles claires, #FBBF24 ≥ 6,6:1 sur les sombres.
    warn: dark ? "#FBBF24" : "#8A4B00",
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
  // Polices : styles de texte (suivent Dynamic Type), jamais de taille fixe.
  // 11 caption2, 12 caption, 13 footnote, 14-17 subheadline, 18-21 title3,
  // 22-25 title2, 26+ title (28 pt ; pas de largeTitle, 34 pt trop grand pour la tuile).
  const textStyleOf = (size: number) =>
    size >= 26
      ? "title"
      : size >= 22
          ? "title2"
          : size >= 18
            ? "title3"
            : size >= 14
              ? "subheadline"
              : size >= 13
                ? "footnote"
                : size >= 12
                  ? "caption"
                  : "caption2";
  const F = (size: number, weight?: "regular" | "semibold" | "bold") =>
    font(weight ? { textStyle: textStyleOf(size), weight } : { textStyle: textStyleOf(size) });
  const fit1 = [lineLimit(1), minimumScaleFactor(0.8)];
  const now = environment.date ? new Date(environment.date).getTime() : Date.now();
  const family = environment.widgetFamily;
  const isAccessory = family === "accessoryInline" || family === "accessoryRectangular";
  // Plafond Dynamic Type : écran verrouillé xLarge, écran d'accueil xxxLarge.
  const typeCap = dynamicTypeSize({ max: isAccessory ? "xLarge" : "xxxLarge" });
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
  // Sieste/nuit/balade qui dure trop (staleAtMs, shared/widget) : « oubliée ? », jamais arrêtée seule.
  const isStale = (l: WidgetLive | null | undefined) =>
    !!l && l.kind !== "nursing" && l.staleAtMs != null && (environment.date ? new Date(environment.date).getTime() : Date.now()) >= l.staleAtMs;
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
  const ZONE_HINT = {
    meal: "Ouvre SuiviBaby et permet de noter un repas",
    diaper: "Ouvre SuiviBaby et permet de noter un change",
    nursing: "Ouvre SuiviBaby sur la tétée en cours",
    sleep: "Ouvre SuiviBaby et permet de noter un sommeil",
  };
  const small = family === "systemSmall";

  // ----- Horloge et durées (affichées et parlées) -----
  const clock = (ms: number | null | undefined) => (ms ? new Date(ms).toTimeString().slice(0, 5) : "—");
  const dayKey = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const daysAgo = (ms: number) => Math.round((dayKey(now) - dayKey(ms)) / 86400000);
  const ddmm = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  // Durées à la minute (« 45 min », « 1h08 ») comme Android, calculées depuis
  // l'heure de l'entrée de timeline (services/widgetSync.ts). Hors timeline
  // (ancienne app, timeline épuisée) : compteurs natifs d'iOS, avec secondes.
  const inTimeline = props.timelineEndMs != null && now < props.timelineEndMs;
  const minutesBetween = (startMs: number, endMs: number) =>
    // Minutes « à la pendule » (secondes du début ignorées), comme Android et l'Accueil.
    Math.max(0, Math.floor(endMs / 60000) - Math.floor(startMs / 60000));
  const minutesText = (startMs: number) => {
    const m = minutesBetween(startMs, now);
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
  };
  // Durée parlée, sans abréviation : « 45 minutes », « 1 heure et 8 minutes ».
  const minutesSay = (m: number) => {
    const h = Math.floor(m / 60);
    const r = m % 60;
    const mm = `${r} minute${r > 1 ? "s" : ""}`;
    return h === 0 ? mm : `${h} heure${h > 1 ? "s" : ""}${r ? ` et ${mm}` : ""}`;
  };
  const sleepLabel = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`);
  const isDaysAgo = (ms: number) => now - ms >= (23 * 60 + 50) * 60000;
  const agoText = (ms: number) => (isDaysAgo(ms) ? `${Math.max(1, Math.round((now - ms) / 86400000))} j` : minutesText(ms));
  const agoSay = (ms: number) => {
    if (!isDaysAgo(ms)) return minutesSay(minutesBetween(ms, now));
    const n = Math.max(1, Math.round((now - ms) / 86400000));
    return `${n} jour${n > 1 ? "s" : ""}`;
  };
  const sideWord = (side: string | null | undefined) => (side === "G" ? "gauche" : side === "D" ? "droit" : "");
  const otherSide = (l: WidgetLive) =>
    l.otherSideLabel ? l.otherSideLabel.replace(/^G /, "gauche ").replace(/^D /, "droit ") : null;
  // Autre sein parlé, sans abréviation : « droit, 12 minutes » (jamais « droit 12 min »).
  const otherSay = (l: WidgetLive) => {
    const m = l.otherSideLabel ? /^([GD]) (.+)$/.exec(l.otherSideLabel) : null;
    if (!m) return otherSide(l);
    const dur = /^(\d+) min$/.exec(m[2]);
    const hm = /^(\d+)h(\d{2})$/.exec(m[2]);
    const said = dur ? minutesSay(Number(dur[1])) : hm ? minutesSay(Number(hm[1]) * 60 + Number(hm[2])) : m[2].replace(/\bmin\b/g, "minutes");
    return `${sideWord(m[1])}, ${said}`;
  };

  // Phrase parlée d'une session : « Sieste en cours depuis 14:00, 45 minutes »,
  // « Tétée en cours, sein gauche, depuis 14:20 ». Durée seulement quand la
  // timeline la donne à la minute (sinon le chrono natif défile seul).
  const a11yOf = (l: WidgetLive) => {
    const dur = inTimeline && l.timerStartMs ? minutesSay(minutesBetween(l.timerStartMs, l.pausedAtMs ?? now)) : null;
    if (l.kind === "nursing") {
      // Comme Android : « Tétée en pause, sein gauche, autre sein droit, 12 minutes, depuis 14:20 ».
      const parts = [`Tétée${l.pausedAtMs != null ? " en pause" : " en cours"}`];
      if (l.side) parts.push(`sein ${sideWord(l.side)}`);
      if (l.otherSideLabel) parts.push(`autre sein ${otherSay(l)}`);
      parts.push(l.sinceLabel);
      if (dur) parts.push(dur);
      return parts.join(", ");
    }
    return `${labelOf(l)} en cours ${l.sinceLabel}${dur ? `, ${dur}` : ""}${l.pausedAtMs != null ? ", en pause" : ""}${isStale(l) ? ", oubliée ? à vérifier" : ""}`;
  };
  const liveA11y = lives.map(a11yOf).join(". ");

  const timerOf = (l: WidgetLive | null, size: number, hide = false) => {
    // Masqué seulement en timeline : le libellé dit alors les minutes. Hors timeline
    // la durée n'est dite nulle part ailleurs : le chrono natif reste lisible.
    const hid = hide && inTimeline ? [accessibilityHidden()] : [];
    return l && l.kind !== "nursing" && inTimeline ? (
      <Text modifiers={[F(size, "bold"), monospacedDigit(), foregroundStyle(dataStale ? C.soft : isStale(l) ? C.warn : C.strong), minimumScaleFactor(0.7), lineLimit(1), ...hid]}>
        {minutesText(l.timerStartMs)}
      </Text>
    ) : l ? (
      <Text
        timerInterval={{ lower: new Date(l.timerStartMs), upper: far }}
        countsDown={false}
        pauseTime={l.pausedAtMs != null ? new Date(l.pausedAtMs) : undefined}
        modifiers={[F(size, "bold"), monospacedDigit(), foregroundStyle(dataStale ? C.soft : isStale(l) ? C.warn : C.strong), minimumScaleFactor(0.7), lineLimit(1), ...hid]}
      />
    ) : null;
  };
  const timer = (size: number) => timerOf(live, size);
  const far = new Date(now + 24 * 3600 * 1000);
  // Info de plus de 2 h : on dit de quand elle date.
  const generatedAt = props.generatedAtMs ?? 0;
  const dataStale = generatedAt > 0 && now - generatedAt > 2 * 3600 * 1000;

  // Le lien enveloppe la zone : padding, fond et cadre sont posés sur l'enfant,
  // sinon (modificateurs posés hors du Link) les bords tombent sur le fond.
  const zone = (action: "meal" | "diaper" | "nursing" | "sleep", say: string, content: React.ReactElement, key?: string) => (
    <Link
      key={key ?? action}
      destination={zoneUrl(action)}
      modifiers={[accessibilityLabel(say), accessibilityHint(canWrite ? ZONE_HINT[action] : "Ouvre SuiviBaby pour consulter")]}
    >
      <VStack alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10000, alignment: "leading" }), contentShape(shapes.rectangle())]}>
        {content}
      </VStack>
    </Link>
  );
  // Une seule étiquette : sur la tuile tétée, c'est le lien qui la porte (son contenu
  // est ignoré) ; ailleurs, le contenu.
  const liveLabel = (l: WidgetLive) => (l.kind === "nursing" && !small ? [] : [accessibilityLabel(a11yOf(l))]);
  // Tuile tétée : le lien couvre le contenu, pas « ■ Arrêter » (pas de lien dans un lien).
  const tileLink = (l: WidgetLive, content: React.ReactElement) =>
    l.kind === "nursing" && !small ? zone("nursing", a11yOf(l), content, `tile-${l.kind}`) : content;
  // Compteurs d'un jour passé (minuit franchi sans nouvel envoi) : masqués.
  const dayStart = props.dayStartMs ?? 0;
  const nextMidnight = dayStart > 0
    ? new Date(new Date(dayStart).getFullYear(), new Date(dayStart).getMonth(), new Date(dayStart).getDate() + 1).getTime()
    : 0;
  const dayStale = nextMidnight > 0 && now >= nextMidnight;
  // Sommeil en cours compté dans le total du jour (jusqu'à l'instant du rendu).
  const sleepFrom =
    props.day?.sleepRunningFromMs != null && lives.some((l) => l.kind === "sleep") ? Math.min(props.day.sleepRunningFromMs, now) : null;
  const sleepNowMin = (props.day?.sleepMinutes ?? 0) + (sleepFrom != null ? Math.max(0, Math.floor(now / 60000) - Math.floor(sleepFrom / 60000)) : 0);

  // Données de plus de 24 h (membre retiré du foyer, consentement retiré,
  // app plus ouverte) : ni prénom ni données, seulement une invitation à
  // ouvrir l'app. Décidé par le widget à l'heure dite (entrée de timeline
  // préparée, services/widgetSync.ts) : garanti sans réseau ni notification.
  if (generatedAt > 0 && now - generatedAt > 24 * 3600 * 1000) {
    const msg = "Ouvrez SuiviBaby pour mettre à jour";
    const say = `SuiviBaby. ${msg}`;
    if (family === "accessoryInline") return <Text modifiers={[widgetURL(homeUrl), accessibilityLabel(say), typeCap]}>SuiviBaby</Text>;
    if (family === "accessoryRectangular") {
      return (
        <VStack alignment="leading" spacing={2} modifiers={[widgetURL(homeUrl), accessibilityElement("ignore"), accessibilityLabel(say), typeCap]}>
          <Text modifiers={[F(13, "semibold")]}>SuiviBaby</Text>
          <Text modifiers={[F(12)]}>{msg}</Text>
        </VStack>
      );
    }
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[bg, widgetURL(homeUrl), frame({ maxWidth: 10000, maxHeight: 10000, alignment: "topLeading" }), accessibilityElement("ignore"), accessibilityLabel(say), typeCap]}
      >
        <Text modifiers={[F(13, "bold"), foregroundStyle(C.strong)]}>SuiviBaby</Text>
        <Spacer />
        <Text modifiers={[F(14), foregroundStyle(C.soft), ...fit1]}>{msg}</Text>
      </VStack>
    );
  }

  // ----- Écran verrouillé -----
  if (family === "accessoryInline") {
    return live ? (
      <Text modifiers={[widgetURL(url), privacySensitive(), accessibilityLabel(a11yOf(live)), typeCap]}>{`${info?.label}${live.side ? ` ${live.side}` : ""} ${isStale(live) ? "oubliée ?" : live.sinceLabel}`}</Text>
    ) : (
      <Text
        modifiers={[
          widgetURL(url),
          privacySensitive(),
          accessibilityLabel(props.lastMealMs ? `Dernier repas à ${clock(props.lastMealMs)}` : "SuiviBaby"),
          typeCap,
        ]}
      >
        {props.lastMealMs ? `Repas à ${new Date(props.lastMealMs).toTimeString().slice(0, 5)}` : "SuiviBaby"}
      </Text>
    );
  }
  if (family === "accessoryRectangular") {
    const restSayAcc = props.lastMealMs
      ? mealLate
        ? `Dernier repas à ${clock(props.lastMealMs)}, rappel dépassé`
        : `Dernier repas à ${clock(props.lastMealMs)}`
      : "Dernier repas : pas encore";
    return (
      <VStack
        alignment="leading"
        spacing={2}
        modifiers={[
          widgetURL(url),
          privacySensitive(),
          accessibilityElement("ignore"),
          accessibilityLabel(live ? a11yOf(live) : restSayAcc),
          typeCap,
        ]}
      >
        {live ? (
          <>
            <Text modifiers={[F(13, "semibold")]}>
              {`${info?.label}${live.side ? ` · ${live.side}` : ""}${live.pausedAtMs != null ? " · en pause" : ""}${isStale(live) ? " · oubliée ?" : ""}`}
            </Text>
            {timer(22)}
            {live.otherSideLabel ? <Text modifiers={[F(12)]}>{live.otherSideLabel}</Text> : null}
          </>
        ) : (
          <>
            <Text modifiers={[F(13, "semibold")]}>{mealLate ? "Repas en retard" : "Dernier repas"}</Text>
            {props.lastMealMs ? (
              <Text date={new Date(props.lastMealMs)} dateStyle="relative" modifiers={[F(20, "bold"), monospacedDigit()]} />
            ) : (
              <Text modifiers={[F(15)]}>—</Text>
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
    // Texte vert sur tuile claire : #386F26 sur #E6F2DE = 5,2:1 (AA exige 4,5:1).
    walk: { short: "Balade", dot: "#8BC46B", tile: dark ? "#2e3f3e" : "#E6F2DE", text: dark ? "#8BC46B" : "#386F26" },
    meal: { dot: "#E8785A", text: dark ? "#E8785A" : "#A83F23" },
    diaper: { dot: "#5BA4A4", text: dark ? "#5BA4A4" : "#2B6A6A" },
  };
  const day = props.day;
  const lastWhen = (ms: number) => {
    const k = daysAgo(ms);
    return k <= 0 ? `dernier à ${clock(ms)}` : k === 1 ? `dernier hier à ${clock(ms)}` : `dernier le ${ddmm(ms)}`;
  };
  // Affiché court (colonne étroite, tronqué sinon) : « rappel · hier 19:37 » ;
  // parlé (lateSay) : « rappel dépassé, dernier hier à 19:37 ».
  const lastShort = (ms: number) => {
    const k = daysAgo(ms);
    return k <= 0 ? clock(ms) : k === 1 ? `hier ${clock(ms)}` : `le ${ddmm(ms)}`;
  };
  const lateWhen = (ms: number) => `rappel · ${lastShort(ms)}`;
  const lateSay = (ms: number) => `rappel dépassé, ${lastWhen(ms)}`;
  // Pastille décorative : jamais lue (le sens est porté par le libellé de la tuile).
  const dotText = (color: string, size = 9) => <Text modifiers={[font({ size }), foregroundStyle(color), accessibilityHidden()]}>●</Text>;
  // Icône de catégorie (SF Symbol) : décorative, le sens est dans le libellé du bloc.
  const icon = (name: "fork.knife" | "drop.fill" | "moon.zzz.fill", color: string) => (
    <Image systemName={name} size={10} color={color} modifiers={[accessibilityHidden()]} />
  );
  const sinceTime = (l: WidgetLive) => (l.sinceMs ? clock(l.sinceMs) : l.sinceLabel.replace("depuis ", ""));
  // Petit format, une seule sieste/nuit ou balade (Parent) : un seul lien pour
  // tout le widget (limite d'Apple). Il arrête la session, SANS la clé de
  // l'appareil : l'app demande « Arrêter la sieste ? » (Arrêter / Annuler),
  // jamais d'arrêt sur un simple appui pour ouvrir l'app.
  // Tétée comprise : l'app propose « Arrêter et enregistrer » ou « Voir la tétée ».
  const smallStop = small && canWrite && lives.length === 1 ? lives[0] : null;
  // Plusieurs sessions : l'app demande laquelle arrêter (« stop-pick »).
  const smallPick = small && canWrite && lives.length >= 2;
  // « ■ » visuel du petit format (le lien est celui du widget).
  const stopMarkView = (l: WidgetLive, sp: number) => (
    <Text
      modifiers={[F(sp, "bold"), foregroundStyle(CAT[l.kind].text), padding({ leading: 7, trailing: 7, top: 4, bottom: 4 }), background(C.bg), clipShape("capsule"), accessibilityHidden()]}
    >
      ■
    </Text>
  );
  const stopOf = (l: WidgetLive) => (l.kind === "sleep" ? "sleep-stop" : l.kind === "walk" ? "walk-stop" : "nursing-stop");
  // Même phrase qu'Android : « Arrêter la sieste », « la nuit », « la balade », « la tétée ».
  const stopSay = (l: WidgetLive) =>
    l.kind === "sleep" ? (l.nap === true ? "Arrêter la sieste" : l.nap === false ? "Arrêter la nuit" : "Arrêter le sommeil") : `Arrêter ${stopWhat(l)}`;
  const stopWhat = (l: WidgetLive) => (l.kind === "sleep" ? "le sommeil" : l.kind === "walk" ? "la balade" : "la tétée");

  // Bouton « ■ Arrêter » (ou « ■ ») sur fond du widget, comme Android. Zone
  // tactile : 44 pt (tuile seule), 40 pt (deux sessions) ; la pastille reste petite.
  const stopChip = (l: WidgetLive, compact: boolean, minH: number) => (
    <Link
      key={`stop-${l.kind}`}
      destination={actionUrl(stopOf(l))}
      modifiers={[accessibilityLabel(stopSay(l)), accessibilityHint(stopSay(l).replace(/^Arrêter /, "Ouvre SuiviBaby et arrête "))]}
    >
      <HStack modifiers={[frame({ minWidth: compact ? 40 : 44, minHeight: minH, alignment: "center" }), contentShape(shapes.rectangle())]}>
        <Text
          modifiers={[
            F(12, "semibold"),
            foregroundStyle(CAT[l.kind].text),
            ...fit1,
            padding({ top: 6, bottom: 6, leading: compact ? 10 : 12, trailing: compact ? 10 : 12 }),
            background(C.bg),
            clipShape("capsule"),
          ]}
        >
          {compact ? "■" : "■ Arrêter"}
        </Text>
      </HStack>
    </Link>
  );
  const tileTitle = (l: WidgetLive, withOther: boolean) => {
    if (l.kind === "nursing") {
      const other = withOther ? otherSide(l) : null;
      return `Tétée${l.pausedAtMs != null ? " en pause" : ""}${l.side ? ` · ${sideWord(l.side)}` : ""}${other ? ` · ${other}` : ""}`;
    }
    if (isStale(l)) return `${labelOf(l)} · oubliée ?`;
    return small ? labelOf(l) : `${labelOf(l)} · ${sinceTime(l)}`;
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
      <Text modifiers={[F(sp, "semibold"), foregroundStyle(CAT[l.kind].text), ...fit1]}>{text}</Text>
    </HStack>
  );
  // Une session : grande tuile (titre, [autre sein], chrono et « ■ Arrêter » sur la même ligne).
  // Petit format : un seul lien pour tout le widget, pas de « ■ ».
  const singleTile = (l: WidgetLive) => {
    const other = l.kind === "nursing" ? otherSide(l) : null;
    const under = l.kind === "nursing" ? (other ? `${other} · depuis ${sinceTime(l)}` : `depuis ${sinceTime(l)}`) : small ? `depuis ${sinceTime(l)}` : null;
    const underText = under ? <Text modifiers={[F(small ? 11 : 12), monospacedDigit(), foregroundStyle(T.softOnTile), ...fit1]}>{under}</Text> : null;
    if (small || !canWrite) {
      // « ■ » visuel seulement (petit format : le lien est celui du widget, smallStop).
      const stopMark = smallStop === l ? stopMarkView(l, 13) : null;
      return (
        <VStack alignment="leading" spacing={3} modifiers={tileMods(l, 16, small ? 9 : 10)}>
          {tileLink(
            l,
            <VStack alignment="leading" spacing={3} modifiers={[accessibilityElement("ignore"), ...liveLabel(l)]}>
              {titleRow(l, tileTitle(l, false), small ? 12 : 13)}
              {stopMark ? (
                <HStack spacing={6} alignment="center">
                  {timerOf(l, 26)}
                  <Spacer />
                  {stopMark}
                </HStack>
              ) : (
                timerOf(l, small ? 26 : 30)
              )}
              {underText}
            </VStack>,
          )}
        </VStack>
      );
    }
    return (
      <VStack alignment="leading" spacing={2} modifiers={tileMods(l, 16, 8)}>
        {tileLink(
          l,
          <VStack alignment="leading" spacing={2} modifiers={[accessibilityElement("ignore"), ...liveLabel(l)]}>
            {titleRow(l, tileTitle(l, false), 13)}
            {underText}
          </VStack>,
        )}
        <HStack spacing={8} alignment="center">
          {timerOf(l, 30, true)}
          <Spacer />
          {stopChip(l, true, 44)}
        </HStack>
      </VStack>
    );
  };
  // Deux sessions : une tuile par session, chrono et « ■ » (40 pt) à droite.
  const rowTile = (l: WidgetLive) => (
    <HStack spacing={6} alignment="bottom" modifiers={tileMods(l, 12, 6)}>
      {tileLink(
        l,
        <VStack
          alignment="leading"
          spacing={1}
          modifiers={[accessibilityElement("ignore"), ...liveLabel(l), frame({ maxWidth: 10000, alignment: "leading" })]}
        >
          {titleRow(l, tileTitle(l, !small), 12)}
          {timerOf(l, small ? 18 : 22)}
        </VStack>,
      )}
      {canWrite && !small ? stopChip(l, true, 40) : smallPick ? stopMarkView(l, 11) : null}
    </HStack>
  );
  // Trois sessions : lignes compactes, sans « ■ » (le lien de la tuile reste).
  const compactTile = (l: WidgetLive) => (
    <HStack spacing={6} modifiers={tileMods(l, 12, 4)}>
      {tileLink(
        l,
        <HStack spacing={5} modifiers={[accessibilityElement("ignore"), ...liveLabel(l)]}>
          {dotText(CAT[l.kind].dot, 8)}
          <Text modifiers={[F(12, "semibold"), foregroundStyle(CAT[l.kind].text), ...fit1]}>
            {l.kind === "nursing" && l.side ? `${CAT.nursing.short} ${l.side}` : isStale(l) ? `${labelOf(l)} · oubliée ?` : labelOf(l)}
          </Text>
          <Spacer />
          {timerOf(l, 15)}
        </HStack>,
      )}
    </HStack>
  );

  // À droite du chiffre : « rappel / dépassé » (rouge) ou « rappel / 18:20 ».
  const reminderPile = (late: boolean, atMs: number | null | undefined) =>
    late || (atMs != null && atMs > now) ? (
      <VStack alignment="leading" spacing={0}>
        <Text modifiers={[F(12, late ? "semibold" : "regular"), foregroundStyle(late ? C.alert : C.soft), ...fit1]}>rappel</Text>
        <Text modifiers={[F(12), monospacedDigit(), foregroundStyle(late ? C.alert : C.soft), ...fit1]}>{late ? "dépassé" : clock(atMs)}</Text>
      </VStack>
    ) : null;
  const underHour = (ms: number) => now - ms < 3600000;
  const restSay = (label: string, ms: number | null | undefined, late: boolean) =>
    ms ? `${label} il y a ${agoSay(ms)}${late ? ", rappel dépassé" : ""}` : `${label} : pas encore`;
  const restBlock = (label: string, cat: { dot: string; text: string }, ms: number | null | undefined, late: boolean, atMs: number | null | undefined, sp: number) => (
    <VStack alignment="leading" spacing={0}>
      <HStack spacing={5}>
        {dotText(late ? C.alert : cat.dot, 8)}
        <Text modifiers={[F(12, "semibold"), foregroundStyle(late ? C.alert : cat.text), ...fit1]}>{label}</Text>
      </HStack>
      {ms ? (
        <HStack spacing={0} alignment="lastTextBaseline">
          <Text modifiers={[F(12), foregroundStyle(late ? C.alert : C.soft), padding({ trailing: 4 }), ...fit1]}>il y a</Text>
          {/* Boîte de largeur minimale (≈ 3 × la taille, « 14h52 »), comme Android :
              « rappel / dépassé » reste à la même place d'une ligne à l'autre ;
              elle grandit avec Dynamic Type. */}
          <Text
            modifiers={[
              F(underHour(ms) ? Math.round(sp * 0.8) : sp, "bold"),
              monospacedDigit(),
              foregroundStyle(late ? C.alert : C.strong),
              minimumScaleFactor(0.7),
              lineLimit(1),
              frame({ minWidth: underHour(ms) ? Math.ceil(sp * 0.8 * 3.8) : Math.ceil(sp * 3), alignment: "leading" }),
            ]}
          >
            {agoText(ms)}
          </Text>
          {!small && reminderPile(late, atMs) ? <VStack modifiers={[padding({ leading: 6 })]}>{reminderPile(late, atMs)}</VStack> : null}
        </HStack>
      ) : (
        <Text modifiers={[F(15), foregroundStyle(C.soft), ...fit1]}>pas encore</Text>
      )}
      {/* Petit format : pas la place à côté du chiffre (« ra… dé… ») : une ligne dessous. */}
      {small && ms && (late || (atMs != null && atMs > now)) ? (
        <Text modifiers={[F(11, late ? "semibold" : "regular"), monospacedDigit(), foregroundStyle(late ? C.alert : C.soft), ...fit1]}>
          {late ? "rappel dépassé" : `rappel à ${clock(atMs as number)}`}
        </Text>
      ) : null}
    </VStack>
  );

  // Zone « Maintenant » (gauche) : chargement, sessions ou repos.
  const nowZone = () => {
    if (props.loading) return <Text modifiers={[F(small ? 12 : 14), foregroundStyle(C.soft), ...fit1]}>Mise à jour…</Text>;
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
        <Text modifiers={[F(12), foregroundStyle(C.soft), ...fit1]}>Aucun repas noté</Text>
      );
    }
    return (
      <VStack alignment="leading" spacing={8}>
        {zone("meal", restSay("Dernier repas", props.lastMealMs, mealLate), restBlock("Dernier repas", CAT.meal, props.lastMealMs, mealLate, props.alerts.mealAtMs, 26))}
        {zone("diaper", restSay("Dernier change", day?.lastDiaperMs, diaperLate), restBlock("Dernier change", CAT.diaper, day?.lastDiaperMs, diaperLate, props.alerts.diaperAtMs, 26))}
      </VStack>
    );
  };

  // Colonne « Aujourd'hui » (droite), comme Android. Zone tactile : 44 pt en
  // grand ; en moyen la hauteur du widget (3 lignes + en-tête) ne permet pas plus de 32.
  const ROW_H = family === "systemLarge" ? 44 : 32;
  const dayRow = (color: string, main: string, sub: string | null, late: boolean) => (
    <HStack spacing={8} alignment="center" modifiers={[frame({ minHeight: ROW_H, alignment: "leading" })]}>
      {dotText(late ? C.alert : color)}
      <VStack alignment="leading" spacing={0}>
        <Text modifiers={[F(15, "semibold"), monospacedDigit(), foregroundStyle(late ? C.alert : C.strong), ...fit1]}>{main}</Text>
        {sub ? <Text modifiers={[F(12), monospacedDigit(), foregroundStyle(late ? C.alert : C.soft), ...fit1]}>{sub}</Text> : null}
      </VStack>
    </HStack>
  );
  // Sous-titre affiché (spoken = false) et parlé (spoken = true).
  const mealSubOf = (spoken: boolean) =>
    day?.lastMealMs
      ? mealLate
        ? spoken
          ? lateSay(day.lastMealMs)
          : lateWhen(day.lastMealMs)
        : day.bottleMl > 0 && daysAgo(day.lastMealMs) <= 0
          ? spoken
            ? `à ${clock(day.lastMealMs)}, ${day.bottleMl} millilitres`
            : `${clock(day.lastMealMs)} · ${day.bottleMl} ml`
          : lastWhen(day.lastMealMs)
      : day?.noMealEver
        ? "aucun noté"
        : null;
  const diaperSubOf = (spoken: boolean) =>
    day?.lastDiaperMs
      ? diaperLate
        ? spoken
          ? lateSay(day.lastDiaperMs)
          : lateWhen(day.lastDiaperMs)
        : lastWhen(day.lastDiaperMs)
      : day?.noDiaperEver
        ? "aucun noté"
        : null;
  const mealSub = mealSubOf(false);
  const diaperSub = diaperSubOf(false);
  const mealSay = mealSubOf(true);
  const diaperSay = diaperSubOf(true);
  // Largeur minimale de la colonne, comme Android (38 % de l'intérieur, 112 à 156) ;
  // elle peut grandir un peu avec Dynamic Type, le texte se réduit au-delà.
  const DAY_W = family === "systemLarge" ? 136 : 126;
  const dayColumn = () =>
    !day ? null : dayStale ? (
      <VStack alignment="leading" spacing={2} modifiers={[frame({ minWidth: DAY_W, maxWidth: Math.round(DAY_W * 1.25), alignment: "topLeading" })]}>
        <Text modifiers={[F(14, "semibold"), foregroundStyle(C.strong), ...fit1]}>Nouvelle journée</Text>
        <Text modifiers={[F(11), foregroundStyle(C.soft), minimumScaleFactor(0.8)]}>Mise à jour à la prochaine saisie</Text>
      </VStack>
    ) : (
      <VStack alignment="leading" spacing={0} modifiers={[frame({ minWidth: DAY_W, maxWidth: Math.round(DAY_W * 1.25), maxHeight: 10000, alignment: "topLeading" })]}>
        {zone("meal", `${day.mealsCount} repas${mealSay ? `, ${mealSay}` : ""}`, dayRow(CAT.meal.dot, `${day.mealsCount} repas`, mealSub, mealLate), "row-meal")}
        <Spacer />
        {zone(
          "diaper",
          `${day.diapersCount} change${day.diapersCount > 1 ? "s" : ""}${diaperSay ? `, ${diaperSay}` : ""}`,
          dayRow(CAT.diaper.dot, `${day.diapersCount} change${day.diapersCount > 1 ? "s" : ""}`, diaperSub, diaperLate),
          "row-diaper",
        )}
        <Spacer />
        {zone("sleep", `${minutesSay(sleepNowMin)} de sommeil`, dayRow(CAT.sleep.dot, sleepLabel(sleepNowMin), "de sommeil", false), "row-sleep")}
      </VStack>
    );

  // En-tête : prénom seul dans une pastille, « màj HH:MM » si les données
  // datent de plus de 2 h, boutons « ▶ Sieste/Nuit » et « ▶ Balade » (Parent,
  // hors session du même type ; pas en petit format). Zone tactile 32 pt.
  const firstName = props.childName ? props.childName.trim().split(/\s+/)[0] : "SuiviBaby";
  const headChip = (label: string, action: string, cat: { tile: string; text: string }) => {
    const walk = action === "walk-start";
    const night = label.includes("Nuit");
    return (
      <Link
        key={action}
        destination={actionUrl(action)}
        modifiers={[
          accessibilityLabel(walk ? "Démarrer une balade" : night ? "Démarrer la nuit" : "Démarrer une sieste"),
          accessibilityHint(`Ouvre SuiviBaby et démarre ${walk ? "une balade" : night ? "la nuit" : "une sieste"}`),
        ]}
      >
        <HStack modifiers={[frame({ minHeight: 32, alignment: "center" }), contentShape(shapes.rectangle())]}>
          <Text
            modifiers={[
              F(11, "semibold"),
              foregroundStyle(cat.text),
              ...fit1,
              padding({ top: 4, bottom: 4, leading: 9, trailing: 9 }),
              background(cat.tile),
              clipShape("capsule"),
            ]}
          >
            {label}
          </Text>
        </HStack>
      </Link>
    );
  };
  const staleAlert = lives.length > 0 && !small;
  const header = (
    <HStack spacing={6}>
      <Text
        modifiers={[
          F(small ? 12 : 13, "bold"),
          foregroundStyle(T.pillText),
          ...fit1,
          padding({ top: 3, bottom: 3, leading: 9, trailing: 9 }),
          background(T.pillBg),
          clipShape("capsule"),
        ]}
      >
        {firstName}
      </Text>
      {dataStale ? (
        <Text
          modifiers={[
            F(11),
            foregroundStyle(staleAlert ? C.alert : C.soft),
            ...fit1,
            accessibilityLabel(`${staleAlert ? "Données à vérifier, " : ""}mis à jour à ${clock(generatedAt)}`),
          ]}
        >
          {`${staleAlert ? "à vérifier · " : ""}màj ${clock(generatedAt)}`}
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
  // Lue d'un bloc, sans abréviation.
  const bandSay = () =>
    !day
      ? ""
      : `${day.mealsCount} repas${mealLate && lives.length > 0 ? ", rappel dépassé" : ""}, ${day.diapersCount} change${day.diapersCount > 1 ? "s" : ""}${diaperLate ? ", rappel dépassé" : ""}, ${minutesSay(sleepNowMin)} de sommeil`;
  const band = () =>
    !day || dayStale ? null : (
      <HStack spacing={8} modifiers={[accessibilityElement("ignore"), accessibilityLabel(bandSay())]}>
        <HStack spacing={3}>
          {icon("fork.knife", mealLate && lives.length > 0 ? C.alert : CAT.meal.dot)}
          <Text modifiers={[F(11, "semibold"), foregroundStyle(mealLate && lives.length > 0 ? C.alert : C.strong), ...fit1]}>{`${day.mealsCount}`}</Text>
        </HStack>
        <HStack spacing={3}>
          {icon("drop.fill", diaperLate ? C.alert : CAT.diaper.dot)}
          <Text modifiers={[F(11, "semibold"), foregroundStyle(diaperLate ? C.alert : C.strong), ...fit1]}>{`${day.diapersCount}`}</Text>
        </HStack>
        <HStack spacing={3}>
          {icon("moon.zzz.fill", CAT.sleep.dot)}
          <Text modifiers={[F(11, "semibold"), foregroundStyle(C.strong), ...fit1]}>{sleepLabel(sleepNowMin)}</Text>
        </HStack>
      </HStack>
    );

  // Petit format : un seul lien (WidgetKit ignore les Link) — tétée en cours,
  // sinon repas si le bloc « Dernier repas » est affiché, sinon l'Accueil.
  const smallUrl = smallStop
    ? `${actionUrl(stopOf(smallStop)).replace(/&k=[^&]*/, "")}&ask=1`
    : smallPick
      ? `${homeUrl}?widget=stop-pick${child}&ask=1`
    : lives.some((l) => l.kind === "nursing") && lives.length === 1
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
    typeCap,
  ];

  if (small) {
    return (
      <VStack alignment="leading" spacing={6} modifiers={container}>
        {header}
        {nowZone()}
        <Spacer />
        {/* Deux sessions ou plus : plus la place pour la bande du jour (collée au
            bord, rognée) ; les sessions passent avant. */}
        {lives.length >= 2 ? null : band()}
      </VStack>
    );
  }

  const top = (
    <HStack spacing={9} alignment="top" modifiers={[frame({ maxWidth: 10000, maxHeight: family === "systemLarge" ? undefined : 10000, alignment: "topLeading" })]}>
      <VStack alignment="leading" modifiers={[frame({ maxWidth: 10000, maxHeight: 10000, alignment: "leading" })]}>
        {nowZone()}
      </VStack>
      {day ? <VStack modifiers={[frame({ minWidth: 1, maxWidth: 1, maxHeight: 10000 }), background(C.rule), accessibilityHidden()]}>{null}</VStack> : null}
      {dayColumn()}
    </HStack>
  );

  if (family !== "systemLarge") {
    return (
      <VStack alignment="leading" spacing={2} modifiers={container}>
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
          <Text modifiers={[F(12, "semibold"), foregroundStyle(C.soft), ...fit1, accessibilityAddTraits(["isHeader"])]}>Évènements récents</Text>
          {events.map((e, i) => {
            const when = `${daysAgo(e.ms) >= 1 ? "hier " : ""}${clock(e.ms)}`;
            const labelSay = e.icon === "jalon" && /^\p{Extended_Pictographic}/u.test(e.label) ? `humeur ${e.label}` : e.label;
            return (
              <HStack key={`${e.ms}-${i}`} spacing={6} modifiers={[accessibilityElement("ignore"), accessibilityLabel(`${daysAgo(e.ms) >= 1 ? "hier " : ""}à ${clock(e.ms)}, ${labelSay}`)]}>
                {dotText((e.icon && TYPE_COLOR[e.icon]) || (e.kind === "meal" ? C.meal : e.kind === "diaper" ? C.diaper : C.soft))}
                <Text modifiers={[F(13), monospacedDigit(), foregroundStyle(C.soft), ...fit1]}>{when}</Text>
                <Text modifiers={[F(13), foregroundStyle(C.strong), ...fit1]}>{e.label}</Text>
              </HStack>
            );
          })}
        </VStack>
      ) : null}
    </VStack>
  );
};

export default createWidget("BebeMaintenant", BebeMaintenant, EMPTY_NOW_WIDGET_NATIVE);
