/**
 * S11.5 - Multi-user scenario on the Firebase emulators.
 *
 * A (owner) shares a child with B through a share code. The access is created
 * by the REAL redeemShareCodeCF (functions/index.js, Admin SDK against the
 * Firestore emulator), not seeded by hand. B (contributor, "Proche") reads the
 * child's events, likes and comments a photo event, but cannot create or update
 * events. A revokes B (access docs removed as the app does) and B can no longer
 * read anything.
 *
 * Run: npm run test:rules (Firestore + Storage emulators).
 */
process.env.GCLOUD_PROJECT = "samaye-53723";

import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  limit,
  Timestamp,
} from "firebase/firestore";

const PROJECT_ID = "samaye-53723";
const A = "userA";
const B = "userB";
const CHILD = "childAB";
const CODE = "ABCD1234";

let testEnv: RulesTestEnvironment;
let redeemShareCodeCF: any;
let createShareCodeCF: any;
let setMemberRoleCF: any;
let code = CODE;

const asUser = (uid: string) =>
  testEnv.authenticatedContext(uid, { email: `${uid}@test.com`, email_verified: true }).firestore();

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
  // Loaded after the emulator env is known: firebase-admin talks to the emulator.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  redeemShareCodeCF = require("../functions/index").redeemShareCodeCF;
  createShareCodeCF = require("../functions/index").createShareCode;
  setMemberRoleCF = require("../functions/index").setMemberRole;
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe("A shares with B, B reads and interacts, A revokes", () => {
  beforeAll(async () => {
    await testEnv.clearFirestore();
    // A owns the child (bootstrap data, written as the app does at child creation).
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as any;
      await setDoc(doc(db, "children", CHILD), { name: "Baby", birthDate: Timestamp.now(), ownerId: A });
      await setDoc(doc(db, "children", CHILD, "access", A), { userId: A, role: "owner", grantedBy: A });
      await setDoc(doc(db, "user_child_access", `${A}_${CHILD}`), { userId: A, childId: CHILD });
      await setDoc(doc(db, "events", "plain"), { childId: CHILD, userId: A, type: "biberon", createdAt: Timestamp.now() });
      await setDoc(doc(db, "events", "photo"), {
        childId: CHILD, userId: A, type: "jalon", createdAt: Timestamp.now(), photos: [`children/${CHILD}/jalons/p.jpg`],
      });
    });
  });

  test("before sharing, B sees nothing", async () => {
    const db = asUser(B);
    await assertFails(getDoc(doc(db, "events", "plain")));
    await assertFails(getDoc(doc(db, "children", CHILD)));
  });

  test("A creates a share code through createShareCode (server-side)", async () => {
    const res = await createShareCodeCF.run({
      auth: { uid: A, token: { email: `${A}@test.com`, email_verified: true } },
      data: { childId: CHILD },
      rawRequest: {},
      app: { appId: "test", token: {} },
    });
    expect(res.code).toMatch(/^[A-Z0-9]{6}$/);
    code = res.code;
    // The creator can read it back under the rules.
    await assertSucceeds(getDoc(doc(asUser(A), "shareCodes", code)));
  });

  test("B cannot grant himself access from the client", async () => {
    await assertFails(setDoc(doc(asUser(B), "children", CHILD, "access", B), { userId: B, role: "owner", grantedBy: B }));
    await assertFails(setDoc(doc(asUser(B), "children", CHILD, "access", B), { userId: B, role: "admin", grantedBy: A }));
  });

  test("B redeems the code through redeemShareCodeCF and becomes contributor", async () => {
    const res = await redeemShareCodeCF.run({
      auth: { uid: B, token: { email: `${B}@test.com`, email_verified: true } },
      data: { code },
      rawRequest: {},
      app: { appId: "test", token: {} },
    });
    expect(res).toMatchObject({ childId: CHILD, childName: "Baby" });

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as any;
      const access = (await getDoc(doc(db, "children", CHILD, "access", B))).data();
      expect(access).toMatchObject({ userId: B, role: "contributor", grantedBy: A, canWriteEvents: false });
      expect((await getDoc(doc(db, "user_child_access", `${B}_${CHILD}`))).exists()).toBe(true);
      expect((await getDoc(doc(db, "shareCodes", code))).data()).toMatchObject({ used: true, usedBy: B });
    });
  });

  test("the code cannot be redeemed twice", async () => {
    await expect(
      redeemShareCodeCF.run({
        auth: { uid: "userC", token: { email: "c@test.com", email_verified: true } },
        data: { code },
        rawRequest: {},
        app: { appId: "test", token: {} },
      })
    ).rejects.toMatchObject({ code: "not-found" });
  });

  test("B reads the child and all events, and sees his access index", async () => {
    const db = asUser(B);
    await assertSucceeds(getDoc(doc(db, "children", CHILD)));
    await assertSucceeds(getDoc(doc(db, "events", "plain")));
    await assertSucceeds(getDoc(doc(db, "events", "photo")));
    await assertSucceeds(getDoc(doc(db, "user_child_access", `${B}_${CHILD}`)));
    const list = await assertSucceeds(getDocs(query(collection(db, "user_child_access"), where("userId", "==", B), limit(50))));
    expect(list.size).toBe(1);
  });

  test("B likes and comments a photo event, but not a plain one", async () => {
    const db = asUser(B);
    await assertSucceeds(setDoc(doc(db, "eventLikes", "likeB"), { childId: CHILD, eventId: "photo", userId: B }));
    await assertSucceeds(
      setDoc(doc(db, "eventComments", "comB"), { childId: CHILD, eventId: "photo", userId: B, content: "Adorable", createdAt: Timestamp.now() })
    );
    await assertSucceeds(updateDoc(doc(db, "eventComments", "comB"), { content: "Adorable!" }));
    await assertFails(setDoc(doc(db, "eventLikes", "likePlain"), { childId: CHILD, eventId: "plain", userId: B }));
    await assertFails(
      setDoc(doc(db, "eventComments", "comPlain"), { childId: CHILD, eventId: "plain", userId: B, content: "x", createdAt: Timestamp.now() })
    );
    // Not in someone else's name.
    await assertFails(setDoc(doc(db, "eventLikes", "likeFake"), { childId: CHILD, eventId: "photo", userId: A }));
  });

  test("B cannot create, update or delete events, nor edit the child or the access", async () => {
    const db = asUser(B);
    await assertFails(setDoc(doc(db, "events", "newB"), { childId: CHILD, userId: B, type: "biberon", createdAt: Timestamp.now() }));
    await assertFails(updateDoc(doc(db, "events", "plain"), { note: "hacked" }));
    await assertFails(deleteDoc(doc(db, "events", "plain")));
    await assertFails(updateDoc(doc(db, "children", CHILD), { name: "Renamed" }));
    await assertFails(updateDoc(doc(db, "children", CHILD, "access", B), { role: "owner" }));
    await assertFails(setDoc(doc(db, "shareCodes", "BBBB1111"), {
      code: "BBBB1111", childId: CHILD, createdBy: B, used: false, expiresAt: Timestamp.fromMillis(Date.now() + 3600000),
    }));
  });

  test("A can still write events", async () => {
    await assertSucceeds(setDoc(doc(asUser(A), "events", "newA"), { childId: CHILD, userId: A, type: "biberon", createdAt: Timestamp.now() }));
  });

  const callRole = (uid: string, role: string) =>
    setMemberRoleCF.run({
      auth: { uid, token: { email: `${uid}@test.com`, email_verified: true } },
      data: { childId: CHILD, memberId: B, role },
      rawRequest: {},
      app: { appId: "test", token: {} },
    });

  test("only A (owner) switches B between Proche and Parent, and the rules follow the new role", async () => {
    // B cannot promote himself, through the callable or the client.
    await expect(callRole(B, "admin")).rejects.toMatchObject({ code: "permission-denied" });
    await assertFails(updateDoc(doc(asUser(B), "children", CHILD, "access", B), { role: "admin" }));
    // A cannot do it from the client either: only the callable writes access docs.
    await assertFails(updateDoc(doc(asUser(A), "children", CHILD, "access", B), { role: "admin", canWriteEvents: true }));

    await callRole(A, "admin");
    await assertSucceeds(setDoc(doc(asUser(B), "events", "byParentB"), { childId: CHILD, userId: B, type: "biberon", createdAt: Timestamp.now() }));
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const access = (await getDoc(doc(ctx.firestore() as any, "children", CHILD, "access", B))).data();
      expect(access).toMatchObject({ role: "admin", canWriteEvents: true, grantedBy: A });
    });

    await callRole(A, "contributor");
    await assertFails(setDoc(doc(asUser(B), "events", "byProcheB"), { childId: CHILD, userId: B, type: "biberon", createdAt: Timestamp.now() }));
    await assertSucceeds(getDoc(doc(asUser(B), "events", "plain")));
  });

  test("a non-owner cannot revoke B (C has no access, B cannot revoke himself via the child access)", async () => {
    await assertFails(deleteDoc(doc(asUser("userC"), "children", CHILD, "access", B)));
    await assertFails(deleteDoc(doc(asUser(B), "children", CHILD, "access", B)));
  });

  test("A revokes B, and B loses every read", async () => {
    const dbA = asUser(A);
    await assertSucceeds(deleteDoc(doc(dbA, "children", CHILD, "access", B)));
    await assertSucceeds(deleteDoc(doc(dbA, "user_child_access", `${B}_${CHILD}`)));

    const db = asUser(B);
    await assertFails(getDoc(doc(db, "children", CHILD)));
    await assertFails(getDoc(doc(db, "events", "plain")));
    await assertFails(getDoc(doc(db, "events", "photo")));
    await assertFails(getDoc(doc(db, "eventLikes", "likeB")));
    await assertFails(getDoc(doc(db, "eventComments", "comB")));
    await assertFails(getDocs(query(collection(db, "eventLikes"), where("childId", "==", CHILD))));
    await assertFails(setDoc(doc(db, "eventLikes", "likeAgain"), { childId: CHILD, eventId: "photo", userId: B }));
    await assertFails(setDoc(doc(db, "eventComments", "comAgain"), { childId: CHILD, eventId: "photo", userId: B, content: "x", createdAt: Timestamp.now() }));
    const list = await getDocs(query(collection(db, "user_child_access"), where("userId", "==", B), limit(50)));
    expect(list.size).toBe(0);
  });

  test("A still owns everything after the revocation", async () => {
    const db = asUser(A);
    await assertSucceeds(getDoc(doc(db, "events", "plain")));
    await assertSucceeds(getDoc(doc(db, "children", CHILD, "access", A)));
  });
});
