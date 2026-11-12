import React from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getNeutralColors } from '@/constants/dashboardColors';
import { Colors, getReadableTextColor } from '@/constants/theme';
import { elevation, radius } from '@/constants/tokens';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { DESTRUCTIVE_COLOR } from './ConfirmModal';
import { pressedOpacity, usePressRipple } from './pressFeedback';

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
  const ripple = usePressRipple();
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
        <Text style={[styles.modalMessage, { color: ink }]}>
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
          styles.modalMessage,
          { color: ink },
          (message.props as { style?: any }).style,
        ],
      });
    }

    return <View style={styles.modalMessageContainer}>{message}</View>;
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
      <Pressable style={styles.modalOverlay} onPress={allowBackdropDismiss ? onClose : undefined}>
        <Pressable
          style={[
            styles.modalContent,
            elevation.raised(colorScheme),
            { backgroundColor: surface },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { color: ink }]}>{title}</Text>
          {renderMessage()}
          {showConfirmButton && (
            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [
                  styles.modalButton,
                  { backgroundColor: resolvedConfirmButtonColor },
                  pressedOpacity(pressed),
                ]}
                android_ripple={ripple}
                onPress={handleConfirm}
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

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width * 0.85,
    borderRadius: radius.xl,
    padding: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  modalMessageContainer: {
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    minHeight: 44,
    paddingVertical: 14,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden', // borne le ripple Android au bouton
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  dismissLink: {
    marginTop: 8,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissText: {
    fontSize: 14,
    opacity: 0.75, // ≥ 4.5:1 sur les surfaces claires et sombres
  },
});
