// showConfirm : « Supprimer » rouge par défaut ; libellé et couleur réglables.
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

it("par défaut : bouton « Supprimer » (comportement inchangé)", () => {
  setup();
  const onConfirm = jest.fn();
  act(() => modal.showConfirm("Supprimer ?", "Sûr ?", onConfirm));
  fireEvent.press(screen.getByText("Supprimer"));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it("libellé personnalisé et couleur normale : « Démarrer », pas « Supprimer »", () => {
  setup();
  const onConfirm = jest.fn();
  act(() => modal.showConfirm("Démarrer une sieste ?", "Lien inconnu", onConfirm, { confirmText: "Démarrer", destructive: false }));
  expect(screen.queryByText("Supprimer")).toBeNull();
  fireEvent.press(screen.getByText("Démarrer"));
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it("« Annuler » ne déclenche pas l'action", () => {
  setup();
  const onConfirm = jest.fn();
  act(() => modal.showConfirm("Arrêter ?", "Lien inconnu", onConfirm, { confirmText: "Arrêter", destructive: false }));
  fireEvent.press(screen.getByText("Annuler"));
  expect(onConfirm).not.toHaveBeenCalled();
});
