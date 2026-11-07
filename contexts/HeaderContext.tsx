// Contextes du header du drawer : chaque écran pose son bouton gauche / droit
// (identifié par un `ownerId`) via ces hooks. Les fournisseurs sont montés par
// app/(drawer)/_layout.tsx, qui ré-exporte ces hooks pour compatibilité.
import { createContext, useContext } from "react";

export type HeaderSetter = (component: React.ReactElement | null, ownerId?: string) => void;

// Contexte pour gérer le headerRight dynamiquement
export const HeaderRightContext = createContext<{ setHeaderRight: HeaderSetter }>({
  setHeaderRight: () => {},
});

// Contexte pour gérer le headerLeft dynamiquement
export const HeaderLeftContext = createContext<{ setHeaderLeft: HeaderSetter }>({
  setHeaderLeft: () => {},
});

export const useHeaderRight = () => useContext(HeaderRightContext);
export const useHeaderLeft = () => useContext(HeaderLeftContext);
