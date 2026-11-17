// hooks/useWidgetDeepLink.ts
// Appui sur une zone du widget « Bébé maintenant » : le lien
// suivibaby:///baby/home?widget=meal|diaper|nursing|sleep&child=<id> ouvre
// directement le formulaire de la catégorie sur l'Accueil, pour le bon bébé.
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";

import { useBaby } from "@/contexts/BabyContext";

export type WidgetDeepLinkAction =
  | "meal"
  | "diaper"
  | "nursing"
  | "sleep"
  | "nursing-stop"
  | "sleep-start"
  | "sleep-stop"
  | "walk-start"
  | "walk-stop"
  // Petit widget iPhone, plusieurs sessions : l'app demande laquelle arrêter.
  | "stop-pick";

const ACTIONS = new Set<string>([
  "meal",
  "diaper",
  "nursing",
  "sleep",
  "nursing-stop",
  "sleep-start",
  "sleep-stop",
  "walk-start",
  "walk-stop",
  "stop-pick",
]);

/** Lien d'une zone du widget (construit aussi dans le widget, runtime isolé). */
export function widgetDeepLink(action: WidgetDeepLinkAction, childId?: string, nap?: boolean): string {
  return `suivibaby:///baby/home?widget=${action}${childId ? `&child=${encodeURIComponent(childId)}` : ""}${nap === undefined ? "" : `&nap=${nap ? 1 : 0}`}`;
}

export function useWidgetDeepLink(opts: {
  /** Données de l'Accueil chargées : la feuille s'ouvre sur un état juste. */
  ready: boolean;
  /** `nap` : sieste (true) ou nuit (false) pour « sleep-start », tel qu'affiché par le widget. */
  /** `linkKey` : clé portée par le lien (&k=), vérifiée par l'appelant pour les actions. */
  /** `fromSmall` : petit widget iPhone (un seul lien), l'arrêt demande toujours confirmation. */
  open: (action: WidgetDeepLinkAction, opts?: { nap?: boolean; linkKey?: string; fromSmall?: boolean }) => void;
}): void {
  const { widget, child, nap, k, ask } = useLocalSearchParams<{ widget?: string; child?: string; nap?: string; k?: string; ask?: string }>();
  const { activeChild, children, childrenLoaded, setActiveChild } = useBaby();
  const { ready, open } = opts;
  // Un lien n'est traité qu'une fois. router.setParams() n'efface les
  // paramètres qu'au rendu suivant : entre-temps, l'effet se relance (open
  // change dès que les données bougent) et démarrait plusieurs siestes ou
  // promenades pour un seul appui.
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!widget) {
      handledRef.current = null;
      return;
    }
    const key = `${widget}|${child ?? ""}|${nap ?? ""}`;
    if (handledRef.current === key) return;
    const clear = () => router.setParams({ widget: undefined, child: undefined, nap: undefined, k: undefined, ask: undefined });
    if (!ACTIONS.has(widget)) {
      clear();
      return;
    }
    // Le widget affichait un autre bébé que l'app : on bascule d'abord.
    if (child && activeChild?.id !== child) {
      const target = children.find((c) => c.id === child);
      if (target) setActiveChild(target);
      // Démarrage à froid : la liste des bébés arrive après le lien.
      else if (childrenLoaded) clear();
      return;
    }
    if (!ready) return;
    handledRef.current = key;
    const linkOpts = {
      ...(nap === "1" ? { nap: true } : nap === "0" ? { nap: false } : {}),
      ...(k ? { linkKey: k } : {}),
      ...(ask === "1" ? { fromSmall: true } : {}),
    };
    open(widget as WidgetDeepLinkAction, Object.keys(linkOpts).length ? linkOpts : undefined);
    clear();
  }, [widget, child, nap, k, ask, activeChild?.id, children, childrenLoaded, setActiveChild, ready, open]);
}
