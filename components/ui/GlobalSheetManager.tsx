// components/ui/GlobalSheetManager.tsx
import React, { useRef, useEffect, useState, useCallback } from 'react';
import BottomSheet from '@gorhom/bottom-sheet';
import { useSheet, isFormSheetProps, isImmunizationFormProps, isSoinsFormProps, isMealsFormProps, isPumpingFormProps, isActivitiesFormProps, isMilestonesFormProps, isDiapersFormProps, isRoutinesFormProps, isCroissanceFormProps } from '@/contexts/SheetContext';
import { FormBottomSheet } from './FormBottomSheet';
import { ImmunizationForm } from '@/components/forms/ImmunizationForm';
import { SoinsForm } from '@/components/forms/SoinsForm';
import { MealsForm } from '@/components/forms/MealsForm';
import { PumpingForm } from '@/components/forms/PumpingForm';
import { ActivitiesForm } from '@/components/forms/ActivitiesForm';
import { MilestonesForm } from '@/components/forms/MilestonesForm';
import { DiapersForm } from '@/components/forms/DiapersForm';
import { RoutinesForm } from '@/components/forms/RoutinesForm';
import { CroissanceForm } from '@/components/forms/CroissanceForm';
import { eventColors } from '@/constants/eventColors';
import { Colors } from '@/constants/theme';

const SOINS_TYPE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  temperature: { label: "Température", color: eventColors.temperature.dark, icon: "temperature-half" },
  medicament: { label: "Médicament", color: eventColors.medicament.dark, icon: "pills" },
  symptome: { label: "Symptôme", color: eventColors.symptome.dark, icon: "virus" },
  vaccin: { label: "Vaccin", color: eventColors.vaccin.dark, icon: "syringe" },
  vitamine: { label: "Vitamine", color: eventColors.vitamine.dark, icon: "pills" },
};

export const GlobalSheetManager = () => {
  const { isOpen, viewProps, closeSheet } = useSheet();
  const sheetRef = useRef<BottomSheet>(null);
  const [formKey, setFormKey] = useState(0);
  const [isInPicker, setIsInPicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // Reset states when opening
      setFormKey((k) => k + 1);
      setIsInPicker(false);
      setIsSubmitting(false);
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
    // Handle immunization form (legacy - vaccin/vitamine only)
    if (isImmunizationFormProps(viewProps)) {
      const { immunizationType, editData } = viewProps;
      const isEditing = !!editData;
      const title = isEditing
        ? (immunizationType === 'vaccin' ? 'Modifier le vaccin' : 'Modifier la vitamine')
        : (immunizationType === 'vaccin' ? 'Ajouter un vaccin' : 'Ajouter une vitamine');
      const icon = immunizationType === 'vaccin' ? 'syringe' : 'pills';
      const accentColor = immunizationType === 'vaccin'
        ? eventColors.vaccin.dark
        : eventColors.vitamine.dark;

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
          <ImmunizationForm
            key={formKey}
            type={immunizationType}
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
          enablePanDownToClose={true}
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
          />
        </FormBottomSheet>
      );
    }

    // Handle milestones form
    if (isMilestonesFormProps(viewProps)) {
      const { jalonType, editData } = viewProps;
      const isEditing = !!editData;
      const title = isEditing ? 'Modifier le jalon' : 'Nouveau jalon';

      return (
        <FormBottomSheet
          ref={sheetRef}
          title={title}
          icon="star"
          accentColor={eventColors.jalon.dark}
          showActions={false}
          enablePanDownToClose={!isInPicker}
          onSubmit={() => {}}
          onCancel={closeSheet}
          onClose={closeSheet}
        >
          <MilestonesForm
            key={formKey}
            initialType={jalonType}
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

    // Handle routines form (sommeil, bain)
    if (isRoutinesFormProps(viewProps)) {
      const { routineType, sleepMode, editData, sommeilEnCours } = viewProps;
      const isEditing = !!editData;
      const isBain = routineType === 'bain';
      const title = isEditing
        ? (isBain ? 'Modifier le bain' : 'Modifier le sommeil')
        : (isBain ? 'Nouveau bain' : 'Nouveau sommeil');
      const icon = isBain ? 'bath' : 'bed';
      const accentColor = isBain ? eventColors.bain.dark : eventColors.sommeil.dark;

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
          accentColor="#8BCF9B"
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
