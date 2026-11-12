// components/forms/formGuard.tsx
// Garde-fou contre la perte de saisie : chaque formulaire signale s'il a été
// modifié ; la feuille globale bloque alors le glissement vers le bas et
// demande confirmation avant de fermer (fond, bouton Fermer/Annuler, retour
// Android).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type FormValues = Record<string, unknown>;

function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.getTime();
  return value;
}

/** Vrai si une valeur du formulaire diffère de son état initial. */
export function isFormDirty(baseline: FormValues, current: FormValues): boolean {
  const keys = new Set([...Object.keys(baseline), ...Object.keys(current)]);
  for (const key of keys) {
    const a = normalize(baseline[key]);
    const b = normalize(current[key]);
    if (Object.is(a, b)) continue;
    if (a !== null && b !== null && typeof a === "object" && typeof b === "object") {
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
    }
    return true;
  }
  return false;
}

/**
 * Décide de la suite d'une demande de fermeture.
 * - "close" : fermer tout de suite ;
 * - "confirm" : demander « Abandonner la saisie ? » ;
 * - "ignore" : un enregistrement est en cours, on ne ferme pas.
 */
export function resolveDismissRequest(opts: {
  dirty: boolean;
  isSubmitting: boolean;
}): "close" | "confirm" | "ignore" {
  if (opts.isSubmitting) return "ignore";
  return opts.dirty ? "confirm" : "close";
}

export type FormGuardContextValue = {
  setDirty: (dirty: boolean) => void;
  setDiscardHandler: (handler: (() => void) | null) => void;
};

export const FormGuardContext = createContext<FormGuardContextValue | null>(null);

/**
 * À appeler dans un formulaire avec ses valeurs courantes. L'état initial est
 * celui du premier rendu ; `resetBaseline` le remplace (par ex. après le
 * chargement asynchrone d'une valeur par défaut). `onDiscard` est appelé quand
 * l'utilisateur confirme l'abandon de la saisie.
 */
export function useFormDirtyGuard(
  current: FormValues,
  options: { onDiscard?: () => void; extraDirty?: boolean } = {},
): { isDirty: boolean; resetBaseline: (next?: FormValues) => void } {
  const ctx = useContext(FormGuardContext);
  const [baseline, setBaseline] = useState<FormValues>(() => current);
  const currentRef = useRef(current);
  useEffect(() => {
    currentRef.current = current;
  });

  const isDirty = Boolean(options.extraDirty) || isFormDirty(baseline, current);

  const resetBaseline = useCallback((next?: FormValues) => {
    setBaseline(next ?? currentRef.current);
  }, []);

  const setDirty = ctx?.setDirty;
  useEffect(() => {
    setDirty?.(isDirty);
  }, [setDirty, isDirty]);

  // Au démontage, le formulaire n'a plus rien à protéger.
  useEffect(() => () => setDirty?.(false), [setDirty]);

  const onDiscardRef = useRef(options.onDiscard);
  useEffect(() => {
    onDiscardRef.current = options.onDiscard;
  });
  const setDiscardHandler = ctx?.setDiscardHandler;
  useEffect(() => {
    if (!setDiscardHandler) return;
    setDiscardHandler(() => onDiscardRef.current?.());
    return () => setDiscardHandler(null);
  }, [setDiscardHandler]);

  return { isDirty, resetBaseline };
}

export function FormGuardProvider({
  value,
  children,
}: {
  value: FormGuardContextValue;
  children: React.ReactNode;
}) {
  return <FormGuardContext.Provider value={value}>{children}</FormGuardContext.Provider>;
}
