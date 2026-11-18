import React from "react";
import { Modal, Pressable, Text, useWindowDimensions, View } from "react-native";

import {
  getNeutralColors,
  neutralColors,
  neutralColorsDark,
} from "@/constants/dashboardColors";
import { getReadableTextColor } from "@/constants/theme";
import { elevation, space } from "@/constants/tokens";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { DialogButton, dialogStyles } from "./DialogParts";

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
/**
 * Deux boutons côte à côte seulement si le plus long libellé tient sur une
 * ligne dans la moitié de la fenêtre, selon la largeur de l'écran et la
 * taille du texte réglée par l'utilisateur (iPhone SE, texte agrandi).
 * Sinon : boutons empilés, action en haut, annulation en dessous.
 */
const AVG_CHAR_WIDTH = 8.5; // pt, texte 16 semi-gras, minuscules (boutons des fenêtres)
export function buttonsFitSideBySide(
  labels: string[],
  windowWidth: number,
  fontScale: number,
): boolean {
  // Mêmes mesures que dialogStyles (marge 20, boîte ≤ 400, intérieur 24) et
  // DialogButton (marge intérieure 16, écart 12).
  const dialogWidth = Math.min(windowWidth - 2 * space.lg, 400);
  const buttonWidth = (dialogWidth - 2 * space.xl - space.sm) / 2;
  const textWidth = buttonWidth - 2 * space.md;
  const longest = Math.max(...labels.map((l) => l.length));
  return longest * AVG_CHAR_WIDTH * Math.max(1, fontScale) <= textWidth;
}

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
  const surface = backgroundColor ?? nc.backgroundCard;
  const ink = textColor ?? nc.textStrong;
  const confirmButtonColor = normalizeConfirmColor(confirmButtonColorProp);
  const resolvedConfirmTextColor =
    confirmTextColor ?? getReadableTextColor(confirmButtonColor);
  const confirmVariant = confirmButtonColor === DESTRUCTIVE_COLOR ? "destructive" : "primary";
  const { width: windowWidth, fontScale } = useWindowDimensions();
  const stacked = !buttonsFitSideBySide([confirmText, cancelText], windowWidth, fontScale);
  const layout = stacked ? "stack" : "row";
  const cancelButton = (
    <DialogButton
      key="cancel"
      text={cancelText}
      variant="secondary"
      layout={layout}
      color={cancelButtonColor}
      textColor={cancelTextColor}
      onPress={onCancel}
    />
  );
  const confirmButton = (
    <DialogButton
      key="confirm"
      text={confirmText}
      variant={confirmVariant}
      layout={layout}
      color={confirmButtonColor}
      textColor={resolvedConfirmTextColor}
      onPress={onConfirm}
    />
  );
  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={dismissOnBack ? onCancel : NOOP}
    >
      <Pressable
        style={dialogStyles.overlay}
        onPress={allowBackdropDismiss ? onDismiss : undefined}
      >
        <Pressable
          style={[dialogStyles.card, elevation.raised(colorScheme), { backgroundColor: surface }]}
          onPress={(event) => event.stopPropagation()}
          accessibilityViewIsModal={true}
        >
          <Text style={[dialogStyles.title, { color: ink }]} accessibilityRole="header">
            {title}
          </Text>
          {typeof message === "string" ? (
            <Text style={[dialogStyles.message, { color: textColor ?? nc.textNormal }]}>{message}</Text>
          ) : (
            <View style={dialogStyles.messageContainer}>{message}</View>
          )}

          <View style={stacked ? dialogStyles.buttonsStack : dialogStyles.buttonsRow}>
            {stacked ? [confirmButton, cancelButton] : [cancelButton, confirmButton]}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
