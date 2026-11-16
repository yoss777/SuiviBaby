// Contrat écrivain/lecteur sur iPhone : ce que l'app écrit dans la timeline
// (services/widgetSync.ts) est rendu correctement par le widget
// (BebeMaintenant.ios.tsx) — mêmes clés de données, clé des liens, expiration.
jest.mock("expo-widgets", () => ({ createWidget: (_n: string, fn: unknown) => fn }));

import { Platform } from "react-native";

import { __resetWidgetSyncForTests, pushNowWidget } from "@/services/widgetSync";
import { KEY, NOW, H, napLive, widgetProps } from "./helpers/widgetFixtures";
import { allText, compileWidget, dumpWidget } from "./helpers/widgetTree";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const render = compileWidget(require("@/widgets/BebeMaintenant.ios").default, "ios");

type Entry = { date: Date; props: Record<string, unknown> };

it("timeline écrite par l'app : rendue par le widget (prénom, session, clé), masquée à l'expiration", () => {
  expect(Platform.OS).toBe("ios");
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  const entries: Entry[] = [];
  __resetWidgetSyncForTests({
    updateSnapshot: jest.fn(),
    updateTimeline: (e: Entry[]) => entries.push(...e),
  } as never);

  pushNowWidget(widgetProps({ generatedAtMs: NOW, lives: [napLive(NOW - H)] }) as never);
  expect(entries.length).toBeGreaterThan(10);

  const first = dumpWidget(render(entries[0].props, { colorScheme: "light", widgetFamily: "systemMedium", date: entries[0].date }));
  expect(allText(first)).toContain("Léa");
  expect(first.texts).toContain("■ Arrêter");
  expect(first.links.find((l) => l.includes("widget=sleep-stop"))).toContain(`&k=${KEY}`);
  // Les données natives n'ont aucun null (pont Android d'expo-widgets).
  expect(JSON.stringify(entries[0].props)).not.toContain("null");

  // Au-delà de la fenêtre de comptage (4 h) : compteur natif, jamais une
  // durée figée (régression : « 4h00 » affiché de 4 h à 24 h).
  const end = entries[0].props.timelineEndMs as number;
  const late = entries.find((e) => e.date.getTime() > end && e.date.getTime() < NOW + 24 * H);
  expect(late).toBeDefined();
  const lateDump = dumpWidget(render(late!.props, { colorScheme: "light", widgetFamily: "systemMedium", date: late!.date }));
  // La sieste en cours passe au compteur natif (défile seul).
  expect(lateDump.nativeTimers).toBeGreaterThanOrEqual(1);
  // Et pendant la fenêtre de comptage, c'est le texte à la minute (« 1 h » dans 0 min…).
  const firstDump = dumpWidget(render(entries[0].props, { colorScheme: "light", widgetFamily: "systemMedium", date: entries[0].date }));
  expect(firstDump.nativeTimers).toBe(0);

  const last = entries[entries.length - 1];
  expect(last.date.getTime()).toBe(NOW + 24 * H + 60_000);
  const expired = dumpWidget(render(last.props, { colorScheme: "light", widgetFamily: "systemMedium", date: last.date }));
  expect(allText(expired)).not.toContain("Léa");
  expect(allText(expired)).toContain("Ouvrez SuiviBaby pour mettre à jour");
  jest.useRealTimers();
});
