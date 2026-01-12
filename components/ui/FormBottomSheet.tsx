import FontAwesome from "@expo/vector-icons/FontAwesome6";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import React, { forwardRef, useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ============================================
// TYPES
// ============================================

export interface FormBottomSheetProps {
  title: string;
  icon?: string;
  accentColor?: string;
  isEditing?: boolean;
  isSubmitting?: boolean;
  children: React.ReactNode;
  onSubmit: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onCancel: () => void;
  onClose?: () => void;
  snapPoints?: string[];
}

// ============================================
// COMPONENT
// ============================================

export const FormBottomSheet = forwardRef<BottomSheet, FormBottomSheetProps>(
  (
    {
      title,
      icon = "edit",
      accentColor = "#4A90E2",
      isEditing = false,
      isSubmitting = false,
      children,
      onSubmit,
      onDelete,
      onCancel,
      onClose,
      snapPoints: customSnapPoints,
    },
    ref
  ) => {
    const snapPoints = useMemo(
      () => customSnapPoints || ["75%", "90%"],
      [customSnapPoints]
    );

    const renderBackdrop = (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    );

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose={true}
        backdropComponent={renderBackdrop}
        onClose={onClose}
      >
        <BottomSheetScrollView style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <FontAwesome name={icon} size={24} color={accentColor} />
            <Text style={styles.title}>{title}</Text>
          </View>

          {/* Contenu du formulaire */}
          <View style={styles.content}>{children}</View>

          {/* Boutons d'action */}
          <View style={styles.buttonsContainer}>
            {/* Bouton Supprimer (uniquement en mode édition) */}
            {isEditing && onDelete && (
              <TouchableOpacity
                style={[
                  styles.deleteButton,
                  isSubmitting && styles.buttonDisabled,
                ]}
                onPress={onDelete}
                disabled={isSubmitting}
              >
                <FontAwesome name="trash" size={20} color="white" />
              </TouchableOpacity>
            )}

            {/* Bouton Annuler */}
            <TouchableOpacity
              style={[
                styles.cancelButton,
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={onCancel}
              disabled={isSubmitting}
            >
              <FontAwesome name="xmark" size={20} color="white" />
            </TouchableOpacity>

            {/* Bouton Valider */}
            <TouchableOpacity
              style={[
                styles.validateButton,
                { backgroundColor: isEditing ? "#28a745" : "#4A90E2" },
                isSubmitting && styles.buttonDisabled,
              ]}
              onPress={onSubmit}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <FontAwesome name="check" size={20} color="white" />
              )}
            </TouchableOpacity>

          </View>
        </BottomSheetScrollView>
      </BottomSheet>
    );
  }
);

FormBottomSheet.displayName = "FormBottomSheet";

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 20,
    marginTop: 10,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#333",
  },
  content: {
    paddingBottom: 10,
  },

  // Boutons d'action
  buttonsContainer: {
    flexDirection: "row",
    gap: 16,
    paddingBottom: Platform.OS === "ios" ? 20 : 16,
    paddingTop: 10,
  },
  deleteButton: {
    flex: 1,
    backgroundColor: "#dc3545",
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#333333",
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  validateButton: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
