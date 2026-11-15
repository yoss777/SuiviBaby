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
  padding,
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
  const actionUrl = (action: string) =>
    `suivibaby:///baby/home?widget=${action}${child}${action === "sleep-start" ? `&nap=${napNow ? 1 : 0}` : ""}`;
  const chip = (label: string, action: string, color: string) => (
    <Link
      key={action}
      destination={actionUrl(action)}
      label={label}
      modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(color), lineLimit(1)]}
    />
  );
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

  // ----- Écran verrouillé -----
  if (family === "accessoryInline") {
    return live ? (
      <Text modifiers={[widgetURL(url)]}>{`${info?.label}${live.side ? ` ${live.side}` : ""} ${live.sinceLabel}`}</Text>
    ) : (
      <Text modifiers={[widgetURL(url)]}>
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

  // ----- Bloc « Maintenant » (small, et gauche du medium) -----
  const multiBlock = (
    <VStack alignment="leading" spacing={6} modifiers={[accessibilityLabel(liveA11y)]}>
      {lives.map((l) => (
        <VStack key={l.kind} alignment="leading" spacing={0}>
          <HStack spacing={5}>
            <Image systemName={KIND[l.kind].symbol as any} color={KIND[l.kind].color} size={11} />
            <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(C.strong), lineLimit(1)]}>
              {`${labelOf(l)}${l.side ? ` · ${l.side === "G" ? "gauche" : "droit"}` : ""}${l.pausedAtMs != null ? " · pause" : ""}`}
            </Text>
          </HStack>
          {timerOf(l, lives.length > 2 ? 17 : 20)}
        </VStack>
      ))}
    </VStack>
  );
  const nowBlock = lives.length > 1 ? multiBlock : live ? (
    <VStack alignment="leading" spacing={4} modifiers={[accessibilityLabel(liveA11y)]}>
      <HStack spacing={6}>
        <Image systemName={info?.symbol as any} color={info?.color} size={14} />
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(C.strong)]}>
          {live.pausedAtMs != null ? `${info?.label} · en pause` : info?.label}
        </Text>
        <Spacer />
        {live.alsoKind ? <Image systemName={KIND[live.alsoKind].symbol as any} color={KIND[live.alsoKind].color} size={12} /> : null}
      </HStack>
      <Spacer />
      {timer(family === "systemSmall" ? 34 : 30)}
      {live.side ? (
        <Text modifiers={[font({ size: 13, weight: "medium" }), foregroundStyle(C.strong)]}>
          {`${live.pausedAtMs != null ? "" : "▶ "}Sein ${live.side === "G" ? "gauche" : "droit"}`}
        </Text>
      ) : (
        <Text modifiers={[font({ size: 13 }), foregroundStyle(C.soft)]}>{live.sinceLabel}</Text>
      )}
      {live.otherSideLabel ? (
        <Text modifiers={[font({ size: 12 }), monospacedDigit(), foregroundStyle(C.soft)]}>{live.otherSideLabel}</Text>
      ) : null}
      {canWrite && family !== "systemSmall"
        ? chip(
            "■ Arrêter",
            live.kind === "sleep" ? "sleep-stop" : live.kind === "walk" ? "walk-stop" : "nursing-stop",
            info?.color ?? C.strong,
          )
        : null}
    </VStack>
  ) : (
    <VStack alignment="leading" spacing={4}>
      {family === "systemSmall" ? (
        <Text modifiers={[font({ size: 12, weight: "medium" }), foregroundStyle(C.soft), lineLimit(1)]}>{props.childName}</Text>
      ) : null}
      <HStack spacing={4}>
        {mealLate ? <Image systemName="exclamationmark.circle.fill" color={C.alert} size={12} /> : null}
        <Text modifiers={[font({ size: 13 }), foregroundStyle(mealLate ? C.alert : C.soft)]}>Dernier repas</Text>
      </HStack>
      <Spacer />
      {props.lastMealMs && inTimeline ? (
        <HStack spacing={4} alignment="lastTextBaseline">
          <Text modifiers={[font({ size: 13 }), foregroundStyle(C.soft)]}>il y a</Text>
          <Text modifiers={[font({ size: 28, weight: "bold" }), monospacedDigit(), foregroundStyle(C.strong), minimumScaleFactor(0.6), lineLimit(1)]}>
            {minutesText(props.lastMealMs)}
          </Text>
        </HStack>
      ) : props.lastMealMs ? (
        <Text
          date={new Date(props.lastMealMs)}
          dateStyle="relative"
          modifiers={[font({ size: 28, weight: "bold" }), monospacedDigit(), foregroundStyle(C.strong), minimumScaleFactor(0.6), lineLimit(1)]}
        />
      ) : (
        <Text modifiers={[font({ size: 28, weight: "bold" }), foregroundStyle(C.strong)]}>—</Text>
      )}
      {props.lastMealLabel ? (
        <Text modifiers={[font({ size: 13 }), foregroundStyle(C.soft), lineLimit(1)]}>{props.lastMealLabel}</Text>
      ) : null}
    </VStack>
  );

  if (family !== "systemMedium" && family !== "systemLarge") {
    return (
      <VStack alignment="leading" modifiers={[bg, widgetURL(url), frame({ maxWidth: 10000, maxHeight: 10000, alignment: "topLeading" })]}>
        {nowBlock}
      </VStack>
    );
  }

  // ----- Medium (et haut du grand) : maintenant à gauche, journée à droite -----
  const day = props.day;
  const clock = (ms: number | null) => (ms ? new Date(ms).toTimeString().slice(0, 5) : "—");
  const sleepLabel = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`);

  // Moyen et grand, au repos : comme Android. À gauche « Dernier repas · il y a
  // 3h57 » et « Dernier change · il y a 2 j » ; à droite « 1 repas / dernier à
  // 10:35 », « 0 change / dernier le 13/11 », « 1h00 / de sommeil ».
  const agoText = (ms: number) =>
    now - ms >= (23 * 60 + 50) * 60000 ? `${Math.max(1, Math.round((now - ms) / 86400000))} j` : minutesText(ms);
  const dayKey = (ms: number) => {
    const d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  };
  const lastWhen = (ms: number) => {
    const days = Math.round((dayKey(now) - dayKey(ms)) / 86400000);
    const d = new Date(ms);
    if (days <= 0) return `dernier à ${clock(ms)}`;
    if (days === 1) return `dernier hier à ${clock(ms)}`;
    return `dernier le ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  // Rappel dépassé : le jour du dernier, comme Android (« rappel · 11:57 »,
  // « rappel · hier 11:57 », « rappel · le 13/11 »).
  const lateWhen = (ms: number) => {
    const days = Math.round((dayKey(now) - dayKey(ms)) / 86400000);
    const d = new Date(ms);
    if (days <= 0) return `rappel · ${clock(ms)}`;
    if (days === 1) return `rappel · hier ${clock(ms)}`;
    return `rappel · le ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const restBlock = (label: string, color: string, ms: number | null | undefined, late: boolean) => (
    <VStack alignment="leading" spacing={0}>
      <HStack spacing={5}>
        <Text modifiers={[font({ size: 9 }), foregroundStyle(late ? C.alert : color)]}>●</Text>
        <Text modifiers={[font({ size: 13, weight: "semibold" }), foregroundStyle(late ? C.alert : color), lineLimit(1)]}>{label}</Text>
      </HStack>
      {ms ? (
        <HStack spacing={4} alignment="lastTextBaseline">
          <Text modifiers={[font({ size: 12 }), foregroundStyle(late ? C.alert : C.soft)]}>il y a</Text>
          <Text modifiers={[font({ size: 26, weight: "bold" }), monospacedDigit(), foregroundStyle(late ? C.alert : C.strong), minimumScaleFactor(0.7), lineLimit(1)]}>
            {agoText(ms)}
          </Text>
        </HStack>
      ) : (
        <Text modifiers={[font({ size: 15 }), foregroundStyle(C.soft)]}>pas encore</Text>
      )}
    </VStack>
  );
  const dayRow = (color: string, main: string, sub: string | null, late: boolean) => (
    <HStack spacing={6} alignment="firstTextBaseline">
      <Text modifiers={[font({ size: 9 }), foregroundStyle(late ? C.alert : color)]}>●</Text>
      <VStack alignment="leading" spacing={0}>
        <Text modifiers={[font({ size: 14, weight: "semibold" }), monospacedDigit(), foregroundStyle(late ? C.alert : C.strong), lineLimit(1)]}>{main}</Text>
        {sub ? <Text modifiers={[font({ size: 11 }), monospacedDigit(), foregroundStyle(late ? C.alert : C.soft), lineLimit(1)]}>{sub}</Text> : null}
      </VStack>
    </HStack>
  );
  const top = (mods: any[]) => (
    <HStack spacing={12} alignment="top" modifiers={mods}>
      <VStack alignment="leading" spacing={6} modifiers={[frame({ maxWidth: 10000, alignment: "topLeading" })]}>
        {lives.length
          ? nowBlock
          : [restBlock("Dernier repas", C.meal, props.lastMealMs, mealLate), restBlock("Dernier change", C.diaper, day?.lastDiaperMs, diaperLate)]}
      </VStack>
      {day && dayStale ? (
        <VStack alignment="leading" spacing={2} modifiers={[frame({ maxWidth: 10000, alignment: "topLeading" })]}>
          <Text modifiers={[font({ size: 14, weight: "semibold" }), foregroundStyle(C.strong)]}>Nouvelle journée</Text>
          <Text modifiers={[font({ size: 11 }), foregroundStyle(C.soft)]}>Mise à jour à la prochaine saisie</Text>
        </VStack>
      ) : day ? (
        <VStack alignment="leading" spacing={5} modifiers={[frame({ maxWidth: 10000, alignment: "topLeading" })]}>
          {dayRow(C.meal, `${day.mealsCount} repas`, day.lastMealMs ? (mealLate ? lateWhen(day.lastMealMs) : lastWhen(day.lastMealMs)) : day.noMealEver ? "aucun noté" : null, mealLate)}
          {dayRow(C.diaper, `${day.diapersCount} change${day.diapersCount > 1 ? "s" : ""}`, day.lastDiaperMs ? (diaperLate ? lateWhen(day.lastDiaperMs) : lastWhen(day.lastDiaperMs)) : day.noDiaperEver ? "aucun noté" : null, diaperLate)}
          {dayRow(C.sleep, sleepLabel(sleepNowMin), "de sommeil", false)}
          {dataStale ? <Text modifiers={[font({ size: 11 }), foregroundStyle(C.soft)]}>{`màj ${clock(generatedAt)}`}</Text> : null}
        </VStack>
      ) : null}
    </HStack>
  );

  // En-tête comme sur Android : prénom dans une pastille à gauche, boutons
  // « ▶ Sieste/Nuit » et « ▶ Promenade » à droite (Parent, hors session du même type).
  const T = {
    pillBg: dark ? "#1e3a5f" : "#e0f0f5",
    pillText: dark ? "#bfdbfe" : "#075f80",
    sleepTile: dark ? "#2c3246" : "#ECE8F4",
    sleepText: dark ? "#A898D0" : "#5B4A85",
    walkTile: dark ? "#2e3f3e" : "#E6F2DE",
    walkText: dark ? "#8BC46B" : "#3F7A2A",
  };
  const headChip = (label: string, action: string, tile: string, text: string) => (
    <Link
      key={action}
      destination={actionUrl(action)}
      label={label}
      modifiers={[
        font({ size: 11, weight: "semibold" }),
        foregroundStyle(text),
        lineLimit(1),
        padding({ top: 3, bottom: 3, leading: 8, trailing: 8 }),
        background(tile),
        clipShape("capsule"),
      ]}
    />
  );
  // Le prénom seul, comme Android (« Abebech » plutôt que le nom complet coupé).
  const firstName = props.childName ? props.childName.trim().split(/\s+/)[0] : "SuiviBaby";
  const header = (
    <HStack spacing={6}>
      <Text
        modifiers={[
          font({ size: 13, weight: "bold" }),
          foregroundStyle(T.pillText),
          lineLimit(1),
          padding({ top: 3, bottom: 3, leading: 9, trailing: 9 }),
          background(T.pillBg),
          clipShape("capsule"),
        ]}
      >
        {firstName}
      </Text>
      <Spacer />
      {canWrite && !lives.some((l) => l.kind === "sleep")
        ? headChip(napNow ? "▶ Sieste" : "▶ Nuit", "sleep-start", T.sleepTile, T.sleepText)
        : null}
      {canWrite && !lives.some((l) => l.kind === "walk") ? headChip("▶ Balade", "walk-start", T.walkTile, T.walkText) : null}
    </HStack>
  );

  if (family !== "systemLarge") {
    return (
      <VStack alignment="leading" spacing={6} modifiers={[bg, widgetURL(url), frame({ maxWidth: 10000, maxHeight: 10000, alignment: "topLeading" })]}>
        {header}
        {top([frame({ maxWidth: 10000, alignment: "topLeading" })])}
      </VStack>
    );
  }

  // ----- Grand : le haut du medium, puis les événements récents (un widget
  // iOS ne défile pas : le fil n'a de place que dans cette taille) -----
  const TYPE_COLOR: Record<string, string> = {
    tetee: "#D66B8F", biberon: "#E8785A", solide: "#E89A5A", pompage: "#6BA47C", croissance: "#E8C45A",
    miction: "#5BA4A4", selle: "#A47C5B", medicament: "#5A8BE8", temperature: "#E85A5A", symptome: "#E85A8B",
    vaccin: "#8B7CB4", bain: "#5AADE8", nez: "#6BA4A4", activite: "#8BC46B", jalon: "#E8A85A",
    sieste: "#7C6BA4", nuit: "#5A6BA4",
  };
  const events = (props.recent ?? []).slice(0, 7);
  const todayStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime();
  return (
    <VStack alignment="leading" spacing={10} modifiers={[bg, widgetURL(url), frame({ maxWidth: 10000, maxHeight: 10000, alignment: "topLeading" })]}>
      {header}
      {top([frame({ maxWidth: 10000, alignment: "topLeading" })])}
      {events.length ? (
        <VStack alignment="leading" spacing={5}>
          <Text modifiers={[font({ size: 12, weight: "semibold" }), foregroundStyle(C.soft)]}>Évènements récents</Text>
          {events.map((e, i) => (
            <HStack key={`${e.ms}-${i}`} spacing={6}>
              <Text modifiers={[font({ size: 9 }), foregroundStyle((e.icon && TYPE_COLOR[e.icon]) || (e.kind === "meal" ? C.meal : e.kind === "diaper" ? C.diaper : C.soft))]}>●</Text>
              <Text modifiers={[font({ size: 13 }), monospacedDigit(), foregroundStyle(C.soft)]}>
                {`${e.ms < todayStart ? "hier " : ""}${clock(e.ms)}`}
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
