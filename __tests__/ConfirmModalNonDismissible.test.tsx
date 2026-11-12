import { fireEvent, render, screen } from "@testing-library/react-native";
import { Modal } from "react-native";

import { ConfirmModal } from "@/components/ui/ConfirmModal";

// L'alerte température < 3 mois passe par ConfirmModal (ModalContext) : elle ne
// doit se fermer que par ses deux boutons.
describe("ConfirmModal utilisée pour l'alerte température < 3 mois", () => {
  const setup = (extra: { dismissOnBack?: boolean } = { dismissOnBack: false }) => {
    const onCancel = jest.fn();
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    render(
      <ConfirmModal
        visible
        title="Température élevée"
        message="Consultez en urgence un médecin ou appelez le 15."
        confirmText="Appeler le 15"
        cancelText="J'ai compris"
        backgroundColor="#fff"
        textColor="#000"
        onCancel={onCancel}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
        {...extra}
      />,
    );
    return { onCancel, onConfirm, onDismiss };
  };

  it("n'a pas de fermeture par le bouton retour (dismissOnBack={false})", () => {
    const { onCancel, onConfirm, onDismiss } = setup();
    const modal = screen.UNSAFE_getByType(Modal);
    modal.props.onRequestClose();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it("ne se ferme pas en touchant le fond", () => {
    const { onCancel, onDismiss } = setup();
    const overlay = screen.UNSAFE_getByType(Modal).findAllByProps({ accessible: true })[0];
    if (overlay?.props.onPress) overlay.props.onPress();
    expect(onDismiss).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("expose les deux boutons", () => {
    const { onCancel, onConfirm } = setup();
    fireEvent.press(screen.getByText("J'ai compris"));
    fireEvent.press(screen.getByText("Appeler le 15"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("par défaut, le bouton retour Android annule (modale ordinaire)", () => {
    const { onCancel, onConfirm } = setup({});
    screen.UNSAFE_getByType(Modal).props.onRequestClose();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
