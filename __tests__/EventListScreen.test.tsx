/* eslint-disable import/first */
// Sprint 13.2 : écran générique de liste rendu pour de vrai avec la config
// Repas (+ fumée Pompages / Couches). Firestore et navigation sont simulés.
import { act, fireEvent, render } from "@testing-library/react-native";
import React from "react";

type Listener = { type: string; callback: (events: any[]) => void; options: any };
const mockListeners: Listener[] = [];

jest.mock("@/services/eventsService", () => ({
  ecouterEvenements: jest.fn((_childId: string, callback: any, options: any) => {
    mockListeners.push({ type: options?.type, callback, options });
    return jest.fn();
  }),
  obtenirEvenements: jest.fn(() => Promise.resolve([])),
  getNextEventDateBefore: jest.fn(() => Promise.resolve(null)),
  hasMoreEventsBefore: jest.fn(() => Promise.resolve(false)),
  supprimerEvenement: jest.fn(() => Promise.resolve({ status: "deleted" })),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const eventsService = require("@/services/eventsService");

jest.mock("firebase/firestore", () => ({
  Timestamp: class Timestamp {
    static fromDate(d: Date) {
      return { toDate: () => d, toMillis: () => d.getTime() };
    }
  },
}));

jest.mock("@/contexts/BabyContext", () => ({
  useBaby: () => ({ activeChild: { id: "child-1", name: "Léo" } }),
}));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ firebaseUser: { uid: "user-1" } }),
}));
let mockRole: string | null = "owner";
jest.mock("@/hooks/useChildPermissions", () => ({
  useChildPermissions: () => ({ role: mockRole, loading: false }),
}));
const mockShowToast = jest.fn();
jest.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({
    showToast: mockShowToast,
    showUndoToast: jest.fn(),
    showActionToast: jest.fn(),
  }),
}));
const mockOpenSheet = jest.fn();
jest.mock("@/contexts/SheetContext", () => ({
  useSheet: () => ({ openSheet: mockOpenSheet, closeSheet: jest.fn(), isOpen: false }),
}));
jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("@/hooks/useForegroundServerRefresh", () => ({ useForegroundServerRefresh: jest.fn() }));
jest.mock("@/hooks/useSwipeHint", () => ({
  useSwipeHint: () => ({ swipeableRef: { current: null }, triggerHint: jest.fn() }),
}));
jest.mock("expo-router", () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock("@react-navigation/native", () => {
  const { useEffect } = jest.requireActual("react");
  return {
    useNavigation: () => ({ setParams: jest.fn() }),
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});
jest.mock("@react-navigation/elements", () => ({ HeaderBackButton: () => null }));
let mockHeaderRight: React.ReactNode = null;
jest.mock("@/app/(drawer)/_layout", () => ({
  useHeaderLeft: () => ({ setHeaderLeft: jest.fn() }),
  useHeaderRight: () => ({
    setHeaderRight: (node: React.ReactNode) => {
      mockHeaderRight = node;
    },
  }),
}));
jest.mock("expo-haptics", () => ({ impactAsync: jest.fn(), ImpactFeedbackStyle: {} }));
jest.mock("@expo/vector-icons/FontAwesome6", () => "FontAwesome6");
jest.mock("@expo/vector-icons/FontAwesome5", () => "FontAwesome5");
jest.mock("react-native-calendars", () => ({ Calendar: () => null }));
jest.mock("react-native-gesture-handler", () => {
  const { View } = jest.requireActual("react-native");
  return { GestureHandlerRootView: View };
});
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View };
});
jest.mock("react-native-gesture-handler/ReanimatedSwipeable", () => {
  const { forwardRef } = jest.requireActual("react");
  const { View } = jest.requireActual("react-native");
  return forwardRef(({ children, renderRightActions, enabled }: any, _ref: any) => (
    <View testID={enabled ? "swipe-enabled" : "swipe-disabled"}>
      {children}
      {renderRightActions ? renderRightActions() : null}
    </View>
  ));
});
jest.mock("@/components/ui/HeaderMenu", () => {
  const { Text, View } = jest.requireActual("react-native");
  return {
    HeaderMenu: ({ items }: any) => (
      <View>
        {items.map((item: any) => (
          <Text key={item.label} onPress={item.onPress}>
            {item.label}
          </Text>
        ))}
      </View>
    ),
  };
});

import { EventListScreen } from "@/components/eventList/EventListScreen";
import { diapersConfig } from "@/components/eventList/configs/diapersConfig";
import { mealsConfig } from "@/components/eventList/configs/mealsConfig";
import { pumpingConfig } from "@/components/eventList/configs/pumpingConfig";

const NOW = new Date(2026, 10, 7, 15, 0, 0);
const at = (hour: number, minute = 0) => new Date(2026, 10, 7, hour, minute);

function deliver(type: string, events: any[]) {
  const listener = [...mockListeners].reverse().find((l) => l.type === type);
  if (!listener) throw new Error(`no listener for ${type}`);
  act(() => {
    listener.callback(events);
  });
}

function settle() {
  act(() => {
    jest.advanceTimersByTime(400);
  });
}

/** Items du menu d'en-tête (calendrier + HeaderMenu) posé par l'écran. */
function headerMenuItems(): { label: string; onPress: () => void }[] {
  const children = React.Children.toArray((mockHeaderRight as any).props.children) as any[];
  return children[1].props.items;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  mockListeners.length = 0;
  mockRole = "owner";
  mockHeaderRight = null;
  jest.clearAllMocks();
});
afterEach(() => {
  jest.useRealTimers();
});

describe("EventListScreen (repas)", () => {
  it("squelette tant que les trois écouteurs n'ont pas répondu", () => {
    const screen = render(<EventListScreen config={mealsConfig} />);
    expect(eventsService.ecouterEvenements).toHaveBeenCalledTimes(3);
    expect(mockListeners.map((l) => l.type)).toEqual(["tetee", "biberon", "solide"]);
    expect(mockListeners[0].options).toMatchObject({ waitForServer: true });
    expect(mockListeners[0].options.jusqu).toEqual(new Date(2026, 10, 7, 23, 59, 59, 999));

    deliver("tetee", []);
    deliver("biberon", []);
    settle();
    expect(screen.getByTestId("event-list-skeleton")).toBeTruthy();
  });

  it("snapshots → groupe du jour, résumé et ligne la plus récente en tête", () => {
    const screen = render(<EventListScreen config={mealsConfig} />);
    deliver("tetee", [{ id: "t1", type: "tetee", date: at(8), dureeGauche: 5, dureeDroite: 7 }]);
    deliver("biberon", [{ id: "b1", type: "biberon", date: at(12, 30), quantite: 120 }]);
    deliver("solide", []);
    settle();

    expect(screen.queryByTestId("event-list-skeleton")).toBeNull();
    // Résumé : 2 repas, 1 tétée, 1 biberon (120 ml).
    expect(screen.getByText("repas")).toBeTruthy();
    // Libellé présent dans le résumé du jour et sur la ligne.
    expect(screen.getAllByText("Tétée")).toHaveLength(2);
    expect(screen.getAllByText("Biberon")).toHaveLength(2);
    expect(screen.getByText("120 ml")).toBeTruthy();
    // Ligne de tête = biberon (12h30) ; la tétée est repliée sous « 1 autre repas »
    // (aujourd'hui est déplié par le filtre « aujourd'hui »).
    expect(screen.getAllByLabelText("Modifier ce repas")).toHaveLength(2);
    expect(screen.getByLabelText("Masquer les repas")).toBeTruthy();
    expect(screen.getByText("lait infantile · 120 ml")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy(); // 5 + 7 min

    fireEvent.press(screen.getByLabelText("Masquer les repas"));
    expect(screen.getAllByLabelText("Modifier ce repas")).toHaveLength(1);
    expect(screen.getByLabelText("Voir 1 autre repas")).toBeTruthy();
  });

  it("état vide + CTA qui ouvre le formulaire d'ajout", () => {
    const screen = render(<EventListScreen config={mealsConfig} />);
    deliver("tetee", []);
    deliver("biberon", []);
    deliver("solide", []);
    settle();

    expect(screen.getByText("Aucun repas enregistré")).toBeTruthy();
    expect(screen.getByText("Suivez les repas et biberons")).toBeTruthy();
    fireEvent(screen.getByTestId("event-list-body"), "layout", { nativeEvent: { layout: {} } });
    fireEvent.press(screen.getByLabelText("Ajouter un repas"));
    act(() => {
      jest.advanceTimersByTime(100); // InteractionManager
    });
    expect(mockOpenSheet).toHaveBeenCalledWith(
      expect.objectContaining({ formType: "meals", ownerId: "meals", mealType: "tetee" }),
    );
  });

  it("propriétaire : balayage + action « Supprimer ce repas »", () => {
    const screen = render(<EventListScreen config={mealsConfig} />);
    deliver("tetee", [{ id: "t1", type: "tetee", date: at(8) }]);
    deliver("biberon", []);
    deliver("solide", []);
    settle();
    expect(screen.getByTestId("swipe-enabled")).toBeTruthy();
    expect(screen.getByLabelText("Supprimer ce repas")).toBeTruthy();
  });

  it("lecteur : ni balayage ni suppression", () => {
    mockRole = "viewer";
    const screen = render(<EventListScreen config={mealsConfig} />);
    deliver("tetee", [{ id: "t1", type: "tetee", date: at(8) }]);
    deliver("biberon", []);
    deliver("solide", []);
    settle();
    expect(screen.getByTestId("swipe-disabled")).toBeTruthy();
    expect(screen.queryByLabelText("Supprimer ce repas")).toBeNull();
  });

  it("mode sélection : barre d'outils, appui = cocher", () => {
    const screen = render(<EventListScreen config={mealsConfig} />);
    deliver("tetee", [{ id: "t1", type: "tetee", date: at(8) }]);
    deliver("biberon", []);
    deliver("solide", []);
    settle();

    const select = headerMenuItems().find((item) => item.label === "Sélectionner")!;
    act(() => select.onPress());
    expect(screen.getByLabelText("Supprimer 0 élément")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("Modifier ce repas"));
    expect(screen.getByLabelText("Supprimer 1 élément")).toBeTruthy();
    expect(mockOpenSheet).not.toHaveBeenCalled();
  });
});

describe("EventListScreen (fumée pompages / couches)", () => {
  it("pompages : un écouteur, totaux en ml", () => {
    const screen = render(<EventListScreen config={pumpingConfig} />);
    expect(mockListeners.map((l) => l.type)).toEqual(["pompage"]);
    deliver("pompage", [
      { id: "p1", type: "pompage", date: at(9), quantiteGauche: 60, quantiteDroite: 40 },
      { id: "p2", type: "pompage", date: at(14), quantiteGauche: 50, quantiteDroite: undefined },
    ]);
    settle();
    expect(screen.getByText("150")).toBeTruthy(); // total du jour
    expect(screen.getByText("110 ml")).toBeTruthy(); // gauche
    expect(screen.getAllByLabelText("Modifier ce pompage").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Supprimer ce pompage").length).toBeGreaterThan(0);
  });

  it("couches : deux écouteurs, type réimposé, compteurs", () => {
    const screen = render(<EventListScreen config={diapersConfig} />);
    expect(mockListeners.map((l) => l.type)).toEqual(["miction", "selle"]);
    deliver("miction", [{ id: "m1", date: at(9), couleur: "jaune" }]);
    deliver("selle", [{ id: "s1", date: at(10), consistance: "molle", quantite: "peu" }]);
    settle();
    // Résumé (Miction / Selle + compteur) et lignes.
    expect(screen.getAllByText("Miction")).toHaveLength(2);
    expect(screen.getAllByText("Selle")).toHaveLength(2);
    expect(screen.getByText("Molle · Peu")).toBeTruthy();
    expect(screen.getAllByLabelText("Modifier cette excrétion")).toHaveLength(2);
    expect(screen.getByLabelText("Masquer les excrétions")).toBeTruthy();
  });

  it("couches : état vide", () => {
    const screen = render(<EventListScreen config={diapersConfig} />);
    deliver("miction", []);
    deliver("selle", []);
    settle();
    expect(screen.getByText("Aucune couche enregistrée")).toBeTruthy();
    expect(screen.getByLabelText("Ajouter une couche")).toBeTruthy();
  });
});
