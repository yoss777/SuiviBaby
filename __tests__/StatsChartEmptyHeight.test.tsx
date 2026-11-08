import type { ViewStyle } from "react-native";
import { act, render, renderHook, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import {
  CHART_CONTAINER_MARGIN_VERTICAL,
  CHART_EMPTY_STATE_HEIGHT,
  CHART_HEIGHT,
  useStableChartBlockHeight,
} from "@/components/suivibaby/chartLayout";

// Skia : rendu natif indisponible sous Jest, on remplace les primitives par des vues vides.
jest.mock("@shopify/react-native-skia", () => {
  const { View } = jest.requireActual("react-native");
  const Stub = ({ children }: { children?: React.ReactNode }) => (
    <View>{children}</View>
  );
  const path = () => {
    const p: Record<string, unknown> = {};
    for (const m of ["moveTo", "lineTo", "cubicTo", "quadTo", "close", "addRRect", "addRect", "arcToTangent"]) {
      p[m] = () => p;
    }
    return p;
  };
  return {
    Canvas: Stub,
    Group: Stub,
    LinearGradient: Stub,
    Path: Stub,
    RoundedRect: Stub,
    Rect: Stub,
    Shadow: Stub,
    Circle: Stub,
    Line: Stub,
    DashPathEffect: Stub,
    vec: (x: number, y: number) => ({ x, y }),
    rect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
    rrect: (r: unknown) => r,
    Skia: {
      Path: { Make: path },
      RRectXY: (r: unknown) => r,
      XYWHRect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
    },
  };
});
jest.mock("react-native-reanimated", () => {
  const { View } = jest.requireActual("react-native");
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    runOnJS: (fn: unknown) => fn,
  };
});
jest.mock("react-native-gesture-handler", () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["onEnd", "onStart", "onBegin", "onUpdate", "runOnJS", "maxDuration", "onFinalize"]) {
    chain[m] = () => chain;
  }
  return {
    Gesture: { Tap: () => chain, Pan: () => chain, Race: () => chain },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
  };
});
jest.mock("expo-router", () => ({ router: { replace: jest.fn(), push: jest.fn() } }));
jest.mock("@expo/vector-icons/FontAwesome6", () => "FontAwesome6");
jest.mock("@expo/vector-icons/MaterialCommunityIcons", () => "MaterialCommunityIcons");

// Un événement bien antérieur à la semaine courante : le graphique n'est pas
// « vide » globalement, mais la semaine / le jour affiché n'a aucune donnée.
const OLD = new Date(2020, 0, 6, 10, 0);

const minHeightOf = (testID: string) =>
  StyleSheet.flatten(screen.getByTestId(testID).props.style).minHeight;

describe("chartLayout", () => {
  it("réserve à l'état vide la hauteur de la zone graphique (marges comprises)", () => {
    expect(CHART_EMPTY_STATE_HEIGHT).toBe(CHART_HEIGHT + 2 * CHART_CONTAINER_MARGIN_VERTICAL);
  });

  it("garde la plus grande hauteur du bloc avec données, jamais moins que le graphique", () => {
    const { result } = renderHook(() => useStableChartBlockHeight());
    expect(result.current.emptyMinHeight).toBe(CHART_EMPTY_STATE_HEIGHT);

    const layout = (height: number) =>
      act(() => {
        result.current.onContentLayout({
          nativeEvent: { layout: { x: 0, y: 0, width: 300, height } },
        } as never);
      });

    expect(result.current.dataMinHeight).toBeUndefined();

    layout(512.4);
    expect(result.current.emptyMinHeight).toBe(512);
    expect(result.current.dataMinHeight).toBe(512);

    // Filtre avec un bloc plus court (ex. « Bib » sans la légende de « Tous ») :
    // la carte ne rétrécit pas.
    layout(430);
    expect(result.current.emptyMinHeight).toBe(512);
    expect(result.current.dataMinHeight).toBe(512);
  });
});

describe("état vide des graphiques de stats", () => {
  it("RepasChart : le conteneur vide a la hauteur du graphique", async () => {
    const RepasChart = require("@/components/suivibaby/RepasChart").default;
    render(
      <RepasChart
        tetees={[{ id: "r1", type: "biberon", date: OLD, quantite: 120 }]}
        screenWidth={320}
      />,
    );
    await act(async () => {});
    expect(screen.getByText("Aucune donnée cette semaine")).toBeTruthy();
    expect(minHeightOf("chart-empty-state")).toBe(CHART_EMPTY_STATE_HEIGHT);
  });

  it("SommeilChart : le conteneur vide a la hauteur du graphique", async () => {
    const SommeilChart = require("@/components/suivibaby/SommeilChart").default;
    render(
      <SommeilChart
        sommeils={[
          {
            id: "s1",
            type: "sommeil",
            date: OLD,
            heureDebut: OLD,
            heureFin: new Date(OLD.getTime() + 3600000),
            isNap: true,
          },
        ]}
        screenWidth={320}
      />,
    );
    await act(async () => {});
    expect(screen.getByText("Aucune donnée cette semaine")).toBeTruthy();
    expect(minHeightOf("chart-empty-state")).toBe(CHART_EMPTY_STATE_HEIGHT);
  });

  it("PompagesChart : le conteneur vide (vue jour) a la hauteur du graphique", async () => {
    const PompagesChart = require("@/components/suivibaby/PompagesChart").default;
    render(
      <PompagesChart
        pompages={[{ id: "p1", type: "pompage", date: OLD, quantiteGauche: 50, quantiteDroite: 50 }]}
        screenWidth={320}
      />,
    );
    await act(async () => {});
    expect(screen.getByText("Aucune session ce jour")).toBeTruthy();
    expect(minHeightOf("chart-empty-state")).toBe(CHART_EMPTY_STATE_HEIGHT);
  });
});

describe("largeur des cartes de stats", () => {
  // Le ScrollView des stats centre son contenu : la carte doit s'étirer, sinon
  // elle se resserre quand un filtre retire une ligne (Repas « Bib »).
  it.each([
    ["RepasChart", { tetees: [] }],
    ["SommeilChart", { sommeils: [] }],
    ["PompagesChart", { pompages: [] }],
  ])("%s occupe toute la largeur", async (name, props) => {
    const Chart = require(`@/components/suivibaby/${name}`).default;
    render(<Chart {...props} screenWidth={320} />);
    await act(async () => {});
    const root = screen.toJSON() as unknown as { props: { style: ViewStyle | ViewStyle[] } };
    expect(StyleSheet.flatten(root.props.style).alignSelf).toBe("stretch");
  });
});
