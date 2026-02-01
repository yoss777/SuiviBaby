// components/forms/ImmunizationFormSheet.tsx
import React, { useState } from "react";
import { eventColors } from "@/constants/eventColors";
import { ImmunizationForm, ImmunizationType } from "./ImmunizationForm";

export interface ImmunizationFormSheetProps {
  type: ImmunizationType;
  onSuccess: () => void;
  onCancel: () => void;
}

/**
 * This component provides the form content and configuration
 * for the GlobalSheetManager to render inside FormBottomSheet.
 *
 * It returns the necessary props for FormBottomSheet rather than
 * rendering the sheet itself.
 */
export function useImmunizationFormSheet(props: ImmunizationFormSheetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { type, onSuccess, onCancel } = props;

  const title = type === "vaccin" ? "Ajouter un vaccin" : "Ajouter une vitamine";
  const icon = type === "vaccin" ? "syringe" : "pills";
  const accentColor = type === "vaccin"
    ? eventColors.vaccin.dark
    : eventColors.vitamine.dark;

  return {
    // Props for FormBottomSheet
    sheetProps: {
      title,
      icon,
      accentColor,
      isSubmitting,
      showActions: true,
      isEditing: false,
    },
    // The form component to render as children
    formContent: (
      <ImmunizationForm
        type={type}
        onSuccess={onSuccess}
        onCancel={onCancel}
        isSubmitting={isSubmitting}
        setIsSubmitting={setIsSubmitting}
      />
    ),
    // Expose isSubmitting for external control if needed
    isSubmitting,
    setIsSubmitting,
  };
}

// Type for the form configuration that will be passed to GlobalSheetManager
export interface ImmunizationFormConfig {
  formType: "immunization";
  immunizationType: ImmunizationType;
  onSuccess?: () => void;
}
