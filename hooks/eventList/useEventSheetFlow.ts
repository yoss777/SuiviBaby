// Ouverture du formulaire (bottom sheet) d'un écran de liste : ajout, édition,
// paramètres d'URL (openModal, editId, tab, returnTo) et retour à l'écran
// d'origine à la fermeture.
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { InteractionManager } from "react-native";

import { useSheet } from "@/contexts/SheetContext";

import { isOptimisticId, SAVING_TOAST } from "./useSoftDelete";

const RETURN_TARGETS = ["home", "chrono", "journal"] as const;

const normalizeParam = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** Écran d'origine : home → /baby/home, chrono et journal → /baby/chrono. */
export function navigateToReturnTarget(target: string | null | undefined): boolean {
  if (target === "home") {
    router.replace("/baby/home");
    return true;
  }
  if (target === "chrono" || target === "journal") {
    router.replace("/baby/chrono");
    return true;
  }
  return false;
}

type SheetConfig<T> = {
  formType: string;
  ownerId: string;
  buildOpenProps: (args: { editItem?: T; addPreset?: string }) => Record<string, unknown>;
  savedToast?: (isEdit: boolean) => string;
};

type Options<T extends { id: string }> = {
  sheet: SheetConfig<T>;
  parseTabParam?: (tab?: string) => string | undefined;
  items: readonly T[];
  showToast: (message: string) => void;
  /** Après enregistrement : fenêtre incluant aujourd'hui + filtre « aujourd'hui ». */
  onSaved: () => void;
};

export function useEventSheetFlow<T extends { id: string }>({
  sheet,
  parseTabParam,
  items,
  showToast,
  onSaved,
}: Options<T>) {
  const navigation = useNavigation();
  const { openSheet, closeSheet, isOpen } = useSheet();
  const { tab, openModal, editId, returnTo } = useLocalSearchParams();
  const returnTargetParam = normalizeParam(returnTo);
  const tabParam = normalizeParam(tab);

  const [layoutReady, setLayoutReady] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [pendingEditItem, setPendingEditItem] = useState<T | null>(null);
  const [pendingPreset, setPendingPreset] = useState<string | undefined>(undefined);
  const editIdRef = useRef<string | null>(null);
  const returnToRef = useRef<string | null>(null);

  const sheetRef = useRef(sheet);
  sheetRef.current = sheet;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const onLayout = useCallback(() => setLayoutReady(true), []);

  const stashReturnTo = useCallback(() => {
    const target = normalizeParam(returnTo);
    if (!target) return;
    if ((RETURN_TARGETS as readonly string[]).includes(target)) {
      returnToRef.current = target;
      return;
    }
    returnToRef.current = null;
  }, [returnTo]);

  useEffect(() => {
    stashReturnTo();
  }, [stashReturnTo]);

  const maybeReturnTo = useCallback((targetOverride?: string | null) => {
    const target = targetOverride ?? returnToRef.current;
    returnToRef.current = null;
    navigateToReturnTarget(target);
  }, []);

  /** Ajout ; `preset` = type présélectionné (sinon celui par défaut du formulaire). */
  const openAdd = useCallback((preset?: string) => {
    setPendingPreset(preset);
    setPendingEditItem(null);
    setPendingOpen(true);
  }, []);

  const openEdit = useCallback(
    (item: T) => {
      if (isOptimisticId(item.id)) {
        showToast(SAVING_TOAST);
        return;
      }
      setPendingEditItem(item);
      setPendingOpen(true);
    },
    [showToast],
  );

  // Ouvrir automatiquement le formulaire si le paramètre openModal est présent
  useFocusEffect(
    useCallback(() => {
      if (openModal !== "true") return;
      openAdd(parseTabParam?.(tabParam));
    }, [openModal, tabParam, parseTabParam, openAdd]),
  );

  useEffect(() => {
    if (!pendingOpen || !layoutReady) return;
    const returnTarget = returnTargetParam ?? returnToRef.current;
    const editItem = pendingEditItem ?? undefined;
    const preset = pendingPreset;
    const task = InteractionManager.runAfterInteractions(() => {
      stashReturnTo();
      const { formType, ownerId, buildOpenProps, savedToast } = sheetRef.current;
      openSheet({
        ownerId,
        formType,
        ...buildOpenProps({ editItem, addPreset: preset }),
        onSuccess: () => {
          onSavedRef.current();
          if (savedToast) showToast(savedToast(!!editItem));
        },
        onDismiss: () => {
          editIdRef.current = null;
          maybeReturnTo(returnTarget);
        },
      } as Parameters<typeof openSheet>[0]);
      navigation.setParams({ openModal: undefined, editId: undefined } as never);
      setPendingOpen(false);
      setPendingEditItem(null);
    });
    return () => task.cancel?.();
  }, [
    pendingOpen,
    layoutReady,
    pendingEditItem,
    pendingPreset,
    returnTargetParam,
    openSheet,
    navigation,
    showToast,
    stashReturnTo,
    maybeReturnTo,
  ]);

  // Édition demandée par l'URL (editId), une seule fois par id.
  useEffect(() => {
    if (!editId || !layoutReady) return;
    const normalizedId = normalizeParam(editId);
    if (!normalizedId || editIdRef.current === normalizedId) return;
    const target = items.find((item) => item.id === normalizedId);
    if (!target) return;
    stashReturnTo();
    editIdRef.current = normalizedId;
    setPendingEditItem(target);
    setPendingOpen(true);
    navigation.setParams({ openModal: undefined, editId: undefined } as never);
  }, [editId, layoutReady, items, navigation, stashReturnTo]);

  return {
    layoutReady,
    onLayout,
    openAdd,
    openEdit,
    isOpen,
    closeSheet,
    returnTargetParam,
    returnToRef,
  };
}
