import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Modal, Text } from "react-native";

import { ModalProvider, showAppAlert, useModal } from "@/contexts/ModalContext";

jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));

let modal: ReturnType<typeof useModal>;
const Grab = () => {
  modal = useModal();
  return <Text>grab</Text>;
};

const setup = () => render(<ModalProvider><Grab /></ModalProvider>);

describe("ModalContext : dialogues à plusieurs choix", () => {
  it("3 boutons : tous affichés, dans l'ordre, « Annuler » en dernier", () => {
    setup();
    act(() =>
      modal.showAlert("Plutôt une nuit ?", "Une sieste à 21:00 ?", [
        { text: "Annuler", style: "cancel" },
        { text: "Démarrer une nuit" },
        { text: "Démarrer une sieste" },
      ]),
    );
    expect(screen.getByTestId("choice-modal-button-0")).toHaveTextContent("Démarrer une nuit");
    expect(screen.getByTestId("choice-modal-button-1")).toHaveTextContent("Démarrer une sieste");
    expect(screen.getByTestId("choice-modal-button-2")).toHaveTextContent("Annuler");
  });

  it("un choix ferme la fenêtre puis exécute son action", () => {
    setup();
    const night = jest.fn();
    act(() =>
      modal.showAlert("Q", "m", [
        { text: "Nuit", onPress: night },
        { text: "Sieste" },
        { text: "Annuler", style: "cancel" },
      ]),
    );
    fireEvent.press(screen.getByText("Nuit"));
    expect(night).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Sieste")).toBeNull();
  });

  it("retour Android : exécute l'action d'annulation", () => {
    setup();
    const cancel = jest.fn();
    act(() =>
      modal.showAlert("Q", "m", [
        { text: "A" },
        { text: "B" },
        { text: "Annuler", style: "cancel", onPress: cancel },
      ]),
    );
    act(() => screen.UNSAFE_getByType(Modal).props.onRequestClose());
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("A")).toBeNull();
  });

  it("2 boutons : « Annuler » exécute son action (comme l'alerte native)", () => {
    setup();
    const fix = jest.fn();
    act(() =>
      modal.showAlert("Cette sieste passe minuit", "m", [
        { text: "Corriger l'heure de fin", style: "cancel", onPress: fix },
        { text: "Enregistrer comme nuit" },
      ]),
    );
    fireEvent.press(screen.getByText("Corriger l'heure de fin"));
    expect(fix).toHaveBeenCalledTimes(1);
  });

  it("même clé : une seule fenêtre malgré des appels répétés", () => {
    setup();
    act(() => {
      for (let i = 0; i < 5; i += 1) {
        modal.showAlert("Cette sieste passe minuit", `appel ${i}`, [
          { text: "Corriger", style: "cancel" },
          { text: "Nuit" },
        ], { key: "nap" });
      }
    });
    expect(screen.getByText("appel 0")).toBeTruthy();
    fireEvent.press(screen.getByText("Corriger"));
    // Aucune des répétitions n'a été mise en file.
    expect(screen.queryByText(/appel/)).toBeNull();
  });

  it("une question à choix n'est jamais remplacée : la fenêtre suivante attend", () => {
    setup();
    act(() =>
      modal.showAlert("Choix", "question", [{ text: "A" }, { text: "B" }, { text: "Annuler", style: "cancel" }]),
    );
    act(() => modal.showAlert("Info", "suivante"));
    expect(screen.getByText("question")).toBeTruthy();
    expect(screen.queryByText("suivante")).toBeNull();
    fireEvent.press(screen.getByText("A"));
    expect(screen.getByText("suivante")).toBeTruthy();
  });

  it("showAppAlert (code hors composant) affiche la même fenêtre", () => {
    setup();
    act(() => showAppAlert("Ligne", undefined, [{ text: "Modifier" }, { text: "Supprimer", style: "destructive" }, { text: "Annuler", style: "cancel" }]));
    expect(screen.getByText("Modifier")).toBeTruthy();
    expect(screen.getByText("Supprimer")).toBeTruthy();
  });
});

describe("ModalContext : deux boutons à libellé long", () => {
  it("« Enregistrer quand même » : boutons empilés, action en haut, Corriger en dessous", () => {
    setup();
    act(() =>
      modal.showAlert("Plutôt une nuit ?", "m", [
        { text: "Corriger", style: "cancel" },
        { text: "Enregistrer quand même" },
      ]),
    );
    const labels = screen.getAllByRole("button").map((b) => b.props.children ?? "");
    const texts = screen.getAllByText(/Corriger|Enregistrer quand même/).map((t) => t.props.children);
    expect(texts).toEqual(["Enregistrer quand même", "Corriger"]);
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });
});

describe("buttonsFitSideBySide (petits écrans, texte agrandi)", () => {
  const { buttonsFitSideBySide } = require("@/components/ui/ConfirmModal");
  it("iPhone SE : « Annuler / Supprimer » côte à côte, « Enregistrer quand même » empilé", () => {
    expect(buttonsFitSideBySide(["Annuler", "Supprimer"], 320, 1)).toBe(true);
    expect(buttonsFitSideBySide(["Corriger", "Enregistrer quand même"], 320, 1)).toBe(false);
  });
  it("texte agrandi : empilé plus tôt", () => {
    expect(buttonsFitSideBySide(["Annuler", "Supprimer"], 393, 1)).toBe(true);
    expect(buttonsFitSideBySide(["Annuler", "Supprimer"], 320, 1.5)).toBe(false);
  });
});
