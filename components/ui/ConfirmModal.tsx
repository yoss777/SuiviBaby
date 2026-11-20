import React, { useCallback, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  type TextLayoutEvent,
  useWindowDimensions,
  View,
} from "react-native";

import {
  getNeutralColors,
  neutralColors,
  neutralColorsDark,
} from "@/constants/dashboardColors";
import { getReadableTextColor } from "@/constants/theme";
import { elevation, space } from "@/constants/tokens";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  DialogButton,
  DialogScroll,
  DialogTitle,
  dialogStyles,
  dialogTextWidth,
  estimateBoldTextWidth,
} from "./DialogParts";

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
export function buttonsFitSideBySide(
  labels: string[],
  windowWidth: number,
  fontScale: number,
): boolean {
  // Mêmes mesures que dialogStyles (marge 20, boîte ≤ 400, intérieur 24) et
  // DialogButton (marge intérieure 16, écart 12).
  const buttonWidth = (dialogTextWidth(windowWidth) - space.sm) / 2;
  const textWidth = buttonWidth - 2 * space.md;
  const longest = Math.max(...labels.map((l) => estimateBoldTextWidth(l, 16)));
  // Texte des boutons plafonné à ×2 (DialogButton, maxFontSizeMultiplier).
  // Ce n'est qu'une estimation : si un libellé passe quand même à la ligne,
  // la fenêtre empile les boutons après la mesure (ConfirmModal).
  return longest * Math.min(Math.max(1, fontScale), 2) <= textWidth;
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
  // Libellé passé à la ligne malgré l'estimation (largeur réelle des lettres,
  // police du système) : on empile. Recalculé quand les libellés ou la police
  // changent.
  const layoutKey = `${confirmText}|${cancelText}|${windowWidth}|${fontScale}`;
  const [wrappedFor, setWrappedFor] = useState<string | null>(null);
  const stacked =
    wrappedFor === layoutKey || !buttonsFitSideBySide([confirmText, cancelText], windowWidth, fontScale);
  const layout = stacked ? "stack" : "row";
  const onButtonTextLayout = useCallback(
    (event: TextLayoutEvent) => {
      if (!stacked && event.nativeEvent.lines.length > 1) setWrappedFor(layoutKey);
    },
    [stacked, layoutKey],
  );
  const cancelButton = (
    <DialogButton
      key="cancel"
      text={cancelText}
      variant="secondary"
      layout={layout}
      color={cancelButtonColor}
      textColor={cancelTextColor}
      onPress={onCancel}
      onTextLayout={onButtonTextLayout}
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
      onTextLayout={onButtonTextLayout}
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
        // Le fond n'est pas un élément VoiceOver : sinon il regroupe toute la
        // fenêtre en un seul bloc (boutons inatteignables, recette 1.0.22).
        accessible={false}
      >
        <Pressable
          style={[dialogStyles.card, elevation.raised(colorScheme), { backgroundColor: surface }]}
          onPress={(event) => event.stopPropagation()}
          // Pas un seul élément pour VoiceOver : titre, texte et boutons restent atteignables.
          accessible={false}
          accessibilityViewIsModal={true}
        >
          {/* Titre et texte défilent ensemble ; la boîte ne dépasse jamais
              l'écran (dialogStyles.card), les boutons restent en dessous. */}
          <DialogScroll>
            <DialogTitle title={title} color={ink} />
            {typeof message === "string" ? (
              <Text style={[dialogStyles.message, { color: textColor ?? nc.textNormal }]}>{message}</Text>
            ) : (
              <View style={dialogStyles.messageContainer}>{message}</View>
            )}
          </DialogScroll>

          <View style={stacked ? dialogStyles.buttonsStack : dialogStyles.buttonsRow}>
            {stacked ? [confirmButton, cancelButton] : [cancelButton, confirmButton]}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
