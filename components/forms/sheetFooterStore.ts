// components/forms/sheetFooterStore.ts
// Store minimal du pied collant : le formulaire y dépose ses boutons, la
// feuille les affiche dans son `footerComponent` (voir SheetFooter.tsx).
import type React from "react";

export type SheetFooterStore = {
  getNode: () => React.ReactNode;
  setNode: (node: React.ReactNode) => void;
  getHeight: () => number;
  setHeight: (height: number) => void;
  subscribe: (listener: () => void) => () => void;
};

export function createSheetFooterStore(): SheetFooterStore {
  let node: React.ReactNode = null;
  let height = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  return {
    getNode: () => node,
    setNode: (next) => {
      if (next === node) return;
      node = next;
      emit();
    },
    getHeight: () => height,
    setHeight: (next) => {
      const rounded = Math.round(next);
      if (rounded === height) return;
      height = rounded;
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
