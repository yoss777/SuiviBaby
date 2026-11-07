// components/ui/GlobalSheetManager.tsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import BottomSheet from '@gorhom/bottom-sheet';
import { SafeBoundary } from '@/components/SafeBoundary';
import { useSheetState, useSheetActions, isFormSheetProps, isSoinsFormProps, isMealsFormProps, isPumpingFormProps, isActivitiesFormProps, isMilestonesFormProps, isDiapersFormProps, isRoutinesFormProps, isCroissanceFormProps, isContentSheetProps } from '@/contexts/SheetContext';
import { FormBottomSheet } from './FormBottomSheet';
import { SoinsForm } from '@/components/forms/SoinsForm';
import { MealsForm } from '@/components/forms/MealsForm';
import { PumpingForm } from '@/components/forms/PumpingForm';
import { ActivitiesForm } from '@/components/forms/ActivitiesForm';
import { MilestonesForm } from '@/components/forms/MilestonesForm';
import { DiapersForm } from '@/components/forms/DiapersForm';
import { RoutinesForm } from '@/components/forms/RoutinesForm';
import { CroissanceForm } from '@/components/forms/CroissanceForm';
import { ArticleReader } from '@/components/suivibaby/ArticleReader';
import { eventColors } from '@/constants/eventColors';
import { Colors } from '@/constants/theme';
import { getNeutralColors } from '@/constants/dashboardColors';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchTipById, bookmarkTip, removeBookmark, submitTipFeedback, getUserContentState } from '@/services/smartContentService';
import type { Tip, UserContent } from '@/types/content';
import type { AnySheetProps } from '@/contexts/SheetContext';

// Clé de montage d'une feuille : type de formulaire + sous-type + événement édité
// (+ enfant). Un autre formulaire ou un autre événement remonte le formulaire
// (aucun état résiduel) ; le même événement rouvert pendant que la feuille est
// ouverte ne le remonte pas.
export function getSheetKey(props: AnySheetProps | null): string {
  if (!props) return 'closed';
  if (!isFormSheetProps(props)) return `view:${props.ownerId}`;
  let subtype = '';
  let editId: string | undefined;
  if (isSoinsFormProps(props)) {
    subtype = props.soinsType;
    editId = props.editData?.id;
  } else if (isMealsFormProps(props)) {
    subtype = props.mealType;
    editId = props.editData?.id;
  } else if (isPumpingFormProps(props)) {
    editId = props.editData?.id;
  } else if (isActivitiesFormProps(props)) {
    // promenadeEnCours est lu dans l'état initial du formulaire : il fait partie de la clé.
    subtype = `${props.activiteType}:${props.promenadeEnCours?.id ?? 'none'}`;
    editId = props.editData?.id;
  } else if (isMilestonesFormProps(props)) {
    subtype = props.jalonType;
    editId = props.editData?.id;
  } else if (isDiapersFormProps(props)) {
    subtype = props.diapersType;
    editId = props.editData?.id;
  } else if (isRoutinesFormProps(props)) {
    // sleepMode est lu dans l'état initial du formulaire : il fait partie de la clé.
    subtype = `${props.routineType}:${props.sleepMode ?? 'nap'}`;
    editId = props.editData?.id;
  } else if (isCroissanceFormProps(props)) {
    editId = props.editData?.id;
  } else if (isContentSheetProps(props)) {
    subtype = props.tipId;
  }
  return `${props.ownerId}:${props.formType}:${subtype}:${editId ?? 'new'}`;
}

// Repli affiché à la place d'un formulaire qui a planté : la feuille reste
// fermable, le reste de l'app n'est pas touché. Couleurs du thème (mode sombre).
function FormCrashFallback({ onClose, onCrash }: { onClose: () => void; onCrash?: () => void }) {
  const colorScheme = useColorScheme() ?? 'light';
  const neutral = getNeutralColors(colorScheme);
  // Un formulaire planté en plein sélecteur ne doit pas bloquer la fermeture par glissement.
  useEffect(() => {
    onCrash?.();
  }, [onCrash]);
  return (
    <View style={fallbackStyles.container} accessibilityRole="alert">
      <Text style={[fallbackStyles.title, { color: neutral.errorText }]}>Ce formulaire n&apos;a pas pu s&apos;afficher</Text>
      <Text style={[fallbackStyles.message, { color: neutral.textNormal }]}>
        L&apos;équipe a été notifiée. Vous pouvez fermer cette fenêtre et réessayer.
      </Text>
      <Pressable
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Fermer"
        style={[fallbackStyles.button, { backgroundColor: Colors[colorScheme].tint }]}
      >
        <Text style={fallbackStyles.buttonText}>Fermer</Text>
      </Pressable>
    </View>
  );
}

const fallbackStyles = StyleSheet.create({
  container: { padding: 24, alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  message: { fontSize: 14, textAlign: 'center' },
  button: { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
});

// Boundary d'un formulaire : un crash de rendu n'emporte que la feuille.
function FormBoundary({
  name,
  onClose,
  onCrash,
  children,
}: {
  name: string;
  onClose: () => void;
  onCrash?: () => void;
  children: React.ReactNode;
}) {
  return (
    <SafeBoundary name={`sheet.${name}`} fallback={<FormCrashFallback onClose={onClose} onCrash={onCrash} />}>
      {children}
    </SafeBoundary>
  );
}

const SOINS_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  temperature: { label: "Température", color: eventColors.temperature.dark, icon: "temperature-half" },
  medicament: { label: "Médicament", color: eventColors.medicament.dark, icon: "pills" },
  symptome: { label: "Symptôme", color: eventColors.symptome.dark, icon: "virus" },
  vaccin: { label: "Vaccin", color: eventColors.vaccin.dark, icon: "syringe" },
  vitamine: { label: "Vitamine", color: eventColors.vitamine.dark, icon: "pills" },
};

// Internal component for content sheet
function ContentSheetContent({ tipId, onClose }: { tipId: string; onClose: () => void }) {
  const colorScheme = useColorScheme() ?? 'light';
  const [tip, setTip] = React.useState<Tip | null>(null);
  const [userContent, setUserContent] = React.useState<UserContent | null>(null);

  React.useEffect(() => {
    let mounted = true;
    Promise.all([fetchTipById(tipId), getUserContentState()])
      .then(([t, uc]) => {
        if (mounted) {
          setTip(t);
          setUserContent(uc);
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [tipId]);

  const handleBookmark = React.useCallback(async (id: string) => {
    if (!userContent) return;
    const isBookmarked = userContent.bookmarks.includes(id);
    if (isBookmarked) {
      await removeBookmark(id);
      setUserContent(prev => prev ? { ...prev, bookmarks: prev.bookmarks.filter(b => b !== id) } : prev);
    } else {
      await bookmarkTip(id);
      setUserContent(prev => prev ? { ...prev, bookmarks: [...prev.bookmarks, id] } : prev);
    }
  }, [userContent]);

  const handleFeedback = React.useCallback(async (id: string, fb: 'up' | 'down') => {
    await submitTipFeedback(id, fb);
    setUserContent(prev => prev ? { ...prev, tipFeedback: { ...prev.tipFeedback, [id]: fb } } : prev);
  }, []);

  if (!tip) return null;

  return (
    <ArticleReader
      tip={tip}
      isBookmarked={userContent?.bookmarks.includes(tipId) ?? false}
      feedback={userContent?.tipFeedback?.[tipId] ?? null}
      onBookmark={handleBookmark}
      onFeedback={handleFeedback}
      onClose={onClose}
      colorScheme={colorScheme}
    />
  );
}

const GlobalSheetManagerInner = () => {
  const colorScheme = useColorScheme() ?? 'light';
  const { isOpen, viewProps } = useSheetState();
  const { closeSheet } = useSheetActions();
  const sheetRef = useRef<BottomSheet>(null);
  const formKey = getSheetKey(viewProps);
  const viewPropsRef = useRef(viewProps);
  viewPropsRef.current = viewProps;
  const [isInPicker, setIsInPicker] = useState(false);
  const [activeRoutineSheet, setActiveRoutineSheet] = useState<"nap" | "night" | "bain" | "nez">("nap");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Reset states when opening (ou quand un autre formulaire/événement
      // remplace la feuille ouverte : la clé change, le formulaire est remonté)
      setIsInPicker(false);
      setIsSubmitting(false);
      // Initialize routine sheet type from viewProps
      const current = viewPropsRef.current;
      if (current && isFormSheetProps(current) && isRoutinesFormProps(current)) {
        const rt = current.routineType;
        setActiveRoutineSheet(
          rt === "bain" ? "bain" : rt === "nettoyage_nez" ? "nez" : (current.sleepMode === "night" ? "night" : "nap")
        );
      }
      sheetRef.current?.snapToIndex(1);
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen, formKey]);

  const resetPicker = useCallback(() => setIsInPicker(false), []);

  const handleFormStepChange = useCallback((inPicker: boolean) => {
    setIsInPicker(inPicker);
  }, []);

  const handleSuccess = useCallback(() => {
    if (viewProps && isFormSheetProps(viewProps)) {
      viewProps.onSuccess?.();
    }
    closeSheet();
  }, [viewProps, closeSheet]);

  if (!viewProps) {
    return null;
  }

  // Handle form-based sheets
  if (isFormSheetProps(viewProps)) {
    // Handle soins form (temperature, medicament, symptome, vaccin, vitamine)
    if (isSoinsFormProps(viewProps)) {
      const { soinsType, editData } = viewProps;
      const isEditing = !!editData;
      const config = SOINS_TYPE_CONFIG[soinsType] ?? SOINS_TYPE_CONFIG.temperature;
      const title = isEditing ? `Modifier` : `Nouveau`;

      return (
        <FormBottomSheet
          ref={sheetRef}
          initialIndex={1}
          title={title}
          icon="prescription-bottle"
          accentColor={config.color}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
          <FormBoundary key={formKey} name="SoinsForm" onClose={closeSheet} onCrash={resetPicker}>
            <SoinsForm
              key={formKey}
              initialType={soinsType}
              onSuccess={handleSuccess}
              onCancel={closeSheet}
              isSubmitting={isSubmitting}
              setIsSubmitting={setIsSubmitting}
              onFormStepChange={handleFormStepChange}
              editData={editData}
              onDelete={closeSheet}
            />
          </FormBoundary>
        </FormBottomSheet>
      );
    }

    // Handle meals form (tetee, biberon, solide)
    if (isMealsFormProps(viewProps)) {
      const { mealType, editData } = viewProps;
      const isEditing = !!editData;
      const title = isEditing ? 'Modifier le repas' : 'Nouveau repas';

      return (
        <FormBottomSheet
          ref={sheetRef}
          initialIndex={1}
          title={title}
          icon="baby"
          accentColor={eventColors.meal.dark}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
          <FormBoundary key={formKey} name="MealsForm" onClose={closeSheet} onCrash={resetPicker}>
            <MealsForm
              key={formKey}
              initialType={mealType}
              onSuccess={handleSuccess}
              onCancel={closeSheet}
              isSubmitting={isSubmitting}
              setIsSubmitting={setIsSubmitting}
              onFormStepChange={handleFormStepChange}
              editData={editData}
              onDelete={closeSheet}
            />
          </FormBoundary>
        </FormBottomSheet>
      );
    }

    // Handle pumping form
    if (isPumpingFormProps(viewProps)) {
      const { editData } = viewProps;
      const isEditing = !!editData;
      const title = isEditing ? 'Modifier la session' : 'Nouvelle session';

      return (
        <FormBottomSheet
          ref={sheetRef}
          initialIndex={1}
          title={title}
          icon="pump-medical"
          accentColor={eventColors.pumping.dark}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
          <FormBoundary key={formKey} name="PumpingForm" onClose={closeSheet} onCrash={resetPicker}>
            <PumpingForm
              key={formKey}
              onSuccess={handleSuccess}
              onCancel={closeSheet}
              isSubmitting={isSubmitting}
              setIsSubmitting={setIsSubmitting}
              onFormStepChange={handleFormStepChange}
              editData={editData}
              onDelete={closeSheet}
            />
          </FormBoundary>
        </FormBottomSheet>
      );
    }

    // Handle activities form
    if (isActivitiesFormProps(viewProps)) {
      const { activiteType, editData } = viewProps;
      const isEditing = !!editData;
      const title = isEditing ? "Modifier l'activité" : 'Nouvelle activité';

      return (
        <FormBottomSheet
          ref={sheetRef}
          initialIndex={1}
          title={title}
          icon="play-circle"
          accentColor={eventColors.activite.dark}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
          <FormBoundary key={formKey} name="ActivitiesForm" onClose={closeSheet} onCrash={resetPicker}>
            <ActivitiesForm
              key={formKey}
              initialType={activiteType}
              onSuccess={handleSuccess}
              onCancel={closeSheet}
              isSubmitting={isSubmitting}
              setIsSubmitting={setIsSubmitting}
              onFormStepChange={handleFormStepChange}
              editData={editData}
              onDelete={closeSheet}
              promenadeEnCours={viewProps.promenadeEnCours}
            />
          </FormBoundary>
        </FormBottomSheet>
      );
    }

    // Handle milestones form
    if (isMilestonesFormProps(viewProps)) {
      const { jalonType, editData, onCancel } = viewProps;
      const isEditing = !!editData;
      const title = isEditing ? 'Modifier le jalon' : 'Nouveau jalon';

      const handleCancel = () => {
        closeSheet();
        onCancel?.();
      };

      return (
        <FormBottomSheet
          ref={sheetRef}
          initialIndex={1}
          title={title}
          icon="star"
          accentColor={eventColors.jalon.dark}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={handleCancel}
          onClose={handleCancel}
        >
          <FormBoundary key={formKey} name="MilestonesForm" onClose={handleCancel} onCrash={resetPicker}>
            <MilestonesForm
              key={formKey}
              initialType={jalonType}
              onSuccess={handleSuccess}
              onCancel={handleCancel}
              isSubmitting={isSubmitting}
              setIsSubmitting={setIsSubmitting}
              onFormStepChange={handleFormStepChange}
              editData={editData}
              onDelete={closeSheet}
            />
          </FormBoundary>
        </FormBottomSheet>
      );
    }

    // Handle diapers form (miction, selle)
    if (isDiapersFormProps(viewProps)) {
      const { diapersType, editData } = viewProps;
      const isEditing = !!editData;
      const isMiction = diapersType === 'miction';
      const title = isEditing
        ? (isMiction ? 'Modifier la miction' : 'Modifier la selle')
        : (isMiction ? 'Nouvelle miction' : 'Nouvelle selle');
      const icon = isMiction ? 'droplet' : 'poop';
      const accentColor = isMiction ? eventColors.miction.dark : eventColors.selle.dark;

      return (
        <FormBottomSheet
          ref={sheetRef}
          initialIndex={1}
          title={title}
          icon={icon}
          accentColor={accentColor}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
          <FormBoundary key={formKey} name="DiapersForm" onClose={closeSheet} onCrash={resetPicker}>
            <DiapersForm
              key={formKey}
              initialType={diapersType}
              onSuccess={handleSuccess}
              onCancel={closeSheet}
              isSubmitting={isSubmitting}
              setIsSubmitting={setIsSubmitting}
              onFormStepChange={handleFormStepChange}
              editData={editData}
              onDelete={closeSheet}
            />
          </FormBoundary>
        </FormBottomSheet>
      );
    }

    // Handle routines form (sommeil, bain, nettoyage_nez)
    if (isRoutinesFormProps(viewProps)) {
      const { routineType, sleepMode, editData, sommeilEnCours } = viewProps;
      const isEditing = !!editData;

      const getRoutineSheetInfo = (sheetType: "nap" | "night" | "bain" | "nez") => {
        switch (sheetType) {
          case "bain":
            return {
              title: isEditing ? "Modifier le bain" : "Nouveau bain",
              icon: "bath",
              iconLib: "fa6" as const,
              accentColor: eventColors.bain.dark,
            };
          case "nez":
            return {
              title: isEditing ? "Modifier le soin" : "Nouveau soin",
              icon: "eyedropper",
              iconLib: "mci" as const,
              accentColor: eventColors.nettoyage_nez.dark,
            };
          default:
            return {
              title: isEditing ? "Modifier le sommeil" : "Nouveau sommeil",
              icon: "bed",
              iconLib: "fa6" as const,
              accentColor: eventColors.sommeil.dark,
            };
        }
      };

      const { title, icon, iconLib, accentColor } = getRoutineSheetInfo(activeRoutineSheet);

      return (
        <FormBottomSheet
          ref={sheetRef}
          initialIndex={1}
          title={title}
          icon={icon}
          iconLib={iconLib}
          accentColor={accentColor}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
          <FormBoundary key={formKey} name="RoutinesForm" onClose={closeSheet} onCrash={resetPicker}>
            <RoutinesForm
              key={formKey}
              initialType={routineType}
              initialSleepMode={sleepMode}
              onSuccess={handleSuccess}
              onCancel={closeSheet}
              isSubmitting={isSubmitting}
              setIsSubmitting={setIsSubmitting}
              onFormStepChange={handleFormStepChange}
              editData={editData}
              onDelete={closeSheet}
              sommeilEnCours={sommeilEnCours}
              onSheetTypeChange={setActiveRoutineSheet}
            />
          </FormBoundary>
        </FormBottomSheet>
      );
    }

    // Handle croissance form (poids, taille, tete)
    if (isCroissanceFormProps(viewProps)) {
      const { editData } = viewProps;
      const isEditing = !!editData;
      const title = isEditing ? 'Modifier la mesure' : 'Nouvelle mesure';

      return (
        <FormBottomSheet
          ref={sheetRef}
          initialIndex={1}
          title={title}
          icon="seedling"
          accentColor={eventColors.croissance.dark}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
          <FormBoundary key={formKey} name="CroissanceForm" onClose={closeSheet} onCrash={resetPicker}>
            <CroissanceForm
              key={formKey}
              onSuccess={handleSuccess}
              onCancel={closeSheet}
              isSubmitting={isSubmitting}
              setIsSubmitting={setIsSubmitting}
              onFormStepChange={handleFormStepChange}
              editData={editData}
              onDelete={closeSheet}
            />
          </FormBoundary>
        </FormBottomSheet>
      );
    }

    // Handle content/article reader sheet
    if (isContentSheetProps(viewProps)) {
      // ArticleReader is rendered via useSmartContent hook directly
      // The sheet just provides the container
      return (
        <FormBottomSheet
          ref={sheetRef}
          initialIndex={1}
          title="Conseil"
          icon="lightbulb"
          accentColor={Colors[colorScheme].tint}
          showActions={false}
          enablePanDownToClose={true}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
          <FormBoundary key={formKey} name="ContentSheet" onClose={closeSheet} onCrash={resetPicker}>
            <ContentSheetContent tipId={viewProps.tipId} onClose={closeSheet} />
          </FormBoundary>
        </FormBottomSheet>
      );
    }
  }

  // Handle regular sheet props (with children)
  return (
    <FormBottomSheet
      ref={sheetRef}
      initialIndex={1}
      {...viewProps}
      onCancel={closeSheet}
      onClose={closeSheet}
    />
  );
};

// Repli du gestionnaire entier : un crash hors FormBoundary (titre, icône,
// FormBottomSheet...) laisse viewProps non nul ; sans reset, la clé de la
// boundary resterait « open » et plus rien ne s'afficherait. On ferme donc la
// feuille (état remis à zéro) : l'ouverture suivante réarme la boundary.
function SheetCrashReset() {
  const { closeSheet } = useSheetActions();
  useEffect(() => {
    closeSheet();
  }, [closeSheet]);
  return null;
}

// Le gestionnaire entier est isolé : un crash de la feuille ne doit pas faire
// tomber l'app. La clé change à la fermeture, ce qui réarme la boundary après
// un crash (le repli ferme la feuille pour que l'état se réinitialise).
export const GlobalSheetManager = () => {
  const { viewProps } = useSheetState();
  return (
    <SafeBoundary key={viewProps ? 'open' : 'closed'} name="GlobalSheetManager" fallback={<SheetCrashReset />}>
      <GlobalSheetManagerInner />
    </SafeBoundary>
  );
};
