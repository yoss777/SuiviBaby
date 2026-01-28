import React from 'react';
import {
  Dimensions,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface InfoModalProps {
  visible: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  backgroundColor: string;
  textColor: string;
  confirmButtonColor?: string;
  confirmTextColor?: string;
  onClose: () => void;
  onConfirm?: () => void;
}

const getReadableTextColor = (color: string, fallback = "#fff") => {
  if (!color || !color.startsWith("#")) return fallback;
  let hex = color.slice(1);
  if (hex.length === 3) {
    hex = hex
      .split("")
      .map((char) => char + char)
      .join("");
  }
  if (hex.length !== 6) return fallback;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.7 ? "#1b1b1b" : "#fff";
};

export function InfoModal({
  visible,
  title,
  message,
  confirmText = 'OK',
  backgroundColor,
  textColor,
  confirmButtonColor,
  confirmTextColor,
  onClose,
  onConfirm,
}: InfoModalProps) {
  const isErrorTitle = /erreur|error|echec|failed|❌/i.test(title);
  const resolvedConfirmButtonColor =
    confirmButtonColor ?? (isErrorTitle ? "#dc3545" : "#28a745");
  const resolvedConfirmTextColor =
    confirmTextColor ?? getReadableTextColor(resolvedConfirmButtonColor);
  const showConfirmButton = !!confirmText;
  const renderMessage = () => {
    if (typeof message === 'string') {
      return (
        <Text style={[styles.modalMessage, { color: textColor }]}>
          {message}
        </Text>
      );
    }

    const isTextElement =
      React.isValidElement(message) &&
      (message.type === Text ||
        (typeof message.type === 'function' &&
          (message.type.displayName === 'Text' ||
            message.type.name === 'Text')));

    if (isTextElement) {
      return React.cloneElement(message, {
        style: [
          styles.modalMessage,
          { color: textColor },
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
      onRequestClose={() => {}}
    >
      <Pressable style={styles.modalOverlay}>
        <Pressable
          style={[styles.modalContent, { backgroundColor }]}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { color: textColor }]}>{title}</Text>
          {renderMessage()}
          {showConfirmButton && (
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.confirmButton,
                  { backgroundColor: resolvedConfirmButtonColor },
                ]}
                onPress={handleConfirm}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.confirmButtonText,
                    { color: resolvedConfirmTextColor },
                  ]}
                >
                  {confirmText}
                </Text>
              </TouchableOpacity>
            </View>
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
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
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
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    backgroundColor: '#28a745',
  },
  confirmButtonText: {
    fontSize: 16,
    color: '#fff',
    fontWeight: '600',
  },
});
