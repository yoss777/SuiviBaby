/* eslint-disable import/first */
// S7.8 : un seul écouteur d'accès par (enfant, utilisateur), partagé par tous
// les écrans et le menu latéral ; il reste ouvert un court instant après le
// dernier démontage (pas de relecture à la réouverture du menu).

jest.mock("@/config/firebase", () => ({ db: {} }));

type Cb = (snap: { exists: () => boolean; data: () => unknown }) => void;
const mockUnsubscribe = jest.fn();
const mockSnapshotCallbacks: Cb[] = [];
const mockErrorCallbacks: ((e: Error) => void)[] = [];
const mockOnSnapshot = jest.fn((_ref: unknown, cb: Cb, errCb?: (e: Error) => void) => {
  mockSnapshotCallbacks.push(cb);
  mockErrorCallbacks.push(errCb ?? (() => {}));
  return mockUnsubscribe;
});
jest.mock("firebase/firestore", () => ({
  collection: jest.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  doc: jest.fn((_db: unknown, ...path: string[]) => ({ path: path.join("/") })),
  onSnapshot: (...a: [unknown, Cb, ((e: Error) => void)?]) => mockOnSnapshot(...a),
}));

import { act, renderHook } from "@testing-library/react-native";
import {
  ACCESS_ERROR_RETRY_MS,
  ACCESS_LISTENER_LINGER_MS,
  getOpenAccessListenerCount,
  resetChildPermissionsStore,
  useChildPermissions,
  useChildRoles,
} from "@/hooks/useChildPermissions";

const accessSnap = (role: string) => ({
  exists: () => true,
  data: () => ({ userId: "u1", role, grantedBy: "o" }),
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockSnapshotCallbacks.length = 0;
  mockErrorCallbacks.length = 0;
  resetChildPermissionsStore();
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe("useChildPermissions partagé", () => {
  it("opens ONE listener for N consumers of the same child and user", () => {
    const hooks = [1, 2, 3, 4, 5, 6, 7].map(() => renderHook(() => useChildPermissions("c1", "u1")));
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    expect(getOpenAccessListenerCount()).toBe(1);

    act(() => mockSnapshotCallbacks[0](accessSnap("owner")));
    hooks.forEach((h) => {
      expect(h.result.current.role).toBe("owner");
      expect(h.result.current.loading).toBe(false);
    });
  });

  it("starts in loading state, then publishes the computed permissions", () => {
    const { result } = renderHook(() => useChildPermissions("c1", "u1"));
    expect(result.current.loading).toBe(true);
    act(() => mockSnapshotCallbacks[0](accessSnap("viewer")));
    expect(result.current).toMatchObject({ hasAccess: true, role: "viewer", loading: false });
  });

  it("reports no access when the access document does not exist", () => {
    const { result } = renderHook(() => useChildPermissions("c1", "u1"));
    act(() => mockSnapshotCallbacks[0]({ exists: () => false, data: () => undefined }));
    expect(result.current).toMatchObject({ hasAccess: false, role: null, loading: false });
  });

  it("returns empty permissions without any listener when childId or userId is missing", () => {
    const { result } = renderHook(() => useChildPermissions(undefined, "u1"));
    expect(result.current).toMatchObject({ hasAccess: false, loading: false });
    expect(mockOnSnapshot).not.toHaveBeenCalled();
  });

  it("keeps the listener open after the last unmount, then closes it", () => {
    const first = renderHook(() => useChildPermissions("c1", "u1"));
    act(() => mockSnapshotCallbacks[0](accessSnap("admin")));
    first.unmount();
    expect(mockUnsubscribe).not.toHaveBeenCalled();

    // Réouverture rapide : même écouteur, déjà chargé, aucune relecture.
    const second = renderHook(() => useChildPermissions("c1", "u1"));
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1);
    expect(second.result.current.role).toBe("admin");
    second.unmount();

    act(() => jest.advanceTimersByTime(ACCESS_LISTENER_LINGER_MS + 1));
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(getOpenAccessListenerCount()).toBe(0);
  });

  it("uses a separate listener per child", () => {
    renderHook(() => useChildPermissions("c1", "u1"));
    renderHook(() => useChildPermissions("c2", "u1"));
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
  });
});

describe("useChildRoles", () => {
  it("reads the roles of every child through the shared listeners", () => {
    const { result } = renderHook(() => useChildRoles(["c1", "c2"], "u1"));
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
    act(() => mockSnapshotCallbacks[0](accessSnap("owner")));
    act(() => mockSnapshotCallbacks[1](accessSnap("viewer")));
    expect(result.current).toEqual({ c1: "owner", c2: "viewer" });
  });

  it("shares the listener with useChildPermissions of the active child", () => {
    renderHook(() => useChildPermissions("c1", "u1"));
    renderHook(() => useChildRoles(["c1", "c2"], "u1"));
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2); // c1 partagé + c2
  });
});

describe("erreur de l'écouteur d'accès", () => {
  it("publie des permissions sans accès + l'erreur (pas de droits périmés) et ferme l'écouteur", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useChildPermissions("c1", "u1"));
    act(() => mockSnapshotCallbacks[0](accessSnap("owner")));
    expect(result.current.canWriteEvents).toBe(true);
    const err = new Error("permission-denied");
    act(() => mockErrorCallbacks[0](err));
    expect(result.current).toMatchObject({
      hasAccess: false, canWriteEvents: false, canManageAccess: false, loading: false, error: err,
    });
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("un nouveau consommateur relance un écouteur frais, les consommateurs en place sont notifiés", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const first = renderHook(() => useChildPermissions("c1", "u1"));
    act(() => mockErrorCallbacks[0](new Error("boom")));
    const second = renderHook(() => useChildPermissions("c1", "u1"));
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
    act(() => mockSnapshotCallbacks[1](accessSnap("viewer")));
    expect(second.result.current).toMatchObject({ role: "viewer", loading: false });
    expect(first.result.current).toMatchObject({ role: "viewer", loading: false });
    expect(first.result.current.error).toBeUndefined();
    spy.mockRestore();
  });

  it("retente seule tant qu'un consommateur est monté", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const { result } = renderHook(() => useChildPermissions("c1", "u1"));
    act(() => mockErrorCallbacks[0](new Error("boom")));
    act(() => jest.advanceTimersByTime(ACCESS_ERROR_RETRY_MS + 1));
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2);
    act(() => mockSnapshotCallbacks[1](accessSnap("admin")));
    expect(result.current.role).toBe("admin");
    spy.mockRestore();
  });
});

describe("resetChildPermissionsStore", () => {
  it("ferme les écouteurs et notifie les consommateurs montés (pas de chargement infini)", () => {
    const { result } = renderHook(() => useChildPermissions("c1", "u1"));
    expect(result.current.loading).toBe(true);
    act(() => resetChildPermissionsStore());
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(result.current).toMatchObject({ hasAccess: false, loading: false });
    expect(getOpenAccessListenerCount()).toBe(0);
  });
});
