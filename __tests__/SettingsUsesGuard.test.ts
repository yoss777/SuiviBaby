import fs from "fs";
import path from "path";

// Les points d'entrée de menu doivent passer par la navigation gardée :
// plus aucun router.push direct dans ces fichiers.
const GUARDED_FILES = [
  "app/(drawer)/settings.tsx",
  "app/settings/edit-child.tsx",
  "app/(drawer)/share-child.tsx",
  "app/(drawer)/baby/manage-access.tsx",
  "app/(drawer)/baby/(tabs)/plus.tsx",
  "app/(drawer)/baby/(tabs)/home.tsx",
  "app/child-picker.tsx",
  "components/ui/PaywallPrompt.tsx",
  "components/drawer/CustomDrawerContent.tsx",
  "components/suivibaby/voice/VoiceCommandModals.tsx",
  "components/suivibaby/AddChildModal.tsx",
  "hooks/useEventEditHandler.ts",
  "hooks/useMomentsActions.ts",
];

describe("navigation gardée", () => {
  it.each(GUARDED_FILES)("%s n'appelle plus router.push directement", (file) => {
    const src = fs.readFileSync(path.join(__dirname, "..", file), "utf8");
    expect(src).not.toMatch(/router\.push\(/);
    expect(src).toContain("useGuardedNavigation");
  });

  it("les lignes de réglages (dont Export) utilisent guardedPush", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "app/(drawer)/settings.tsx"), "utf8");
    expect(src).toContain('guardedPush("/settings/export")');
  });
});

// « Voir plus » saute au prochain événement dès le premier appui manuel, sur
// tous les écrans de liste (non migrés inclus).
describe("« Voir plus » manuel", () => {
  it.each(["activities", "milestones", "soins", "routines"])(
    "%s saute dès l'appui manuel (!auto || tentatives épuisées)",
    (name) => {
      const src = fs.readFileSync(
        path.join(__dirname, "..", `app/(drawer)/baby/(tabs)/${name}.tsx`),
        "utf8",
      );
      expect(src).toMatch(/if \(!auto \|\| autoLoadMoreAttempts >= MAX_AUTO_LOAD_ATTEMPTS - 1\)/);
      expect(src).toContain("daysWindowToCover(nextEventDate, endOfRange)");
    },
  );
});
