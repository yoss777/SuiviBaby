// N1 (audit V2) : un brouillon de tétée ne détourne jamais une feuille Repas
// ouverte pour un autre type, n'impose jamais son heure à un autre repas, et
// expire tout seul s'il est oublié.
import {
  EMPTY_NURSING_TIMER,
  formatNursingMinutes,
  isNursingDraftStale,
  nursingDraftLabel,
  PAUSED_DRAFT_TTL_MS,
  proposedMealDate,
  resolveNursingDraftOnOpen,
  RUNNING_DRAFT_TTL_MS,
  toggleSide,
  type NursingTimerState,
} from "@/components/forms/nursingTimer";

const T0 = 1_700_000_000_000;
const MIN = 60 * 1000;
const running = toggleSide(EMPTY_NURSING_TIMER, "left", T0);
const paused: NursingTimerState = {
  ...EMPTY_NURSING_TIMER,
  leftSeconds: 300,
  startedAt: T0,
  updatedAt: T0 + 5 * MIN,
};

describe("expiration des brouillons", () => {
  it("en pause : expire au-delà d'1 h sans action", () => {
    expect(PAUSED_DRAFT_TTL_MS).toBe(60 * MIN);
    expect(isNursingDraftStale(paused, paused.updatedAt + 59 * MIN)).toBe(false);
    expect(isNursingDraftStale(paused, paused.updatedAt + 61 * MIN)).toBe(true);
  });

  it("en marche : expire au-delà de 3 h sans action", () => {
    expect(RUNNING_DRAFT_TTL_MS).toBe(180 * MIN);
    expect(isNursingDraftStale(running, T0 + 2 * 60 * MIN)).toBe(false);
    expect(isNursingDraftStale(running, T0 + 3 * 60 * MIN + 1)).toBe(true);
  });
});

describe("reprise à l'ouverture de la feuille", () => {
  const base = { isEditing: false, formHasProgress: false };

  it("feuille ouverte sur Tétée : le chrono est repris", () => {
    expect(resolveNursingDraftOnOpen({ ...base, draft: running, currentType: "tetee" })).toBe(
      "resume",
    );
  });

  it("feuille ouverte pour un biberon ou un solide : proposé, jamais imposé", () => {
    expect(resolveNursingDraftOnOpen({ ...base, draft: running, currentType: "biberon" })).toBe(
      "offer",
    );
    expect(resolveNursingDraftOnOpen({ ...base, draft: paused, currentType: "solide" })).toBe(
      "offer",
    );
  });

  it("rien à reprendre : pas de brouillon, brouillon vide, édition, chrono déjà lancé", () => {
    expect(resolveNursingDraftOnOpen({ ...base, draft: null, currentType: "tetee" })).toBe("none");
    expect(
      resolveNursingDraftOnOpen({ ...base, draft: EMPTY_NURSING_TIMER, currentType: "tetee" }),
    ).toBe("none");
    expect(
      resolveNursingDraftOnOpen({ ...base, isEditing: true, draft: running, currentType: "tetee" }),
    ).toBe("none");
    expect(
      resolveNursingDraftOnOpen({
        ...base,
        formHasProgress: true,
        draft: running,
        currentType: "tetee",
      }),
    ).toBe("none");
  });
});

describe("heure proposée", () => {
  const formDate = new Date(T0 + 120 * MIN);

  it("une tétée prend l'heure de début du chrono si l'heure n'a pas été choisie", () => {
    expect(
      proposedMealDate({ mealType: "tetee", timer: running, dateTouched: false, fallback: formDate })
        .getTime(),
    ).toBe(T0);
  });

  it("jamais pour un biberon ou un solide", () => {
    for (const mealType of ["biberon", "solide"]) {
      expect(
        proposedMealDate({ mealType, timer: running, dateTouched: false, fallback: formDate }),
      ).toBe(formDate);
    }
  });

  it("une heure choisie à la main l'emporte toujours", () => {
    expect(
      proposedMealDate({ mealType: "tetee", timer: running, dateTouched: true, fallback: formDate }),
    ).toBe(formDate);
  });

  it("sans chrono démarré, l'heure du formulaire", () => {
    expect(
      proposedMealDate({
        mealType: "tetee",
        timer: EMPTY_NURSING_TIMER,
        dateTouched: false,
        fallback: formDate,
      }),
    ).toBe(formDate);
  });
});

describe("libellé du bandeau", () => {
  it("dit si la tétée tourne ou est en pause, avec sa durée", () => {
    expect(nursingDraftLabel(running, T0 + 12 * MIN)).toBe("Tétée en cours (12 min)");
    expect(nursingDraftLabel(paused, T0 + 60 * MIN)).toBe("Tétée en pause (5 min)");
  });

  it("formate les durées courtes et longues", () => {
    expect(formatNursingMinutes(30)).toBe("moins d'1 min");
    expect(formatNursingMinutes(65 * 60)).toBe("1 h 05");
  });
});
