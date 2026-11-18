// Liens du widget dans l'Accueil : clé de l'appareil → action ; sinon
// confirmation ; jamais sur un autre bébé ni après démontage.
import { act, renderHook } from "@testing-library/react-native";

import { WIDGET_ACTION_CONFIRM_MESSAGE, WIDGET_SMALL_CONFIRM_MESSAGE, useWidgetActionGate } from "@/hooks/useWidgetActionGate";

const KEY = "0123456789abcdef0123456789abcdef";
jest.mock("@/services/widgetLinkKey", () => ({
  isWidgetLinkKeyValid: (k?: string) => Promise.resolve(k === "0123456789abcdef0123456789abcdef"),
}));

const setup = (over: Partial<{ canManageContent: boolean; activeChildId: string }> = {}) => {
  const run = jest.fn();
  const confirm = jest.fn();
  const hook = renderHook((p: { activeChildId: string; canManageContent: boolean }) =>
    useWidgetActionGate({ run, confirm, canManageContent: p.canManageContent, activeChildId: p.activeChildId }),
  { initialProps: { activeChildId: "a", canManageContent: true, ...over } });
  return { run, confirm, hook };
};
const flush = () => act(async () => {});

it("clé de l'appareil : l'action est faite, sans confirmation (options transmises)", async () => {
  const { run, confirm, hook } = setup();
  hook.result.current("sleep-start", { nap: false, linkKey: KEY });
  await flush();
  expect(run).toHaveBeenCalledWith("sleep-start", { nap: false });
  expect(confirm).not.toHaveBeenCalled();
});

it("clé absente ou fausse : confirmation ; l'action n'est faite qu'après « confirmer »", async () => {
  const { run, confirm, hook } = setup();
  hook.result.current("sleep-stop", { linkKey: "faux" });
  hook.result.current("walk-start");
  await flush();
  expect(run).not.toHaveBeenCalled();
  expect(confirm).toHaveBeenCalledWith("Arrêter le sommeil en cours ?", WIDGET_ACTION_CONFIRM_MESSAGE, expect.any(Function), {
    confirmText: "Arrêter",
    destructive: false,
  });
  expect(confirm).toHaveBeenCalledWith("Démarrer une balade ?", WIDGET_ACTION_CONFIRM_MESSAGE, expect.any(Function), {
    confirmText: "Démarrer",
    destructive: false,
  });
  confirm.mock.calls[0][2]();
  expect(run).toHaveBeenCalledWith("sleep-stop", undefined);
});

it("petit widget iPhone (ask=1) : arrêt toujours confirmé, message propre au petit widget", async () => {
  const { run, confirm, hook } = setup();
  hook.result.current("sleep-stop", { fromSmall: true, linkKey: KEY });
  await flush();
  expect(run).not.toHaveBeenCalled();
  expect(confirm).toHaveBeenCalledWith("Arrêter le sommeil en cours ?", WIDGET_SMALL_CONFIRM_MESSAGE, expect.any(Function), {
    confirmText: "Arrêter",
    destructive: false,
  });
});

it("ouvrir un formulaire : jamais de confirmation", async () => {
  const { run, confirm, hook } = setup();
  hook.result.current("meal");
  hook.result.current("sleep");
  await flush();
  expect(run).toHaveBeenCalledTimes(2);
  expect(confirm).not.toHaveBeenCalled();
});

it("Proche : appel direct (l'action refuse elle-même la saisie), pas de confirmation", async () => {
  const { run, confirm, hook } = setup({ canManageContent: false });
  hook.result.current("sleep-stop");
  await flush();
  expect(run).toHaveBeenCalledTimes(1);
  expect(confirm).not.toHaveBeenCalled();
});

it("bébé changé pendant la vérification ou avant de confirmer : rien sur l'autre bébé", async () => {
  const { run, confirm, hook } = setup();
  hook.result.current("sleep-stop", { linkKey: KEY });
  hook.rerender({ activeChildId: "b", canManageContent: true });
  await flush();
  expect(run).not.toHaveBeenCalled();

  hook.result.current("walk-stop");
  await flush();
  hook.rerender({ activeChildId: "a", canManageContent: true });
  confirm.mock.calls[0][2]();
  expect(run).not.toHaveBeenCalled();
});

it("Accueil démonté avant la fin de la vérification : rien", async () => {
  const { run, confirm, hook } = setup();
  hook.result.current("sleep-stop", { linkKey: KEY });
  hook.unmount();
  await flush();
  expect(run).not.toHaveBeenCalled();
  expect(confirm).not.toHaveBeenCalled();
});
