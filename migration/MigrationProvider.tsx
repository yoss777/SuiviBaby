// Migration terminée — ce provider est conservé uniquement pour
// compatibilité avec le provider stack dans _layout.tsx.
// Il peut être retiré en toute sécurité en le supprimant aussi de composeProviders().

import React, { type ReactNode } from "react";

export function MigrationProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
