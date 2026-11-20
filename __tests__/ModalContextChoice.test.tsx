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
  it("iPhone SE : « Supprimer » (≈ 79 pt) ne tient pas dans 78 pt, on empile ; « Enregistrer quand même » empilé", () => {
    expect(buttonsFitSideBySide(["Annuler", "Supprimer"], 320, 1)).toBe(false);
    expect(buttonsFitSideBySide(["Corriger", "Enregistrer quand même"], 320, 1)).toBe(false);
  });
  it("iPhone 13 Pro Max, plus grande taille standard (×1,35) : « Déconnexion » empilé (recette 1.0.23, test 28)", () => {
    expect(buttonsFitSideBySide(["Annuler", "Déconnexion"], 428, 1)).toBe(true);
    expect(buttonsFitSideBySide(["Annuler", "Déconnexion"], 428, 1.35)).toBe(false);
  });
  it("texte agrandi : empilé plus tôt", () => {
    expect(buttonsFitSideBySide(["Annuler", "Supprimer"], 393, 1)).toBe(true);
    expect(buttonsFitSideBySide(["Annuler", "Supprimer"], 320, 1.5)).toBe(false);
  });
});

describe("titre des fenêtres en très grande police", () => {
  const { titleMaxFontSizeMultiplier, estimateBoldTextWidth } = require("@/components/ui/DialogParts");
  it("le mot le plus long du titre tient sur une ligne (plus de « Déconne/xion »)", () => {
    for (const width of [320, 393, 428]) {
      const cap = titleMaxFontSizeMultiplier("Déconnexion", width);
      const textWidth = Math.min(width - 40, 400) - 48;
      expect(estimateBoldTextWidth("Déconnexion", 20) * cap).toBeLessThanOrEqual(textWidth);
    }
  });
  it("titre court : grandit jusqu'à ×3 ; jamais sous la taille normale", () => {
    expect(titleMaxFontSizeMultiplier("Oui", 393)).toBe(3);
    expect(titleMaxFontSizeMultiplier("Anticonstitutionnellement", 320)).toBe(1);
  });
  it("lettres étroites et larges pèsent différemment", () => {
    expect(estimateBoldTextWidth("mmmm", 16)).toBeGreaterThan(estimateBoldTextWidth("iiii", 16) * 2);
  });
});

describe("ConfirmModal : libellé passé à la ligne malgré l'estimation", () => {
  it("les boutons s'empilent après la mesure", () => {
    const { ConfirmModal } = require("@/components/ui/ConfirmModal");
    const ui = render(
      <ConfirmModal visible title="Supprimer ?" message="Texte" confirmText="Oui" cancelText="Non" onConfirm={jest.fn()} onCancel={jest.fn()} />,
    );
    const confirmLabel = ui.getByText("Oui");
    // côte à côte d'abord (libellés courts) : « Non » puis « Oui »
    expect(ui.getAllByText(/^(Oui|Non)$/).map((t) => t.props.children)).toEqual(["Non", "Oui"]);
    act(() => {
      confirmLabel.props.onTextLayout({ nativeEvent: { lines: [{}, {}] } });
    });
    // empilé : action en haut
    expect(ui.getAllByText(/^(Oui|Non)$/).map((t) => t.props.children)).toEqual(["Oui", "Non"]);
  });
});

describe("ModalHost sous le thème de l'app", () => {
  it("fenêtre affichée par l'hôte séparé (provider sans rendu propre)", () => {
    const { ModalHost } = require("@/contexts/ModalContext");
    render(
      <ModalProvider renderHost={false}>
        <Grab />
        <ModalHost />
      </ModalProvider>,
    );
    act(() => modal.showAlert("Titre", "affiché par l'hôte"));
    expect(screen.getByText("affiché par l'hôte")).toBeTruthy();
    // Une seule fenêtre : le provider n'en rend pas une seconde.
    expect(screen.getAllByText("affiché par l'hôte")).toHaveLength(1);
  });
});
