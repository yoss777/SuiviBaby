import { act, renderHook } from "@testing-library/react-native";

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
let mockPathname = "/settings";
let mockParams: Record<string, string> = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, navigate: mockNavigate }),
  usePathname: () => mockPathname,
  useGlobalSearchParams: () => mockParams,
}));

import {
  NAVIGATION_LOCK_MS,
  resetNavigationGuard,
  useGuardedNavigation,
} from "@/hooks/useGuardedNavigation";

describe("useGuardedNavigation", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockPathname = "/settings";
    mockParams = {};
    resetNavigationGuard();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("ignore un second push tant que le premier est en cours", () => {
    const { result } = renderHook(() => useGuardedNavigation());
    act(() => {
      result.current.push("/settings/export");
      result.current.push("/settings/export");
      result.current.push("/settings/theme");
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith("/settings/export");
  });

  it("libère le verrou après le délai de repli", () => {
    const { result } = renderHook(() => useGuardedNavigation());
    act(() => {
      result.current.push("/settings/export");
    });
    act(() => {
      jest.advanceTimersByTime(NAVIGATION_LOCK_MS + 1);
    });
    act(() => {
      result.current.push("/settings/theme");
    });
    expect(mockPush).toHaveBeenCalledTimes(2);
  });

  it("le verrou est partagé entre les instances du hook", () => {
    const a = renderHook(() => useGuardedNavigation());
    const b = renderHook(() => useGuardedNavigation());
    act(() => {
      a.result.current.push("/settings/export");
      b.result.current.push("/settings/theme");
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("ignore un push vers la route déjà au sommet (même chemin + params)", () => {
    mockPathname = "/settings/export";
    mockParams = { childId: "c1" };
    const { result } = renderHook(() => useGuardedNavigation());
    act(() => {
      result.current.push({ pathname: "/settings/export", params: { childId: "c1" } });
    });
    act(() => {
      jest.advanceTimersByTime(NAVIGATION_LOCK_MS + 1);
      result.current.push("/(drawer)/settings/export?childId=c1");
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("autorise la même page avec des params différents", () => {
    mockPathname = "/baby/stats";
    mockParams = { tab: "tetees" };
    const { result } = renderHook(() => useGuardedNavigation());
    act(() => {
      result.current.push("/baby/stats?tab=biberons");
    });
    expect(mockPush).toHaveBeenCalledTimes(1);
  });

  it("autorise une autre route une fois le verrou libéré", () => {
    const { result } = renderHook(() => useGuardedNavigation());
    act(() => {
      result.current.push("/settings/export");
      jest.advanceTimersByTime(NAVIGATION_LOCK_MS + 1);
      result.current.push("/settings/theme");
    });
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual(["/settings/export", "/settings/theme"]);
  });

  it("garde aussi replace et navigate", () => {
    const { result } = renderHook(() => useGuardedNavigation());
    act(() => {
      result.current.replace("/a");
      result.current.navigate("/b");
    });
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("expose des fonctions stables entre les rendus", () => {
    const { result, rerender } = renderHook(() => useGuardedNavigation());
    const first = result.current;
    rerender({});
    expect(result.current.push).toBe(first.push);
  });
});
