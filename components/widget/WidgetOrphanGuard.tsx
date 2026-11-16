// components/widget/WidgetOrphanGuard.tsx
// Filet de l'effacement à distance (functions/src/widget/wipe.js) : si le
// compte n'a plus aucun bébé accessible (accès retiré pendant que l'app était
// fermée), le widget est vidé à l'ouverture, sans attendre de message du
// serveur. Quand il reste des bébés, l'Accueil réécrit déjà le widget avec le
// bébé actif. Ne rend rien.
import { useEffect, useRef } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { clearNowWidget } from "@/services/widgetSync";

export function WidgetOrphanGuard(): null {
  const { user } = useAuth();
  const { children, childrenLoaded, status } = useBaby();
  const clearedRef = useRef(false);
  useEffect(() => {
    if (children.length > 0) {
      clearedRef.current = false;
      return;
    }
    // Liste chargée et confirmée par le serveur (« ready »), vraiment vide.
    if (!!user && childrenLoaded && status === "ready" && !clearedRef.current) {
      clearedRef.current = true;
      clearNowWidget();
    }
  }, [user, childrenLoaded, status, children.length]);
  return null;
}
