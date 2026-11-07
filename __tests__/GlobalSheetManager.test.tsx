// S8.3 — clé de montage des formulaires dans la feuille globale.
import { act, render, screen } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";

import { GlobalSheetManager, getSheetKey } from "@/components/ui/GlobalSheetManager";
import { SheetProvider, useSheetActions } from "@/contexts/SheetContext";

const mockMounts = jest.fn();
let mockShouldCrash = false;
let mockSheetCrash = false;

jest.mock("@/hooks/use-color-scheme", () => ({ useColorScheme: () => "light" }));
jest.mock("@/components/ui/FormBottomSheet", () => {
  const R = require("react");
  return {
    FormBottomSheet: R.forwardRef(({ children }: any, _ref: any) => {
      if (mockSheetCrash) throw new Error("sheet crash");
      return children;
    }),
  };
});
jest.mock("@/components/forms/SoinsForm", () => {
  const R = require("react");
  const { Text: T } = require("react-native");
  return {
    SoinsForm: ({ editData }: any) => {
      R.useEffect(() => {
        mockMounts(editData?.id ?? "new");
      }, []);
      if (mockShouldCrash) throw new Error("form crash");
      return <T>{`soins:${editData?.id ?? "new"}`}</T>;
    },
  };
});
jest.mock("@/components/forms/MealsForm", () => ({ MealsForm: () => null }));
jest.mock("@/components/forms/PumpingForm", () => ({ PumpingForm: () => null }));
jest.mock("@/components/forms/ActivitiesForm", () => ({ ActivitiesForm: () => null }));
jest.mock("@/components/forms/MilestonesForm", () => ({ MilestonesForm: () => null }));
jest.mock("@/components/forms/DiapersForm", () => ({ DiapersForm: () => null }));
jest.mock("@/components/forms/RoutinesForm", () => ({ RoutinesForm: () => null }));
jest.mock("@/components/forms/CroissanceForm", () => ({ CroissanceForm: () => null }));
jest.mock("@/components/suivibaby/ArticleReader", () => ({ ArticleReader: () => null }));
jest.mock("@/services/smartContentService", () => ({
  fetchTipById: jest.fn(), bookmarkTip: jest.fn(), removeBookmark: jest.fn(),
  submitTipFeedback: jest.fn(), getUserContentState: jest.fn(),
}));

let actions: ReturnType<typeof useSheetActions>;
const Grab = () => {
  actions = useSheetActions();
  return null;
};
const setup = () =>
  render(
    <SheetProvider>
      <Grab />
      <GlobalSheetManager />
    </SheetProvider>,
  );

const soins = (id?: string, soinsType: any = "temperature") => ({
  ownerId: "c1",
  formType: "soins" as const,
  soinsType,
  editData: id ? ({ id } as any) : undefined,
});

describe("getSheetKey", () => {
  it("dépend du type, du sous-type et de l'événement édité", () => {
    expect(getSheetKey(soins("a") as any)).not.toBe(getSheetKey(soins("b") as any));
    expect(getSheetKey(soins() as any)).not.toBe(getSheetKey(soins("a") as any));
    expect(getSheetKey(soins("a", "vaccin") as any)).not.toBe(getSheetKey(soins("a") as any));
    expect(getSheetKey(soins("a") as any)).toBe(getSheetKey(soins("a") as any));
  });

  it("dépend de sleepMode et promenadeEnCours (lus dans l'état initial)", () => {
    const routine = (sleepMode: any) => ({ ownerId: "c1", formType: "routines", routineType: "sommeil", sleepMode });
    expect(getSheetKey(routine("nap") as any)).not.toBe(getSheetKey(routine("night") as any));
    const act_ = (p: any) => ({ ownerId: "c1", formType: "activities", activiteType: "promenade", promenadeEnCours: p });
    expect(getSheetKey(act_({ id: "x" }) as any)).not.toBe(getSheetKey(act_(null) as any));
  });
});

describe("GlobalSheetManager", () => {
  beforeEach(() => {
    mockMounts.mockClear();
    mockShouldCrash = false;
    mockSheetCrash = false;
  });

  it("monte le formulaire une seule fois à l'ouverture (pas de double montage)", () => {
    setup();
    act(() => actions.openSheet(soins()));
    expect(screen.getByText("soins:new")).toBeTruthy();
    expect(mockMounts).toHaveBeenCalledTimes(1);
  });

  it("un autre événement remonte le formulaire, le même événement non", () => {
    setup();
    act(() => actions.openSheet(soins("a")));
    expect(mockMounts).toHaveBeenCalledTimes(1);
    act(() => actions.openSheet({ ...soins("a") }));
    expect(mockMounts).toHaveBeenCalledTimes(1);
    act(() => actions.openSheet(soins("b")));
    expect(mockMounts).toHaveBeenCalledTimes(2);
    expect(screen.getByText("soins:b")).toBeTruthy();
  });

  it("un formulaire qui plante est isolé : repli avec bouton Fermer, pas de crash de l'app", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockShouldCrash = true;
    setup();
    act(() => actions.openSheet(soins("a")));
    expect(screen.getByText("Ce formulaire n'a pas pu s'afficher")).toBeTruthy();
    expect(require("@sentry/react-native").captureException).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("un crash hors FormBoundary réarme le gestionnaire : l'ouverture suivante rend le formulaire", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    mockSheetCrash = true;
    setup();
    act(() => actions.openSheet(soins("a")));
    expect(screen.queryByText("soins:a")).toBeNull();
    mockSheetCrash = false;
    act(() => actions.openSheet(soins("b")));
    expect(screen.getByText("soins:b")).toBeTruthy();
    spy.mockRestore();
  });
});
