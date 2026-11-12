import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { getNeutralColors } from "@/constants/dashboardColors";
import { getReadableTextColor } from "@/constants/theme";
import { radius } from "@/constants/tokens";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { pressedOpacity, usePressRipple } from "./pressFeedback";

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** Par défaut : surface de carte du thème (nc.backgroundCard). */
  backgroundColor?: string;
  /** Par défaut : nc.textStrong. */
  textColor?: string;
  confirmButtonColor?: string;
  confirmTextColor?: string;
  /** Par défaut : nc.backgroundPressed (suit le thème). */
  cancelButtonColor?: string;
  /** Par défaut : nc.textStrong. */
  cancelTextColor?: string;
  allowBackdropDismiss?: boolean;
  /**
   * Bouton retour Android : ferme la modale (onCancel) par défaut. false pour
   * une alerte protégée qui ne doit se fermer que par ses boutons.
   */
  dismissOnBack?: boolean;
  onDismiss?: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Rouge destructif : texte blanc à 4.53:1. */
export const DESTRUCTIVE_COLOR = "#dc3545";
const NOOP = () => {};

export function ConfirmModal({
  visible,
  title,
  message,
  confirmText = "Supprimer",
  cancelText = "Annuler",
  backgroundColor,
  textColor,
  confirmButtonColor = DESTRUCTIVE_COLOR,
  confirmTextColor,
  cancelButtonColor,
  cancelTextColor,
  allowBackdropDismiss = false,
  dismissOnBack = true,
  onDismiss,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const ripple = usePressRipple();
  const surface = backgroundColor ?? nc.backgroundCard;
  const ink = textColor ?? nc.textStrong;
  // Bouton secondaire dérivé du thème : plus de rectangle #f2f2f2 qui éblouit
  // au milieu d'un écran sombre.
  const cancelBg = cancelButtonColor ?? nc.backgroundPressed;
  const cancelInk = cancelTextColor ?? nc.textStrong;
  const resolvedConfirmTextColor =
    confirmTextColor ?? getReadableTextColor(confirmButtonColor);
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={dismissOnBack ? onCancel : NOOP}
    >
      <Pressable
        style={styles.modalOverlay}
        onPress={allowBackdropDismiss ? onDismiss : undefined}
      >
        <Pressable
          style={[styles.modalContent, { backgroundColor: surface }]}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { color: ink }]}>{title}</Text>
          {typeof message === "string" ? (
            <Text style={[styles.modalSubtitle, { color: ink }]}>{message}</Text>
          ) : (
            <View style={styles.modalMessageContainer}>{message}</View>
          )}

          <View style={styles.modalButtons}>
            <Pressable
              style={({ pressed }) => [
                styles.modalButton,
                { backgroundColor: cancelBg },
                pressedOpacity(pressed),
              ]}
              android_ripple={ripple}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={[styles.cancelButtonText, { color: cancelInk }]}>
                {cancelText}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.modalButton,
                { backgroundColor: confirmButtonColor },
                pressedOpacity(pressed),
              ]}
              android_ripple={ripple}
              onPress={onConfirm}
              accessibilityRole="button"
            >
              <Text
                style={[
                  styles.confirmButtonText,
                  { color: resolvedConfirmTextColor },
                ]}
              >
                {confirmText}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radius.lg,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  modalMessageContainer: {
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden", // borne le ripple Android au bouton
  },
  cancelButtonText: {
    fontWeight: "600",
  },
  confirmButtonText: {
    fontWeight: "700",
  },
});
