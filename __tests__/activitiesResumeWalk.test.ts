// Remettre en cours une balade terminée : bloqué seulement si une AUTRE balade tourne.
import { otherWalkBlocksResume } from "@/utils/walkResume";

const base = { isChronoMode: true, isOngoing: true, isEditing: true, editId: "b1" };

it("aucune balade en cours : permis (régression : bloquait « une autre balade est déjà en cours »)", () => {
  expect(otherWalkBlocksResume({ ...base, runningId: undefined })).toBe(false);
});

it("la balade modifiée est celle qui tourne : permis", () => {
  expect(otherWalkBlocksResume({ ...base, runningId: "b1" })).toBe(false);
});

it("une autre balade tourne : bloqué", () => {
  expect(otherWalkBlocksResume({ ...base, runningId: "b2" })).toBe(true);
});

it("balade terminée (pas remise en cours) ou création : jamais bloqué ici", () => {
  expect(otherWalkBlocksResume({ ...base, isOngoing: false, runningId: "b2" })).toBe(false);
  expect(otherWalkBlocksResume({ ...base, isEditing: false, runningId: "b2" })).toBe(false);
});
