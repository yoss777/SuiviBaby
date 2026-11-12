// Règles écran de la passe UI/UX V2 : actions de ligne sans glissement,
// aperçus internes masqués hors drapeau, indicateur « Tétée en cours ».
import fs from "fs";
import path from "path";
import { ActionSheetIOS, Alert, Platform } from "react-native";

import { isPlusRouteVisible, resolveShowPreviews } from "@/constants/featureFlags";
import { EMPTY_NURSING_TIMER } from "@/components/forms/nursingTimer";
import { describeNursingDraft } from "@/utils/nursingDraftDisplay";
import {
  buildRowAccessibilityActions,
  handleRowAccessibilityAction,
  showRowActionMenu,
} from "@/utils/rowActions";

const read = (p: string) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

describe("actions de ligne (alternative au glissement)", () => {
  it("expose Modifier / Supprimer selon les droits", () => {
    expect(buildRowAccessibilityActions({ canEdit: true, canDelete: true })).toEqual([
      { name: "activate", label: "Modifier" },
      { name: "delete", label: "Supprimer" },
    ]);
    expect(buildRowAccessibilityActions({ canEdit: true, canDelete: false })).toEqual([
      { name: "activate", label: "Modifier" },
    ]);
    expect(buildRowAccessibilityActions({ canEdit: false, canDelete: false })).toBeUndefined();
  });

  it("route l'action d'accessibilité vers le bon gestionnaire", () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const ev = (actionName: string) => ({ nativeEvent: { actionName } }) as never;
    handleRowAccessibilityAction(ev("delete"), { onEdit, onDelete });
    handleRowAccessibilityAction(ev("activate"), { onEdit, onDelete });
    handleRowAccessibilityAction(ev("magicTap"), { onEdit, onDelete });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("menu de l'appui long : Supprimer marqué destructif (iOS) / dialogue (Android)", () => {
    const onDelete = jest.fn();
    const sheet = jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation((opts, cb) => {
      expect(opts.options).toEqual(["Modifier", "Supprimer", "Annuler"]);
      expect(opts.destructiveButtonIndex).toBe(1);
      cb(1);
    });
    const original = Platform.OS;
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    expect(showRowActionMenu({ title: "Tétée", onEdit: jest.fn(), onDelete })).toBe(true);
    expect(onDelete).toHaveBeenCalled();

    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    showRowActionMenu({ title: "Tétée", onDelete });
    expect(alert).toHaveBeenCalled();
    expect(showRowActionMenu({ title: "x" })).toBe(false);

    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
    sheet.mockRestore();
    alert.mockRestore();
  });

  it("le Journal, l'Accueil, Croissance et les listes génériques s'en servent", () => {
    for (const file of [
      "app/(drawer)/baby/(tabs)/chrono.tsx",
      "app/(drawer)/baby/(tabs)/croissance.tsx",
      "components/suivibaby/dashboard/RecentEventsList.tsx",
      "components/eventList/EventListScreen.tsx",
    ]) {
      const src = read(file);
      expect(src).toContain("buildRowAccessibilityActions(");
      expect(src).toContain("onAccessibilityAction=");
      expect(src).toContain("showRowActionMenu(");
    }
  });
});

describe("suppressions unitaires sans modale « irréversible »", () => {
  it.each([
    "app/(drawer)/baby/(tabs)/home.tsx",
    "app/(drawer)/baby/(tabs)/chrono.tsx",
    "app/(drawer)/baby/(tabs)/croissance.tsx",
    "app/(drawer)/baby/(tabs)/growth.tsx",
    "app/(drawer)/baby/(tabs)/soins.tsx",
    "app/(drawer)/baby/(tabs)/activities.tsx",
    "app/(drawer)/baby/(tabs)/milestones.tsx",
    "app/(drawer)/baby/(tabs)/routines.tsx",
    "components/eventList/EventListScreen.tsx",
  ])("%s", (file) => {
    const src = read(file);
    expect(src).not.toMatch(/irréversible/);
    expect(src).not.toMatch(/visible=\{deleteConfirm\.visible\}/);
    expect(src).not.toMatch(/softDelete\.deleteConfirm/);
  });
});

describe("aperçus internes", () => {
  it("visibles en dev ou avec extra.showPreviews === true seulement", () => {
    expect(resolveShowPreviews(true, undefined)).toBe(true);
    expect(resolveShowPreviews(false, { showPreviews: true })).toBe(true);
    expect(resolveShowPreviews(false, { showPreviews: "true" })).toBe(false);
    expect(resolveShowPreviews(false, {})).toBe(false);
    expect(resolveShowPreviews(false, null)).toBe(false);
  });

  it("l'aperçu croissance-fusion a été retiré (2026-11-12)", () => {
    const fs = require("fs");
    const path = require("path");
    const root = path.join(__dirname, "..");
    expect(fs.existsSync(path.join(root, "app/(drawer)/baby/(tabs)/croissance-fusion.tsx"))).toBe(false);
    expect(read("app/(drawer)/baby/(tabs)/plus.tsx")).not.toMatch(/croissance-fusion/);
    expect(read("app/(drawer)/baby/(tabs)/_layout.tsx")).not.toMatch(/croissance-fusion/);
    expect(isPlusRouteVisible("/baby/growth", false)).toBe(true);
  });

  it("app.json ne porte pas showPreviews (builds de store)", () => {
    expect(read("app.json")).not.toMatch(/showPreviews/);
  });
});

describe("indicateur « Tétée en cours »", () => {
  const now = 1_700_000_000_000;

  it("côté en cours : statut, côté et temps écoulé", () => {
    const d = describeNursingDraft(
      {
        ...EMPTY_NURSING_TIMER,
        leftSeconds: 120,
        runningSide: "left",
        runningSince: now - 4 * 60_000,
        startedAt: now - 6 * 60_000,
        updatedAt: now - 4 * 60_000,
      },
      now,
    );
    expect(d.running).toBe(true);
    expect(d.totalSeconds).toBe(360);
    expect(d.label).toBe("Tétée en cours · côté gauche · 6 min");
    expect(d.accessibilityLabel).toBe("Tétée en cours, côté gauche, 6 min. Reprendre la tétée");
  });

  it("en pause : pas de côté ; moins d'une minute lisible", () => {
    const paused = describeNursingDraft(
      { ...EMPTY_NURSING_TIMER, leftSeconds: 300, rightSeconds: 3600, startedAt: now, updatedAt: now },
      now,
    );
    expect(paused.running).toBe(false);
    expect(paused.label).toBe("Tétée en pause · 1 h 05");
    const fresh = describeNursingDraft(
      { ...EMPTY_NURSING_TIMER, runningSide: "right", runningSince: now - 20_000, startedAt: now - 20_000, updatedAt: now },
      now,
    );
    expect(fresh.label).toBe("Tétée en cours · côté droit · moins d'1 min");
  });

  it("l'Accueil affiche l'indicateur et ne réécrit pas le stockage du chrono", () => {
    const home = read("app/(drawer)/baby/(tabs)/home.tsx");
    expect(home).toContain("<NursingInProgressBanner");
    const banner = read("components/suivibaby/dashboard/NursingInProgressBanner.tsx");
    expect(banner).toContain("loadNursingTimer");
    expect(banner).not.toMatch(/saveNursingTimer|clearNursingTimer|AsyncStorage/);
  });
});
