import { Colors } from "@/constants/theme";
import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import React, { forwardRef, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ============================================
// TYPES
// ============================================

export interface FormBottomSheetProps {
  title: string;
  icon?: string;
  iconLib?: "fa6" | "mci";
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
      iconLib = "fa6",
      accentColor = "#4A90E2",
      isEditing = false,
      isSubmitting = false,
      showActions = true,
      enablePanDownToClose = true,
      enableOverDrag = false,
      children,
      onSubmit,
      onDelete,
      onCancel,
      onClose,
      snapPoints: customSnapPoints,
    },
    ref,
  ) => {
    const colorScheme = useColorScheme() ?? "light";
    const tintColor = Colors[colorScheme].tint;
    const nc = getNeutralColors(colorScheme);
    const insets = useSafeAreaInsets();
    const snapPoints = useMemo(
      () => customSnapPoints || ["75%", "90%"],
      [customSnapPoints],
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
          pressBehavior="close"
        />
      ),
      [],
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
        backgroundStyle={{ backgroundColor: nc.backgroundCard }}
        handleIndicatorStyle={{ backgroundColor: nc.textMuted }}
      >
        <BottomSheetScrollView
          style={styles.container}
          contentContainerStyle={{ paddingBottom: Math.max(16, insets.bottom) }}
        >
          {/* Header */}
          <View style={styles.header}>
            {iconLib === "mci" ? (
              <MaterialCommunityIcons name={icon as any} size={24} color={accentColor} />
            ) : (
              <FontAwesome name={icon} size={24} color={accentColor} />
            )}
            <Text style={[styles.title, { color: nc.textStrong }]}>{title}</Text>
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
                    { backgroundColor: nc.background, borderColor: nc.border },
                    isSubmitting && styles.buttonDisabled,
                  ]}
                  onPress={onCancel}
                  disabled={isSubmitting}
                >
                  <Text style={[styles.cancelText, { color: nc.textNormal }]}>Annuler</Text>
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
                    <ActivityIndicator size="small" color={nc.white} />
                  ) : (
                    <Text style={[styles.validateText, { color: nc.white }]}>
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
                  <FontAwesome name="trash" size={14} color={nc.error} />
                  <Text style={[styles.deleteOutlineText, { color: nc.error }]}>Supprimer</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </BottomSheetScrollView>
      </BottomSheet>
    );
  },
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
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  deleteOutlineText: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  cancelText: {
    fontSize: 16,
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
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
