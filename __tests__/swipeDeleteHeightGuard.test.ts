// The swipe « Supprimer » action is drawn behind the card and must follow the
// card's height (aligned by its marginBottom). A minHeight made it taller than
// short one-line cards, so the red button showed under them (2026-11-12).
import fs from "fs";
import path from "path";

const root = path.join(__dirname, "..");
const FILES = [
  "app/(drawer)/baby/(tabs)/chrono.tsx",
  "app/(drawer)/baby/(tabs)/croissance.tsx",
  "app/(drawer)/baby/(tabs)/routines.tsx",
  "app/(drawer)/baby/(tabs)/soins.tsx",
  "app/(drawer)/baby/(tabs)/activities.tsx",
  "app/(drawer)/baby/(tabs)/milestones.tsx",
  "app/(drawer)/baby/(tabs)/growth.tsx",
  "components/suivibaby/dashboard/RecentEventsList.tsx",
  "components/eventList/EventListScreen.tsx",
];

describe("swipe delete action height", () => {
  it.each(FILES)("%s: deleteAction has no minHeight", (file) => {
    const src = fs.readFileSync(path.join(root, file), "utf8");
    const m = src.match(/ deleteAction: \{([\s\S]*?)\n  \},/);
    if (!m) return; // no swipe action style in this file
    expect(m[1]).not.toMatch(/minHeight/);
  });
});
