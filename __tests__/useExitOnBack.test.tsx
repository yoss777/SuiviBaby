import { renderHook } from "@testing-library/react-native";
import { BackHandler, Platform } from "react-native";

import { useExitOnBack } from "@/hooks/useExitOnBack";

jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react");
  return { useFocusEffect: (effect: () => void | (() => void)) => useEffect(effect, [effect]) };
});

describe("useExitOnBack (écrans racine Android)", () => {
  let handler: (() => boolean) | undefined;
  const remove = jest.fn();

  afterEach(() => jest.restoreAllMocks());

  beforeEach(() => {
    handler = undefined;
    remove.mockClear();
    Platform.OS = "android";
    jest.spyOn(BackHandler, "addEventListener").mockImplementation((_e, h) => {
      handler = h as () => boolean;
      return { remove };
    });
    jest.spyOn(BackHandler, "exitApp").mockImplementation(() => {});
  });

  it("ferme l'application au lieu de dépiler vers un écran vide", () => {
    renderHook(() => useExitOnBack());
    expect(handler?.()).toBe(true);
    expect(BackHandler.exitApp).toHaveBeenCalled();
  });

  it("laisse onBack consommer l'appui d'abord (mode inscription)", () => {
    renderHook(() => useExitOnBack(() => true));
    expect(handler?.()).toBe(true);
    expect(BackHandler.exitApp).not.toHaveBeenCalled();
  });

  it("retire l'écouteur quand l'écran perd le focus", () => {
    const { unmount } = renderHook(() => useExitOnBack());
    unmount();
    expect(remove).toHaveBeenCalled();
  });
});
