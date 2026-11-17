// showConfirm : « Supprimer » rouge par défaut ; libellé et couleur réglables.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import { DESTRUCTIVE_COLOR } from "@/components/ui/ConfirmModal";
import { ModalProvider, useModal } from "@/contexts/ModalContext";

jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));

// Couleur de fond du bouton de confirmation (le Pressable parent du texte).
const confirmBg = (label: string) => {
  let node = screen.getByText(label).parent;
  while (node) {
    const style = typeof node.props.style === "function" ? node.props.style({ pressed: false }) : node.props.style;
    const bg = [style].flat(3).find((x) => x && typeof x === "object" && "backgroundColor" in x)?.backgroundColor;
    if (bg) return bg as string;
    node = node.parent;
  }
  return undefined;
};

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

it("couleurs : rouge par défaut, couleur d'accent quand destructive est faux", () => {
  const { unmount } = setup();
  act(() => modal.showConfirm("Supprimer ?", "Sûr ?", jest.fn()));
  expect(confirmBg("Supprimer")).toBe(DESTRUCTIVE_COLOR);
  unmount();

  setup();
  act(() => modal.showConfirm("Arrêter ?", "Lien inconnu", jest.fn(), { confirmText: "Arrêter", destructive: false }));
  const tint = confirmBg("Arrêter");
  expect(tint).toBeDefined();
  expect(tint).not.toBe(DESTRUCTIVE_COLOR);
});
