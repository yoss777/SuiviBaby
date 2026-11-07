// S8.1 — les actions des contextes gardent la même identité quand l'état change.
import { act, render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import { ModalProvider, useModal, useModalActions } from "@/contexts/ModalContext";
import { SheetProvider, useSheet, useSheetActions, useSheetState } from "@/contexts/SheetContext";
import { SuccessAnimationProvider, useSuccessAnimation } from "@/contexts/SuccessAnimationContext";
import { ToastProvider, useToast } from "@/contexts/ToastContext";

jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("@gorhom/portal", () => ({ Portal: ({ children }: any) => children }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/ui/SuccessAnimation", () => ({ SuccessAnimation: () => null }));

describe("ModalContext actions stables", () => {
  it("showAlert / showConfirm / hide gardent leur identité malgré l'ouverture d'une modale", () => {
    const seen: any[] = [];
    let renders = 0;
    const Grab = () => {
      renders += 1;
      seen.push(useModalActions());
      useModal();
      return <Text>x</Text>;
    };
    render(<ModalProvider><Grab /></ModalProvider>);
    act(() => seen[0].showAlert("Titre", "Message"));
    act(() => seen[0].showAlert("Titre 2", "Message 2"));
    const first = seen[0];
    expect(seen.every((v) => v === first)).toBe(true);
    expect(renders).toBe(1);
  });
});

describe("ToastContext actions stables", () => {
  it("la valeur ne change pas quand un toast s'affiche", () => {
    const seen: any[] = [];
    const Grab = () => {
      seen.push(useToast());
      return null;
    };
    render(<ToastProvider><Grab /></ToastProvider>);
    act(() => seen[0].showToast("Bonjour"));
    expect(seen.every((v) => v === seen[0])).toBe(true);
  });
});

describe("SuccessAnimationContext actions stables", () => {
  it("showSuccess garde son identité", () => {
    const seen: any[] = [];
    const Grab = () => {
      seen.push(useSuccessAnimation());
      return null;
    };
    render(<SuccessAnimationProvider><Grab /></SuccessAnimationProvider>);
    act(() => seen[0].showSuccess("default", "ok"));
    expect(seen.every((v) => v === seen[0])).toBe(true);
  });
});

describe("SheetContext actions séparées de l'état", () => {
  it("useSheetActions ne se re-rend pas à l'ouverture, useSheetState oui", () => {
    let actionRenders = 0;
    let stateRenders = 0;
    let actions: any;
    const A = () => {
      actionRenders += 1;
      actions = useSheetActions();
      return null;
    };
    const S = () => {
      stateRenders += 1;
      const { isOpen } = useSheetState();
      return <Text>{isOpen ? "open" : "closed"}</Text>;
    };
    let both: any;
    const B = () => {
      both = useSheet();
      return null;
    };
    const { getByText } = render(<SheetProvider><A /><S /><B /></SheetProvider>);
    act(() => actions.openSheet({ ownerId: "c1", formType: "croissance" }));
    expect(getByText("open")).toBeTruthy();
    expect(actionRenders).toBe(1);
    expect(stateRenders).toBe(2);
    expect(both.isOpen).toBe(true);
    expect(both.openSheet).toBe(actions.openSheet);
    act(() => actions.closeSheet());
    expect(getByText("closed")).toBeTruthy();
  });
});
