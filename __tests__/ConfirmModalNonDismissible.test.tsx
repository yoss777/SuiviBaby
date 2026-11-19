import { fireEvent, render, screen } from "@testing-library/react-native";
import { Modal, ScrollView } from "react-native";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { dialogStyles } from "@/components/ui/DialogParts";

// Fond de la fenêtre (Pressable plein écran) et boîte, repérés par leur style.
const overlayOf = () => screen.UNSAFE_getByType(Modal).findAll((n) => n.props.style === dialogStyles.overlay && typeof n.type !== "string")[0];
const cardOf = () =>
  screen.UNSAFE_getByType(Modal).findAll(
    (n) => Array.isArray(n.props.style) && n.props.style[0] === dialogStyles.card && typeof n.type !== "string",
  )[0];

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
    overlayOf().props.onPress?.();
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

// Recette 1.0.22 (tests 22) : VoiceOver lisait toute la fenêtre d'un bloc, et
// en très grande police « J'ai compris » sortait de l'écran.
describe("ConfirmModal : accessibilité et très grande police", () => {
  const renderNotice = () =>
    render(
      <ConfirmModal
        visible
        title="Votre widget SuiviBaby"
        message={"Long texte d'information.\n\nDeuxième paragraphe."}
        confirmText="En savoir plus"
        cancelText="J'ai compris"
        onCancel={jest.fn()}
        onConfirm={jest.fn()}
      />,
    );

  it("le fond et la boîte ne regroupent pas la fenêtre en un seul élément VoiceOver", () => {
    renderNotice();
    expect(overlayOf().props.accessible).toBe(false);
    expect(cardOf().props.accessible).toBe(false);
    expect(screen.getByRole("button", { name: "J'ai compris" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "En savoir plus" })).toBeTruthy();
  });

  it("titre et texte défilent ensemble, les boutons restent hors de la zone qui défile", () => {
    renderNotice();
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.findByProps({ children: "Votre widget SuiviBaby" })).toBeTruthy();
    expect(scroll.findAllByProps({ accessibilityLabel: "J'ai compris" })).toHaveLength(0);
  });
});
