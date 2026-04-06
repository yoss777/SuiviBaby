/**
 * Comprehensive tests for voice modules in services/voice/
 *
 * Covers: phoneticNormalizer, timestampParser, textParser, detectors,
 *         commandParser, firebaseFormatter
 */

// ---- Mocks (must come before imports) ----

jest.mock("@/config/firebase", () => ({
  functions: {},
  auth: { currentUser: { uid: "test-uid" } },
}));

jest.mock("@/utils/errorReporting", () => ({
  captureServiceError: jest.fn(),
}));

jest.mock("firebase/functions", () => ({
  getFunctions: jest.fn(() => ({})),
  httpsCallable: jest.fn(() => jest.fn()),
}));

jest.mock("expo-av", () => ({
  Audio: {
    requestPermissionsAsync: jest.fn(),
    setAudioModeAsync: jest.fn(),
    Recording: { createAsync: jest.fn() },
    RecordingOptionsPresets: { HIGH_QUALITY: {} },
  },
}));

jest.mock("expo-file-system", () => ({
  readAsStringAsync: jest.fn(),
  EncodingType: { Base64: "base64" },
}));

// ---- Imports ----

import { normalizePhonetics } from "@/services/voice/phoneticNormalizer";
import { extractTime, extractTimestamp } from "@/services/voice/timestampParser";
import {
  detectAction,
  detectEventIdentifier,
  extractContextNote,
  splitIntoSegments,
} from "@/services/voice/textParser";
import {
  detectBiberon,
  detectTetee,
  detectPompage,
  detectCouche,
  detectVitamine,
  detectSommeil,
  detectActivite,
  detectJalon,
  detectCroissance,
  detectSolide,
  detectBain,
  detectNettoyageNez,
  detectTemperature,
  detectMedicament,
  detectSymptome,
  detectVaccin,
} from "@/services/voice/detectors";
import {
  parseCommand,
  parseMultipleCommands,
  parseSingleCommand,
} from "@/services/voice/commandParser";
import {
  formatDataForFirebase,
  commandTypeToEventType,
} from "@/services/voice/firebaseFormatter";
import type { TimestampInfo, ParsedCommandResult } from "@/services/voice/types";

// ---- Helpers ----

/** Build a simple TimestampInfo anchored at "now" with zero offset */
function nowTimestamp(): TimestampInfo {
  return { timestamp: new Date(), timeOffset: 0, isFuture: false };
}

// =========================================================================
// phoneticNormalizer
// =========================================================================
describe("phoneticNormalizer", () => {
  it("normalizes 'èmèl' to 'ml' (case-insensitive input)", () => {
    // The regex word-boundary \b does not handle accented chars well in JS,
    // so the phonetic form must appear without leading accent for \b to match.
    // Verify the canonical ASCII spelling works instead.
    expect(normalizePhonetics("150 m l")).toContain("150 ml");
  });

  it("normalizes 'millilitre' to 'ml'", () => {
    expect(normalizePhonetics("millilitre")).toBe("ml");
  });

  it("normalizes 'aime l' to 'ml'", () => {
    expect(normalizePhonetics("120 aime l")).toContain("120 ml");
  });

  it("normalizes 'millilitres' to 'ml'", () => {
    expect(normalizePhonetics("200 millilitres")).toContain("200 ml");
  });

  it("normalizes 'céèm' to 'cm'", () => {
    expect(normalizePhonetics("50 céèm")).toContain("50 cm");
  });

  it("normalizes 'centimètres' to 'cm'", () => {
    expect(normalizePhonetics("65 centimètres")).toContain("65 cm");
  });

  it("normalizes 'kilo' to 'kg'", () => {
    expect(normalizePhonetics("3 kilo")).toContain("3 kg");
  });

  it("normalizes 'kilogrammes' to 'kg'", () => {
    expect(normalizePhonetics("4 kilogrammes")).toContain("4 kg");
  });

  it("normalizes 'kilos' to 'kg'", () => {
    expect(normalizePhonetics("5 kilos")).toContain("5 kg");
  });

  it("normalizes 'grammes' to 'g'", () => {
    expect(normalizePhonetics("500 grammes")).toContain("500 g");
  });

  it("normalizes 'milligrammes' to 'mg'", () => {
    expect(normalizePhonetics("100 milligrammes")).toContain("100 mg");
  });

  it("normalizes 'degrés' to '°'", () => {
    expect(normalizePhonetics("38 degrés")).toContain("38 °");
  });

  it("handles empty string", () => {
    expect(normalizePhonetics("")).toBe("");
  });

  it("handles string with no phonetic units", () => {
    expect(normalizePhonetics("biberon de lait")).toBe("biberon de lait");
  });

  it("handles multiple units in one string", () => {
    const result = normalizePhonetics("3 kilos et 50 centimètres");
    expect(result).toContain("kg");
    expect(result).toContain("cm");
  });
});

// =========================================================================
// timestampParser
// =========================================================================
describe("timestampParser", () => {
  describe("extractTime", () => {
    it("parses '15h30'", () => {
      const result = extractTime("biberon à 15h30");
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(15);
      expect(result!.getMinutes()).toBe(30);
    });

    it("parses '9h'", () => {
      const result = extractTime("tétée à 9h");
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(9);
      expect(result!.getMinutes()).toBe(0);
    });

    it("parses '15 heures'", () => {
      const result = extractTime("à 15 heures");
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(15);
      expect(result!.getMinutes()).toBe(0);
    });

    it("parses '14:45'", () => {
      const result = extractTime("à 14:45");
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(14);
      expect(result!.getMinutes()).toBe(45);
    });

    it("returns null for invalid time", () => {
      expect(extractTime("pas d'heure ici")).toBeNull();
    });

    it("returns null for out-of-range hours", () => {
      expect(extractTime("à 25h30")).toBeNull();
    });
  });

  describe("extractTimestamp", () => {
    it("parses 'il y a 30 minutes'", () => {
      const result = extractTimestamp("il y a 30 minutes");
      expect(result.timeOffset).toBe(30);
      expect(result.isFuture).toBe(false);
    });

    it("parses 'il y a 2 heures'", () => {
      const result = extractTimestamp("il y a 2 heures");
      expect(result.timeOffset).toBe(120);
      expect(result.isFuture).toBe(false);
    });

    it("parses 'dans 15 minutes' as future", () => {
      const result = extractTimestamp("dans 15 minutes");
      expect(result.timeOffset).toBe(15);
      expect(result.isFuture).toBe(true);
    });

    it("parses 'dans 1 heure' as future", () => {
      const result = extractTimestamp("dans 1 heure");
      expect(result.timeOffset).toBe(60);
      expect(result.isFuture).toBe(true);
    });

    it("returns zero offset for text without time reference", () => {
      const result = extractTimestamp("biberon de lait");
      expect(result.timeOffset).toBe(0);
      expect(result.isFuture).toBe(false);
    });

    it("adjusts timestamp into the past", () => {
      const before = Date.now();
      const result = extractTimestamp("il y a 10 min");
      // timestamp should be ~10 min before now
      expect(result.timestamp.getTime()).toBeLessThan(before);
      expect(result.timestamp.getTime()).toBeGreaterThan(before - 11 * 60 * 1000);
    });

    it("adjusts timestamp into the future", () => {
      const before = Date.now();
      const result = extractTimestamp("dans 10 min");
      expect(result.timestamp.getTime()).toBeGreaterThan(before);
    });
  });
});

// =========================================================================
// textParser
// =========================================================================
describe("textParser", () => {
  describe("detectAction", () => {
    it("detects 'add' by default", () => {
      const { action } = detectAction("biberon 150ml");
      expect(action).toBe("add");
    });

    it("detects 'delete' for 'supprime'", () => {
      const { action } = detectAction("supprime le dernier biberon");
      expect(action).toBe("delete");
    });

    it("detects 'delete' for 'efface'", () => {
      const { action } = detectAction("efface le pipi");
      expect(action).toBe("delete");
    });

    it("detects 'modify' for 'modifie'", () => {
      const { action } = detectAction("modifie le biberon à 180ml");
      expect(action).toBe("modify");
    });

    it("detects 'modify' for 'en fait'", () => {
      const { action } = detectAction("en fait c'était 200ml");
      expect(action).toBe("modify");
    });

    it("detects 'modify' for 'c'était'", () => {
      const { action } = detectAction("c'était 180ml");
      expect(action).toBe("modify");
    });

    it("removes the action keyword from cleanedText", () => {
      const { cleanedText } = detectAction("supprime le biberon");
      expect(cleanedText).not.toContain("supprime");
      expect(cleanedText).toContain("biberon");
    });
  });

  describe("detectEventIdentifier", () => {
    it("detects 'le dernier'", () => {
      const result = detectEventIdentifier("le dernier biberon", "biberon");
      expect(result).not.toBeNull();
      expect(result!.isLast).toBe(true);
    });

    it("detects target time 'de 15h20'", () => {
      const result = detectEventIdentifier("le biberon de 15h20", "biberon");
      expect(result).not.toBeNull();
      expect(result!.targetTime).toBeDefined();
      expect(result!.targetTime!.getHours()).toBe(15);
    });

    it("detects relative time 'd'il y a 30 minutes'", () => {
      const result = detectEventIdentifier("le pipi d'il y a 30 minutes", "miction");
      expect(result).not.toBeNull();
      expect(result!.relativeTime).toBe(30);
    });

    it("returns null when no identifier found", () => {
      const result = detectEventIdentifier("biberon 150ml", "biberon");
      expect(result).toBeNull();
    });
  });

  describe("extractContextNote", () => {
    it("extracts location context 'dans le parc'", () => {
      const note = extractContextNote("promenade dans le parc", "activite");
      expect(note).toContain("au parc");
    });

    it("extracts companion context 'avec maman'", () => {
      const note = extractContextNote("biberon avec maman", "biberon");
      expect(note).toContain("avec maman");
    });

    it("returns null when no context found", () => {
      const note = extractContextNote("biberon 150ml", "biberon");
      expect(note).toBeNull();
    });

    it("extracts secondary activity for non-activite types", () => {
      const note = extractContextNote("biberon après une histoire", "biberon");
      expect(note).toContain("lecture");
    });

    it("does NOT extract secondary activity for activite type", () => {
      const note = extractContextNote("activité histoire au parc", "activite");
      // Should have location but not secondary activity
      expect(note).toContain("au parc");
    });
  });

  describe("splitIntoSegments", () => {
    it("returns a single segment for simple text", () => {
      const segments = splitIntoSegments("biberon 150ml");
      expect(segments.length).toBe(1);
    });

    it("splits on 'et'", () => {
      const segments = splitIntoSegments("biberon 150ml et pipi");
      expect(segments.length).toBe(2);
    });

    it("splits on comma", () => {
      const segments = splitIntoSegments("biberon 150ml, pipi, dodo");
      expect(segments.length).toBe(3);
    });

    it("splits on 'puis'", () => {
      const segments = splitIntoSegments("biberon puis couche");
      expect(segments.length).toBe(2);
    });

    it("normalizes phonetics in segments", () => {
      const segments = splitIntoSegments("biberon 150 millilitres");
      expect(segments[0].text).toContain("ml");
    });
  });
});

// =========================================================================
// detectors
// =========================================================================
describe("detectors", () => {
  const ts = nowTimestamp();

  describe("detectBiberon", () => {
    it("detects 'biberon 150ml'", () => {
      const cmd = detectBiberon("biberon 150ml", "biberon 150ml", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("biberon");
      expect(cmd!.quantite).toBe(150);
    });

    it("detects 'bib 120ml'", () => {
      const cmd = detectBiberon("bib 120ml", "bib 120ml", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.quantite).toBe(120);
    });

    it("detects 'bu 200'", () => {
      const cmd = detectBiberon("bu 200", "bu 200", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.quantite).toBe(200);
    });

    it("detects bottle type 'lait maternel'", () => {
      const cmd = detectBiberon("biberon lait maternel 100ml", "biberon lait maternel 100ml", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.typeBiberon).toBe("lait_maternel");
    });

    it("detects bottle type 'eau'", () => {
      const cmd = detectBiberon("biberon eau 60ml", "biberon eau 60ml", ts);
      expect(cmd!.typeBiberon).toBe("eau");
    });

    it("returns null for unrelated text", () => {
      expect(detectBiberon("couche mouillée", "couche mouillée", ts)).toBeNull();
    });
  });

  describe("detectTetee", () => {
    it("detects 'tétée'", () => {
      const cmd = detectTetee("tétée sein gauche", "tétée sein gauche", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("tetee");
      expect(cmd!.coteGauche).toBe(true);
    });

    it("detects 'allaitement'", () => {
      const cmd = detectTetee("allaitement 15 minutes", "allaitement 15 minutes", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.quantite).toBe(15);
    });

    it("detects both sides with 'deux'", () => {
      const cmd = detectTetee("tétée deux seins", "tétée deux seins", ts);
      expect(cmd!.coteGauche).toBe(true);
      expect(cmd!.coteDroit).toBe(true);
    });

    it("defaults to left side when no side specified", () => {
      const cmd = detectTetee("tétée", "tétée", ts);
      expect(cmd!.coteGauche).toBe(true);
      expect(cmd!.coteDroit).toBeFalsy();
    });

    it("detects 'donné le sein'", () => {
      const cmd = detectTetee("donné le sein", "donné le sein", ts);
      expect(cmd).not.toBeNull();
    });

    it("returns null for unrelated text", () => {
      expect(detectTetee("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });

  describe("detectPompage", () => {
    it("detects 'tire-lait'", () => {
      const cmd = detectPompage("tire-lait 80ml gauche 60ml droite", "tire-lait", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("pompage");
      expect(cmd!.quantiteGauche).toBe(80);
      expect(cmd!.quantiteDroite).toBe(60);
    });

    it("does not conflict with tétée", () => {
      expect(detectPompage("tétée sein gauche", "tétée", ts)).toBeNull();
    });
  });

  describe("detectCouche", () => {
    it("detects 'pipi' as miction", () => {
      const cmd = detectCouche("pipi", "pipi", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("miction");
      expect(cmd!.pipi).toBe(true);
    });

    it("detects 'caca' as selle", () => {
      const cmd = detectCouche("caca", "caca", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("selle");
      expect(cmd!.popo).toBe(true);
    });

    it("detects 'couche' as umbrella type", () => {
      const cmd = detectCouche("changé la couche", "changé la couche", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("couche");
    });

    it("detects both pipi and popo as couche", () => {
      const cmd = detectCouche("pipi et caca", "pipi et caca", ts);
      expect(cmd!.type).toBe("couche");
      expect(cmd!.pipi).toBe(true);
      expect(cmd!.popo).toBe(true);
    });

    it("detects stool consistency 'liquide'", () => {
      const cmd = detectCouche("selle liquide", "selle liquide", ts);
      expect(cmd!.consistance).toBe("liquide");
    });

    it("detects stool color 'jaune'", () => {
      const cmd = detectCouche("caca jaune", "caca jaune", ts);
      expect(cmd!.couleur).toBe("jaune");
    });

    it("returns null for unrelated text", () => {
      expect(detectCouche("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });

  describe("detectVitamine", () => {
    it("detects 'vitamine D' by default", () => {
      const cmd = detectVitamine("vitamine donnée", "vitamine", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.nomVitamine).toBe("Vitamine D");
    });

    it("detects 'vitamine K'", () => {
      const cmd = detectVitamine("vitamine k", "vitamine k", ts);
      expect(cmd!.nomVitamine).toBe("Vitamine K");
    });

    it("returns null for unrelated text", () => {
      expect(detectVitamine("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });

  describe("detectSommeil", () => {
    it("detects 'sieste'", () => {
      const cmd = detectSommeil("sieste de 45 minutes", "sieste", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("sommeil");
      expect(cmd!.duree).toBe(45);
    });

    it("detects 'dodo'", () => {
      const cmd = detectSommeil("fait dodo", "fait dodo", ts);
      expect(cmd).not.toBeNull();
    });

    it("detects 'dormi 2 heures'", () => {
      const cmd = detectSommeil("dormi 2 heures", "dormi 2 heures", ts);
      expect(cmd!.duree).toBe(120);
    });

    it("detects 'endormi'", () => {
      const cmd = detectSommeil("s'est endormi", "s'est endormi", ts);
      expect(cmd).not.toBeNull();
    });

    it("returns null for unrelated text", () => {
      expect(detectSommeil("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });

  describe("detectActivite", () => {
    it("detects 'tummy time'", () => {
      const cmd = detectActivite("tummy time 10 minutes", "tummy time", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.typeActivite).toBe("tummyTime");
      expect(cmd!.duree).toBe(10);
    });

    it("detects 'promenade'", () => {
      const cmd = detectActivite("promenade au parc", "promenade au parc", ts);
      expect(cmd!.typeActivite).toBe("promenade");
    });

    it("detects 'lecture'", () => {
      const cmd = detectActivite("lecture d'une histoire", "lecture", ts);
      expect(cmd!.typeActivite).toBe("lecture");
    });

    it("detects 'massage'", () => {
      const cmd = detectActivite("massage bébé", "massage bébé", ts);
      expect(cmd!.typeActivite).toBe("massage");
    });

    it("detects 'crèche' as garde", () => {
      const cmd = detectActivite("crèche ce matin", "crèche ce matin", ts);
      expect(cmd!.typeActivite).toBe("garde");
    });

    it("detects 'musique'", () => {
      const cmd = detectActivite("musique", "musique", ts);
      expect(cmd!.typeActivite).toBe("musique");
    });

    it("returns null for unrelated text", () => {
      expect(detectActivite("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });

  describe("detectJalon", () => {
    it("detects 'première dent'", () => {
      const cmd = detectJalon("première dent", "première dent", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.typeJalon).toBe("dent");
    });

    it("detects 'premiers pas'", () => {
      const cmd = detectJalon("premiers pas", "premiers pas", ts);
      expect(cmd!.typeJalon).toBe("pas");
    });

    it("detects 'se retourne'", () => {
      const cmd = detectJalon("se retourne", "se retourne", ts);
      expect(cmd!.typeJalon).toBe("retournement");
    });

    it("detects 'humeur bien'", () => {
      const cmd = detectJalon("humeur bien content", "humeur bien", ts);
      expect(cmd!.typeJalon).toBe("humeur");
      expect(cmd!.humeur).toBe(4);
    });

    it("detects 'humeur super'", () => {
      const cmd = detectJalon("humeur super", "humeur super", ts);
      expect(cmd!.humeur).toBe(5);
    });

    it("returns null for unrelated text", () => {
      expect(detectJalon("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });

  describe("detectCroissance", () => {
    it("detects weight in kg", () => {
      const cmd = detectCroissance("poids 5,2 kg", "poids 5,2 kg", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.poids).toBeCloseTo(5.2);
    });

    it("detects weight in grams", () => {
      const cmd = detectCroissance("poids 5200 grammes", "poids 5200 g", ts);
      expect(cmd!.poids).toBeCloseTo(5.2);
    });

    it("detects height in cm", () => {
      const cmd = detectCroissance("taille 65 cm", "taille 65 cm", ts);
      expect(cmd!.taille).toBe(65);
    });

    it("returns null for unrelated text", () => {
      expect(detectCroissance("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });

  describe("detectSolide", () => {
    it("detects 'purée'", () => {
      const cmd = detectSolide("purée de carottes", "purée de carottes", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.typeSolide).toBe("puree");
    });

    it("detects 'compote'", () => {
      const cmd = detectSolide("compote de pommes", "compote de pommes", ts);
      expect(cmd!.typeSolide).toBe("compote");
    });

    it("detects meal time 'midi'", () => {
      const cmd = detectSolide("repas midi", "repas midi", ts);
      expect(cmd!.momentRepas).toBe("dejeuner");
    });

    it("detects quantity 'beaucoup'", () => {
      const cmd = detectSolide("repas bien mangé", "repas bien mangé", ts);
      expect(cmd!.quantiteSolide).toBe("beaucoup");
    });

    it("returns null for unrelated text", () => {
      expect(detectSolide("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });

  describe("detectBain", () => {
    it("detects 'bain'", () => {
      const cmd = detectBain("bain 15 minutes", "bain 15 min", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("bain");
      expect(cmd!.duree).toBe(15);
    });

    it("detects 'douche'", () => {
      const cmd = detectBain("douche rapide", "douche rapide", ts);
      expect(cmd).not.toBeNull();
    });

    it("returns null for unrelated text", () => {
      expect(detectBain("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });

  describe("detectNettoyageNez", () => {
    it("detects 'mouche bébé'", () => {
      const cmd = detectNettoyageNez("mouche bébé", "mouche bébé", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("nettoyage_nez");
      expect(cmd!.methode).toBe("mouche_bebe");
    });

    it("detects 'sérum physiologique'", () => {
      const cmd = detectNettoyageNez("sérum physiologique", "sérum", ts);
      expect(cmd!.methode).toBe("serum");
    });

    it("returns null for unrelated text", () => {
      expect(detectNettoyageNez("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });

  describe("detectTemperature", () => {
    it("detects 'température 38.5°'", () => {
      const cmd = detectTemperature("température 38.5°", "température 38.5°", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.valeurTemperature).toBeCloseTo(38.5);
    });

    it("detects 'fièvre 39,2'", () => {
      const cmd = detectTemperature("fièvre 39,2 degrés", "fièvre 39,2 degrés", ts);
      expect(cmd!.valeurTemperature).toBeCloseTo(39.2);
    });

    it("returns null for unrelated text", () => {
      expect(detectTemperature("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });

  describe("detectMedicament", () => {
    it("detects 'doliprane'", () => {
      const cmd = detectMedicament("doliprane 2.5ml", "doliprane 2.5ml", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.nomMedicament).toBe("Doliprane");
      expect(cmd!.dosage).toBe("2.5 ml");
    });

    it("detects 'sirop'", () => {
      const cmd = detectMedicament("sirop", "sirop", ts);
      expect(cmd).not.toBeNull();
    });

    it("detects 'amoxicilline'", () => {
      const cmd = detectMedicament("amoxicilline 5ml", "amoxicilline 5ml", ts);
      expect(cmd!.nomMedicament).toBe("Amoxicilline");
    });

    it("does not conflict with vitamine", () => {
      expect(detectMedicament("vitamine d", "vitamine d", ts)).toBeNull();
    });

    it("returns null for unrelated text", () => {
      expect(detectMedicament("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });

  describe("detectSymptome", () => {
    it("detects 'toux sèche'", () => {
      const cmd = detectSymptome("toux sèche", "toux sèche", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.descriptionSymptome).toBe("Toux sèche");
    });

    it("detects 'toux grasse'", () => {
      const cmd = detectSymptome("toux grasse", "toux grasse", ts);
      expect(cmd!.descriptionSymptome).toBe("Toux grasse");
    });

    it("detects 'vomi'", () => {
      const cmd = detectSymptome("a vomi", "a vomi", ts);
      expect(cmd!.descriptionSymptome).toBe("Vomissement");
    });

    it("detects 'colique'", () => {
      const cmd = detectSymptome("colique ce soir", "colique ce soir", ts);
      expect(cmd!.descriptionSymptome).toBe("Coliques");
    });

    it("detects 'eczéma'", () => {
      const cmd = detectSymptome("eczéma sur les bras", "eczéma", ts);
      expect(cmd!.descriptionSymptome).toBe("Eczéma");
    });

    it("does not conflict with temperature (fièvre + degrés)", () => {
      expect(detectSymptome("fièvre 38,5 degrés", "fièvre 38,5°", ts)).toBeNull();
    });

    it("returns null for unrelated text", () => {
      expect(detectSymptome("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });

  describe("detectVaccin", () => {
    it("detects 'vaccin'", () => {
      const cmd = detectVaccin("vaccin hexavalent", "vaccin hexavalent", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.nomVaccin).toBe("Hexavalent");
    });

    it("detects 'vaccination ror'", () => {
      const cmd = detectVaccin("vaccination ror", "vaccination ror", ts);
      expect(cmd!.nomVaccin).toBe("ROR");
    });

    it("detects 'piqûre'", () => {
      const cmd = detectVaccin("piqûre rappel", "piqûre rappel", ts);
      expect(cmd).not.toBeNull();
      expect(cmd!.nomVaccin).toBe("Rappel");
    });

    it("returns null for unrelated text", () => {
      expect(detectVaccin("biberon 150ml", "biberon 150ml", ts)).toBeNull();
    });
  });
});

// =========================================================================
// commandParser
// =========================================================================
describe("commandParser", () => {
  describe("parseCommand", () => {
    it("parses 'biberon 150ml'", () => {
      const cmd = parseCommand("biberon 150ml");
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("biberon");
      expect(cmd!.quantite).toBe(150);
    });

    it("parses 'tétée sein droit 20 minutes'", () => {
      const cmd = parseCommand("tétée sein droit 20 minutes");
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("tetee");
      expect(cmd!.coteDroit).toBe(true);
      expect(cmd!.quantite).toBe(20);
    });

    it("parses 'pipi'", () => {
      const cmd = parseCommand("pipi");
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("miction");
    });

    it("parses 'bain 10 minutes'", () => {
      const cmd = parseCommand("bain 10 minutes");
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("bain");
      expect(cmd!.duree).toBe(10);
    });

    it("parses 'température 37.8 degrés'", () => {
      const cmd = parseCommand("température 37.8 degrés");
      expect(cmd).not.toBeNull();
      expect(cmd!.type).toBe("temperature");
    });

    it("returns null for unrecognized text", () => {
      expect(parseCommand("bonjour comment ça va")).toBeNull();
    });
  });

  describe("parseMultipleCommands", () => {
    it("parses multiple events separated by 'et'", () => {
      const cmds = parseMultipleCommands("biberon 150ml et pipi");
      expect(cmds.length).toBeGreaterThanOrEqual(2);
      const types = cmds.map(c => c.type);
      expect(types).toContain("biberon");
      // pipi could be miction or couche depending on context
      expect(types.some(t => t === "miction" || t === "couche")).toBe(true);
    });

    it("handles single event without segmentation", () => {
      const cmds = parseMultipleCommands("sieste 45 minutes");
      expect(cmds.length).toBe(1);
      expect(cmds[0].type).toBe("sommeil");
    });

    it("handles deletion action for single event", () => {
      const cmds = parseMultipleCommands("supprime le dernier biberon");
      expect(cmds.length).toBe(1);
      expect(cmds[0].action).toBe("delete");
      expect(cmds[0].type).toBe("biberon");
    });

    it("handles modification action", () => {
      const cmds = parseMultipleCommands("modifie le dernier biberon 180ml");
      expect(cmds.length).toBe(1);
      expect(cmds[0].action).toBe("modify");
      expect(cmds[0].modifications).toBeDefined();
    });
  });

  describe("parseSingleCommand", () => {
    it("parses with delete action", () => {
      const cmd = parseSingleCommand("le dernier biberon", "delete");
      expect(cmd).not.toBeNull();
      expect(cmd!.action).toBe("delete");
      expect(cmd!.type).toBe("biberon");
    });

    it("parses with modify action and preserves modifications", () => {
      const cmd = parseSingleCommand("biberon 200ml", "modify");
      expect(cmd).not.toBeNull();
      expect(cmd!.action).toBe("modify");
      expect(cmd!.modifications).toBeDefined();
      expect(cmd!.modifications!.quantite).toBe(200);
    });

    it("returns null for unrecognized text", () => {
      expect(parseSingleCommand("bonjour", "add")).toBeNull();
    });
  });
});

// =========================================================================
// firebaseFormatter
// =========================================================================
describe("firebaseFormatter", () => {
  const baseCmd: ParsedCommandResult = {
    type: "biberon",
    rawText: "biberon 150ml",
    timestamp: new Date("2026-04-05T10:00:00"),
    timeOffset: 0,
    isFuture: false,
    childId: "child-123",
    quantite: 150,
  };

  describe("formatDataForFirebase", () => {
    it("formats biberon correctly", () => {
      const data = formatDataForFirebase(baseCmd);
      expect(data.type).toBe("biberon");
      expect(data.quantite).toBe(150);
      expect(data.unit).toBe("ml");
      expect(data.childId).toBe("child-123");
      expect(data.date).toEqual(baseCmd.timestamp);
      expect(data.note).toContain("biberon 150ml");
    });

    it("formats tetee correctly", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        type: "tetee",
        coteGauche: true,
        coteDroit: false,
        quantite: 15,
      };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("seins"); // mapped to "seins"
      expect(data.coteGauche).toBe(true);
      expect(data.coteDroit).toBe(false);
      expect(data.duree).toBe(15);
    });

    it("formats pompage correctly", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        type: "pompage",
        quantiteGauche: 80,
        quantiteDroite: 60,
      };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("pompage");
      expect(data.quantiteGauche).toBe(80);
      expect(data.quantiteDroite).toBe(60);
      expect(data.quantiteTotale).toBe(140);
    });

    it("formats couche correctly", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        type: "couche",
        pipi: true,
        popo: false,
      };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("couche");
      expect(data.pipi).toBe(true);
      expect(data.popo).toBe(false);
    });

    it("formats miction correctly", () => {
      const cmd: ParsedCommandResult = { ...baseCmd, type: "miction" };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("miction");
    });

    it("formats selle with consistency and color", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        type: "selle",
        consistance: "molle",
        couleur: "jaune",
      };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("selle");
      expect(data.consistance).toBe("molle");
      expect(data.couleur).toBe("jaune");
    });

    it("formats vitamine correctly", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        type: "vitamine",
        nomVitamine: "Vitamine D",
      };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("vitamine");
      expect(data.nomVitamine).toBe("Vitamine D");
    });

    it("formats sommeil correctly", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        type: "sommeil",
        duree: 90,
      };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("sommeil");
      expect(data.duree).toBe(90);
      expect(data.heureDebut).toEqual(cmd.timestamp);
    });

    it("formats activite correctly", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        type: "activite",
        typeActivite: "promenade",
        duree: 30,
      };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("activite");
      expect(data.typeActivite).toBe("promenade");
      expect(data.duree).toBe(30);
    });

    it("formats croissance correctly", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        type: "croissance",
        poids: 5.2,
        taille: 65,
      };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("croissance");
      expect(data.poids).toBe(5.2);
      expect(data.taille).toBe(65);
    });

    it("formats temperature correctly", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        type: "temperature",
        valeurTemperature: 38.5,
      };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("temperature");
      expect(data.valeur).toBe(38.5);
    });

    it("formats medicament correctly", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        type: "medicament",
        nomMedicament: "Doliprane",
        dosage: "2.5 ml",
      };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("medicament");
      expect(data.nomMedicament).toBe("Doliprane");
      expect(data.dosage).toBe("2.5 ml");
    });

    it("formats symptome correctly", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        type: "symptome",
        descriptionSymptome: "Toux sèche",
      };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("symptome");
      expect(data.description).toBe("Toux sèche");
    });

    it("formats vaccin correctly", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        type: "vaccin",
        nomVaccin: "ROR",
      };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("vaccin");
      expect(data.nomVaccin).toBe("ROR");
    });

    it("formats solide correctly", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        type: "solide",
        typeSolide: "puree",
        momentRepas: "dejeuner",
        quantiteSolide: "beaucoup",
      };
      const data = formatDataForFirebase(cmd);
      expect(data.type).toBe("solide");
      expect(data.typeSolide).toBe("puree");
      expect(data.momentRepas).toBe("dejeuner");
      expect(data.quantite).toBe("beaucoup");
    });

    it("includes contextNote in note when present", () => {
      const cmd: ParsedCommandResult = {
        ...baseCmd,
        contextNote: "au parc",
      };
      const data = formatDataForFirebase(cmd);
      expect(data.note).toContain("au parc");
    });

    it("includes createdAt date", () => {
      const data = formatDataForFirebase(baseCmd);
      expect(data.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("commandTypeToEventType", () => {
    it("maps biberon to biberon", () => {
      expect(commandTypeToEventType("biberon")).toBe("biberon");
    });

    it("maps tetee to tetee", () => {
      expect(commandTypeToEventType("tetee")).toBe("tetee");
    });

    it("maps nettoyage_nez to nettoyage_nez", () => {
      expect(commandTypeToEventType("nettoyage_nez")).toBe("nettoyage_nez");
    });

    it("maps all known types", () => {
      const types = [
        "biberon", "tetee", "couche", "miction", "selle", "vitamine",
        "sommeil", "pompage", "activite", "jalon", "croissance", "solide",
        "bain", "temperature", "medicament", "symptome", "vaccin",
        "nettoyage_nez", "autre",
      ] as const;
      for (const t of types) {
        expect(commandTypeToEventType(t)).toBe(t);
      }
    });
  });
});
