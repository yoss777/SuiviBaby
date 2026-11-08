// Accueil : célébration d'un jalon (une par jour et par enfant, jamais sur l'alerte fièvre ni une feuille).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";

import { HomeMilestoneCelebration } from "@/components/suivibaby/home/HomeMilestoneCelebration";
import { ModalProvider, useModal } from "@/contexts/ModalContext";
import { countChildEvents, getFirstEventDate } from "@/services/eventsRepository";
import { __setReduceMotionForTests } from "@/utils/motion";

jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(),
  impactAsync: jest.fn(),
  NotificationFeedbackType: { Success: "success" },
  ImpactFeedbackStyle: { Medium: "medium" },
}));
jest.mock("@/services/eventsRepository", () => ({
  countChildEvents: jest.fn(),
  getFirstEventDate: jest.fn(),
}));

let mockPremium = { isLoading: false, access: false };
jest.mock("@/contexts/PremiumContext", () => ({
  usePremium: () => ({
    isLoading: mockPremium.isLoading,
    checkFeatureAccess: () => mockPremium.access,
  }),
}));
let mockSheetOpen = false;
jest.mock("@/contexts/SheetContext", () => ({
  useSheetState: () => ({ isOpen: mockSheetOpen, viewProps: null }),
}));

const store = new Map<string, string>();
const DAY = 86400000;

let modal: ReturnType<typeof useModal>;
const Grab = () => {
  modal = useModal();
  return null;
};

type Props = Partial<React.ComponentProps<typeof HomeMilestoneCelebration>>;
const ui = (props: Props = {}) => (
  <ModalProvider>
    <Grab />
    <HomeMilestoneCelebration
      childId="child-a"
      childName="Léa"
      events={[]}
      weeklyLoaded
      blocked={false}
      {...props}
    />
  </ModalProvider>
);

const streakEvents = () =>
  Array.from({ length: 8 }, (_, i) => ({
    type: "tetee",
    date: new Date(new Date(Date.now() - i * DAY).setHours(9, 0, 0, 0)),
  }));

beforeEach(() => {
  __setReduceMotionForTests(true);
  jest.clearAllMocks();
  store.clear();
  store.set("@suivibaby_milestone_baseline", JSON.stringify(["child-a", "child-b"])); // déjà vérifiés : seuls les nouveaux paliers s'affichent
  mockPremium = { isLoading: false, access: false };
  mockSheetOpen = false;
  (AsyncStorage.getItem as jest.Mock).mockImplementation((k: string) => Promise.resolve(store.get(k) ?? null));
  (AsyncStorage.setItem as jest.Mock).mockImplementation((k: string, v: string) => {
    store.set(k, v);
    return Promise.resolve();
  });
  (getFirstEventDate as jest.Mock).mockResolvedValue(new Date(Date.now() - 40 * DAY));
  (countChildEvents as jest.Mock).mockResolvedValue(5);
});

afterEach(() => __setReduceMotionForTests(false));

const celebrated = () => JSON.parse(store.get("@suivibaby_celebrated_milestones") ?? "[]");

describe("HomeMilestoneCelebration", () => {
  it("affiche une célébration à l'ouverture et la marque célébrée", async () => {
    render(ui());
    expect(await screen.findByText("1 mois de suivi !")).toBeTruthy();
    expect(celebrated()).toEqual(["child-a:tracking_30d"]);
  });

  it("fermer retire la modale ; elle n'est pas rejouée au retour sur l'accueil", async () => {
    const first = render(ui());
    fireEvent.press(await screen.findByRole("button", { name: "Fermer" }));
    await waitFor(() => expect(screen.queryByText("1 mois de suivi !")).toBeNull());
    first.unmount();
    render(ui());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByText("1 mois de suivi !")).toBeNull();
  });

  it("reste marquée célébrée même si l'app est quittée sans fermer", async () => {
    const view = render(ui());
    await screen.findByText("1 mois de suivi !");
    view.unmount();
    expect(celebrated()).toContain("child-a:tracking_30d");
  });

  it("au plus une célébration par jour : les autres jalons attendent le lendemain", async () => {
    (countChildEvents as jest.Mock).mockResolvedValue(150);
    const first = render(ui());
    await screen.findByText("1 mois de suivi !");
    fireEvent.press(screen.getByRole("button", { name: "Fermer" }));
    first.unmount();
    render(ui());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByText(/100/)).toBeNull();
  });

  it("n'ouvre rien par-dessus l'alerte fièvre déjà affichée, et ne marque rien", async () => {
    const view = render(ui({ weeklyLoaded: false }));
    act(() =>
      modal.showAlert("Température élevée", "Appelez le 15", [{ text: "J'ai compris" }], {
        dismissible: false,
        callEmergency: true,
      }),
    );
    view.rerender(ui({ weeklyLoaded: true }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByText("1 mois de suivi !")).toBeNull();
    expect(screen.getByText("Appelez le 15")).toBeTruthy();
    expect(celebrated()).toEqual([]);
  });

  it("l'alerte fièvre qui arrive pendant la célébration la remplace", async () => {
    render(ui());
    await screen.findByText("1 mois de suivi !");
    act(() =>
      modal.showAlert("Température élevée", "Appelez le 15", [{ text: "J'ai compris" }], {
        dismissible: false,
      }),
    );
    await waitFor(() => expect(screen.queryByText("1 mois de suivi !")).toBeNull());
    expect(screen.getByText("Appelez le 15")).toBeTruthy();
  });

  it("n'ouvre pas la célébration pendant qu'une feuille est ouverte, puis l'affiche à sa fermeture", async () => {
    mockSheetOpen = true;
    const view = render(ui());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByText("1 mois de suivi !")).toBeNull();
    expect(getFirstEventDate).not.toHaveBeenCalled();
    mockSheetOpen = false;
    view.rerender(ui());
    expect(await screen.findByText("1 mois de suivi !")).toBeTruthy();
  });

  it("attend la fin du chargement des événements et de l'abonnement", async () => {
    mockPremium = { isLoading: true, access: false };
    const view = render(ui({ weeklyLoaded: false }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(getFirstEventDate).not.toHaveBeenCalled();
    mockPremium = { isLoading: false, access: false };
    view.rerender(ui({ weeklyLoaded: true }));
    expect(await screen.findByText("1 mois de suivi !")).toBeTruthy();
  });

  it("ne fait rien tant qu'un autre écran modal de l'accueil est affiché (blocked)", async () => {
    render(ui({ blocked: true }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByText("1 mois de suivi !")).toBeNull();
    expect(getFirstEventDate).not.toHaveBeenCalled();
  });

  it("jalon Premium : proposé aux abonnés, pas aux gratuits (qui gardent les autres)", async () => {
    (getFirstEventDate as jest.Mock).mockResolvedValue(new Date(Date.now() - 10 * DAY));
    const free = render(ui({ events: streakEvents() }));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByText("7 jours consécutifs !")).toBeNull();
    free.unmount();

    mockPremium = { isLoading: false, access: true };
    render(ui({ childId: "child-b", events: streakEvents() }));
    expect(await screen.findByText("7 jours consécutifs !")).toBeTruthy();
  });

  it("propre à l'enfant actif : un autre enfant a sa propre célébration le même jour", async () => {
    const a = render(ui());
    fireEvent.press(await screen.findByRole("button", { name: "Fermer" }));
    a.unmount();
    render(ui({ childId: "child-b", childName: "Tom" }));
    expect(await screen.findByText("1 mois de suivi !")).toBeTruthy();
  });

  it("hors ligne (lecture impossible) : aucune célébration, aucune erreur", async () => {
    (countChildEvents as jest.Mock).mockRejectedValue(new Error("offline"));
    render(ui());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.queryByText("1 mois de suivi !")).toBeNull();
    expect(celebrated()).toEqual([]);
  });
});
