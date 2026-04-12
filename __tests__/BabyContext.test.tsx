import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";

import { BabyProvider, useBaby } from "@/contexts/BabyContext";
import { useAuth } from "@/contexts/AuthContext";

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/services/userPreferencesService", () => ({
  obtenirPreferences: jest.fn(() =>
    Promise.resolve({ hiddenChildrenIds: [], lastActiveChildId: null }),
  ),
}));

jest.mock("@/services/eventsService", () => ({
  obtenirEvenementsDuJour: jest.fn(() => Promise.resolve([])),
}));

jest.mock("@/services/todayEventsCache", () => ({
  buildTodayEventsData: jest.fn(() => ({})),
  getTodayEventsCache: jest.fn(() => null),
  setTodayEventsCache: jest.fn(),
}));

type FirestoreSnapshot = {
  exists?: () => boolean;
  data?: () => any;
  docs?: { data: () => any }[];
};

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <BabyProvider>{children}</BabyProvider>;
}

describe("BabyContext", () => {
  const accessCallbacks: ((snapshot: FirestoreSnapshot) => void)[] = [];
  const childCallbacks = new Map<string, (snapshot: FirestoreSnapshot) => void>();

  beforeEach(() => {
    jest.clearAllMocks();
    accessCallbacks.length = 0;
    childCallbacks.clear();

    (useAuth as jest.Mock).mockReturnValue({
      user: { uid: "user-1" },
      loading: false,
    });

    (doc as jest.Mock).mockImplementation((_db, ...segments: string[]) => ({
      kind: "doc",
      path: segments.join("/"),
    }));
    (collection as jest.Mock).mockImplementation((_db, ...segments: string[]) => ({
      kind: "collection",
      path: segments.join("/"),
    }));
    (query as jest.Mock).mockImplementation((ref: { path: string }) => ({
      kind: "query",
      path: ref.path,
    }));
    (where as jest.Mock).mockReturnValue({ kind: "where" });
    (limit as jest.Mock).mockReturnValue({ kind: "limit" });
    (setDoc as jest.Mock).mockResolvedValue(undefined);

    (onSnapshot as jest.Mock).mockImplementation(
      (
        ref: { kind: string; path: string },
        onNext: (snapshot: FirestoreSnapshot) => void,
      ) => {
        if (ref.kind === "query" && ref.path === "user_child_access") {
          accessCallbacks.push(onNext);
        } else if (ref.kind === "doc" && ref.path.startsWith("children/")) {
          childCallbacks.set(ref.path.split("/")[1], onNext);
        }

        return jest.fn();
      },
    );
  });

  it("hydrates from cache first, then upgrades to ready when live listeners resolve", async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(
      JSON.stringify({
        children: [
          {
            id: "child-stale",
            name: "Cache Child",
            birthDate: "01/01/2024",
          },
        ],
        activeChildId: "child-stale",
        cachedAt: Date.now(),
      }),
    );

    const { result } = renderHook(() => useBaby(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("degraded");
      expect(result.current.children).toHaveLength(1);
      expect(result.current.children[0]?.id).toBe("child-stale");
    });

    await act(async () => {
      accessCallbacks[0]?.({
        docs: [
          {
            data: () => ({
              userId: "user-1",
              childId: "child-fresh",
            }),
          },
        ],
      });
    });

    await act(async () => {
      childCallbacks.get("child-fresh")?.({
        exists: () => true,
        data: () => ({
          name: "Fresh Child",
          birthDate: "02/02/2024",
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
      expect(result.current.children).toHaveLength(1);
      expect(result.current.children[0]?.id).toBe("child-fresh");
      expect(result.current.activeChild?.id).toBe("child-fresh");
    });
  });

  it("does not let late cache hydration overwrite live ready data", async () => {
    const deferredCache = createDeferred<string | null>();
    (AsyncStorage.getItem as jest.Mock).mockReturnValue(deferredCache.promise);

    const { result } = renderHook(() => useBaby(), { wrapper });

    await act(async () => {
      accessCallbacks[0]?.({
        docs: [
          {
            data: () => ({
              userId: "user-1",
              childId: "child-fresh",
            }),
          },
        ],
      });
    });

    await act(async () => {
      childCallbacks.get("child-fresh")?.({
        exists: () => true,
        data: () => ({
          name: "Fresh Child",
          birthDate: "02/02/2024",
        }),
      });
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
      expect(result.current.children[0]?.id).toBe("child-fresh");
      expect(result.current.activeChild?.id).toBe("child-fresh");
    });

    await act(async () => {
      deferredCache.resolve(
        JSON.stringify({
          children: [
            {
              id: "child-stale",
              name: "Cache Child",
              birthDate: "01/01/2024",
            },
          ],
          activeChildId: "child-stale",
          cachedAt: Date.now(),
        }),
      );
      await deferredCache.promise;
    });

    await waitFor(() => {
      expect(result.current.status).toBe("ready");
      expect(result.current.children).toHaveLength(1);
      expect(result.current.children[0]?.id).toBe("child-fresh");
      expect(result.current.activeChild?.id).toBe("child-fresh");
    });
  });
});
