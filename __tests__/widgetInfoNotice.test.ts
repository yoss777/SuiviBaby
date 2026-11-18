// Information à la pose du widget (registre RGPD, traitement 5) : une fois par
// appareil, à la première détection d'un widget posé.
import AsyncStorage from "@react-native-async-storage/async-storage";

const mockCapture = jest.fn();
jest.mock("@/utils/errorReporting", () => ({ captureServiceError: (...a: unknown[]) => mockCapture(...a) }));

import {
  WIDGET_INFO_TITLE,
  __resetWidgetInfoForTests,
  maybeShowWidgetInfo,
  widgetInfoMessage,
} from "@/services/widgetInfoNotice";

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  mockCapture.mockClear();
  __resetWidgetInfoForTests();
  (AsyncStorage.getItem as jest.Mock).mockImplementation((k: string) => Promise.resolve(store.get(k) ?? null));
  (AsyncStorage.setItem as jest.Mock).mockImplementation((k: string, v: string) => {
    store.set(k, v);
    return Promise.resolve();
  });
});

describe("information à la pose du widget", () => {
  it("lue (bouton touché) : plus jamais montrée, même au lancement suivant", async () => {
    const show = jest.fn((_t: string, _m: string, onRead: () => void) => onRead());
    expect(await maybeShowWidgetInfo(show)).toBe(true);
    expect(show.mock.calls[0][0]).toBe(WIDGET_INFO_TITLE);
    await Promise.resolve();
    __resetWidgetInfoForTests(); // nouveau lancement
    expect(await maybeShowWidgetInfo(show)).toBe(false);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("fermée sans être lue (retour auto, app tuée) : revient au lancement suivant, une fois par lancement", async () => {
    const show = jest.fn();
    expect(await maybeShowWidgetInfo(show)).toBe(true);
    expect(await maybeShowWidgetInfo(show)).toBe(false); // même lancement
    __resetWidgetInfoForTests();
    expect(await maybeShowWidgetInfo(show)).toBe(true);
  });

  it("deux détections simultanées (lancement et retour au premier plan) : un seul message", async () => {
    const show = jest.fn();
    await Promise.all([maybeShowWidgetInfo(show), maybeShowWidgetInfo(show)]);
    expect(show).toHaveBeenCalledTimes(1);
  });

  it("stockage illisible : pas de message en boucle, échec signalé", async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(() => Promise.reject(new Error("disk")));
    const show = jest.fn();
    expect(await maybeShowWidgetInfo(show)).toBe(false);
    expect(show).not.toHaveBeenCalled();
    expect(mockCapture).toHaveBeenCalled();
  });

  it("texte : ce qu'il montre, qui peut le voir, par où passent les mises à jour, comment l'arrêter", () => {
    const ios = widgetInfoMessage("ios");
    const android = widgetInfoMessage("android");
    for (const t of [ios, android]) {
      expect(t).toMatch(/prénom/);
      expect(t).toMatch(/température/);
      expect(t).toMatch(/Expo/);
      expect(t).toMatch(/dès la prochaine ouverture de l'app/);
    }
    expect(ios).toMatch(/Apple/);
    expect(ios).toMatch(/verrouillé par un code/);
    expect(android).toMatch(/Google/);
    expect(android).toMatch(/Android ne le masque pas/);
  });
});
