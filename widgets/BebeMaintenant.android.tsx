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
// - au repos, pas de fond : l'heure du dernier repas et « il y a » qui défile ;
// - la journée est une colonne de texte neutre ; le rouge ne sert qu'aux
//   rappels dépassés, toujours avec le mot « rappel ».
//
// Contraintes : tout est déclaré dans la fonction « widget » (runtime isolé).
// Pas de weight dans Glance : les largeurs sont calculées depuis la taille réelle
// du widget (widthDp / heightDp, transmis par le patch expo-widgets).
import { Box, Column, Row, Spacer, Text } from "@expo/ui/jetpack-compose";
import { background, cornerRadius, fillMaxSize, height, padding, paddingAll, size, width } from "@expo/ui/jetpack-compose/modifiers";
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

  const clock = (ms: number) => {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const sleepLabel = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}` : `${m} min`);
  const sideWord = (s: string | null | undefined) => (s === "G" ? "gauche" : s === "D" ? "droit" : "");
  const otherSide = (l: WidgetLive) =>
    l.otherSideLabel ? l.otherSideLabel.replace(/^G /, "gauche ").replace(/^D /, "droit ") : null;

  // Rendu à chaque envoi de l'app : l'heure du rendu fait foi pour les rappels.
  const now = Date.now();
  const mealLate = props.alerts.mealAtMs != null && now >= props.alerts.mealAtMs;
  const diaperLate = props.alerts.diaperAtMs != null && now >= props.alerts.diaperAtMs;
  const lives = props.lives ?? (props.live ? [props.live] : []);
  const n = lives.length;
  const day = props.day;

  // ----- Grille -----
  const env = environment as WidgetEnvironment & { widthDp?: number; heightDp?: number };
  const W = env.widthDp && env.widthDp > 0 ? env.widthDp : 420;
  const H = env.heightDp && env.heightDp > 0 ? env.heightDp : 222;
  const small = W < 250;
  const PAD = small ? 12 : 14;
  const HEAD_H = small ? 14 : 16;
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
  const chrono = (l: WidgetLive, sp: number) => (
    <Chrono
      startMs={l.timerStartMs}
      pausedAtMs={l.pausedAtMs ?? undefined}
      color={l.pausedAtMs != null ? C.softOnTile : C.strong}
      fontSize={sp}
    />
  );
  const sinceTime = (l: WidgetLive) => l.sinceLabel.replace("depuis ", "");

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
    const kind = props.lastMealLabel ? props.lastMealLabel.split(" à ")[0] : null;
    const prefix = kind && kind !== "Repas" && !small ? `${kind} · il y a ` : "il y a ";
    const big = small || zoneH < 108 ? 30 : 36;
    const sp = small ? 12 : 13;
    return (
      <Column verticalAlignment="center" modifiers={[size(zoneW, h)]}>
        {labelRow(
          mealLate ? C.alert : CAT.meal.text,
          mealLate ? C.alert : CAT.meal.dot,
          mealLate ? "Dernier repas · rappel" : "Dernier repas",
          sp,
        )}
        {gap(2)}
        {txt(clock(props.lastMealMs), mealLate ? C.alert : C.strong, big, true)}
        {gap(2)}
        {props.nextSide && small ? (
          txt(`Prochain sein : ${props.nextSide}`, CAT.nursing.text, sp, true)
        ) : (
          <Row verticalAlignment="center">
            {txt(prefix, C.soft, sp)}
            <Chrono startMs={props.lastMealMs} color={mealLate ? C.alert : C.soft} fontSize={sp} />
          </Row>
        )}
        {props.nextSide && !small ? gap(2) : null}
        {props.nextSide && !small ? txt(`Prochain sein : ${sideWord(props.nextSide)}`, CAT.nursing.text, sp, true) : null}
      </Column>
    );
  };

  const singleTile = (l: WidgetLive) => {
    const k = CAT[l.kind];
    const title =
      l.kind === "nursing"
        ? `Tétée${l.pausedAtMs != null ? " en pause" : ""}${l.side ? ` · ${sideWord(l.side)}` : ""}`
        : `${k.label} en cours`;
    const other = l.kind === "nursing" ? otherSide(l) : null;
    const chronoSp = small ? Math.min(28, Math.floor((zoneW - 20) / 4.3)) : Math.min(36, Math.floor((zoneW - 24) / 4.3));
    return (
      <Column
        verticalAlignment="center"
        modifiers={[size(zoneW, zoneH - bandH), background(k.tile), cornerRadius(16), paddingAll(small ? 10 : 12)]}
      >
        {labelRow(k.text, k.dot, title, small ? 12 : 13)}
        {gap(4)}
        {chrono(l, chronoSp)}
        {gap(2)}
        {txt(other ? `${other} · depuis ${sinceTime(l)}` : `depuis ${sinceTime(l)}`, C.softOnTile, small ? 12 : 13)}
      </Column>
    );
  };

  const rowTile = (l: WidgetLive, h: number) => {
    const k = CAT[l.kind];
    let title: string;
    if (l.kind === "nursing") {
      const other = otherSide(l);
      title = `Tétée${l.pausedAtMs != null ? " en pause" : ""}${l.side ? ` · ${sideWord(l.side)}` : ""}${other && !small ? ` · ${other}` : ""}`;
    } else {
      title = small ? k.label : zoneW < 200 ? `${k.label} · ${sinceTime(l)}` : `${k.label} · depuis ${sinceTime(l)}`;
    }
    return (
      <Column verticalAlignment="center" modifiers={[size(zoneW, h), background(k.tile), cornerRadius(12), padding(10, 6, 10, 6)]}>
        {labelRow(k.text, k.dot, title, 12)}
        {chrono(l, small ? 22 : h >= 58 ? 26 : 22)}
      </Column>
    );
  };

  const compactTile = (l: WidgetLive, h: number) => {
    const k = CAT[l.kind];
    const labelW = small ? 56 : 74;
    const label = l.kind === "nursing" && l.side ? `${k.short} ${l.side}` : small ? k.short : k.label;
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

  // ----- Colonne « Aujourd'hui » (4×2) -----
  const dayColumn = () => {
    if (!day) return null;
    const itemH = Math.floor((zoneH - 16) / 3);
    const showSub = itemH >= 34;
    const item = (dotColor: string, value: string, sub: string | null, late: boolean) => (
      <Row verticalAlignment="center" modifiers={[size(Rw, itemH)]}>
        {dot(late ? C.alert : dotColor)}
        <Spacer modifiers={[width(8)]} />
        <Column>
          {txt(value, late ? C.alert : C.strong, 15, true)}
          {showSub && sub ? txt(sub, late ? C.alert : C.soft, 12) : null}
        </Column>
      </Row>
    );
    const mealSub = day.lastMealMs
      ? mealLate
        ? `rappel · ${clock(day.lastMealMs)}`
        : Rw >= 140 && day.bottleMl > 0
          ? `${clock(day.lastMealMs)} · ${day.bottleMl} ml`
          : `dernier ${clock(day.lastMealMs)}`
      : null;
    const diaperSub = day.lastDiaperMs
      ? diaperLate
        ? `rappel · ${clock(day.lastDiaperMs)}`
        : `dernière ${clock(day.lastDiaperMs)}`
      : null;
    return (
      <Column modifiers={[width(Rw)]}>
        {item(CAT.meal.dot, `${day.mealsCount} repas`, mealSub, mealLate && n > 0)}
        {gap(8)}
        {item(CAT.diaper.dot, `${day.diapersCount} couche${day.diapersCount > 1 ? "s" : ""}`, diaperSub, diaperLate)}
        {gap(8)}
        {item(CAT.sleep.dot, sleepLabel(day.sleepMinutes), "de sommeil", false)}
      </Column>
    );
  };

  // ----- Bande du bas (2×2, au plus une session) -----
  const band = () => {
    if (!bandH || !day) return null;
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

  const name = props.childName ? (small ? props.childName.split(" ")[0] : props.childName) : "SuiviBaby";
  const container = [fillMaxSize(), background(C.bg), cornerRadius(20), paddingAll(PAD)];

  if (small) {
    return (
      <Column modifiers={container}>
        <Column modifiers={[height(HEAD_H)]}>{txt(name, C.soft, 11, true)}</Column>
        {gap(HEAD_GAP)}
        {nowZone()}
        {band()}
      </Column>
    );
  }

  return (
    <Column modifiers={container}>
      <Row verticalAlignment="center" modifiers={[height(HEAD_H)]}>
        <Column modifiers={[width(zoneW)]}>{txt(name, C.soft, 12, true)}</Column>
        {showDay ? <Spacer modifiers={[width(SEP)]} /> : null}
        {showDay ? <Column modifiers={[width(Rw)]}>{txt("Aujourd'hui", C.soft, 12)}</Column> : null}
      </Row>
      {gap(HEAD_GAP)}
      <Row>
        {nowZone()}
        {showDay ? <Spacer modifiers={[width(12)]} /> : null}
        {showDay ? <Box modifiers={[size(1, zoneH), background(C.rule)]} /> : null}
        {showDay ? <Spacer modifiers={[width(12)]} /> : null}
        {showDay ? dayColumn() : null}
      </Row>
    </Column>
  );
};

export default createWidget("BebeMaintenant", BebeMaintenant, EMPTY_NOW_WIDGET_NATIVE);
