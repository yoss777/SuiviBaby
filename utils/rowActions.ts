// utils/rowActions.ts
// Alternative au glissement pour les lignes d'événements (WCAG 2.5.1) :
// actions d'accessibilité (rotor VoiceOver « Actions », menu TalkBack) et
// menu à l'appui long, avec les mêmes deux actions : Modifier, Supprimer.
import * as Haptics from "expo-haptics";
import {
  ActionSheetIOS,
  Alert,
  Platform,
  type AccessibilityActionEvent,
  type AccessibilityActionInfo,
} from "react-native";

export const ROW_ACTION_EDIT = "activate";
export const ROW_ACTION_DELETE = "delete";

/** Indice lu par VoiceOver / TalkBack sur les lignes qui ont le menu. */
export const ROW_LONG_PRESS_HINT = "Appui long pour modifier ou supprimer";

export function buildRowAccessibilityActions({
  canEdit,
  canDelete,
}: {
  canEdit: boolean;
  canDelete: boolean;
}): AccessibilityActionInfo[] | undefined {
  const actions: AccessibilityActionInfo[] = [];
  if (canEdit) actions.push({ name: ROW_ACTION_EDIT, label: "Modifier" });
  if (canDelete) actions.push({ name: ROW_ACTION_DELETE, label: "Supprimer" });
  return actions.length > 0 ? actions : undefined;
}

export function handleRowAccessibilityAction(
  event: AccessibilityActionEvent,
  handlers: { onEdit?: () => void; onDelete?: () => void },
): void {
  switch (event.nativeEvent.actionName) {
    case ROW_ACTION_EDIT:
      handlers.onEdit?.();
      break;
    case ROW_ACTION_DELETE:
      handlers.onDelete?.();
      break;
    default:
      break;
  }
}

/**
 * Menu de l'appui long : feuille d'actions native sur iOS, boîte de dialogue
 * sur Android. Ne s'ouvre pas s'il n'y a aucune action.
 */
export function showRowActionMenu({
  title,
  onEdit,
  onDelete,
}: {
  title: string;
  onEdit?: () => void;
  onDelete?: () => void;
}): boolean {
  if (!onEdit && !onDelete) return false;
  // Retour tactile léger : le menu s'ouvre sous le doigt (audit V3, N-V3-3).
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)?.catch?.(() => {});
  if (Platform.OS === "ios") {
    const options = [
      ...(onEdit ? ["Modifier"] : []),
      ...(onDelete ? ["Supprimer"] : []),
      "Annuler",
    ];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options,
        cancelButtonIndex: options.length - 1,
        destructiveButtonIndex: onDelete ? options.indexOf("Supprimer") : undefined,
      },
      (index) => {
        const choice = options[index];
        if (choice === "Modifier") onEdit?.();
        else if (choice === "Supprimer") onDelete?.();
      },
    );
    return true;
  }
  Alert.alert(
    title,
    undefined,
    [
      { text: "Annuler", style: "cancel" },
      ...(onDelete
        ? [{ text: "Supprimer", style: "destructive" as const, onPress: onDelete }]
        : []),
      ...(onEdit ? [{ text: "Modifier", onPress: onEdit }] : []),
    ],
    { cancelable: true },
  );
  return true;
}

/**
 * Props à poser sur le Pressable d'une ligne : actions d'accessibilité,
 * indice et menu à l'appui long (Modifier / Supprimer). Rien en mode
 * sélection ni sans action disponible.
 */
export function rowActionProps({
  title,
  onEdit,
  onDelete,
  disabled = false,
}: {
  title: string;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Mode sélection, ligne en cours d'enregistrement… */
  disabled?: boolean;
}): {
  accessibilityActions?: AccessibilityActionInfo[];
  accessibilityHint?: string;
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
  onLongPress?: () => void;
} {
  if (disabled || (!onEdit && !onDelete)) return {};
  return {
    accessibilityActions: buildRowAccessibilityActions({ canEdit: !!onEdit, canDelete: !!onDelete }),
    accessibilityHint: ROW_LONG_PRESS_HINT,
    onAccessibilityAction: (event) => handleRowAccessibilityAction(event, { onEdit, onDelete }),
    onLongPress: () => {
      showRowActionMenu({ title, onEdit, onDelete });
    },
  };
}
