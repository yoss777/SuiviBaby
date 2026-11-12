/* eslint-disable import/first */
// Règles de la passe UI/UX R4 (audit V3) : rouges destructifs lisibles, un
// seul modèle de suppression (feuille d'édition = annulation 8 s), appui long
// sur les listes secondaires, ripples bornés, bandeau de tétée.

jest.mock("@gorhom/portal", () => ({
  Portal: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
}));

import fs from "fs";
import path from "path";
import React from "react";
import { ActionSheetIOS, Alert, Platform, Text } from "react-native";
import { act, fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import * as Haptics from "expo-haptics";

import { EMPTY_NURSING_TIMER, PAUSED_DRAFT_TTL_MS } from "@/components/forms/nursingTimer";
import { mixHex } from "@/components/ui/accentColors";
import { getNeutralColors } from "@/constants/dashboardColors";
import { eventColors } from "@/constants/eventColors";
import { Colors, contrastRatio } from "@/constants/theme";
import { ToastProvider } from "@/contexts/ToastContext";
import { useSheetDeleteWithUndo } from "@/hooks/useSheetDeleteWithUndo";
import { useSoftDeletedIds } from "@/hooks/useSoftDeletedIds";
import { describeNursingDraft } from "@/utils/nursingDraftDisplay";
import { ROW_LONG_PRESS_HINT, rowActionProps } from "@/utils/rowActions";
import {
  getSoftDeletedIds,
  resetSoftDeletedIdsForTests,
  setSoftDeletedIds,
} from "@/utils/softDeletedStore";

const ROOT = path.join(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const TABS = "app/(drawer)/baby/(tabs)/";

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "backups") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}
const SOURCES = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components"))];

// ============================================
// 1. Rouges destructifs (N-V3-1)
// ============================================

describe("aplats destructifs lisibles", () => {
  it.each(["light", "dark"] as const)("destructive / onDestructive ≥ 4.5:1 (%s)", (scheme) => {
    const nc = getNeutralColors(scheme);
    expect(contrastRatio(nc.onDestructive, nc.destructive)).toBeGreaterThanOrEqual(4.5);
    // Action de récupération (pending-deletion) : tint / onTint.
    expect(contrastRatio(Colors[scheme].onTint, Colors[scheme].tint)).toBeGreaterThanOrEqual(4.5);
  });

  it("« A aimé / N'a pas aimé » : aplats sous texte blanc ≥ 4.5:1", () => {
    expect(contrastRatio("#ffffff", "#15803d")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#ffffff", getNeutralColors("light").destructive)).toBeGreaterThanOrEqual(4.5);
  });

  it("aucun aplat plein en `error` (#ef4444) dans app/ et components/", () => {
    const offenders: string[] = [];
    const re = /backgroundColor:\s*(?:nc|neutralColors|colors)\.error\b(?!\s*\+)|backgroundColor:\s*["']#ef4444["']/gi;
    for (const file of SOURCES) {
      const src = fs.readFileSync(file, "utf8");
      for (const m of src.matchAll(re)) {
        offenders.push(`${path.relative(ROOT, file)}:${src.slice(0, m.index).split("\n").length}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("les glissements des listes secondaires et la suppression groupée utilisent destructive", () => {
    for (const f of ["routines", "soins", "activities", "milestones"]) {
      expect(read(`${TABS}${f}.tsx`)).toContain("backgroundColor: nc.destructive");
    }
    expect(read("components/ui/SelectionToolbar.tsx")).toContain("nc.destructive");
    expect(read("components/drawer/CustomDrawerContent.tsx")).toContain("nc.destructive");
  });

  it("« Annuler la suppression » (récupération) n'est pas en rouge", () => {
    const src = read("app/(auth)/pending-deletion.tsx");
    const button = src.slice(src.indexOf("styles.primaryButton"), src.indexOf("Annuler la suppression\n"));
    expect(button).toContain("backgroundColor: tint");
    expect(button).not.toMatch(/nc\.(error|destructive)/);
  });

  it("join-child « Refuser » : plus d'opacité qui fait tomber le contraste", () => {
    expect(read("app/settings/join-child.tsx")).not.toMatch(/backgroundColor: nc\.\w+, opacity: 0\.85/);
  });
});

// ============================================
// 2. Suppression depuis la feuille d'édition (R-P1-12)
// ============================================

const FORMS = [
  "MealsForm",
  "ActivitiesForm",
  "DiapersForm",
  "PumpingForm",
  "CroissanceForm",
  "RoutinesForm",
  "MilestonesForm",
  "SoinsForm",
];

describe("« Supprimer » des feuilles d'édition", () => {
  it.each(FORMS)("%s : fermeture + annulation 8 s, sans confirmation", (name) => {
    const src = read(`components/forms/${name}.tsx`);
    expect(src).toContain("useSheetDeleteWithUndo()");
    expect(src).toMatch(/deleteFromSheet\(\{[\s\S]*?close: onDelete,[\s\S]*?\}\)/);
    expect(src).not.toMatch(/showConfirm\(/);
    expect(src).not.toMatch(/Voulez-vous vraiment supprimer/);
  });

  beforeEach(() => {
    jest.useFakeTimers();
    resetSoftDeletedIdsForTests();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  function Harness({ run, close }: { run: () => Promise<"deleted">; close: () => void }) {
    const deleteFromSheet = useSheetDeleteWithUndo();
    const [hidden] = useSoftDeletedIds();
    return (
      <>
        {!hidden.has("e1") && <Text>Ligne e1</Text>}
        <Text onPress={() => deleteFromSheet({ id: "e1", message: "Activité supprimée", run, close })}>
          Supprimer
        </Text>
      </>
    );
  }

  it("ferme la feuille, masque la ligne partout, « Annuler » la rétablit sans appel serveur", () => {
    const run = jest.fn(async () => "deleted" as const);
    const close = jest.fn();
    render(
      <ToastProvider>
        <Harness run={run} close={close} />
      </ToastProvider>,
    );
    fireEvent.press(screen.getByText("Supprimer"));
    expect(close).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Ligne e1")).toBeNull();
    expect(getSoftDeletedIds().has("e1")).toBe(true);
    expect(screen.getByText("Activité supprimée")).toBeTruthy();

    fireEvent.press(screen.getByText("Annuler"));
    expect(screen.getByText("Ligne e1")).toBeTruthy();
    act(() => { jest.advanceTimersByTime(10_000); });
    expect(run).not.toHaveBeenCalled();
  });

  it("supprime côté serveur à l'expiration du délai seulement", async () => {
    const run = jest.fn(async () => "deleted" as const);
    render(
      <ToastProvider>
        <Harness run={run} close={jest.fn()} />
      </ToastProvider>,
    );
    fireEvent.press(screen.getByText("Supprimer"));
    act(() => { jest.advanceTimersByTime(7_999); });
    expect(run).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("une saisie pas encore confirmée par le serveur n'est ni fermée ni supprimée", () => {
    const run = jest.fn(async () => "deleted" as const);
    const close = jest.fn();
    function Optimistic() {
      const deleteFromSheet = useSheetDeleteWithUndo();
      return (
        <Text onPress={() => deleteFromSheet({ id: "__optimistic_1", message: "x", run, close })}>
          Supprimer
        </Text>
      );
    }
    render(
      <ToastProvider>
        <Optimistic />
      </ToastProvider>,
    );
    fireEvent.press(screen.getByText("Supprimer"));
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByText("Enregistrement en cours...")).toBeTruthy();
  });

  it("useSoftDeletedIds : état local + ids partagés, le setter ne touche que le local", () => {
    const { result } = renderHook(() => useSoftDeletedIds());
    act(() => result.current[1](new Set(["local"])));
    act(() => setSoftDeletedIds(new Set(["shared"])));
    expect([...result.current[0]].sort()).toEqual(["local", "shared"]);
    // Purge locale (données rechargées) : l'id partagé reste masqué.
    act(() => result.current[1](new Set()));
    expect([...result.current[0]]).toEqual(["shared"]);
  });

  it("les écrans de liste lisent les ids partagés", () => {
    for (const f of ["home", "chrono", "croissance", "routines", "soins", "activities", "milestones", "growth"]) {
      expect(read(`${TABS}${f}.tsx`)).toContain("useSoftDeletedIds()");
    }
    expect(read("hooks/eventList/useSoftDelete.ts")).toContain("useSoftDeletedIds()");
  });
});

// ============================================
// 3. Appui long + actions d'accessibilité (R-P1-13, N-V3-3)
// ============================================

describe("menu d'appui long sur les listes secondaires", () => {
  it.each(["routines", "soins", "activities", "milestones", "growth"])("%s", (f) => {
    const src = read(`${TABS}${f}.tsx`);
    expect(src).toMatch(
      /\{\.\.\.rowActionProps\(\{[\s\S]*?onEdit: \(\) => openEditModal\(event\),[\s\S]*?handleEventDelete\(event\)[\s\S]*?disabled: selectionMode,/,
    );
  });

  it("rowActionProps : actions, indice, appui long avec retour haptique", () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const props = rowActionProps({ title: "Soin", onEdit, onDelete });
    expect(props.accessibilityHint).toBe(ROW_LONG_PRESS_HINT);
    expect(props.accessibilityActions).toEqual([
      { name: "activate", label: "Modifier" },
      { name: "delete", label: "Supprimer" },
    ]);
    props.onAccessibilityAction?.({ nativeEvent: { actionName: "delete" } } as never);
    expect(onDelete).toHaveBeenCalledTimes(1);

    const original = Platform.OS;
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
    props.onLongPress?.();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    buttons.find((b) => b.text === "Modifier")?.onPress?.();
    expect(onEdit).toHaveBeenCalledTimes(1);

    const sheet = jest.spyOn(ActionSheetIOS, "showActionSheetWithOptions").mockImplementation((_o, cb) => cb(1));
    Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
    props.onLongPress?.();
    expect(onDelete).toHaveBeenCalledTimes(2);

    Object.defineProperty(Platform, "OS", { value: original, configurable: true });
    alert.mockRestore();
    sheet.mockRestore();
  });

  it("rien en mode sélection ni sans action", () => {
    expect(rowActionProps({ title: "x", onEdit: jest.fn(), disabled: true })).toEqual({});
    expect(rowActionProps({ title: "x" })).toEqual({});
    expect(rowActionProps({ title: "x", onEdit: jest.fn() }).accessibilityActions).toEqual([
      { name: "activate", label: "Modifier" },
    ]);
  });

  it("indice d'appui long aussi sur le Journal, l'Accueil, Croissance et les listes génériques", () => {
    for (const file of [
      `${TABS}chrono.tsx`,
      `${TABS}croissance.tsx`,
      "components/suivibaby/dashboard/RecentEventsList.tsx",
      "components/eventList/EventListScreen.tsx",
    ]) {
      expect(read(file)).toContain("ROW_LONG_PRESS_HINT");
    }
    // Indice visuel unique (toast discret), une fois par installation.
    expect(read("hooks/useSwipeHint.ts")).toContain("LONG_PRESS_HINT_TOAST");
  });
});

// ============================================
// 4. Ripples bornés (N-V3-2) — même détection que v3tools/ripple.py
// ============================================

describe("ripple Android borné aux coins arrondis", () => {
  const CLIP = ['overflow: "hidden"', "RIPPLE_CLIP", "rippleContainerStyle("];

  function findUnclipped(): string[] {
    const offenders: string[] = [];
    for (const file of SOURCES) {
      const src = fs.readFileSync(file, "utf8");
      if (!src.includes("android_ripple")) continue;
      const styles = new Map<string, string>();
      for (const m of src.matchAll(/\n {2}(\w+): \{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g)) {
        if (!styles.has(m[1])) styles.set(m[1], m[2]);
      }
      for (const m of src.matchAll(/<Pressable\b/g)) {
        const win = src.slice(m.index, m.index + 1500);
        const cut = /\n\s*\/?>/.exec(win);
        const tag = cut ? win.slice(0, cut.index) : win;
        if (!tag.includes("android_ripple") || tag.includes("borderless")) continue;
        const keys = [...tag.matchAll(/styles\.(\w+)/g)].map((k) => k[1]);
        const bodies = keys.map((k) => styles.get(k) ?? "");
        const rounded = tag.includes("borderRadius") || bodies.some((b) => b.includes("borderRadius"));
        const clipped = [tag, ...bodies].some((b) => CLIP.some((c) => b.includes(c)));
        if (rounded && !clipped) {
          offenders.push(`${path.relative(ROOT, file)}:${src.slice(0, m.index).split("\n").length}`);
        }
      }
    }
    return offenders;
  }

  it("tout Pressable arrondi avec ripple borne son ripple", () => {
    expect(findUnclipped()).toEqual([]);
  });

  it("RIPPLE_CLIP ne coupe rien sur iOS (ombres conservées)", () => {
    jest.isolateModules(() => {
      const original = Platform.OS;
      Object.defineProperty(Platform, "OS", { value: "ios", configurable: true });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ios = require("@/components/ui/pressFeedback");
      expect(ios.RIPPLE_CLIP).toEqual({});
      expect(ios.rippleContainerStyle(12)).toEqual({ borderRadius: 12 });
      Object.defineProperty(Platform, "OS", { value: original, configurable: true });
    });
    jest.isolateModules(() => {
      const original = Platform.OS;
      Object.defineProperty(Platform, "OS", { value: "android", configurable: true });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const android = require("@/components/ui/pressFeedback");
      expect(android.RIPPLE_CLIP).toEqual({ overflow: "hidden" });
      expect(android.rippleContainerStyle(12)).toEqual({ borderRadius: 12, overflow: "hidden" });
      Object.defineProperty(Platform, "OS", { value: original, configurable: true });
    });
  });
});

// ============================================
// 5. Bandeaux de tétée (N-V3-5/6/7)
// ============================================

describe("tétée : contraste, lecteur d'écran, brouillon en pause", () => {
  it("« Abandonner » (textNormal) ≥ 4.5:1 sur le fond doux corail, dans les deux thèmes", () => {
    const accent = eventColors.meal.dark;
    const light = mixHex("#f9fafb", accent, 0.14);
    expect(contrastRatio(getNeutralColors("light").textNormal, light)).toBeGreaterThanOrEqual(4.5);
    expect(read("components/forms/MealsForm.tsx")).toContain("mutedText: nc.textNormal");
  });

  it("plus de région live dans le bandeau de brouillon (annonce au changement d'état)", () => {
    const src = read("components/forms/NursingTimerDisplay.tsx");
    expect(src).not.toContain("accessibilityLiveRegion");
    expect(src).toContain("announceForAccessibility");
  });

  it("feuille fermée sur une tétée en pause : toast vers l'Accueil", () => {
    const src = read("components/forms/MealsForm.tsx");
    expect(src).toContain("Tétée en pause — reprenez-la depuis l'accueil");
    expect(src).toMatch(/hasNursingProgress\(timerRef\.current\)\) \{\n\s*showToast\(NURSING_PAUSED_CLOSE_TOAST/);
  });

  it("l'Accueil affiche l'heure d'effacement d'une tétée en pause, mise en avant à 10 min", () => {
    const now = new Date(2026, 10, 12, 14, 0).getTime();
    const paused = { ...EMPTY_NURSING_TIMER, leftSeconds: 600, startedAt: now, updatedAt: now };
    const d = describeNursingDraft(paused, now);
    expect(d.expiryLabel).toBe("Effacée à 15:00 sans reprise");
    expect(d.expiringSoon).toBe(false);
    expect(d.accessibilityLabel).toContain("Effacée à 15:00 sans reprise");
    const late = describeNursingDraft(paused, now + PAUSED_DRAFT_TTL_MS - 5 * 60_000);
    expect(late.expiringSoon).toBe(true);

    const running = describeNursingDraft(
      { ...paused, runningSide: "left", runningSince: now },
      now,
    );
    expect(running.expiryLabel).toBeNull();
    expect(running.expiringSoon).toBe(false);
    expect(read("components/suivibaby/dashboard/NursingInProgressBanner.tsx")).toContain("display.expiryLabel");
  });
});
