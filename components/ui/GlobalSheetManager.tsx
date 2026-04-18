// components/ui/GlobalSheetManager.tsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import BottomSheet from '@gorhom/bottom-sheet';
import { useSheet, isFormSheetProps, isSoinsFormProps, isMealsFormProps, isPumpingFormProps, isActivitiesFormProps, isMilestonesFormProps, isDiapersFormProps, isRoutinesFormProps, isCroissanceFormProps, isContentSheetProps } from '@/contexts/SheetContext';
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
import { useColorScheme } from '@/hooks/use-color-scheme';
import { fetchTipById, bookmarkTip, removeBookmark, submitTipFeedback, getUserContentState } from '@/services/smartContentService';
import type { Tip, UserContent } from '@/types/content';

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

export const GlobalSheetManager = () => {
  const colorScheme = useColorScheme() ?? 'light';
  const { isOpen, viewProps, closeSheet } = useSheet();
  const sheetRef = useRef<BottomSheet>(null);
  const [formKey, setFormKey] = useState(0);
  const [isInPicker, setIsInPicker] = useState(false);
  const [activeRoutineSheet, setActiveRoutineSheet] = useState<"nap" | "night" | "bain" | "nez">("nap");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Reset states when opening
      setFormKey((k) => k + 1);
      setIsInPicker(false);
      setIsSubmitting(false);
      // Initialize routine sheet type from viewProps
      if (viewProps && isFormSheetProps(viewProps) && isRoutinesFormProps(viewProps)) {
        const rt = viewProps.routineType;
        setActiveRoutineSheet(
          rt === "bain" ? "bain" : rt === "nettoyage_nez" ? "nez" : (viewProps.sleepMode === "night" ? "night" : "nap")
        );
      }
      sheetRef.current?.snapToIndex(1);
    } else {
      sheetRef.current?.close();
    }
  }, [isOpen]);

  const handleFormStepChange = useCallback((inPicker: boolean) => {
    setIsInPicker(inPicker);
  }, []);

  const handleSuccess = useCallback(() => {
    if (viewProps && isFormSheetProps(viewProps)) {
      viewProps.onSuccess?.();
    }
    closeSheet();
  }, [viewProps, closeSheet]);

  // Handle form-based sheets
  if (viewProps && isFormSheetProps(viewProps)) {
    // Handle soins form (temperature, medicament, symptome, vaccin, vitamine)
    if (isSoinsFormProps(viewProps)) {
      const { soinsType, editData } = viewProps;
      const isEditing = !!editData;
      const config = SOINS_TYPE_CONFIG[soinsType] ?? SOINS_TYPE_CONFIG.temperature;
      const title = isEditing ? `Modifier` : `Nouveau`;

      return (
        <FormBottomSheet
          ref={sheetRef}
          title={title}
          icon="prescription-bottle"
          accentColor={config.color}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
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
          title={title}
          icon="baby"
          accentColor={eventColors.meal.dark}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
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
          title={title}
          icon="pump-medical"
          accentColor={eventColors.pumping.dark}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
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
          title={title}
          icon="play-circle"
          accentColor={eventColors.activite.dark}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
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
          title={title}
          icon="star"
          accentColor={eventColors.jalon.dark}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={handleCancel}
          onClose={handleCancel}
        >
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
          title={title}
          icon={icon}
          accentColor={accentColor}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
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
          title={title}
          icon="seedling"
          accentColor={eventColors.croissance.dark}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
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
          title="Conseil"
          icon="lightbulb"
          accentColor={Colors[colorScheme].tint}
          showActions={false}
          enablePanDownToClose={true}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
          <ContentSheetContent tipId={viewProps.tipId} onClose={closeSheet} />
        </FormBottomSheet>
      );
    }
  }

  // Handle regular sheet props (with children)
  const activeProps = viewProps && !isFormSheetProps(viewProps)
    ? viewProps
    : {
        title: '',
        children: null,
        showActions: false,
        onSubmit: () => {},
      };

  return (
    <FormBottomSheet
      ref={sheetRef}
      {...activeProps}
      onCancel={closeSheet}
      onClose={closeSheet}
    />
  );
};
