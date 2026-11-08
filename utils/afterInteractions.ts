// utils/afterInteractions.ts — remplace InteractionManager.runAfterInteractions,
// retiré de React Native (0.8x, montée Expo 58) : la tâche part quand le fil JS
// est libre (fin d'animation de navigation), au plus tard après `timeout` ms.

export interface DeferredTask {
  cancel: () => void;
}

export function runAfterInteractions(task: () => void, timeout = 500): DeferredTask {
  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(() => task(), { timeout });
    return { cancel: () => cancelIdleCallback(id) };
  }
  const id = setTimeout(task, 0);
  return { cancel: () => clearTimeout(id) };
}
