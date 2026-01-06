import FontAwesome from "@expo/vector-icons/FontAwesome5";
import React, { ReactNode } from "react";
import {
    Modal,
    Platform,
    StyleProp,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    ViewStyle,
} from "react-native";
import ModernActionButtons from "./ModernActionsButton";

interface ReusableModalProps {
  // Visibilité du modal
  visible: boolean;
  onRequestClose: () => void;

  // En-tête
  title: string;
  iconName: string;
  iconColor?: string;
  isEditing?: boolean;
  onDelete?: () => void;

  // Contenu personnalisé
  children: ReactNode;

  // Boutons d'action
  onCancel: () => void;
  onValidate: () => void;
  cancelText?: string;
  validateText?: string;
  isLoading?: boolean;
  disabled?: boolean;
  loadingText?: string;

  // Styles personnalisés (optionnels)
  modalContentStyle?: StyleProp<ViewStyle>;
  modalOverlayStyle?: StyleProp<ViewStyle>;
}

export default function ReusableModal({
  visible,
  onRequestClose,
  title,
  iconName,
  iconColor = "#4A90E2",
  isEditing = false,
  onDelete,
  children,
  onCancel,
  onValidate,
  cancelText = "Annuler",
  validateText = "Ajouter",
  isLoading = false,
  disabled = false,
  loadingText = "En cours...",
  modalContentStyle,
  modalOverlayStyle,
}: ReusableModalProps) {
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onRequestClose}
    >
      <View style={[styles.modalOverlay, modalOverlayStyle]}>
        <View style={[styles.modalContent, modalContentStyle]}>
          {/* En-tête du modal */}
          <View style={styles.modalHeader}>
            <FontAwesome
              name={isEditing ? "edit" : iconName}
              size={24}
              color={iconColor}
            />
            <Text style={styles.modalTitle}>{title}</Text>
            {isEditing && onDelete && (
              <TouchableOpacity onPress={onDelete}>
                <FontAwesome name="trash" size={24} color="red" />
              </TouchableOpacity>
            )}
          </View>

          {/* Contenu personnalisé */}
          {children}

          {/* Boutons d'action */}
          <View style={styles.actionButtonsContainer}>
            <ModernActionButtons
              onCancel={onCancel}
              onValidate={onValidate}
              cancelText={cancelText}
              validateText={validateText}
              isLoading={isLoading}
              disabled={disabled}
              loadingText={loadingText}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalContent: {
    width: "90%",
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: "white",
    borderRadius: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  actionButtonsContainer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
  },
});