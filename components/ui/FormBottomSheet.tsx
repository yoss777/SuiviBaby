import { Colors } from "@/constants/theme";
import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetFooterProps,
  BottomSheetHandle,
  BottomSheetHandleProps,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import React, { forwardRef, useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FormScrollContext } from "./FormScrollContext";

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
  /**
   * Glissement du contenu et de la poignée entre les crans (agrandir,
   * réduire). Indépendant de `enablePanDownToClose` : une saisie protégée
   * interdit seulement la fermeture par glissement, pas le changement de cran.
   * Par défaut, suit `enablePanDownToClose` (comportement historique).
   */
  enablePanGestures?: boolean;
  enableOverDrag?: boolean;
  children: React.ReactNode;
  onSubmit: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
  onCancel: () => void;
  onClose?: () => void;
  snapPoints?: string[];
  initialIndex?: number;
  /**
   * Fourni quand la saisie doit être protégée : le fond ne ferme plus la
   * feuille directement, il appelle ce rappel (qui peut demander confirmation).
   */
  onRequestDismiss?: () => void;
  /** Pied collant (boutons d'action toujours visibles). */
  footerComponent?: React.FC<BottomSheetFooterProps>;
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
      enablePanGestures,
      enableOverDrag = false,
      children,
      onSubmit,
      onDelete,
      onCancel,
      onClose,
      snapPoints: customSnapPoints,
      initialIndex = -1,
      onRequestDismiss,
      footerComponent,
    },
    ref,
  ) => {
    const colorScheme = useColorScheme() ?? "light";
    const tintColor = Colors[colorScheme].tint;
    const onTint = Colors[colorScheme].onTint;
    const nc = getNeutralColors(colorScheme);
    const insets = useSafeAreaInsets();
    const scrollViewRef = useRef<any>(null);
    const panGestures = enablePanGestures ?? enablePanDownToClose;
    const [scrollEnabled, setScrollEnabled] = useState(true);
    const snapPoints = useMemo(
      () => customSnapPoints || ["75%", "90%"],
      [customSnapPoints],
    );
    const formScrollContext = useMemo(
      () => ({
        scrollToEnd: () => {
          scrollViewRef.current?.scrollToEnd?.({ animated: true });
        },
        setScrollEnabled,
      }),
      [],
    );

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          opacity={0.5}
          // Saisie protégée : le fond garde la feuille ouverte (retour au cran
          // d'ouverture) et délègue la décision à onRequestDismiss.
          pressBehavior={onRequestDismiss ? Math.max(0, initialIndex) : "close"}
          onPress={onRequestDismiss}
          // Libellés français (défauts anglais de @gorhom/bottom-sheet)
          accessibilityLabel="Fermer le formulaire"
          accessibilityHint="Touchez deux fois pour fermer sans enregistrer"
        />
      ),
      [onRequestDismiss, initialIndex],
    );

    const renderHandle = useCallback(
      (props: BottomSheetHandleProps) => (
        <BottomSheetHandle
          {...props}
          indicatorStyle={{ backgroundColor: nc.textMuted }}
          accessibilityLabel="Poignée du formulaire"
          accessibilityHint={
            enablePanDownToClose
              ? "Faites glisser vers le haut pour agrandir, vers le bas pour fermer"
              : "Faites glisser pour agrandir ou réduire le formulaire"
          }
        />
      ),
      [nc.textMuted, enablePanDownToClose],
    );

    return (
      <BottomSheet
        ref={ref}
        index={initialIndex}
        snapPoints={snapPoints}
        enablePanDownToClose={enablePanDownToClose}
        enableContentPanningGesture={panGestures}
        enableHandlePanningGesture={panGestures}
        enableOverDrag={enableOverDrag}
        backdropComponent={renderBackdrop}
        footerComponent={footerComponent}
        onClose={onClose}
        backgroundStyle={{ backgroundColor: nc.backgroundCard }}
        handleComponent={renderHandle}
        // Le conteneur « accessible » par défaut (libellé « Bottom Sheet »)
        // regroupe tout le contenu en un seul élément pour VoiceOver : on le
        // désactive pour que chaque champ et bouton reste atteignable.
        accessible={false}
        accessibilityLabel={title}
      >
        <FormScrollContext.Provider value={formScrollContext}>
          <BottomSheetScrollView
            ref={scrollViewRef}
            scrollEnabled={scrollEnabled}
            style={styles.container}
            contentContainerStyle={{
              paddingBottom: Math.max(16, insets.bottom),
            }}
          >
            {/* Header */}
            <View style={styles.header}>
              {iconLib === "mci" ? (
                <MaterialCommunityIcons name={icon as any} size={24} color={accentColor} />
              ) : (
                <FontAwesome name={icon} size={24} color={accentColor} />
              )}
              <Text
                accessibilityRole="header"
                style={[styles.title, { color: nc.textStrong }]}
              >
                {title}
              </Text>
              {/* Bouton « Fermer » : alternative au glissement / au fond
                  pour les lecteurs d'écran et la commande vocale. */}
              <TouchableOpacity
                style={styles.closeButton}
                onPress={onCancel}
                disabled={isSubmitting}
                accessibilityRole="button"
                accessibilityLabel="Fermer"
                accessibilityState={{ disabled: isSubmitting }}
              >
                <FontAwesome name="xmark" size={18} color={nc.textStrong} />
              </TouchableOpacity>
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
                    accessibilityRole="button"
                    accessibilityState={{ disabled: isSubmitting }}
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
                    accessibilityRole="button"
                    // Pendant l'envoi, le libellé visible disparaît au profit du
                    // spinner : on annonce l'état plutôt qu'un bouton sans nom.
                    accessibilityLabel={
                      isSubmitting
                        ? "Enregistrement en cours"
                        : isEditing
                          ? "Enregistrer"
                          : "Ajouter"
                    }
                    accessibilityState={{ busy: isSubmitting, disabled: isSubmitting }}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator size="small" color={onTint} />
                    ) : (
                      <Text style={[styles.validateText, { color: onTint }]}>
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
                    accessibilityRole="button"
                    accessibilityLabel="Supprimer"
                    accessibilityState={{ disabled: isSubmitting }}
                  >
                    <FontAwesome name="trash" size={14} color={nc.error} />
                    <Text style={[styles.deleteOutlineText, { color: nc.errorText }]}>Supprimer</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </BottomSheetScrollView>
        </FormScrollContext.Provider>
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
  closeButton: {
    position: "absolute",
    right: -8,
    top: -6,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
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
    minHeight: 44, // cible tactile ≥ 44 pt
    minWidth: 44,
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
