// Contexte modales : état ouvert et abonnement aux alertes protégées (jalon vs alerte fièvre).
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

describe("ModalContext : hasOpenModal / subscribeProtectedModal", () => {
  it("hasOpenModal reflète l'ouverture et la fermeture", () => {
    setup();
    expect(modal.hasOpenModal()).toBe(false);
    act(() => modal.showAlert("Info", "Message", [{ text: "OK" }]));
    expect(modal.hasOpenModal()).toBe(true);
    fireEvent.press(screen.getByText("OK"));
    expect(modal.hasOpenModal()).toBe(false);
  });

  it("notifie à l'ouverture d'une alerte protégée, pas d'une alerte ordinaire", () => {
    setup();
    const listener = jest.fn();
    const unsubscribe = modal.subscribeProtectedModal(listener);
    act(() => modal.showAlert("Info", "Ordinaire", [{ text: "OK" }]));
    expect(listener).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText("OK"));
    act(() => modal.showAlert("Fièvre", "Appelez le 15", [{ text: "Compris" }], { dismissible: false }));
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    fireEvent.press(screen.getByText("Compris"));
    act(() => modal.showAlert("Fièvre", "Encore", [{ text: "Compris" }], { callEmergency: true }));
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
