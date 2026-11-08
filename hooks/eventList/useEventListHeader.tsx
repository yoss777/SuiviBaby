// En-tête des écrans de liste : bouton calendrier + menu (Ajouter /
// Sélectionner), bouton retour vers l'écran d'origine, retour matériel
// Android (ferme d'abord le formulaire ouvert).
import { Ionicons } from "@expo/vector-icons";
import { HeaderBackButton } from "expo-router/react-navigation";
import { useFocusEffect } from "expo-router/react-navigation";
import { router } from "expo-router";
import React, { useCallback, useMemo, useRef } from "react";
import { BackHandler, Pressable, StyleSheet, View } from "react-native";

import { HeaderMenu, type HeaderMenuItem } from "@/components/ui/HeaderMenu";
import { Colors } from "@/constants/theme";
import { useHeaderLeft, useHeaderRight } from "@/contexts/HeaderContext";

import { navigateToReturnTarget } from "./useEventSheetFlow";

type Options = {
  ownerPrefix: string;
  colorScheme: "light" | "dark";
  showCalendar: boolean;
  onCalendarPress: () => void;
  calendarButtonInset: boolean;
  onAdd: () => void;
  /** « Sélectionner » n'apparaît que s'il y a des groupes (ou en mode sélection). */
  hasGroups: boolean;
  /** « Sélectionner » (suppression groupée) : propriétaire/admin seulement. */
  canSelect: boolean;
  selectionMode: boolean;
  toggleSelectionMode: () => void;
  isSheetOpen: boolean;
  closeSheet: () => void;
  returnTargetParam: string | undefined;
  returnToRef: React.MutableRefObject<string | null>;
  backUsesStashedReturn: boolean;
};

export function useEventListHeader({
  ownerPrefix,
  colorScheme,
  showCalendar,
  onCalendarPress,
  calendarButtonInset,
  onAdd,
  hasGroups,
  canSelect,
  selectionMode,
  toggleSelectionMode,
  isSheetOpen,
  closeSheet,
  returnTargetParam,
  returnToRef,
  backUsesStashedReturn,
}: Options) {
  const { setHeaderRight } = useHeaderRight();
  const { setHeaderLeft } = useHeaderLeft();
  const headerOwnerId = useRef(`${ownerPrefix}-${Math.random().toString(36).slice(2)}`);

  const menuItems: HeaderMenuItem[] = useMemo(
    () => [
      { label: "Ajouter", icon: "add-circle-outline", onPress: onAdd },
      ...(canSelect && (hasGroups || selectionMode)
        ? [
            {
              label: selectionMode ? "Annuler sélection" : "Sélectionner",
              icon: (selectionMode
                ? "close-outline"
                : "checkmark-done-outline") as keyof typeof Ionicons.glyphMap,
              onPress: toggleSelectionMode,
            },
          ]
        : []),
    ],
    [onAdd, selectionMode, toggleSelectionMode, hasGroups, canSelect],
  );

  // Définir les boutons du header (calendrier + menu)
  useFocusEffect(
    useCallback(() => {
      const ownerId = headerOwnerId.current;
      const headerButtons = (
        <View style={styles.headerRow}>
          <Pressable
            onPress={onCalendarPress}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={[
              styles.headerButton,
              calendarButtonInset && { paddingLeft: 12 },
              showCalendar && { backgroundColor: Colors[colorScheme].tint + "20" },
            ]}
          >
            <Ionicons name="calendar-outline" size={24} color={Colors[colorScheme].tint} />
          </Pressable>
          <HeaderMenu items={menuItems} />
        </View>
      );

      setHeaderRight(headerButtons, ownerId);
      return () => {
        setHeaderRight(null, ownerId);
      };
    }, [onCalendarPress, showCalendar, colorScheme, setHeaderRight, menuItems, calendarButtonInset]),
  );

  const resolveReturnTarget = useCallback(
    () => (backUsesStashedReturn ? returnTargetParam ?? returnToRef.current : returnTargetParam),
    [backUsesStashedReturn, returnTargetParam, returnToRef],
  );

  useFocusEffect(
    useCallback(() => {
      const ownerId = headerOwnerId.current;
      const returnTarget = resolveReturnTarget();
      const backButton = (
        <HeaderBackButton
          onPress={() => {
            if (!navigateToReturnTarget(returnTarget)) router.replace("/baby/plus");
          }}
          tintColor={Colors[colorScheme].text}
        />
      );
      setHeaderLeft(backButton, ownerId);
      return () => {
        setHeaderLeft(null, ownerId);
      };
    }, [colorScheme, resolveReturnTarget, setHeaderLeft]),
  );

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (isSheetOpen) {
          closeSheet();
          return true;
        }
        if (!navigateToReturnTarget(resolveReturnTarget())) router.replace("/baby/plus");
        return true;
      };
      const subscription = BackHandler.addEventListener("hardwareBackPress", onBackPress);
      return () => subscription.remove();
    }, [closeSheet, isSheetOpen, resolveReturnTarget]),
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 16,
    gap: 0,
  },
  headerButton: {
    paddingVertical: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
});
