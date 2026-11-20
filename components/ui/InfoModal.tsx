import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getNeutralColors } from '@/constants/dashboardColors';
import { Colors, getReadableTextColor } from '@/constants/theme';
import { elevation, space } from "@/constants/tokens";
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DESTRUCTIVE_COLOR } from './ConfirmModal';
import { DialogButton, DialogScroll, DialogTitle, dialogStyles } from './DialogParts';
import { pressedOpacity } from './pressFeedback';

interface InfoModalProps {
  visible: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  /** Par défaut : surface de carte du thème (nc.backgroundCard). */
  backgroundColor?: string;
  /** Par défaut : nc.textStrong. */
  textColor?: string;
  /** Par défaut : `tint` du thème (rouge si le titre annonce une erreur). */
  confirmButtonColor?: string;
  confirmTextColor?: string;
  dismissText?: string;
  allowBackdropDismiss?: boolean;
  /**
   * Bouton retour Android : ferme la modale (onClose) par défaut. false pour
   * une alerte protégée qui ne doit se fermer que par ses boutons.
   */
  dismissOnBack?: boolean;
  onClose: () => void;
  onConfirm?: () => void;
}

const NOOP = () => {};

export function InfoModal({
  visible,
  title,
  message,
  confirmText = 'OK',
  backgroundColor,
  textColor,
  confirmButtonColor,
  confirmTextColor,
  dismissText,
  allowBackdropDismiss = false,
  dismissOnBack = true,
  onClose,
  onConfirm,
}: InfoModalProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const nc = getNeutralColors(colorScheme);
  const theme = Colors[colorScheme];
  const surface = backgroundColor ?? nc.backgroundCard;
  const ink = textColor ?? nc.textStrong;
  const isErrorTitle = /erreur|error|echec|failed|❌/i.test(title);
  const usesThemeTint = !confirmButtonColor && !isErrorTitle;
  const resolvedConfirmButtonColor =
    confirmButtonColor ?? (isErrorTitle ? DESTRUCTIVE_COLOR : theme.tint);
  const resolvedConfirmTextColor =
    confirmTextColor ??
    (usesThemeTint ? theme.onTint : getReadableTextColor(resolvedConfirmButtonColor));
  const showConfirmButton = !!confirmText;
  const renderMessage = () => {
    if (typeof message === 'string') {
      return (
        <Text style={[dialogStyles.message, { color: textColor ?? nc.textNormal }]}>
          {message}
        </Text>
      );
    }

    const isTextElement =
      React.isValidElement(message) &&
      (message.type === Text ||
        (typeof message.type === 'function' &&
          ((message.type as any).displayName === 'Text' ||
            message.type.name === 'Text')));

    if (isTextElement) {
      return React.cloneElement(message as React.ReactElement<any>, {
        style: [
          dialogStyles.message,
          { color: textColor ?? nc.textNormal },
          (message.props as { style?: any }).style,
        ],
      });
    }

    return <View style={dialogStyles.messageContainer}>{message}</View>;
  };
  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={dismissOnBack ? onClose : NOOP}
    >
      <Pressable style={dialogStyles.overlay} onPress={allowBackdropDismiss ? onClose : undefined} accessible={false}>
        <Pressable
          style={[
            dialogStyles.card,
            elevation.raised(colorScheme),
            { backgroundColor: surface },
          ]}
          onPress={(event) => event.stopPropagation()}
          // Pas un seul élément pour VoiceOver : titre, texte et boutons restent atteignables.
          accessible={false}
          accessibilityViewIsModal={true}
        >
          <DialogScroll>
            <DialogTitle title={title} color={ink} />
            {renderMessage()}
          </DialogScroll>
          {showConfirmButton && (
            <View style={dialogStyles.buttonsRow}>
              <DialogButton
                text={confirmText}
                variant={resolvedConfirmButtonColor === DESTRUCTIVE_COLOR ? "destructive" : "primary"}
                layout="row"
                color={resolvedConfirmButtonColor}
                textColor={resolvedConfirmTextColor}
                onPress={handleConfirm}
              />
            </View>
          )}
          {!!dismissText && (
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.dismissLink, pressedOpacity(pressed)]}
              accessibilityRole="button"
            >
              <Text style={[styles.dismissText, { color: ink }]}>{dismissText}</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dismissLink: {
    marginTop: space.xs,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    fontSize: 14,
    opacity: 0.75, // ≥ 4.5:1 sur les surfaces claires et sombres
  },
});
