// components/forms/SheetFooter.tsx
// Pied de feuille collant : les boutons « Annuler / Ajouter » d'un formulaire
// restent visibles en bas de la feuille (dans la zone du pouce), au lieu de se
// trouver à la fin d'un contenu qui défile.
//
// Le formulaire rend <SheetFooter>{boutons}</SheetFooter> ; dans la feuille
// globale, ce contenu est téléporté dans le `footerComponent` de
// @gorhom/bottom-sheet (via un petit store) et un espaceur réserve sa hauteur
// en fin de défilement. Hors feuille (tests, écran autonome), il est rendu
// sur place, comme avant.
//
// Ce fichier n'importe pas @gorhom/bottom-sheet : les formulaires restent
// testables seuls. Le rendu dans la feuille est dans SheetFooterHost.tsx.
import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useSyncExternalStore,
} from "react";
import { View } from "react-native";
import type { SheetFooterStore } from "./sheetFooterStore";

export { createSheetFooterStore, type SheetFooterStore } from "./sheetFooterStore";

export const SheetFooterContext = createContext<SheetFooterStore | null>(null);

/** Contenu du pied collant (rendu sur place hors de la feuille globale). */
export function SheetFooter({ children }: { children: React.ReactNode }) {
  const store = useContext(SheetFooterContext);
  useLayoutEffect(() => {
    store?.setNode(children);
  });
  useLayoutEffect(() => {
    if (!store) return;
    return () => {
      store.setNode(null);
      store.setHeight(0);
    };
  }, [store]);
  if (!store) return <>{children}</>;
  return null;
}

/** Espace réservé en fin de défilement : le dernier champ n'est jamais masqué. */
export function SheetFooterSpacer({ store }: { store: SheetFooterStore }) {
  const height = useSyncExternalStore(store.subscribe, store.getHeight, store.getHeight);
  if (!height) return null;
  return <View style={{ height }} pointerEvents="none" />;
}
