import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface ConfirmModalProps {
  visible: boolean;
  title: string;
  message: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  backgroundColor: string;
  textColor: string;
  confirmButtonColor?: string;
  confirmTextColor?: string;
  cancelButtonColor?: string;
  cancelTextColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  visible,
  title,
  message,
  confirmText = "Supprimer",
  cancelText = "Annuler",
  backgroundColor,
  textColor,
  confirmButtonColor = "#dc3545",
  confirmTextColor = "#fff",
  cancelButtonColor = "#f2f2f2",
  cancelTextColor = "#333",
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
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
          {typeof message === "string" ? (
            <Text style={[styles.modalSubtitle, { color: textColor }]}>
              {message}
            </Text>
          ) : (
            <View style={styles.modalMessageContainer}>{message}</View>
          )}

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[
                styles.modalButton,
                styles.cancelButton,
                { backgroundColor: cancelButtonColor },
              ]}
              onPress={onCancel}
              activeOpacity={0.7}
            >
              <Text style={[styles.cancelButtonText, { color: cancelTextColor }]}>
                {cancelText}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.modalButton,
                styles.confirmButton,
                { backgroundColor: confirmButtonColor },
              ]}
              onPress={onConfirm}
              activeOpacity={0.7}
            >
              <Text style={[styles.confirmButtonText, { color: confirmTextColor }]}>
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
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
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
  confirmButton: {},
  confirmButtonText: {
    fontWeight: "700",
  },
});
