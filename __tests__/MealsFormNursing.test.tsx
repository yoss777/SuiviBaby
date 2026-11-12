// P0-4 / P1-6 / P1-9 : chrono tétée accessible et persistant, stepper biberon.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";

import { MealsForm } from "@/components/forms/MealsForm";
import {
  EMPTY_NURSING_TIMER,
  lastBottleStorageKey,
  nursingTimerStorageKey,
  toggleSide,
} from "@/components/forms/nursingTimer";

const mockShowAlert = jest.fn();
const mockShowToast = jest.fn();
const mockAjouter = jest.fn();

jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("@/contexts/BabyContext", () => ({
  useBaby: () => ({ activeChild: { id: "c1", name: "Léa" } }),
}));
jest.mock("@/contexts/ModalContext", () => ({
  useModal: () => ({ showAlert: mockShowAlert, showConfirm: jest.fn() }),
}));
jest.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));
jest.mock("@/contexts/SuccessAnimationContext", () => ({
  useSuccessAnimation: () => ({ showSuccess: jest.fn() }),
}));
jest.mock("@/services/eventsService", () => ({
  ajouterEvenementOptimistic: (...args: unknown[]) => mockAjouter(...args),
  modifierEvenementOptimistic: jest.fn(),
  supprimerEvenement: jest.fn(),
}));
jest.mock("@/components/ui/DateTimeSectionRow", () => ({ DateTimeSectionRow: () => null }));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium" },
  NotificationFeedbackType: { Warning: "warning" },
}));

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  mockShowAlert.mockClear();
  mockShowToast.mockClear();
  mockAjouter.mockClear();
  (AsyncStorage.getItem as jest.Mock).mockImplementation((k: string) =>
    Promise.resolve(store.has(k) ? store.get(k)! : null),
  );
  (AsyncStorage.setItem as jest.Mock).mockImplementation((k: string, v: string) => {
    store.set(k, v);
    return Promise.resolve();
  });
  (AsyncStorage.removeItem as jest.Mock).mockImplementation((k: string) => {
    store.delete(k);
    return Promise.resolve();
  });
});

const renderForm = (props: Partial<React.ComponentProps<typeof MealsForm>> = {}) =>
  render(
    <MealsForm
      initialType="tetee"
      onSuccess={jest.fn()}
      onCancel={jest.fn()}
      isSubmitting={false}
      setIsSubmitting={jest.fn()}
      {...props}
    />,
  );

describe("MealsForm : chrono tétée", () => {
  it("boutons nommés pour VoiceOver/TalkBack, état sélectionné quand le côté tourne", async () => {
    renderForm();
    const start = await screen.findByLabelText("Démarrer le côté gauche");
    fireEvent.press(start);
    const pause = screen.getByLabelText("Mettre en pause le côté gauche");
    expect(pause.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true }),
    );
    expect(screen.getByLabelText("Démarrer le côté droit")).toBeTruthy();
  });

  it("le chrono démarré est sauvegardé pour survivre à la fermeture de la feuille", async () => {
    const { unmount } = renderForm();
    fireEvent.press(await screen.findByLabelText("Démarrer le côté droit"));
    await waitFor(() => expect(store.has(nursingTimerStorageKey("c1"))).toBe(true));
    const saved = JSON.parse(store.get(nursingTimerStorageKey("c1"))!);
    expect(saved.runningSide).toBe("right");
    unmount();
    // Fermeture avec un côté en cours : l'utilisateur est prévenu que ça continue.
    expect(mockShowToast).toHaveBeenCalled();
  });

  it("rouvrir la feuille reprend le chrono en cours, même ouverte sur Biberon", async () => {
    const running = toggleSide(EMPTY_NURSING_TIMER, "left", Date.now() - 5 * 60 * 1000);
    store.set(nursingTimerStorageKey("c1"), JSON.stringify(running));
    renderForm({ initialType: "biberon" });
    expect(await screen.findByLabelText("Mettre en pause le côté gauche")).toBeTruthy();
  });

  it("la remise à zéro demande confirmation (jamais d'un seul geste)", async () => {
    const paused = { ...EMPTY_NURSING_TIMER, leftSeconds: 120, updatedAt: Date.now() };
    store.set(nursingTimerStorageKey("c1"), JSON.stringify(paused));
    renderForm();
    const reset = await screen.findByLabelText("Remettre à zéro le côté gauche");
    await waitFor(() => expect(reset.props.accessibilityState?.disabled).toBe(false));
    fireEvent.press(reset);
    expect(mockShowAlert).toHaveBeenCalledWith(
      "Remettre à zéro le côté gauche ?",
      expect.any(String),
      expect.any(Array),
    );
  });

  it("enregistrer la tétée efface le brouillon", async () => {
    const paused = { ...EMPTY_NURSING_TIMER, leftSeconds: 600, updatedAt: Date.now() };
    store.set(nursingTimerStorageKey("c1"), JSON.stringify(paused));
    renderForm();
    await screen.findByLabelText("Côté gauche : 10 minutes");
    fireEvent.press(screen.getByLabelText("Ajouter"));
    expect(mockAjouter).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ type: "tetee", dureeGauche: 10, coteGauche: true }),
    );
    await waitFor(() => expect(store.has(nursingTimerStorageKey("c1"))).toBe(false));
  });
});

describe("MealsForm : biberon", () => {
  it("préremplit la dernière quantité et avance de 10 ml au relâchement", async () => {
    store.set(lastBottleStorageKey("c1"), JSON.stringify({ quantite: 150 }));
    renderForm({ initialType: "biberon" });
    expect(await screen.findByText("150 ml")).toBeTruthy();
    const plus = screen.getByLabelText("Ajouter 10 ml");
    // Poser le doigt (début de défilement) ne change rien.
    act(() => {
      plus.props.onPressIn?.();
    });
    expect(screen.getByText("150 ml")).toBeTruthy();
    fireEvent.press(plus);
    expect(screen.getByText("160 ml")).toBeTruthy();
    fireEvent.press(screen.getByLabelText("90 ml"));
    expect(screen.getByText("90 ml", { exact: true })).toBeTruthy();
  });
});
