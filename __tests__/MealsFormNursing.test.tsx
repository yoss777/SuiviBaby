// P0-4 / P1-6 / P1-9 : chrono tétée accessible et persistant, stepper biberon.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import React from "react";

import { FormGuardProvider } from "@/components/forms/formGuard";
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
// Chaque rendu de MealsForm rend ce composant : ses appels comptent les rendus
// du formulaire, et sa prop `value` est l'heure proposée.
const mockDateRow = jest.fn((_props: { value: Date }) => null);
jest.mock("@/components/ui/DateTimeSectionRow", () => ({
  DateTimeSectionRow: (props: { value: Date }) => mockDateRow(props),
}));
const lastProposedDate = () => mockDateRow.mock.calls[mockDateRow.mock.calls.length - 1][0].value;
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
  mockDateRow.mockClear();
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

  it("rouvrir la feuille sur Tétée reprend le chrono en cours", async () => {
    const running = toggleSide(EMPTY_NURSING_TIMER, "left", Date.now() - 5 * 60 * 1000);
    store.set(nursingTimerStorageKey("c1"), JSON.stringify(running));
    renderForm({ initialType: "tetee" });
    expect(await screen.findByLabelText("Mettre en pause le côté gauche")).toBeTruthy();
    // Heure proposée : le début de la tétée.
    expect(lastProposedDate().getTime()).toBe(running.startedAt);
  });

  it("ouverte pour un biberon : reste sur Biberon, la tétée est proposée dans un bandeau", async () => {
    const startedAt = Date.now() - 12 * 60 * 1000;
    const running = toggleSide(EMPTY_NURSING_TIMER, "left", startedAt);
    store.set(nursingTimerStorageKey("c1"), JSON.stringify(running));
    renderForm({ initialType: "biberon" });
    expect(await screen.findByText("Tétée en cours (12 min)")).toBeTruthy();
    // Le type demandé est respecté et l'heure n'est pas celle de la tétée.
    expect(screen.getByLabelText("Ajouter 10 ml")).toBeTruthy();
    expect(screen.queryByLabelText("Mettre en pause le côté gauche")).toBeNull();
    expect(Math.abs(lastProposedDate().getTime() - startedAt)).toBeGreaterThan(60 * 1000);
    // Enregistrer le biberon ne touche pas au chrono.
    fireEvent.press(screen.getByLabelText("Ajouter"));
    expect(mockAjouter).toHaveBeenCalledWith("c1", expect.objectContaining({ type: "biberon" }));
    const saved = mockAjouter.mock.calls[0][1] as { date: Date };
    expect(Math.abs(saved.date.getTime() - startedAt)).toBeGreaterThan(60 * 1000);
    expect(store.has(nursingTimerStorageKey("c1"))).toBe(true);
  });

  it("« Reprendre » (ou l'onglet Tétée) reprend le chrono en cours", async () => {
    const running = toggleSide(EMPTY_NURSING_TIMER, "right", Date.now() - 3 * 60 * 1000);
    store.set(nursingTimerStorageKey("c1"), JSON.stringify(running));
    renderForm({ initialType: "solide" });
    fireEvent.press(await screen.findByLabelText("Reprendre la tétée"));
    expect(screen.getByLabelText("Mettre en pause le côté droit")).toBeTruthy();
    expect(screen.queryByLabelText("Reprendre la tétée")).toBeNull();
    expect(lastProposedDate().getTime()).toBe(running.startedAt);
  });

  it("passer sur l'onglet Tétée reprend aussi le brouillon proposé", async () => {
    const running = toggleSide(EMPTY_NURSING_TIMER, "left", Date.now() - 3 * 60 * 1000);
    store.set(nursingTimerStorageKey("c1"), JSON.stringify(running));
    renderForm({ initialType: "biberon" });
    await screen.findByLabelText("Reprendre la tétée");
    fireEvent.press(screen.getByLabelText("Type tétée"));
    expect(screen.getByLabelText("Mettre en pause le côté gauche")).toBeTruthy();
  });

  it("« Abandonner » efface le brouillon après confirmation", async () => {
    const running = toggleSide(EMPTY_NURSING_TIMER, "left", Date.now() - 3 * 60 * 1000);
    store.set(nursingTimerStorageKey("c1"), JSON.stringify(running));
    renderForm({ initialType: "biberon" });
    fireEvent.press(await screen.findByLabelText("Abandonner la tétée"));
    expect(mockShowAlert).toHaveBeenCalledWith(
      "Abandonner la tétée ?",
      expect.any(String),
      expect.any(Array),
    );
    const buttons = mockShowAlert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    act(() => {
      buttons.find((b) => b.text === "Abandonner")?.onPress?.();
    });
    await waitFor(() => expect(store.has(nursingTimerStorageKey("c1"))).toBe(false));
    expect(screen.queryByLabelText("Reprendre la tétée")).toBeNull();
    // Le biberon en cours de saisie est intact.
    expect(screen.getByLabelText("Ajouter 10 ml")).toBeTruthy();
  });

  it("un brouillon expiré (en pause depuis plus d'1 h) n'est plus proposé", async () => {
    const stale = {
      ...EMPTY_NURSING_TIMER,
      leftSeconds: 300,
      startedAt: Date.now() - 2 * 60 * 60 * 1000,
      updatedAt: Date.now() - 61 * 60 * 1000,
    };
    store.set(nursingTimerStorageKey("c1"), JSON.stringify(stale));
    renderForm({ initialType: "biberon" });
    await waitFor(() => expect(store.has(nursingTimerStorageKey("c1"))).toBe(false));
    expect(screen.queryByLabelText("Reprendre la tétée")).toBeNull();
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

describe("MealsForm : garde-fou de saisie (N3)", () => {
  const renderGuarded = (props: Partial<React.ComponentProps<typeof MealsForm>> = {}) => {
    const setDirty = jest.fn();
    const guard = { setDirty, setDiscardHandler: jest.fn() };
    render(
      <FormGuardProvider value={guard}>
        <MealsForm
          initialType="biberon"
          onSuccess={jest.fn()}
          onCancel={jest.fn()}
          isSubmitting={false}
          setIsSubmitting={jest.fn()}
          {...props}
        />
      </FormGuardProvider>,
    );
    const lastDirty = () => setDirty.mock.calls[setDirty.mock.calls.length - 1]?.[0];
    return { lastDirty };
  };

  it("changer d'onglet seul ne rend pas la saisie « modifiée »", async () => {
    const { lastDirty } = renderGuarded();
    await screen.findByLabelText("Ajouter 10 ml");
    fireEvent.press(screen.getByLabelText("Type solide"));
    fireEvent.press(screen.getByLabelText("Type tétée"));
    fireEvent.press(screen.getByLabelText("Type biberon"));
    expect(lastDirty()).toBe(false);
  });

  it("le préremplissage (dernier biberon) n'est pas une saisie", async () => {
    store.set(lastBottleStorageKey("c1"), JSON.stringify({ quantite: 150 }));
    const { lastDirty } = renderGuarded();
    expect(await screen.findByText("150 ml")).toBeTruthy();
    expect(lastDirty()).toBe(false);
  });

  it("une valeur saisie rend la saisie modifiée, la remettre la rend propre", async () => {
    const { lastDirty } = renderGuarded();
    const plus = await screen.findByLabelText("Ajouter 10 ml");
    fireEvent.press(plus);
    expect(lastDirty()).toBe(true);
    fireEvent.press(screen.getByLabelText("Retirer 10 ml"));
    expect(lastDirty()).toBe(false);
  });
});

describe("MealsForm : chrono isolé (N5)", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("le temps défile sans re-rendre le formulaire", async () => {
    jest.useFakeTimers();
    renderForm();
    fireEvent.press(await screen.findByLabelText("Démarrer le côté gauche"));
    // Laisse se terminer les effets du démarrage (persistance).
    await act(async () => {
      await Promise.resolve();
    });
    const rendersBefore = mockDateRow.mock.calls.length;
    act(() => {
      jest.advanceTimersByTime(5_000);
    });
    // L'affichage a avancé…
    expect(screen.getByLabelText("Côté gauche : 0 minute 5 secondes")).toBeTruthy();
    expect(screen.getByLabelText("Durée totale : 0 minute 5 secondes")).toBeTruthy();
    // … mais le formulaire (et donc son pied collant) ne s'est pas re-rendu.
    expect(mockDateRow.mock.calls.length).toBe(rendersBefore);
  });
});
