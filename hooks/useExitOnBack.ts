// hooks/useExitOnBack.ts — bouton retour Android sur un écran racine (connexion,
// introduction) : ferme l'application au lieu de dépiler.
// Raison : l'ancre de la pile racine (`unstable_settings.anchor = "(drawer)"`,
// app/_layout.tsx) laisse l'écran principal sous l'écran de connexion ; après
// une déconnexion, le retour y menait et affichait un écran vide (2026-11-08).
// `onBack` peut consommer l'appui d'abord (ex. revenir du mode inscription).
import { useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { BackHandler, Platform } from "react-native";

export function useExitOnBack(onBack?: () => boolean): void {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return undefined;
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        if (onBack?.()) return true;
        BackHandler.exitApp();
        return true;
      });
      return () => subscription.remove();
    }, [onBack]),
  );
}
