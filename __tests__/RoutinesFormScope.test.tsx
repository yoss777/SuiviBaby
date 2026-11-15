// Formulaire sommeil / hygiène : ouvert en sommeil, seulement Sieste et Nuit ;
// ouvert en bain ou nez, seulement Bain et Nez (deux grands boutons).
import { render, screen } from "@testing-library/react-native";
import React from "react";

import { RoutinesForm } from "@/components/forms/RoutinesForm";

jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("@/contexts/BabyContext", () => ({
  useBaby: () => ({ activeChild: { id: "c1", name: "Léa" } }),
}));
jest.mock("@/contexts/ModalContext", () => ({
  useModal: () => ({ showAlert: jest.fn(), showConfirm: jest.fn() }),
}));
jest.mock("@/contexts/ToastContext", () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));
jest.mock("@/contexts/SuccessAnimationContext", () => ({
  useSuccessAnimation: () => ({ showSuccess: jest.fn() }),
}));
jest.mock("@/services/eventsService", () => ({
  ajouterEvenementOptimistic: jest.fn(),
  modifierEvenementOptimistic: jest.fn(),
  supprimerEvenement: jest.fn(),
  obtenirEvenements: jest.fn(() => Promise.resolve([])),
}));
jest.mock("@/components/ui/DateTimeSectionRow", () => ({ DateTimeSectionRow: () => null }));

const renderForm = (props: Partial<React.ComponentProps<typeof RoutinesForm>>) =>
  render(
    <RoutinesForm isSubmitting={false} setIsSubmitting={jest.fn()} sommeilEnCours={null} {...props} />,
  );

it("ouvert en sommeil : Sieste et Nuit seulement", () => {
  renderForm({ initialType: "sommeil", initialSleepMode: "nap" });
  expect(screen.getByLabelText("Sieste")).toBeTruthy();
  expect(screen.getByLabelText("Nuit")).toBeTruthy();
  expect(screen.queryByLabelText("Bain")).toBeNull();
  expect(screen.queryByLabelText("Nez")).toBeNull();
});

it("ouvert en bain : Bain et Nez seulement", () => {
  renderForm({ initialType: "bain" });
  expect(screen.getByLabelText("Bain")).toBeTruthy();
  expect(screen.getByLabelText("Nez")).toBeTruthy();
  expect(screen.queryByLabelText("Sieste")).toBeNull();
  expect(screen.queryByLabelText("Nuit")).toBeNull();
});

it("ouvert en nez : Bain et Nez seulement", () => {
  renderForm({ initialType: "nettoyage_nez" });
  expect(screen.getByLabelText("Nez")).toBeTruthy();
  expect(screen.queryByLabelText("Sieste")).toBeNull();
});
