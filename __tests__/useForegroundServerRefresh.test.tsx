import { act, renderHook } from "@testing-library/react-native";
import React from "react";
import { AppState } from "react-native";
import { NavigationContext } from "@react-navigation/native";
import { useForegroundServerRefresh } from "@/hooks/useForegroundServerRefresh";

type AppStateHandler = (state: string) => void;

const flushPromises = () => Promise.resolve();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useForegroundServerRefresh", () => {
  let handler: AppStateHandler | null = null;
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    handler = null;
    jest.spyOn(AppState, "addEventListener").mockImplementation((_event, cb) => {
      handler = cb as AppStateHandler;
      return { remove: jest.fn() } as any;
    });
    nowSpy = jest.spyOn(Date, "now");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not refresh before 30s in background and refreshes after 30s", async () => {
    const refresh = jest.fn().mockResolvedValue(["fresh"]);
    const apply = jest.fn();

    renderHook(() => useForegroundServerRefresh({ refresh, apply }));

    nowSpy.mockReturnValue(1_000);
    act(() => handler?.("background"));
    nowSpy.mockReturnValue(30_999);
    act(() => handler?.("active"));
    await flushPromises();

    expect(refresh).not.toHaveBeenCalled();

    nowSpy.mockReturnValue(40_000);
    act(() => handler?.("background"));
    nowSpy.mockReturnValue(70_000);
    act(() => handler?.("active"));
    await flushPromises();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(["fresh"]);
  });

  it("ignores an obsolete refresh response", async () => {
    const first = deferred<string[]>();
    const second = deferred<string[]>();
    const refresh = jest.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const apply = jest.fn();

    renderHook(() => useForegroundServerRefresh({ refresh, apply }));

    nowSpy.mockReturnValue(1_000);
    act(() => handler?.("background"));
    nowSpy.mockReturnValue(31_000);
    act(() => handler?.("active"));

    nowSpy.mockReturnValue(32_000);
    act(() => handler?.("background"));
    nowSpy.mockReturnValue(62_000);
    act(() => handler?.("active"));

    second.resolve(["second"]);
    await flushPromises();
    first.resolve(["first"]);
    await flushPromises();

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(["second"]);
  });
  it("skips the server re-read when the screen is not focused (S7.1)", async () => {
    const refresh = jest.fn().mockResolvedValue(["fresh"]);
    const apply = jest.fn();
    let focused = false;
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <NavigationContext.Provider value={{ isFocused: () => focused } as any}>
        {children}
      </NavigationContext.Provider>
    );

    renderHook(() => useForegroundServerRefresh({ refresh, apply }), { wrapper });

    nowSpy.mockReturnValue(1_000);
    act(() => handler?.("background"));
    nowSpy.mockReturnValue(40_000);
    act(() => handler?.("active"));
    await flushPromises();
    expect(refresh).not.toHaveBeenCalled();

    focused = true;
    nowSpy.mockReturnValue(50_000);
    act(() => handler?.("background"));
    nowSpy.mockReturnValue(90_000);
    act(() => handler?.("active"));
    await flushPromises();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith(["fresh"]);
  });

  it("never applies a re-read started for child A after switching to child B (S7.1)", async () => {
    const pending = deferred<string[]>();
    const refresh = jest.fn().mockReturnValue(pending.promise);
    const apply = jest.fn();

    const { rerender } = renderHook(
      ({ childId }: { childId: string }) =>
        useForegroundServerRefresh({ childId, refresh, apply }),
      { initialProps: { childId: "A" } },
    );

    nowSpy.mockReturnValue(1_000);
    act(() => handler?.("background"));
    nowSpy.mockReturnValue(40_000);
    act(() => handler?.("active"));
    expect(refresh).toHaveBeenCalledTimes(1);

    rerender({ childId: "B" });
    pending.resolve(["data-of-A"]);
    await flushPromises();
    await flushPromises();

    expect(apply).not.toHaveBeenCalled();
  });

  it("still applies the result when the child does not change", async () => {
    const refresh = jest.fn().mockResolvedValue(["ok"]);
    const apply = jest.fn();
    const { rerender } = renderHook(
      ({ childId }: { childId: string }) =>
        useForegroundServerRefresh({ childId, refresh, apply }),
      { initialProps: { childId: "A" } },
    );
    rerender({ childId: "A" });
    nowSpy.mockReturnValue(1_000);
    act(() => handler?.("background"));
    nowSpy.mockReturnValue(40_000);
    act(() => handler?.("active"));
    await flushPromises();
    expect(apply).toHaveBeenCalledWith(["ok"]);
  });
});
