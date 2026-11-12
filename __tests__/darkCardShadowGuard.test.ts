// Android draws `elevation` as a dark frame around cards on the dark
// background (iOS shadows stay invisible). Dashboard and list cards must be
// flattened in dark mode with flatInDark(colorScheme).
import fs from "fs";
import path from "path";
import { flatInDark } from "@/constants/theme";

const root = path.join(__dirname, "..");
const CARDS = [
  "components/suivibaby/dashboard/StatsGroup.tsx",
  "components/suivibaby/dashboard/SleepWidget.tsx",
  "components/suivibaby/dashboard/PromenadeWidget.tsx",
  "components/suivibaby/dashboard/RecentEventsList.tsx",
  "app/(drawer)/baby/(tabs)/home.tsx",
  "app/(drawer)/baby/(tabs)/chrono.tsx",
  "app/(drawer)/baby/(tabs)/moments.tsx",
  "app/(drawer)/baby/(tabs)/croissance.tsx",
  "app/(drawer)/baby/(tabs)/activities.tsx",
  "app/(drawer)/baby/(tabs)/growth.tsx",
  "app/(drawer)/baby/(tabs)/milestones.tsx",
  "app/(drawer)/baby/(tabs)/routines.tsx",
  "app/(drawer)/baby/(tabs)/manage-access.tsx",
];

describe("cards are flat in dark mode", () => {
  it("removes elevation and shadow only in dark mode", () => {
    expect(flatInDark("dark")).toEqual({ elevation: 0, shadowOpacity: 0 });
    expect(flatInDark("light")).toBeNull();
    expect(flatInDark(null)).toBeNull();
  });

  it.each(CARDS)("%s applies flatInDark to its card", (file) => {
    expect(fs.readFileSync(path.join(root, file), "utf8")).toMatch(/flatInDark\(colorScheme\)/);
  });
});
