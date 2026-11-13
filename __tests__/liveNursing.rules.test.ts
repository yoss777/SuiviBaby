/**
 * Tétée en cours partagée : children/{childId}/live/nursing.
 * Lue par tout aidant de l'enfant, écrite par ceux qui écrivent des événements
 * (owner, admin), forme stricte, jamais supprimée côté client.
 *
 * Run: npm run test:rules (émulateurs Firestore + Storage).
 */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "samaye-53723";

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

const PROJECT_ID = process.env.GCLOUD_PROJECT as string;
const MOTHER = "mother";
const FATHER = "father";
const NANNY = "nanny";
const STRANGER = "stranger";
const CHILD = "childLive";

let testEnv: RulesTestEnvironment;

const asUser = (uid: string) =>
  testEnv.authenticatedContext(uid, { email: `${uid}@test.com`, email_verified: true }).firestore();

const live = (db: any, id = "nursing") => doc(db, "children", CHILD, "live", id);

const validDoc = (uid: string, extra: Record<string, unknown> = {}) => ({
  leftSeconds: 120,
  rightSeconds: 0,
  runningSide: "left",
  runningSince: 1_763_000_000_000,
  startedAt: 1_762_999_880_000,
  updatedAt: 1_763_000_000_000,
  v: 1,
  updatedBy: uid,
  serverUpdatedAt: serverTimestamp(),
  ...extra,
});

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as any;
    await setDoc(doc(db, "children", CHILD), { name: "Lina", birthDate: Timestamp.now(), ownerId: MOTHER });
    await setDoc(doc(db, "children", CHILD, "access", MOTHER), { userId: MOTHER, role: "owner", grantedBy: MOTHER });
    await setDoc(doc(db, "children", CHILD, "access", FATHER), { userId: FATHER, role: "admin", grantedBy: MOTHER });
    await setDoc(doc(db, "children", CHILD, "access", NANNY), { userId: NANNY, role: "contributor", grantedBy: MOTHER });
  });
});

describe("live/nursing", () => {
  it("la mère démarre la tétée, le père et la nounou la voient", async () => {
    await assertSucceeds(setDoc(live(asUser(MOTHER)), validDoc(MOTHER)));
    await assertSucceeds(getDoc(live(asUser(FATHER))));
    await assertSucceeds(getDoc(live(asUser(NANNY))));
  });

  it("le père (parent) peut terminer : état vide horodaté", async () => {
    await assertSucceeds(setDoc(live(asUser(MOTHER)), validDoc(MOTHER)));
    await assertSucceeds(
      setDoc(
        live(asUser(FATHER)),
        validDoc(FATHER, { leftSeconds: 0, runningSide: null, runningSince: null, startedAt: null }),
      ),
    );
  });

  it("un inconnu ne lit ni n'écrit", async () => {
    await assertFails(getDoc(live(asUser(STRANGER))));
    await assertFails(setDoc(live(asUser(STRANGER)), validDoc(STRANGER)));
  });

  it("la nounou (proche) lit mais n'écrit pas", async () => {
    await assertFails(setDoc(live(asUser(NANNY)), validDoc(NANNY)));
  });

  it("refuse un auteur usurpé, un champ inconnu, un côté invalide, une autre session", async () => {
    await assertFails(setDoc(live(asUser(MOTHER)), validDoc(FATHER)));
    await assertFails(setDoc(live(asUser(MOTHER)), validDoc(MOTHER, { note: "x" })));
    await assertFails(setDoc(live(asUser(MOTHER)), validDoc(MOTHER, { runningSide: "both" })));
    await assertFails(setDoc(live(asUser(MOTHER)), validDoc(MOTHER, { leftSeconds: -5 })));
    await assertFails(setDoc(live(asUser(MOTHER), "sleep"), validDoc(MOTHER)));
  });

  it("jamais de suppression côté client", async () => {
    await assertSucceeds(setDoc(live(asUser(MOTHER)), validDoc(MOTHER)));
    await assertFails(deleteDoc(live(asUser(MOTHER))));
  });
});
