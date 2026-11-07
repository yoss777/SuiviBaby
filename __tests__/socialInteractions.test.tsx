/* eslint-disable import/first */
// S7.2 : un seul écouteur de likes et un seul de commentaires par enfant,
// partagés par le badge de notifications, Moments et la Galerie.

jest.mock("@/config/firebase", () => ({ db: {}, auth: { currentUser: { uid: "me" } } }));
jest.mock("@/utils/errorReporting", () => ({ addBreadcrumb: jest.fn(), captureServiceError: jest.fn() }));
jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { uid: "me" } }) }));
const mockActiveChild: { current: { id: string } | null } = { current: { id: "c1" } };
jest.mock("@/contexts/BabyContext", () => ({ useBaby: () => ({ activeChild: mockActiveChild.current }) }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()), removeItem: jest.fn(() => Promise.resolve()) },
}));

type Snap = { docs: { id: string; data: () => Record<string, unknown> }[]; size: number };
const mockListeners: { collection: string; cb: (s: Snap) => void; unsub: jest.Mock }[] = [];
jest.mock("firebase/firestore", () => ({
  Timestamp: class MockTimestamp {
    ms: number;
    constructor(ms: number) { this.ms = ms; }
    toMillis() { return this.ms; }
  },
  collection: (_db: unknown, name: string) => ({ name }),
  doc: (_db: unknown, ...p: string[]) => ({ path: p.join("/") }),
  where: jest.fn(), orderBy: jest.fn(), limit: jest.fn(),
  query: (c: { name: string }) => c,
  getDoc: jest.fn(() => Promise.resolve({ exists: () => false, data: () => ({}) })),
  getDocs: jest.fn(), setDoc: jest.fn(() => Promise.resolve()),
  onSnapshot: (q: { name: string }, cb: (s: Snap) => void) => {
    const unsub = jest.fn();
    mockListeners.push({ collection: q.name, cb, unsub });
    return unsub;
  },
}));

import React from "react";
import { Timestamp as MockTimestamp } from "firebase/firestore";
import { act, render, renderHook } from "@testing-library/react-native";
import {
  MomentsNotificationProvider,
  collectNewInteractionEventIds,
  useMomentsNotification,
} from "@/contexts/MomentsNotificationContext";
import { SOCIAL_LISTENERS_START_DELAY_MS, useSocialInteractions } from "@/contexts/SocialInteractionsContext";
import { compterCommentaires, construireLikesInfo } from "@/services/socialService";

const ts = (ms: number) => new (MockTimestamp as any)(ms);
const docsOf = (rows: Record<string, unknown>[]): Snap => ({
  docs: rows.map((r, i) => ({ id: `d${i}`, data: () => r })),
  size: rows.length,
});
const count = (name: string) => mockListeners.filter((l) => l.collection === name).length;
const flush = async () => {
  // Deux passes : le badge ouvre son écouteur de jalons après le chargement de lastSeen.
  for (let i = 0; i < 2; i++) await act(async () => { await jest.advanceTimersByTimeAsync(SOCIAL_LISTENERS_START_DELAY_MS + 100); });
};

beforeEach(() => {
  jest.useFakeTimers();
  mockListeners.length = 0;
  mockActiveChild.current = { id: "c1" };
  jest.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

describe("fournisseur partagé", () => {
  it("one tree with three consumers = 1 likes listener + 1 comments listener (+ 1 milestone listener for the badge)", async () => {
    const Consumers = () => { useSocialInteractions(); useSocialInteractions(); useMomentsNotification(); return null; };
    const { unmount } = render(
      <MomentsNotificationProvider><Consumers /><Consumers /></MomentsNotificationProvider>,
    );
    await flush();
    expect(count("eventLikes")).toBe(1);
    expect(count("eventComments")).toBe(1);
    expect(count("events")).toBe(1);
    unmount();
    mockListeners.forEach((l) => expect(l.unsub).toHaveBeenCalled());
  });

  it("does not open anything before the start delay and without an active child", async () => {
    mockActiveChild.current = null;
    renderHook(() => useSocialInteractions(), { wrapper: ({ children }) => <MomentsNotificationProvider>{children}</MomentsNotificationProvider> });
    await flush();
    expect(mockListeners).toHaveLength(0);
  });

  it("aggregates likes per event with 'Moi' for the current user, and counts comments", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <MomentsNotificationProvider>{children}</MomentsNotificationProvider>;
    const { result } = renderHook(() => useSocialInteractions(), { wrapper });
    await flush();
    const now = Date.now();
    await act(async () => {
      mockListeners.find((l) => l.collection === "eventLikes")!.cb(docsOf([
        { eventId: "e1", userId: "me", userName: "Moi-stocké", createdAt: ts(now) },
        { eventId: "e1", userId: "u2", userName: "Papa", createdAt: ts(now - 1) },
        { eventId: "e2", userId: "u2", userName: "Papa", createdAt: ts(now - 2) },
      ]));
      mockListeners.find((l) => l.collection === "eventComments")!.cb(docsOf([
        { eventId: "e1", userId: "u2", content: "a", createdAt: ts(now) },
        { eventId: "e1", userId: "u3", content: "b", createdAt: ts(now) },
      ]));
      await jest.advanceTimersByTimeAsync(10);
    });
    expect(result.current.likesInfo.e1).toMatchObject({ count: 2, likedByMe: true });
    expect(result.current.likesInfo.e1.likedByNames[0]).toBe("Moi");
    expect(result.current.likesInfo.e2).toMatchObject({ count: 1, likedByMe: false });
    expect(result.current.commentCounts).toEqual({ e1: 2 });
  });

  it("feeds the badge from the shared documents (other users only, newer than last seen)", async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => <MomentsNotificationProvider>{children}</MomentsNotificationProvider>;
    const { result } = renderHook(() => useMomentsNotification(), { wrapper });
    await flush();
    const lastSeen = Date.now(); // premier usage : lastSeen = maintenant
    await act(async () => {
      mockListeners.find((l) => l.collection === "eventLikes")!.cb(docsOf([
        { eventId: "e1", userId: "u2", createdAt: ts(lastSeen + 1000) }, // nouveau
        { eventId: "e2", userId: "me", createdAt: ts(lastSeen + 900) }, // le mien
        { eventId: "e3", userId: "u2", createdAt: ts(lastSeen - 5000) }, // ancien
      ]));
      mockListeners.find((l) => l.collection === "eventComments")!.cb(docsOf([
        { eventId: "e4", userId: "u3", createdAt: ts(lastSeen + 2000) },
      ]));
    });
    expect(result.current.newMomentsCount).toBe(2);
    expect([...result.current.newEventIds].sort()).toEqual(["e1", "e4"]);
    expect(result.current.newEventTypes.get("e1")).toBe("like");
    expect(result.current.newEventTypes.get("e4")).toBe("comment");
  });
});

describe("collectNewInteractionEventIds (badge borné par date)", () => {
  it("stops at the first document older than last seen (sorted newest first)", () => {
    const reads: number[] = [];
    const doc = (i: number, ms: number) => ({
      eventId: `e${i}`, userId: "u2",
      get createdAt() { reads.push(i); return ts(ms); },
    });
    const docs = [doc(0, 5000), doc(1, 4000), doc(2, 900), doc(3, 800), doc(4, 700)];
    const result = collectNewInteractionEventIds(docs, "me", 1000, new Set());
    expect(result.count).toBe(2);
    expect(reads).toEqual([0, 1, 2]); // 3 et 4 jamais examinés
  });

  it("skips already seen events and the user's own interactions", () => {
    const result = collectNewInteractionEventIds(
      [
        { eventId: "a", userId: "me", createdAt: ts(5000) },
        { eventId: "b", userId: "u2", createdAt: ts(4000) },
        { eventId: "c", userId: "u2", createdAt: ts(3000) },
      ],
      "me", 1000, new Set(["b"]),
    );
    expect([...result.eventIds]).toEqual(["c"]);
  });

  it("does not stop on a pending document without date", () => {
    const result = collectNewInteractionEventIds(
      [{ eventId: "a", userId: "u2", createdAt: null }, { eventId: "b", userId: "u2", createdAt: ts(5000) }],
      "me", 1000, new Set(),
    );
    expect([...result.eventIds]).toEqual(["b"]);
  });
});

describe("agrégats purs", () => {
  it("construireLikesInfo keeps at most 3 names and prefers the profile name", () => {
    const likes = ["a", "b", "c", "d"].map((u, i) => ({ eventId: "e", userId: u, userName: `old-${u}`, childId: "c1", createdAt: ts(i) })) as any;
    const info = construireLikesInfo(likes, "x", new Map([["a", "Maman"]]));
    expect(info.e).toEqual({ count: 4, likedByMe: false, likedByNames: ["Maman", "old-b", "old-c"] });
  });
  it("compterCommentaires counts per event", () => {
    expect(compterCommentaires([{ eventId: "a" }, { eventId: "a" }, { eventId: "b" }] as any)).toEqual({ a: 2, b: 1 });
  });
});
