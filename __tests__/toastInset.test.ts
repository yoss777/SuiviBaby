// Position des toasts du bas (audit UI/UX V2, N4) : au-dessus de la barre
// d'onglets et du dock seulement quand les onglets sont à l'écran ; sur un
// écran empilé (Réglages, Partager, modale de pile), zone de sécurité du bas.
import {
  resolveTabChromeInset,
  toastBottomOffset,
  TOAST_GAP,
  TOAST_SAFE_AREA_MARGIN,
} from "@/utils/toastInset";

describe("resolveTabChromeInset", () => {
  const base = { focused: true, keyboardVisible: false, tabBarHeight: 83, dockInset: 0 };

  it("onglets au premier plan : hauteur de la barre (+ dock)", () => {
    expect(resolveTabChromeInset(base)).toBe(83);
    expect(resolveTabChromeInset({ ...base, dockInset: 56 })).toBe(139);
  });

  it("écran empilé par-dessus les onglets : aucun inset", () => {
    expect(resolveTabChromeInset({ ...base, focused: false, dockInset: 56 })).toBe(0);
  });

  it("clavier visible (barre masquée) ou barre pas encore mesurée : aucun inset", () => {
    expect(resolveTabChromeInset({ ...base, keyboardVisible: true })).toBe(0);
    expect(resolveTabChromeInset({ ...base, tabBarHeight: 0, dockInset: 56 })).toBe(0);
  });
});

describe("toastBottomOffset", () => {
  it("au-dessus du chrome quand il est déclaré", () => {
    expect(toastBottomOffset({ chromeInset: 83, safeAreaBottom: 34 })).toBe(83 + TOAST_GAP);
  });

  it("sinon, zone de sécurité du bas", () => {
    expect(toastBottomOffset({ chromeInset: 0, safeAreaBottom: 34 })).toBe(
      34 + TOAST_SAFE_AREA_MARGIN,
    );
  });
});
