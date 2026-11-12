/* eslint-disable import/first */
// Suppression unitaire sans modale (audit UI/UX V2, R-P1-12) : l'élément
// disparaît tout de suite, « Annuler » le rétablit sans appel serveur, la
// suppression ne part qu'à l'expiration du toast.

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@gorhom/portal", () => ({
  Portal: ({ children }: { children: React.ReactNode }) => children,
}));

import { act, fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import React, { useState } from "react";
import { Text } from "react-native";

import { ToastProvider } from "@/contexts/ToastContext";
import { useDeleteWithUndo } from "@/hooks/useDeleteWithUndo";
import { softDeleteNow, withId } from "@/utils/softDeleteNow";

describe("withId", () => {
  it("ajoute / retire sans recréer l'ensemble inutilement", () => {
    const a = new Set<string>(["x"]);
    expect(withId(a, "x", true)).toBe(a);
    expect(withId(a, "y", false)).toBe(a);
    expect(withId(a, "y", true)).toEqual(new Set(["x", "y"]));
    expect(withId(a, "x", false)).toEqual(new Set());
  });
});

describe("softDeleteNow", () => {
  it("masque tout de suite et branche annuler / rétablir / re-masquer", () => {
    const schedule = jest.fn();
    const { result } = renderHook(() => useState<Set<string>>(new Set()));
    const run = jest.fn();

    act(() =>
      softDeleteNow({
        id: "e1",
        message: "Événement supprimé",
        run,
        setHiddenIds: result.current[1],
        scheduleDelete: schedule,
      }),
    );
    expect(result.current[0].has("e1")).toBe(true);
    expect(run).not.toHaveBeenCalled();

    const params = schedule.mock.calls[0][0];
    expect(params.message).toBe("Événement supprimé");
    expect(params.run).toBe(run);
    act(() => params.onUndo());
    expect(result.current[0].has("e1")).toBe(false);
    act(() => params.onHide());
    expect(result.current[0].has("e1")).toBe(true);
    act(() => params.onRestore());
    expect(result.current[0].has("e1")).toBe(false);
  });
});

function Harness({ run }: { run: () => Promise<{ status: "deleted" }> }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const scheduleDelete = useDeleteWithUndo();
  return (
    <>
      {!hidden.has("e1") && <Text>Ligne e1</Text>}
      <Text
        onPress={() =>
          softDeleteNow({ id: "e1", message: "Événement supprimé", run, setHiddenIds: setHidden, scheduleDelete })
        }
      >
        Supprimer
      </Text>
    </>
  );
}

describe("flux complet avec le toast", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("Annuler rétablit la ligne et n'appelle jamais le serveur", () => {
    const run = jest.fn(() => Promise.resolve({ status: "deleted" as const }));
    render(
      <ToastProvider>
        <Harness run={run} />
      </ToastProvider>,
    );
    fireEvent.press(screen.getByText("Supprimer"));
    expect(screen.queryByText("Ligne e1")).toBeNull();
    expect(screen.getByText("Événement supprimé")).toBeTruthy();

    fireEvent.press(screen.getByText("Annuler"));
    expect(screen.getByText("Ligne e1")).toBeTruthy();
    act(() => {
      jest.advanceTimersByTime(20_000);
    });
    expect(run).not.toHaveBeenCalled();
  });

  it("sans annulation, la suppression part à l'expiration du toast", async () => {
    const run = jest.fn(() => Promise.resolve({ status: "deleted" as const }));
    render(
      <ToastProvider>
        <Harness run={run} />
      </ToastProvider>,
    );
    fireEvent.press(screen.getByText("Supprimer"));
    expect(run).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(20_000);
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Ligne e1")).toBeNull();
  });
});
