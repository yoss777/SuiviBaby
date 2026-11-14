// widgets/BebeMaintenant.ios.tsx
// Widget iOS « Bébé maintenant » (expo-widgets, SwiftUI via @expo/ui).
// Le composant s'exécute dans l'extension, isolé de l'app : pas de hooks, pas
// d'import utilisable hors des composants Expo UI, et aucune valeur déclarée
// hors de la fonction (couleurs et libellés sont donc déclarés dedans).
// Les données viennent de utils/widgetSnapshot.ts (updateSnapshot depuis l'app).
// Le chrono défile seul (Text timerInterval) : aucun rechargement dépensé.
import { HStack, Image, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
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
    walk: { label: "Promenade", symbol: "figure.walk", color: C.walk, path: "walk" },
  };
  const now = environment.date ? new Date(environment.date).getTime() : Date.now();
  const family = environment.widgetFamily;
  const live = props.live;
  // Toutes les sessions en cours (tétée, sommeil, promenade), comme sur Android.
  const lives: WidgetLive[] = props.lives ?? (live ? [live] : []);
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

  const timerOf = (l: WidgetLive | null, size: number) =>
    l ? (
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
    </VStack>
  ) : (
    <VStack alignment="leading" spacing={4}>
      <Text modifiers={[font({ size: 12, weight: "medium" }), foregroundStyle(C.soft), lineLimit(1)]}>{props.childName}</Text>
      <HStack spacing={4}>
        {mealLate ? <Image systemName="exclamationmark.circle.fill" color={C.alert} size={12} /> : null}
        <Text modifiers={[font({ size: 13 }), foregroundStyle(mealLate ? C.alert : C.soft)]}>Dernier repas</Text>
      </HStack>
      <Spacer />
      {props.lastMealMs ? (
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
  const row = (label: string, color: string, main: string, sub: string, late: boolean) => (
    <HStack spacing={6} alignment="firstTextBaseline">
      <Text modifiers={[font({ size: 9 }), foregroundStyle(color)]}>●</Text>
      <VStack alignment="leading" spacing={0}>
        <Text modifiers={[font({ size: 12 }), foregroundStyle(C.soft)]}>{label}</Text>
        <HStack spacing={4}>
          {late ? <Image systemName="exclamationmark.circle.fill" color={C.alert} size={11} /> : null}
          <Text modifiers={[font({ size: 15, weight: "semibold" }), monospacedDigit(), foregroundStyle(late ? C.alert : C.strong)]}>{main}</Text>
        </HStack>
        {sub ? <Text modifiers={[font({ size: 11 }), monospacedDigit(), foregroundStyle(C.soft)]}>{sub}</Text> : null}
      </VStack>
    </HStack>
  );
  const clock = (ms: number | null) => (ms ? new Date(ms).toTimeString().slice(0, 5) : "—");
  const sleepLabel = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}` : `${min} min`);

  const top = (mods: any[]) => (
    <HStack spacing={14} alignment="top" modifiers={mods}>
      <VStack alignment="leading" modifiers={[frame({ maxWidth: 10000, maxHeight: 10000, alignment: "topLeading" })]}>
        {nowBlock}
      </VStack>
      {day && dayStale ? (
        <VStack alignment="leading" spacing={2} modifiers={[frame({ maxWidth: 10000, maxHeight: 10000, alignment: "topLeading" })]}>
          <Text modifiers={[font({ size: 15, weight: "semibold" }), foregroundStyle(C.strong)]}>Nouvelle journée</Text>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(C.soft)]}>Mise à jour à la prochaine saisie</Text>
        </VStack>
      ) : day ? (
        <VStack alignment="leading" spacing={6} modifiers={[frame({ maxWidth: 10000, maxHeight: 10000, alignment: "topLeading" })]}>
          {row("Repas", C.meal, `à ${clock(day.lastMealMs)}`, `${day.mealsCount} repas${day.bottleMl ? ` · ${day.bottleMl} ml` : ""}`, mealLate)}
          {row("Change", C.diaper, `à ${clock(day.lastDiaperMs)}`, `${day.diapersCount} change${day.diapersCount > 1 ? "s" : ""}`, diaperLate)}
          {row("Sommeil", C.sleep, sleepLabel(sleepNowMin), "", false)}
          {dataStale ? <Text modifiers={[font({ size: 11 }), foregroundStyle(C.soft)]}>{`màj ${clock(generatedAt)}`}</Text> : null}
        </VStack>
      ) : null}
    </HStack>
  );

  if (family !== "systemLarge") return top([bg, widgetURL(url)]);

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
