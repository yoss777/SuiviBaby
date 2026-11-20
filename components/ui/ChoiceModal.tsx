import React from "react";
import { Modal, Text, View } from "react-native";

import { getNeutralColors } from "@/constants/dashboardColors";
import { elevation } from "@/constants/tokens";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { DialogButton, DialogScroll, DialogTitle, dialogStyles } from "./DialogParts";

export type ChoiceButtonStyle = "default" | "cancel" | "destructive";

export type ChoiceButton = {
  text: string;
  style?: ChoiceButtonStyle;
  onPress: () => void;
};

interface ChoiceModalProps {
  visible: boolean;
  title: string;
  message?: React.ReactNode;
  /** Dans l'ordre d'affichage voulu ; le bouton « cancel » est toujours placé en dernier. */
  buttons: ChoiceButton[];
  tintColor: string;
  onTintColor: string;
  /** Bouton retour Android / geste de fermeture : annulation. */
  onCancel: () => void;
  dismissOnBack?: boolean;
}

const NOOP = () => {};

/**
 * Dialogue à plusieurs choix, même habillage que ConfirmModal (surface,
 * arrondis, bouton principal en teinte de l'app, secondaires neutres) mais
 * boutons empilés : trois libellés d'action ne tiennent pas sur une ligne.
 */
export function ChoiceModal({
  visible,
  title,
  message,
  buttons,
  tintColor,
  onTintColor,
  onCancel,
  dismissOnBack = true,
}: ChoiceModalProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const ordered = [
    ...buttons.filter((b) => b.style !== "cancel"),
    ...buttons.filter((b) => b.style === "cancel"),
  ];
  const firstDefault = ordered.find((b) => (b.style ?? "default") === "default");

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={dismissOnBack ? onCancel : NOOP}
    >
      <View style={dialogStyles.overlay}>
        <View
          style={[dialogStyles.card, elevation.raised(colorScheme), { backgroundColor: nc.backgroundCard }]}
          accessibilityViewIsModal={true}
        >
          <DialogScroll>
            <DialogTitle title={title} color={nc.textStrong} />
            {typeof message === "string" ? (
              message ? (
                <Text style={[dialogStyles.message, { color: nc.textNormal }]}>{message}</Text>
              ) : null
            ) : message ? (
              <View style={dialogStyles.messageContainer}>{message}</View>
            ) : null}
          </DialogScroll>

          <View style={dialogStyles.buttonsStack}>
            {ordered.map((button, index) => {
              const isPrimary = button === firstDefault;
              const variant =
                button.style === "destructive" ? "destructive" : isPrimary ? "primary" : "secondary";
              return (
                <DialogButton
                  key={`${index}-${button.text}`}
                  text={button.text}
                  variant={variant}
                  layout="stack"
                  color={variant === "primary" ? tintColor : undefined}
                  textColor={variant === "primary" ? onTintColor : undefined}
                  onPress={button.onPress}
                  testID={`choice-modal-button-${index}`}
                />
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}
