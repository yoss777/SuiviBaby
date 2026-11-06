import { captureServiceError } from "@/utils/errorReporting";
import { runDeleteWithRetry, MAX_DELETE_ATTEMPTS } from "@/utils/deleteWithRetry";

const flush = () => new Promise((r) => setImmediate(r));

function setup(run: jest.Mock) {
  const showActionToast = jest.fn();
  const showToast = jest.fn();
  const onRestore = jest.fn();
  const onHide = jest.fn();
  const start = () =>
    runDeleteWithRetry({
      run,
      onRestore,
      onHide,
      getToasts: () => ({ showActionToast, showToast }),
      context: { service: "events", operation: "deleteWithUndo" },
    });
  return { showActionToast, showToast, onRestore, onHide, start };
}

beforeEach(() => jest.clearAllMocks());

describe("runDeleteWithRetry", () => {
  it("stays silent when the server deleted it", async () => {
    const t = setup(jest.fn().mockResolvedValue("deleted"));
    await t.start();
    expect(t.showToast).not.toHaveBeenCalled();
    expect(t.showActionToast).not.toHaveBeenCalled();
    expect(t.onRestore).not.toHaveBeenCalled();
  });

  it("treats a legacy void result as done", async () => {
    const t = setup(jest.fn().mockResolvedValue(undefined));
    await t.start();
    expect(t.showToast).not.toHaveBeenCalled();
  });

  it("says the synchronisation is pending when the deletion was only queued, and keeps the item hidden", async () => {
    const t = setup(jest.fn().mockResolvedValue("queued"));
    await t.start();
    expect(t.showToast).toHaveBeenCalledWith("Suppression enregistrée : synchronisation en attente.");
    expect(t.onRestore).not.toHaveBeenCalled();
  });

  it("a grouped deletion is 'pending' as soon as one of them was queued", async () => {
    const t = setup(jest.fn().mockResolvedValue(["deleted", "queued"]));
    await t.start();
    expect(t.showToast).toHaveBeenCalledWith("Suppression enregistrée : synchronisation en attente.");
    const t2 = setup(jest.fn().mockResolvedValue(["deleted", "deleted"]));
    await t2.start();
    expect(t2.showToast).not.toHaveBeenCalled();
  });

  it("restores the item, reports to Sentry and offers « Réessayer » on failure", async () => {
    const error = new Error("boom");
    const t = setup(jest.fn().mockRejectedValue(error));
    await t.start();
    expect(t.onRestore).toHaveBeenCalledTimes(1);
    expect(captureServiceError).toHaveBeenCalledWith(error, { service: "events", operation: "deleteWithUndo" });
    expect(t.showActionToast).toHaveBeenCalledWith(
      "Erreur lors de la suppression",
      "Réessayer",
      expect.any(Function),
    );
  });

  it("« Réessayer » hides the item again and calls the CURRENT run, not a stale result", async () => {
    const run = jest
      .fn()
      .mockRejectedValueOnce(new Error("1"))
      .mockResolvedValueOnce("deleted");
    const t = setup(run);
    await t.start();
    const retry = t.showActionToast.mock.calls[0][2] as () => void;
    retry();
    await flush();
    expect(t.onHide).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(2);
    expect(t.showActionToast).toHaveBeenCalledTimes(1); // pas de nouvelle erreur
    expect(t.onRestore).toHaveBeenCalledTimes(1);
  });

  it("uses the toast functions of the moment, not the ones captured when the delete started", async () => {
    const run = jest.fn().mockRejectedValue(new Error("x"));
    const first = { showActionToast: jest.fn(), showToast: jest.fn() };
    const second = { showActionToast: jest.fn(), showToast: jest.fn() };
    let current = first;
    await runDeleteWithRetry({
      run,
      onRestore: jest.fn(),
      getToasts: () => current,
      context: { service: "events", operation: "d" },
    });
    current = second; // le composant a été rendu à nouveau
    (first.showActionToast.mock.calls[0][2] as () => void)();
    await flush();
    expect(second.showActionToast).toHaveBeenCalledTimes(1);
    expect(first.showActionToast).toHaveBeenCalledTimes(1);
  });

  it(`gives up after ${MAX_DELETE_ATTEMPTS} attempts with a final message`, async () => {
    const run = jest.fn().mockRejectedValue(new Error("down"));
    const t = setup(run);
    await t.start();
    for (let i = 1; i < MAX_DELETE_ATTEMPTS; i++) {
      (t.showActionToast.mock.calls[i - 1][2] as () => void)();
      await flush();
    }
    expect(run).toHaveBeenCalledTimes(MAX_DELETE_ATTEMPTS);
    expect(t.showActionToast).toHaveBeenCalledTimes(MAX_DELETE_ATTEMPTS - 1);
    expect(t.showToast).toHaveBeenLastCalledWith("Échec de la suppression");
    expect(t.onRestore).toHaveBeenCalledTimes(MAX_DELETE_ATTEMPTS);
  });
});
