// hooks/useWidgetActionGate.ts
// Lien du widget qui démarre ou arrête une session : fait seulement si le
// lien porte la clé de cet appareil (services/widgetLinkKey.ts), sinon une
// confirmation est demandée (autre app, page web, widget pas encore à jour).
// Ouvrir un formulaire ne demande rien. Bébé actif et montage revérifiés
// après la vérification (asynchrone) et après la confirmation : jamais
// d'action sur un autre bébé.
import { useCallback, useEffect, useRef } from "react";

import type { WidgetDeepLinkAction } from "@/hooks/useWidgetDeepLink";
import { isWidgetLinkKeyValid } from "@/services/widgetLinkKey";

type RunOpts = { nap?: boolean };

export const WIDGET_ACTION_CONFIRM: Partial<Record<WidgetDeepLinkAction, (o?: RunOpts) => string>> = {
  "sleep-start": (o) => (o?.nap === false ? "Démarrer la nuit ?" : "Démarrer une sieste ?"),
  "sleep-stop": () => "Arrêter le sommeil en cours ?",
  "walk-start": () => "Démarrer une balade ?",
  "walk-stop": () => "Arrêter la balade en cours ?",
  "nursing-stop": () => "Arrêter la tétée en cours ?",
};

export const WIDGET_ACTION_CONFIRM_MESSAGE = "Ce lien ne vient pas de votre widget SuiviBaby.";

export function useWidgetActionGate(opts: {
  /** Action réelle (Accueil). Lue au moment de l'exécution (dernière version). */
  run: (action: WidgetDeepLinkAction, o?: RunOpts) => void;
  canManageContent: boolean;
  activeChildId: string | undefined;
  confirm: (title: string, message: string, onConfirm: () => void) => void;
}): (action: WidgetDeepLinkAction, o?: RunOpts & { linkKey?: string }) => void {
  const runRef = useRef(opts.run);
  runRef.current = opts.run;
  const childRef = useRef(opts.activeChildId);
  childRef.current = opts.activeChildId;
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const { canManageContent, confirm } = opts;

  return useCallback(
    (action, o) => {
      const title = WIDGET_ACTION_CONFIRM[action]?.(o);
      const childId = childRef.current;
      const run = () => {
        if (!mountedRef.current || childRef.current !== childId) return;
        runRef.current(action, o?.nap === undefined ? undefined : { nap: o.nap });
      };
      // Formulaire, ou Proche (l'action refuse elle-même la saisie) : direct.
      if (!title || !canManageContent) {
        run();
        return;
      }
      void isWidgetLinkKeyValid(o?.linkKey).then((ok) => {
        if (!mountedRef.current || childRef.current !== childId) return;
        if (ok) run();
        else confirm(title, WIDGET_ACTION_CONFIRM_MESSAGE, run);
      });
    },
    [canManageContent, confirm],
  );
}
