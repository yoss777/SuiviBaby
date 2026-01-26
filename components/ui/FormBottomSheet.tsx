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
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ============================================
// TYPES
// ============================================

export interface FormBottomSheetProps {
  title: string;
  icon?: string;
  accentColor?: string;
  isEditing?: boolean;
  isSubmitting?: boolean;
  showActions?: boolean;
  enablePanDownToClose?: boolean;
  enableOverDrag?: boolean;
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
      showActions = true,
      enablePanDownToClose = false,
      enableOverDrag = false,
      children,
      onSubmit,
      onDelete,
      onCancel,
      onClose,
      snapPoints: customSnapPoints,
    },
    ref
  ) => {
    const colorScheme = useColorScheme() ?? "light";
    const tintColor = Colors[colorScheme].tint;
    const insets = useSafeAreaInsets();
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
        enablePanDownToClose={enablePanDownToClose}
        enableOverDrag={enableOverDrag}
        backdropComponent={renderBackdrop}
        onClose={onClose}
      >
        <BottomSheetScrollView
          style={styles.container}
          contentContainerStyle={{ paddingBottom: Math.max(16, insets.bottom) }}
        >
          {/* Header */}
          <View style={styles.header}>
            <FontAwesome name={icon} size={24} color={accentColor} />
            <Text style={styles.title}>{title}</Text>
          </View>

          {/* Contenu du formulaire */}
          <View style={styles.content}>{children}</View>

          {/* Boutons d'action */}
          {showActions && (
            <View
              style={[
                styles.buttonsContainer,
                { paddingBottom: Math.max(16, insets.bottom) },
              ]}
            >
              <View style={styles.primaryRow}>
                <TouchableOpacity
                  style={[
                    styles.cancelButton,
                    isSubmitting && styles.buttonDisabled,
                  ]}
                  onPress={onCancel}
                  disabled={isSubmitting}
                >
                  <Text style={styles.cancelText}>Annuler</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.validateButton,
                    { backgroundColor: tintColor },
                    isSubmitting && styles.buttonDisabled,
                  ]}
                  onPress={onSubmit}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text style={styles.validateText}>
                      {isEditing ? "Enregistrer" : "Ajouter"}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {isEditing && onDelete && (
                <TouchableOpacity
                  style={[
                    styles.deleteOutlineButton,
                    isSubmitting && styles.buttonDisabled,
                  ]}
                  onPress={onDelete}
                  disabled={isSubmitting}
                >
                  <FontAwesome name="trash" size={14} color="#dc3545" />
                  <Text style={styles.deleteOutlineText}>Supprimer</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
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
    gap: 12,
    paddingBottom: Platform.OS === "ios" ? 20 : 16,
    paddingTop: 10,
  },
  primaryRow: {
    flexDirection: "row",
    gap: 12,
  },
  deleteOutlineButton: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f1b1b1",
    backgroundColor: "#fff5f5",
    gap: 8,
  },
  deleteOutlineText: {
    fontSize: 14,
    color: "#dc3545",
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: "#f5f6f8",
    borderWidth: 1,
    borderColor: "#d7dbe0",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  cancelText: {
    fontSize: 16,
    color: "#4a4f55",
    fontWeight: "600",
  },
  validateButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  validateText: {
    fontSize: 16,
    color: "#fff",
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
