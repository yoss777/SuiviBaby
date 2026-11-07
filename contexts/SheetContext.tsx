// contexts/SheetContext.tsx
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { BackHandler } from 'react-native';
import type { FormBottomSheetProps } from '@/components/ui/FormBottomSheet';
import type { SoinsType, SoinsEditData } from '@/components/forms/SoinsForm';
import type { MealType, MealsEditData } from '@/components/forms/MealsForm';
import type { PumpingEditData } from '@/components/forms/PumpingForm';
import type { ActiviteType, ActivitiesEditData } from '@/components/forms/ActivitiesForm';
import type { JalonType, MilestonesEditData } from '@/components/forms/MilestonesForm';
import type { DiapersType, DiapersEditData } from '@/components/forms/DiapersForm';
import type { RoutineType, SleepMode, RoutinesEditData } from '@/components/forms/RoutinesForm';
import type { CroissanceEditData } from '@/components/forms/CroissanceForm';

// These are the props that a screen needs to provide to open a form sheet.
// We omit onCancel and onClose because they will be handled internally by the global sheet manager.
export type SheetViewProps = Omit<FormBottomSheetProps, 'onCancel' | 'onClose'> & {
  ownerId: string;
  onDismiss?: () => void;
};

// Props for opening a soins form sheet (temperature, medicament, symptome, vaccin, vitamine)
export type SoinsFormSheetProps = {
  ownerId: string;
  formType: 'soins';
  soinsType: SoinsType;
  onSuccess?: () => void;
  onDismiss?: () => void;
  editData?: SoinsEditData;
};

// Props for opening a meals form sheet (tetee, biberon, solide)
export type MealsFormSheetProps = {
  ownerId: string;
  formType: 'meals';
  mealType: MealType;
  onSuccess?: () => void;
  onDismiss?: () => void;
  editData?: MealsEditData;
};

// Props for opening a pumping form sheet
export type PumpingFormSheetProps = {
  ownerId: string;
  formType: 'pumping';
  onSuccess?: () => void;
  onDismiss?: () => void;
  editData?: PumpingEditData;
};

// Props for opening an activities form sheet
export type ActivitiesFormSheetProps = {
  ownerId: string;
  formType: 'activities';
  activiteType: ActiviteType;
  onSuccess?: () => void;
  onDismiss?: () => void;
  editData?: ActivitiesEditData;
  promenadeEnCours?: { id: string } | null;
};

// Props for opening a milestones form sheet
export type MilestonesFormSheetProps = {
  ownerId: string;
  formType: 'milestones';
  jalonType: JalonType;
  onSuccess?: () => void;
  onCancel?: () => void;
  onDismiss?: () => void;
  editData?: MilestonesEditData;
};

// Props for opening a diapers form sheet (miction, selle)
export type DiapersFormSheetProps = {
  ownerId: string;
  formType: 'diapers';
  diapersType: DiapersType;
  onSuccess?: () => void;
  onDismiss?: () => void;
  editData?: DiapersEditData;
};

// Props for opening a routines form sheet (sommeil, bain)
export type RoutinesFormSheetProps = {
  ownerId: string;
  formType: 'routines';
  routineType: RoutineType;
  sleepMode?: SleepMode;
  onSuccess?: () => void;
  onDismiss?: () => void;
  editData?: RoutinesEditData;
  sommeilEnCours?: { id: string } | null;
};

// Props for opening a croissance form sheet (poids, taille, tete)
export type CroissanceFormSheetProps = {
  ownerId: string;
  formType: 'croissance';
  onSuccess?: () => void;
  onDismiss?: () => void;
  editData?: CroissanceEditData;
};

// Props for opening a content/article reader sheet
export type ContentSheetProps = {
  ownerId: string;
  formType: 'content';
  tipId: string;
  onSuccess?: () => void;
  onDismiss?: () => void;
};

// Union type for form-based sheets
export type FormSheetProps = SoinsFormSheetProps | MealsFormSheetProps | PumpingFormSheetProps | ActivitiesFormSheetProps | MilestonesFormSheetProps | DiapersFormSheetProps | RoutinesFormSheetProps | CroissanceFormSheetProps | ContentSheetProps;

// Union type for all sheet props
export type AnySheetProps = SheetViewProps | FormSheetProps;

// Type guard to check if props are form-based
export function isFormSheetProps(props: AnySheetProps): props is FormSheetProps {
  return 'formType' in props;
}

// Type guard for soins form
export function isSoinsFormProps(props: FormSheetProps): props is SoinsFormSheetProps {
  return props.formType === 'soins';
}

// Type guard for meals form
export function isMealsFormProps(props: FormSheetProps): props is MealsFormSheetProps {
  return props.formType === 'meals';
}

// Type guard for pumping form
export function isPumpingFormProps(props: FormSheetProps): props is PumpingFormSheetProps {
  return props.formType === 'pumping';
}

// Type guard for activities form
export function isActivitiesFormProps(props: FormSheetProps): props is ActivitiesFormSheetProps {
  return props.formType === 'activities';
}

// Type guard for milestones form
export function isMilestonesFormProps(props: FormSheetProps): props is MilestonesFormSheetProps {
  return props.formType === 'milestones';
}

// Type guard for diapers form
export function isDiapersFormProps(props: FormSheetProps): props is DiapersFormSheetProps {
  return props.formType === 'diapers';
}

// Type guard for routines form
export function isRoutinesFormProps(props: FormSheetProps): props is RoutinesFormSheetProps {
  return props.formType === 'routines';
}

// Type guard for croissance form
export function isCroissanceFormProps(props: FormSheetProps): props is CroissanceFormSheetProps {
  return props.formType === 'croissance';
}

// Type guard for content/article reader
export function isContentSheetProps(props: FormSheetProps): props is ContentSheetProps {
  return props.formType === 'content';
}

interface SheetStateType {
  isOpen: boolean;
  viewProps: AnySheetProps | null;
}

interface SheetActionsType {
  openSheet: (props: AnySheetProps) => void;
  closeSheet: () => void;
}

interface SheetContextType extends SheetStateType, SheetActionsType {}

// Deux contextes : l'état change à chaque ouverture/fermeture, les actions sont
// stables. Les écrans qui ne font qu'ouvrir une feuille n'utilisent que les actions.
const SheetStateContext = createContext<SheetStateType | undefined>(undefined);
const SheetActionsContext = createContext<SheetActionsType | undefined>(undefined);

export const SheetProvider = ({ children }: { children: React.ReactNode }) => {
  const [viewProps, setViewProps] = useState<AnySheetProps | null>(null);
  const pendingDismissRef = useRef<(() => void) | null>(null);
  const isOpenRef = useRef(false);

  const openSheet = useCallback((props: AnySheetProps) => {
    setViewProps((prev) => {
      if (prev?.ownerId && prev.ownerId !== props.ownerId) {
        pendingDismissRef.current = prev.onDismiss ?? null;
      }
      return props;
    });
  }, []);

  const closeSheet = useCallback(() => {
    setViewProps((prev) => {
      pendingDismissRef.current = prev?.onDismiss ?? null;
      return null;
    });
  }, []);

  useEffect(() => {
    if (!pendingDismissRef.current) return;
    const dismiss = pendingDismissRef.current;
    pendingDismissRef.current = null;
    dismiss();
  }, [viewProps]);

  useEffect(() => {
    isOpenRef.current = viewProps !== null;
  }, [viewProps]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!isOpenRef.current) return false;
        closeSheet();
        return true;
      },
    );
    return () => subscription.remove();
  }, [closeSheet]);

  const stateValue = useMemo(
    () => ({ isOpen: viewProps !== null, viewProps }),
    [viewProps],
  );
  const actionsValue = useMemo(
    () => ({ openSheet, closeSheet }),
    [openSheet, closeSheet],
  );

  return (
    <SheetActionsContext.Provider value={actionsValue}>
      <SheetStateContext.Provider value={stateValue}>
        {children}
      </SheetStateContext.Provider>
    </SheetActionsContext.Provider>
  );
};

// État de la feuille seul (se met à jour à chaque ouverture/fermeture).
export const useSheetState = (): SheetStateType => {
  const context = useContext(SheetStateContext);
  if (context === undefined) {
    throw new Error('useSheetState must be used within a SheetProvider');
  }
  return context;
};

// Actions seules : identité stable, aucun re-rendu quand la feuille change.
export const useSheetActions = (): SheetActionsType => {
  const context = useContext(SheetActionsContext);
  if (context === undefined) {
    throw new Error('useSheetActions must be used within a SheetProvider');
  }
  return context;
};

// Compatibilité : état + actions (se re-rend avec l'état).
export const useSheet = (): SheetContextType => {
  const state = useContext(SheetStateContext);
  const actions = useContext(SheetActionsContext);
  if (state === undefined || actions === undefined) {
    throw new Error('useSheet must be used within a SheetProvider');
  }
  return useMemo(() => ({ ...state, ...actions }), [state, actions]);
};
