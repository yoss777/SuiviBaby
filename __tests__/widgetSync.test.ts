// Envoi au widget : anti-rebond, contenu inchangé, ordre des écritures avec le
// récepteur natif, effacement à la déconnexion, remontée des erreurs.
const mockCalls: string[] = [];
jest.mock("@/modules/widget-push", () => ({
  noteAppSnapshot: (childId: string) => mockCalls.push(`note:${childId}`),
  clearWidgetPush: () => mockCalls.push("clearNative"),
}));

import {
  __resetWidgetSyncForTests,
  cancelPendingWidgetPush,
  clearNowWidget,
  invalidateWidgetKey,
  pushNowWidget,
  WIDGET_SYNC_DEBOUNCE_MS,
} from "@/services/widgetSync";
import { captureServiceError } from "@/utils/errorReporting";
import { EMPTY_NOW_WIDGET, EMPTY_NOW_WIDGET_NATIVE, type NowWidgetProps } from "@/utils/widgetSnapshot";

const props = (over: Partial<NowWidgetProps> = {}): NowWidgetProps => ({
  ...EMPTY_NOW_WIDGET,
  childId: "c1",
  childName: "Léa",
  generatedAtMs: Date.now(),
  ...over,
});

let widget: { updateSnapshot: jest.Mock };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockCalls.length = 0;
  widget = { updateSnapshot: jest.fn((p: NowWidgetProps) => mockCalls.push(`write:${p.childName}`)) };
  __resetWidgetSyncForTests(widget);
});
afterEach(() => jest.useRealTimers());

it("anti-rebond : un seul envoi, le dernier ; noté avant l'écriture", () => {
  pushNowWidget(props({ childName: "A" }));
  pushNowWidget(props({ childName: "B" }));
  jest.advanceTimersByTime(WIDGET_SYNC_DEBOUNCE_MS - 1);
  expect(widget.updateSnapshot).not.toHaveBeenCalled();
  jest.advanceTimersByTime(1);
  expect(mockCalls).toEqual(["note:c1", "write:B"]);
});

it("contenu inchangé (hors heure de calcul) : pas de réécriture, sauf après invalidation", () => {
  pushNowWidget(props({ generatedAtMs: 1 }));
  jest.runOnlyPendingTimers();
  pushNowWidget(props({ generatedAtMs: 2 }));
  jest.runOnlyPendingTimers();
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(1);
  invalidateWidgetKey();
  pushNowWidget(props({ generatedAtMs: 3 }));
  jest.runOnlyPendingTimers();
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(2);
});

it("annulation : l'envoi en attente ne part pas", () => {
  pushNowWidget(props());
  cancelPendingWidgetPush();
  jest.runOnlyPendingTimers();
  expect(widget.updateSnapshot).not.toHaveBeenCalled();
});

it("déconnexion : widget vidé tout de suite, récepteur réinitialisé, envoi en attente annulé", () => {
  pushNowWidget(props({ childName: "Léa" }));
  clearNowWidget();
  jest.runOnlyPendingTimers();
  expect(widget.updateSnapshot).toHaveBeenCalledTimes(1);
  expect(widget.updateSnapshot).toHaveBeenCalledWith(EMPTY_NOW_WIDGET_NATIVE);
  expect(mockCalls).toContain("clearNative");
});

it("échec d'écriture : remonté une seule fois par session", () => {
  widget.updateSnapshot.mockImplementation(() => {
    throw new Error("native down");
  });
  pushNowWidget(props({ childName: "A" }));
  jest.runOnlyPendingTimers();
  pushNowWidget(props({ childName: "B" }));
  jest.runOnlyPendingTimers();
  expect(captureServiceError).toHaveBeenCalledTimes(1);
  expect(captureServiceError).toHaveBeenCalledWith(expect.any(Error), { service: "widgetSync", operation: "updateSnapshot" });
});
