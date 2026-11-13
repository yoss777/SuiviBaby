// widgets/BebeMaintenant.android.tsx
// Widget Android « Bébé maintenant » (expo-widgets, Jetpack Compose via @expo/ui).
// Android n'a ni timeline ni chrono qui défile dans expo-widgets : on affiche
// l'heure de début (« depuis 14:32 ») en gros, jamais un faux chrono figé.
// Le vrai chrono vivra dans la notification permanente (sprint 5).
// Même contrainte qu'iOS : tout est déclaré dans la fonction « widget ».
import { Column, Row, Spacer, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxSize, fillMaxWidth, paddingAll } from "@expo/ui/jetpack-compose/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";

import { EMPTY_NOW_WIDGET, type NowWidgetProps } from "@/utils/widgetSnapshot";

const BebeMaintenant = (props: NowWidgetProps, environment: WidgetEnvironment) => {
  "widget";
  const dark = environment.colorScheme === "dark";
  const C = {
    bg: dark ? "#1f2937" : "#ffffff",
    strong: dark ? "#f9fafb" : "#1f2937",
    soft: dark ? "#9ca3af" : "#6b7280",
    alert: dark ? "#f87171" : "#b91c1c",
  };
  const KIND = {
    nursing: { label: "Tétée", color: "#D66B8F" },
    sleep: { label: "Sommeil", color: "#7C6BA4" },
    walk: { label: "Promenade", color: "#8BC46B" },
  };
  const clock = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const live = props.live;
  const mealLate = props.alerts.mealAtMs != null && props.generatedAtMs >= props.alerts.mealAtMs;
  const diaperLate = props.alerts.diaperAtMs != null && props.generatedAtMs >= props.alerts.diaperAtMs;
  const sleepLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`);
  const container = [fillMaxSize(), background(C.bg), cornerRadius(16), paddingAll(14)];

  if (live) {
    const info = KIND[live.kind];
    return (
      <Column modifiers={container}>
        <Row>
          <Text color={info.color} style={{ fontSize: 13 }}>●  </Text>
          <Text color={C.strong} style={{ fontSize: 13, fontWeight: "600" }}>
            {live.pausedAtMs != null ? `${info.label} · en pause` : `${info.label} en cours`}
          </Text>
        </Row>
        <Spacer modifiers={[fillMaxWidth()]} />
        <Text color={C.strong} style={{ fontSize: 26, fontWeight: "700" }}>{live.sinceLabel}</Text>
        {live.side ? (
          <Text color={C.strong} style={{ fontSize: 13 }}>{`Sein ${live.side === "G" ? "gauche" : "droit"}`}</Text>
        ) : null}
        {live.otherSideLabel ? <Text color={C.soft} style={{ fontSize: 12 }}>{live.otherSideLabel}</Text> : null}
      </Column>
    );
  }

  return (
    <Column modifiers={container}>
      <Text color={C.soft} style={{ fontSize: 12 }}>{props.childName}</Text>
      <Text color={mealLate ? C.alert : C.soft} style={{ fontSize: 13 }}>{mealLate ? "Dernier repas (rappel)" : "Dernier repas"}</Text>
      <Spacer modifiers={[fillMaxWidth()]} />
      <Text color={C.strong} style={{ fontSize: 26, fontWeight: "700" }}>
        {props.lastMealMs ? `à ${clock(props.lastMealMs)}` : "—"}
      </Text>
      {props.lastMealLabel ? <Text color={C.soft} style={{ fontSize: 13 }}>{props.lastMealLabel}</Text> : null}
      {props.nextSide ? (
        <Text color={C.strong} style={{ fontSize: 13, fontWeight: "600" }}>
          {`Prochain sein : ${props.nextSide === "G" ? "gauche" : "droit"}`}
        </Text>
      ) : null}
      {props.day ? (
        <Text color={diaperLate ? C.alert : C.soft} style={{ fontSize: 12 }}>
          {`Couche ${props.day.lastDiaperMs ? `à ${clock(props.day.lastDiaperMs)}` : "—"} · Sommeil ${sleepLabel(props.day.sleepMinutes)}`}
        </Text>
      ) : null}
    </Column>
  );
};

export default createWidget("BebeMaintenant", BebeMaintenant, EMPTY_NOW_WIDGET);
