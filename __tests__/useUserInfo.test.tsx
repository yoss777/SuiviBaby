import { act, renderHook } from "@testing-library/react-native";

import { useUserInfo } from "@/hooks/useUserInfo";

const mockGetDoc = jest.fn();
jest.mock("@/config/firebase", () => ({ db: {} }));
jest.mock("firebase/firestore", () => ({
  doc: (_db: unknown, _col: string, id: string) => ({ id }),
  getDoc: (ref: unknown) => mockGetDoc(ref),
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const snap = (data: object) => ({ exists: () => true, data: () => data });

describe("useUserInfo", () => {
  beforeEach(() => jest.clearAllMocks());

  it("charge les infos de l'utilisateur", async () => {
    mockGetDoc.mockResolvedValue(snap({ userName: "Alice" }));
    const { result } = renderHook(() => useUserInfo("u1"));
    await act(async () => {});
    expect(result.current.loading).toBe(false);
    expect(result.current.displayName).toBe("Alice");
  });

  it("ignore une réponse arrivée après un changement d'uid", async () => {
    const first = deferred<ReturnType<typeof snap>>();
    const second = deferred<ReturnType<typeof snap>>();
    mockGetDoc.mockImplementation((ref: { id: string }) =>
      ref.id === "u1" ? first.promise : second.promise,
    );
    const { result, rerender } = renderHook(({ id }: { id: string }) => useUserInfo(id), {
      initialProps: { id: "u1" },
    });
    rerender({ id: "u2" });

    await act(async () => {
      second.resolve(snap({ userName: "Bob" }));
    });
    await act(async () => {
      first.resolve(snap({ userName: "Alice" }));
    });

    expect(result.current.userInfo?.userName).toBe("Bob");
  });

  it("ne met plus l'état à jour après le démontage", async () => {
    const pending = deferred<ReturnType<typeof snap>>();
    mockGetDoc.mockReturnValue(pending.promise);
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = renderHook(() => useUserInfo("u1"));
    unmount();
    await act(async () => {
      pending.resolve(snap({ userName: "Alice" }));
    });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
