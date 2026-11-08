/**
 * Export RGPD : les requêtes de lecture et de décompte (count()) de l'écran
 * d'export sont autorisées pour un Parent (tout le suivi) et un Proche (ses
 * saisies, ses likes, ses commentaires), et refusées sans accès à l'enfant.
 *
 * Run: npm run test:rules (Firestore + Storage emulators).
 */
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "samaye-53723";

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import {
  collection,
  doc,
  getCountFromServer,
  getDocsFromServer,
  query,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";

const PROJECT_ID = process.env.GCLOUD_PROJECT as string;
const PARENT = "parentP";
const PROCHE = "procheQ";
const STRANGER = "strangerS";
const CHILD = "childExport";

let testEnv: RulesTestEnvironment;
const asUser = (uid: string) =>
  testEnv.authenticatedContext(uid, { email: `${uid}@test.com`, email_verified: true }).firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore() as any;
    await setDoc(doc(db, "children", CHILD), { name: "Baby", ownerId: PARENT });
    await setDoc(doc(db, "children", CHILD, "access", PARENT), { userId: PARENT, role: "owner" });
    await setDoc(doc(db, "children", CHILD, "access", PROCHE), { userId: PROCHE, role: "viewer" });
    const now = Timestamp.now();
    await setDoc(doc(db, "events", "e1"), { childId: CHILD, userId: PARENT, type: "biberon", createdAt: now });
    await setDoc(doc(db, "events", "e2"), { childId: CHILD, userId: PROCHE, type: "biberon", createdAt: now });
    await setDoc(doc(db, "events", "e3"), { childId: CHILD, userId: PROCHE, type: "selle", createdAt: now });
    await setDoc(doc(db, "eventLikes", "l1"), { childId: CHILD, eventId: "e1", userId: PROCHE, createdAt: now });
    await setDoc(doc(db, "eventLikes", "l2"), { childId: CHILD, eventId: "e1", userId: PARENT, createdAt: now });
    await setDoc(doc(db, "eventComments", "m1"), { childId: CHILD, eventId: "e1", userId: PROCHE, text: "ok", createdAt: now });
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

const count = (db: any, col: string, ...filters: Array<[string, unknown]>) =>
  getCountFromServer(query(collection(db, col), ...filters.map(([f, v]) => where(f, "==", v)))).then((s) => s.data().count);

describe("décomptes serveur (count) de l'écran d'export", () => {
  it("Parent : événements d'un type, tous auteurs", async () => {
    const db = asUser(PARENT) as any;
    await expect(assertSucceeds(count(db, "events", ["childId", CHILD], ["type", "biberon"]))).resolves.toBe(2);
  });

  it("Proche : seulement ses saisies par type, ses likes et ses commentaires", async () => {
    const db = asUser(PROCHE) as any;
    await expect(assertSucceeds(count(db, "events", ["childId", CHILD], ["userId", PROCHE], ["type", "biberon"]))).resolves.toBe(1);
    await expect(assertSucceeds(count(db, "eventLikes", ["childId", CHILD], ["userId", PROCHE]))).resolves.toBe(1);
    await expect(assertSucceeds(count(db, "eventComments", ["childId", CHILD], ["userId", PROCHE]))).resolves.toBe(1);
  });

  it("sans accès à l'enfant : décomptes refusés", async () => {
    const db = asUser(STRANGER) as any;
    await assertFails(count(db, "events", ["childId", CHILD], ["type", "biberon"]));
    await assertFails(count(db, "eventLikes", ["childId", CHILD], ["userId", STRANGER]));
    await assertFails(count(db, "eventComments", ["childId", CHILD], ["userId", STRANGER]));
  });
});

describe("lectures complètes de l'export", () => {
  it("Proche : ses événements lus depuis le serveur", async () => {
    const db = asUser(PROCHE) as any;
    const snap = await assertSucceeds(
      getDocsFromServer(query(collection(db, "events"), where("childId", "==", CHILD), where("userId", "==", PROCHE))),
    );
    expect(snap.docs.map((d: any) => d.id).sort()).toEqual(["e2", "e3"]);
  });

  it("sans accès à l'enfant : lecture refusée", async () => {
    const db = asUser(STRANGER) as any;
    await assertFails(getDocsFromServer(query(collection(db, "events"), where("childId", "==", CHILD))));
  });
});
