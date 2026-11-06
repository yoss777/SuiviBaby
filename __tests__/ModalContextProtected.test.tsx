import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import { ModalProvider, useModal } from "@/contexts/ModalContext";

jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));

let modal: ReturnType<typeof useModal>;
const Grab = () => {
  modal = useModal();
  return <Text>grab</Text>;
};

const setup = () => render(<ModalProvider><Grab /></ModalProvider>);

describe("ModalContext : alerte santé protégée (H1)", () => {
  it("une alerte non masquable n'est pas remplacée par un showAlert ultérieur", () => {
    setup();
    act(() => modal.showAlert("Température élevée", "Appelez le 15", [{ text: "J'ai compris" }], { dismissible: false }));
    act(() => modal.showAlert("Erreur", "Autre message"));
    expect(screen.queryByText("Autre message")).toBeNull();
    expect(screen.getByText("Appelez le 15")).toBeTruthy();
  });

  it("le message en attente s'affiche quand l'alerte protégée est fermée", () => {
    setup();
    act(() => modal.showAlert("Température élevée", "Appelez le 15", [{ text: "J'ai compris" }], { dismissible: false }));
    act(() => modal.showAlert("Info", "Message en attente"));
    fireEvent.press(screen.getByText("J'ai compris"));
    expect(screen.getByText("Message en attente")).toBeTruthy();
    expect(screen.queryByText("Appelez le 15")).toBeNull();
  });

  it("une alerte avec action d'appel du 15 est protégée même sans dismissible:false", () => {
    setup();
    act(() =>
      modal.showAlert(
        "Température basse",
        "Appelez le 15",
        [{ text: "J'ai compris", style: "cancel" }, { text: "Appeler le 15", style: "destructive" }],
        { callEmergency: true },
      ),
    );
    act(() => modal.showConfirm("Supprimer", "Voulez-vous vraiment ?", jest.fn()));
    expect(screen.queryByText("Voulez-vous vraiment ?")).toBeNull();
    expect(screen.getByText("Appelez le 15")).toBeTruthy();
  });

  it("hide() extérieur ne ferme pas une alerte protégée", () => {
    setup();
    act(() => modal.showAlert("Température élevée", "Appelez le 15", [{ text: "J'ai compris" }], { dismissible: false }));
    act(() => modal.hide());
    expect(screen.getByText("Appelez le 15")).toBeTruthy();
  });

  it("plusieurs messages en attente sont affichés dans l'ordre", () => {
    setup();
    act(() => modal.showAlert("A", "premier", [{ text: "ok1" }], { dismissible: false }));
    act(() => modal.showAlert("B", "second"));
    act(() => modal.showAlert("C", "troisième"));
    fireEvent.press(screen.getByText("ok1"));
    expect(screen.getByText("second")).toBeTruthy();
    fireEvent.press(screen.getByText("OK"));
    expect(screen.getByText("troisième")).toBeTruthy();
  });

  it("une alerte protégée peut remplacer une modale ordinaire", () => {
    setup();
    act(() => modal.showAlert("Info", "ordinaire"));
    act(() => modal.showAlert("Température élevée", "urgent", [{ text: "ok" }], { dismissible: false }));
    expect(screen.getByText("urgent")).toBeTruthy();
    expect(screen.queryByText("ordinaire")).toBeNull();
  });

  it("comportement inchangé sans option : la dernière modale remplace la précédente", () => {
    setup();
    act(() => modal.showAlert("A", "un"));
    act(() => modal.showAlert("B", "deux"));
    expect(screen.getByText("deux")).toBeTruthy();
    expect(screen.queryByText("un")).toBeNull();
  });

  it("un bouton qui affiche une autre modale ne la voit pas effacée", () => {
    setup();
    act(() =>
      modal.showAlert("Erreur ?", "premier", [{ text: "Réessayer", onPress: () => modal.showAlert("Suite", "second message") }]),
    );
    fireEvent.press(screen.getByText("Réessayer"));
    expect(screen.getByText("second message")).toBeTruthy();
  });
});
