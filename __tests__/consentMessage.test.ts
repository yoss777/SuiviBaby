import {
  getConsentErrorMessage,
  nextConsentErrorMessage,
} from "@/utils/consentMessage";

describe("message d'erreur de consentement", () => {
  it("décrit précisément ce qui manque", () => {
    expect(getConsentErrorMessage(false, false)).toMatch(/conditions et le consentement/);
    expect(getConsentErrorMessage(false, true)).toMatch(/politique de confidentialité/);
    expect(getConsentErrorMessage(true, false)).toMatch(/données de santé/);
    expect(getConsentErrorMessage(true, true)).toBeNull();
  });

  it("n'affiche rien tant qu'aucune erreur n'a été montrée", () => {
    expect(nextConsentErrorMessage(null, true, false)).toBeNull();
  });

  it("se régénère à chaque case cochée et disparaît quand les deux le sont", () => {
    let msg: string | null = getConsentErrorMessage(false, false);
    // Coche les conditions : il ne reste que la santé
    msg = nextConsentErrorMessage(msg, true, false);
    expect(msg).toBe(getConsentErrorMessage(true, false));
    // Décoche les conditions : les deux manquent à nouveau
    msg = nextConsentErrorMessage(msg, false, false);
    expect(msg).toBe(getConsentErrorMessage(false, false));
    // Coche les deux
    msg = nextConsentErrorMessage(msg, true, false);
    msg = nextConsentErrorMessage(msg, true, true);
    expect(msg).toBeNull();
  });
});
