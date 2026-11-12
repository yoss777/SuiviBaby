import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors, getReadableTextColor } from "@/constants/theme";
import { radius } from "@/constants/tokens";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { pressedOpacity, usePressRipple } from "./pressFeedback";

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
  /** Par défaut : `tint` du thème. */
  confirmButtonColor?: string;
  confirmTextColor?: string;
  confirmDisabled?: boolean;
  /** Par défaut : surface de carte du thème (nc.backgroundCard). */
  backgroundColor?: string;
  /** Par défaut : nc.textStrong. */
  textColor?: string;
  onChangeText: (text: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

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
  confirmButtonColor,
  confirmTextColor,
  confirmDisabled = false,
  backgroundColor,
  textColor,
  onChangeText,
  onConfirm,
  onCancel,
}: PromptModalProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const theme = Colors[colorScheme];
  const ripple = usePressRipple();
  const surface = backgroundColor ?? nc.backgroundCard;
  const ink = textColor ?? nc.textStrong;
  const confirmBg = confirmButtonColor ?? theme.tint;
  const resolvedConfirmTextColor =
    confirmTextColor ??
    (confirmButtonColor ? getReadableTextColor(confirmButtonColor) : theme.onTint);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Bouton retour Android = Annuler
      onRequestClose={onCancel}
    >
      <Pressable style={styles.modalOverlay}>
        <Pressable
          style={[styles.modalContent, { backgroundColor: surface }]}
          onPress={(event) => event.stopPropagation()}
        >
          <Text style={[styles.modalTitle, { color: ink }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.modalSubtitle, { color: ink }]}>{subtitle}</Text>
          ) : null}
          {message ? (
            <Text style={[styles.modalMessage, { color: ink }]}>
              {message}
            </Text>
          ) : null}
          <TextInput
            style={[styles.input, { color: ink, borderColor: nc.border }]}
            placeholder={placeholder}
            placeholderTextColor={nc.textLight}
            value={value}
            onChangeText={onChangeText}
            autoCorrect={false}
            autoCapitalize={autoCapitalize}
            multiline={multiline}
            secureTextEntry={secureTextEntry}
          />
          <View style={styles.modalButtons}>
            <Pressable
              style={({ pressed }) => [
                styles.modalButton,
                { backgroundColor: nc.backgroundPressed },
                pressedOpacity(pressed),
              ]}
              android_ripple={ripple}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={[styles.cancelButtonText, { color: nc.textStrong }]}>
                {cancelText}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.modalButton,
                { backgroundColor: confirmBg },
                confirmDisabled && styles.confirmButtonDisabled,
                pressedOpacity(pressed),
              ]}
              android_ripple={ripple}
              onPress={onConfirm}
              disabled={confirmDisabled}
              accessibilityRole="button"
              accessibilityState={{ disabled: confirmDisabled }}
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
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
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
  confirmButtonDisabled: {
    opacity: 0.6,
  },
});
