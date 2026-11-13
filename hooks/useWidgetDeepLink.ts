// hooks/useWidgetDeepLink.ts
// Appui sur une zone du widget « Bébé maintenant » : le lien
// suivibaby:///baby/home?widget=meal|diaper|nursing&child=<id> ouvre
// directement le formulaire de la catégorie sur l'Accueil, pour le bon bébé.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";

import { useBaby } from "@/contexts/BabyContext";

export type WidgetDeepLinkAction = "meal" | "diaper" | "nursing";

const ACTIONS = new Set<string>(["meal", "diaper", "nursing"]);

/** Lien d'une zone du widget (construit aussi dans le widget, runtime isolé). */
export function widgetDeepLink(action: WidgetDeepLinkAction, childId?: string): string {
  return `suivibaby:///baby/home?widget=${action}${childId ? `&child=${encodeURIComponent(childId)}` : ""}`;
}

export function useWidgetDeepLink(opts: {
  /** Données de l'Accueil chargées : la feuille s'ouvre sur un état juste. */
  ready: boolean;
  open: (action: WidgetDeepLinkAction) => void;
}): void {
  const { widget, child } = useLocalSearchParams<{ widget?: string; child?: string }>();
  const { activeChild, children, setActiveChild } = useBaby();
  const { ready, open } = opts;

  useEffect(() => {
    if (!widget) return;
    const clear = () => router.setParams({ widget: undefined, child: undefined });
    if (!ACTIONS.has(widget)) {
      clear();
      return;
    }
    // Le widget affichait un autre bébé que l'app : on bascule d'abord.
    if (child && activeChild?.id !== child) {
      const target = children.find((c) => c.id === child);
      if (target) setActiveChild(target);
      else clear();
      return;
    }
    if (!ready) return;
    open(widget as WidgetDeepLinkAction);
    clear();
  }, [widget, child, activeChild?.id, children, setActiveChild, ready, open]);
}
