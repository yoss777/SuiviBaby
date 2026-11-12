import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import {
  getNeutralColors,
  neutralColors,
  neutralColorsDark,
} from "@/constants/dashboardColors";
import { getReadableTextColor } from "@/constants/theme";
import { radius, space } from "@/constants/tokens";
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

/**
 * Rouge destructif unique de l'app (token `destructive`, red-600) : texte
 * blanc à 4.83:1, identique en clair et en sombre.
 */
export const DESTRUCTIVE_COLOR = neutralColors.destructive;

/**
 * Anciens appels qui passent `nc.error` (#ef4444, 3.76:1 sous du blanc) pour
 * « Supprimer » : ramenés au token destructif pour que le bouton ait le même
 * aspect sur tous les écrans.
 */
const normalizeConfirmColor = (color: string) =>
  color === neutralColors.error || color === neutralColorsDark.error
    ? DESTRUCTIVE_COLOR
    : color;
const NOOP = () => {};

export function ConfirmModal({
  visible,
  title,
  message,
  confirmText = "Supprimer",
  cancelText = "Annuler",
  backgroundColor,
  textColor,
  confirmButtonColor: confirmButtonColorProp = DESTRUCTIVE_COLOR,
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
  const confirmButtonColor = normalizeConfirmColor(confirmButtonColorProp);
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
    padding: space.lg,
  },
  modalContent: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: space.xs,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: space.md,
  },
  modalMessageContainer: {
    marginBottom: space.md,
  },
  modalButtons: {
    flexDirection: "row",
    gap: space.sm,
  },
  modalButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: space.sm,
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
