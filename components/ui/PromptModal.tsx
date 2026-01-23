import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface PromptModalProps {
  visible: boolean;
  title: string;
  message?: string;
  value: string;
  subtitle?: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  confirmText?: string;
  cancelText?: string;
  confirmButtonColor?: string;
  confirmTextColor?: string;
  confirmDisabled?: boolean;
  backgroundColor: string;
  textColor: string;
  onChangeText: (text: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
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

export function PromptModal({
  visible,
  title,
  message,
  value,
  subtitle,
  placeholder,
  secureTextEntry = false,
  multiline = true,
  autoCapitalize = "sentences",
  confirmText = "Valider",
  cancelText = "Annuler",
  confirmButtonColor = "#28a745",
  confirmTextColor,
  confirmDisabled = false,
  backgroundColor,
  textColor,
  onChangeText,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const resolvedConfirmTextColor =
    confirmTextColor ?? getReadableTextColor(confirmButtonColor);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      <Pressable style={styles.modalOverlay}>
        <Pressable
          style={[styles.modalContent, { backgroundColor }]}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { color: textColor }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.modalSubtitle, { color: textColor }]}>{subtitle}</Text>
          ) : null}
          {message ? (
            <Text style={[styles.modalMessage, { color: textColor }]}>
              {message}
            </Text>
          ) : null}
          <TextInput
            style={[styles.input, { color: textColor, borderColor: textColor + "20" }]}
            placeholder={placeholder}
            placeholderTextColor={textColor + "80"}
            value={value}
            onChangeText={onChangeText}
            autoCorrect={false}
            autoCapitalize={autoCapitalize}
            multiline={multiline}
            secureTextEntry={secureTextEntry}
          />
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.modalButton, styles.cancelButton]}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelButtonText}>{cancelText}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modalButton,
                styles.confirmButton,
                { backgroundColor: confirmButtonColor },
                confirmDisabled && styles.confirmButtonDisabled,
              ]}
              onPress={onConfirm}
              activeOpacity={0.7}
              disabled={confirmDisabled}
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
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
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
    marginBottom: 8,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 16,
    minHeight: 44,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f2f2f2",
  },
  cancelButtonText: {
    color: "#333",
    fontWeight: "600",
  },
  confirmButton: {
  },
  confirmButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  confirmButtonDisabled: {
    opacity: 0.6,
  },
});
