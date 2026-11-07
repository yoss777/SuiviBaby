/**
 * Firestore Security Rules Tests
 *
 * These tests run against the Firebase Emulator (NOT Jest mocks).
 * Start the emulator first:
 *   firebase emulators:start --only firestore
 *
 * Or run via:
 *   npm run test:rules
 */
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
  deleteField,
  collection,
  getDocs,
  query,
  where,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// emulators:exec fixe GCLOUD_PROJECT (CI : projet factice demo-*, aucun identifiant requis).
const PROJECT_ID = process.env.GCLOUD_PROJECT || "samaye-53723";
const RULES_PATH = "firestore.rules";

const ALICE_UID = "alice";
const BOB_UID = "bob";
const CHARLIE_UID = "charlie";
const CHILD_ID = "child1";
const CHILD2_ID = "child2";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let testEnv: RulesTestEnvironment;

/** Shorthand: get a Firestore instance authenticated as a given user */
function authedFirestore(uid: string, email?: string) {
  return testEnv
    .authenticatedContext(uid, { email: email ?? `${uid}@test.com` })
    .firestore();
}

/** Unauthenticated Firestore instance */
function unauthFirestore() {
  return testEnv.unauthenticatedContext().firestore();
}

/** Seed data with admin (security-rules-disabled) context */
async function seedData(
  fn: (adminDb: ReturnType<typeof authedFirestore>) => Promise<void>
) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const adminDb = ctx.firestore();
    await fn(adminDb as any);
  });
}

const now = Timestamp.now();

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
});

// ===========================================================================
// 1. CHILDREN COLLECTION
// ===========================================================================

describe("children collection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      // Create a child owned by alice
      await setDoc(doc(db, "children", CHILD_ID), {
        name: "Baby",
        birthDate: now,
        ownerId: ALICE_UID,
      });
      // Create access doc for alice (owner)
      await setDoc(doc(db, "children", CHILD_ID, "access", ALICE_UID), {
        userId: ALICE_UID,
        role: "owner",
        grantedBy: ALICE_UID,
      });
      // Soft-deleted child
      await setDoc(doc(db, "children", CHILD2_ID), {
        name: "Deleted Baby",
        birthDate: now,
        ownerId: ALICE_UID,
        deletedAt: now,
      });
      await setDoc(doc(db, "children", CHILD2_ID, "access", ALICE_UID), {
        userId: ALICE_UID,
        role: "owner",
        grantedBy: ALICE_UID,
      });
    });
  });

  test("unauthenticated user cannot read a child", async () => {
    const db = unauthFirestore();
    await assertFails(getDoc(doc(db, "children", CHILD_ID)));
  });

  test("owner can read own child", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "children", CHILD_ID)));
  });

  test("non-owner without access cannot read child", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(getDoc(doc(db, "children", CHILD_ID)));
  });

  test("soft-deleted child cannot be read even by owner", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(getDoc(doc(db, "children", CHILD2_ID)));
  });

  test("authenticated user can create child with valid data (ownerId == uid)", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(
      setDoc(doc(db, "children", "newChild"), {
        name: "New Baby",
        birthDate: now,
        ownerId: BOB_UID,
      })
    );
  });

  test("cannot create child with ownerId != uid", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      setDoc(doc(db, "children", "newChild"), {
        name: "New Baby",
        birthDate: now,
        ownerId: ALICE_UID, // not Bob's uid
      })
    );
  });

  test("cannot create child without name", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      setDoc(doc(db, "children", "newChild"), {
        birthDate: now,
        ownerId: BOB_UID,
      })
    );
  });

  test("cannot create child with empty name", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      setDoc(doc(db, "children", "newChild"), {
        name: "",
        birthDate: now,
        ownerId: BOB_UID,
      })
    );
  });

  test("cannot create child without birthDate", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      setDoc(doc(db, "children", "newChild"), {
        name: "Baby",
        ownerId: BOB_UID,
      })
    );
  });

  test("list is always denied", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(getDocs(query(collection(db, "children"), limit(10))));
  });

  test("delete is always denied (CF only)", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(deleteDoc(doc(db, "children", CHILD_ID)));
  });

  test("owner can update child", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(
      updateDoc(doc(db, "children", CHILD_ID), { name: "Updated Baby" })
    );
  });

  test("non-owner cannot update child", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      updateDoc(doc(db, "children", CHILD_ID), { name: "Hacked" })
    );
  });

  test("admin cannot take ownership by rewriting ownerId", async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", CHILD_ID, "access", BOB_UID), {
        userId: BOB_UID,
        role: "admin",
        grantedBy: ALICE_UID,
      });
    });
    const db = authedFirestore(BOB_UID);
    await assertFails(
      updateDoc(doc(db, "children", CHILD_ID), { ownerId: BOB_UID })
    );
    await assertSucceeds(
      updateDoc(doc(db, "children", CHILD_ID), { name: "Renamed by admin" })
    );
  });

  test("owner cannot soft-delete the child client-side", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      updateDoc(doc(db, "children", CHILD_ID), { deletedAt: now })
    );
  });

  test("lastEventAt is maintained by the server only (reminders depend on it)", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      updateDoc(doc(db, "children", CHILD_ID), { lastEventAt: { any: now } })
    );
    await assertFails(
      updateDoc(doc(db, "children", CHILD_ID), { "lastEventAt.repas": now })
    );
    // other fields stay writable
    await assertSucceeds(
      updateDoc(doc(db, "children", CHILD_ID), { name: "Still editable" })
    );
  });

  describe("allergies", () => {
    const base = (uid: string) => ({ name: "Baby", birthDate: now, ownerId: uid });

    test("owner can set valid allergies", async () => {
      const db = authedFirestore(ALICE_UID);
      await assertSucceeds(
        updateDoc(doc(db, "children", CHILD_ID), { allergies: ["Lait", "Kiwi"] })
      );
      await assertSucceeds(updateDoc(doc(db, "children", CHILD_ID), { allergies: [] }));
    });

    test("admin can set allergies, contributor cannot", async () => {
      await seedData(async (db: any) => {
        await setDoc(doc(db, "children", CHILD_ID, "access", BOB_UID), {
          userId: BOB_UID,
          role: "admin",
          grantedBy: ALICE_UID,
        });
        await setDoc(doc(db, "children", CHILD_ID, "access", CHARLIE_UID), {
          userId: CHARLIE_UID,
          role: "contributor",
          grantedBy: ALICE_UID,
        });
      });
      await assertSucceeds(
        updateDoc(doc(authedFirestore(BOB_UID), "children", CHILD_ID), { allergies: ["Lait"] })
      );
      await assertFails(
        updateDoc(doc(authedFirestore(CHARLIE_UID), "children", CHILD_ID), { allergies: ["Lait"] })
      );
    });

    test("rejects non-list, too many, empty, too long and non-string entries", async () => {
      const ref = doc(authedFirestore(ALICE_UID), "children", CHILD_ID);
      await assertFails(updateDoc(ref, { allergies: "Lait" }));
      await assertFails(
        updateDoc(ref, { allergies: Array.from({ length: 16 }, (_, i) => `a${i}`) })
      );
      await assertFails(updateDoc(ref, { allergies: ["Lait", ""] }));
      await assertFails(updateDoc(ref, { allergies: ["a".repeat(41)] }));
      await assertFails(updateDoc(ref, { allergies: ["Lait", 3] }));
      await assertSucceeds(
        updateDoc(ref, { allergies: Array.from({ length: 15 }, () => "a".repeat(40)) })
      );
    });

    test("create accepts valid allergies and rejects invalid ones", async () => {
      const db = authedFirestore(BOB_UID);
      await assertSucceeds(
        setDoc(doc(db, "children", "c-ok"), { ...base(BOB_UID), allergies: ["Lait"] })
      );
      await assertFails(
        setDoc(doc(db, "children", "c-ko"), { ...base(BOB_UID), allergies: ["a".repeat(41)] })
      );
      await assertFails(
        setDoc(doc(db, "children", "c-ko2"), { ...base(BOB_UID), allergies: "Lait" })
      );
    });
  });
});

// ===========================================================================
// 2. CHILDREN/ACCESS SUBCOLLECTION
// ===========================================================================

describe("children/access subcollection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", CHILD_ID), {
        name: "Baby",
        birthDate: now,
        ownerId: ALICE_UID,
      });
      await setDoc(doc(db, "children", CHILD_ID, "access", ALICE_UID), {
        userId: ALICE_UID,
        role: "owner",
        grantedBy: ALICE_UID,
      });
      await setDoc(doc(db, "children", CHILD_ID, "access", BOB_UID), {
        userId: BOB_UID,
        role: "viewer",
        grantedBy: ALICE_UID,
      });
    });
  });

  test("user can read own access doc", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(
      getDoc(doc(db, "children", CHILD_ID, "access", BOB_UID))
    );
  });

  test("owner can read any member's access doc", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(
      getDoc(doc(db, "children", CHILD_ID, "access", BOB_UID))
    );
  });

  test("non-owner non-member cannot read access doc", async () => {
    const db = authedFirestore(CHARLIE_UID);
    await assertFails(
      getDoc(doc(db, "children", CHILD_ID, "access", BOB_UID))
    );
  });

  test("owner can list all access docs", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(
      getDocs(
        query(collection(db, "children", CHILD_ID, "access"), limit(10))
      )
    );
  });

  test("member with access can list access docs", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(
      getDocs(
        query(collection(db, "children", CHILD_ID, "access"), limit(10))
      )
    );
  });

  test("non-member cannot list access docs", async () => {
    const db = authedFirestore(CHARLIE_UID);
    await assertFails(
      getDocs(
        query(collection(db, "children", CHILD_ID, "access"), limit(10))
      )
    );
  });

  test("owner can delete other member's access", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(
      deleteDoc(doc(db, "children", CHILD_ID, "access", BOB_UID))
    );
  });

  test("owner cannot delete own access doc", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      deleteDoc(doc(db, "children", CHILD_ID, "access", ALICE_UID))
    );
  });

  test("bootstrap: childOwner can create own access with role=owner", async () => {
    // Create a new child for this test — no access doc yet
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", "childNew"), {
        name: "New Baby",
        birthDate: now,
        ownerId: CHARLIE_UID,
      });
    });
    const db = authedFirestore(CHARLIE_UID);
    await assertSucceeds(
      setDoc(doc(db, "children", "childNew", "access", CHARLIE_UID), {
        userId: CHARLIE_UID,
        role: "owner",
        grantedBy: CHARLIE_UID,
      })
    );
  });

  test("viewer cannot promote itself to owner", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      updateDoc(doc(db, "children", CHILD_ID, "access", BOB_UID), {
        role: "owner",
      })
    );
  });

  // TRANSITION (apps <= 1.0.9): their manage-access screen updates the access
  // doc directly. Role changes by the owner stay possible until
  // app_config.minVersion > 1.0.9; everything else is refused.
  describe("transition (app <= 1.0.9): owner changes a member's role directly", () => {
    const roleFlags: Record<string, Record<string, boolean>> = {
      admin: { canWriteEvents: true, canWriteLikes: true, canWriteComments: true },
      contributor: { canWriteEvents: false, canWriteLikes: true, canWriteComments: true },
      viewer: { canWriteEvents: false, canWriteLikes: false, canWriteComments: false },
    };
    const bobDoc = () => doc(authedFirestore(ALICE_UID), "children", CHILD_ID, "access", BOB_UID);

    test("owner can set admin, contributor or viewer with consistent flags", async () => {
      for (const role of ["admin", "contributor", "viewer"]) {
        await assertSucceeds(updateDoc(bobDoc(), { role, ...roleFlags[role] }));
      }
    });

    test("flags must match the role (no admin role with viewer flags, no flag-only change)", async () => {
      await assertFails(updateDoc(bobDoc(), { role: "admin", ...roleFlags.viewer }));
      await assertFails(updateDoc(bobDoc(), { role: "viewer", ...roleFlags.admin }));
      await assertFails(updateDoc(bobDoc(), { role: "admin" }));
      await assertFails(updateDoc(bobDoc(), { canWriteEvents: true }));
    });

    test("owner cannot grant the owner role, nor touch other fields", async () => {
      await assertFails(updateDoc(bobDoc(), { role: "owner", ...roleFlags.admin }));
      await assertFails(updateDoc(bobDoc(), { role: "admin", ...roleFlags.admin, grantedBy: BOB_UID }));
      await assertFails(updateDoc(bobDoc(), { role: "admin", ...roleFlags.admin, userId: CHARLIE_UID }));
    });

    test("owner cannot touch own doc, an owner's doc or the primary owner's doc", async () => {
      await seedData(async (db: any) => {
        await setDoc(doc(db, "children", CHILD_ID, "access", CHARLIE_UID), {
          userId: CHARLIE_UID,
          role: "owner",
          grantedBy: ALICE_UID,
        });
      });
      const alice = authedFirestore(ALICE_UID);
      await assertFails(
        updateDoc(doc(alice, "children", CHILD_ID, "access", ALICE_UID), { role: "viewer", ...roleFlags.viewer })
      );
      await assertFails(
        updateDoc(doc(alice, "children", CHILD_ID, "access", CHARLIE_UID), { role: "viewer", ...roleFlags.viewer })
      );
      // a co-owner cannot demote the primary owner either
      await assertFails(
        updateDoc(doc(authedFirestore(CHARLIE_UID), "children", CHILD_ID, "access", ALICE_UID), {
          role: "viewer",
          ...roleFlags.viewer,
        })
      );
    });

    test("admins, members and strangers cannot change roles", async () => {
      await seedData(async (db: any) => {
        await setDoc(doc(db, "children", CHILD_ID, "access", CHARLIE_UID), {
          userId: CHARLIE_UID,
          role: "admin",
          grantedBy: ALICE_UID,
        });
      });
      await assertFails(
        updateDoc(doc(authedFirestore(CHARLIE_UID), "children", CHILD_ID, "access", BOB_UID), {
          role: "admin",
          ...roleFlags.admin,
        })
      );
      await assertFails(
        updateDoc(doc(authedFirestore(BOB_UID), "children", CHILD_ID, "access", BOB_UID), {
          role: "admin",
          ...roleFlags.admin,
        })
      );
      await assertFails(
        updateDoc(doc(authedFirestore("stranger"), "children", CHILD_ID, "access", BOB_UID), {
          role: "admin",
          ...roleFlags.admin,
        })
      );
    });
  });

  test("invitee cannot grant itself access from an invitation", async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "shareInvitations", "inviteX"), {
        inviterId: ALICE_UID,
        invitedUserId: CHARLIE_UID,
        invitedEmail: "charlie@test.com",
        childId: CHILD_ID,
        status: "pending",
        role: "viewer",
      });
    });
    const db = authedFirestore(CHARLIE_UID, "charlie@test.com");
    await assertFails(
      setDoc(doc(db, "children", CHILD_ID, "access", CHARLIE_UID), {
        userId: CHARLIE_UID,
        role: "owner",
        grantedBy: ALICE_UID,
        invitationId: "inviteX",
      })
    );
    await assertFails(
      setDoc(doc(db, "user_child_access", `${CHARLIE_UID}_${CHILD_ID}`), {
        userId: CHARLIE_UID,
        childId: CHILD_ID,
        role: "owner",
      })
    );
  });

  test("a co-owner cannot demote or remove the primary owner (children.ownerId)", async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", CHILD_ID, "access", CHARLIE_UID), {
        userId: CHARLIE_UID,
        role: "owner",
        grantedBy: ALICE_UID,
      });
    });
    const db = authedFirestore(CHARLIE_UID);
    await assertFails(
      updateDoc(doc(db, "children", CHILD_ID, "access", ALICE_UID), { role: "viewer" })
    );
    await assertFails(deleteDoc(doc(db, "children", CHILD_ID, "access", ALICE_UID)));
    // roles only change through setMemberRole, even for the primary owner
    await assertFails(
      updateDoc(doc(authedFirestore(ALICE_UID), "children", CHILD_ID, "access", CHARLIE_UID), { role: "admin" })
    );
  });

  test("ownerId bootstrap only applies on create, not to restore a demoted access", async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", "childBoot"), { name: "B", birthDate: now, ownerId: CHARLIE_UID });
      await setDoc(doc(db, "children", "childBoot", "access", CHARLIE_UID), {
        userId: CHARLIE_UID,
        role: "viewer",
        grantedBy: ALICE_UID,
      });
    });
    const db = authedFirestore(CHARLIE_UID);
    await assertFails(
      updateDoc(doc(db, "children", "childBoot", "access", CHARLIE_UID), { role: "owner" })
    );
  });

  test("user_child_access: owner bootstrap works, forged or overwritten entries are denied", async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", "childNew"), { name: "N", birthDate: now, ownerId: CHARLIE_UID });
      await setDoc(doc(db, "user_child_access", `${BOB_UID}_${CHILD_ID}`), {
        userId: BOB_UID,
        childId: CHILD_ID,
      });
    });
    const db = authedFirestore(CHARLIE_UID);
    // legit: index entry for own new child
    await assertSucceeds(
      setDoc(doc(db, "user_child_access", `${CHARLIE_UID}_childNew`), {
        userId: CHARLIE_UID,
        childId: "childNew",
      })
    );
    // overwrite Bob's entry for child1 with Charlie's own child
    await assertFails(
      setDoc(doc(db, "user_child_access", `${BOB_UID}_${CHILD_ID}`), {
        userId: BOB_UID,
        childId: "childNew",
      })
    );
    // forge an entry for Bob on Charlie's child (not owner-granted access path)
    await assertFails(
      setDoc(doc(db, "user_child_access", `${BOB_UID}_childNew`), {
        userId: BOB_UID,
        childId: "childNew",
      })
    );
  });

  test("M4: an owner cannot create an access doc for another user client-side", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      setDoc(doc(db, "children", CHILD_ID, "access", CHARLIE_UID), {
        userId: CHARLIE_UID,
        role: "viewer",
        grantedBy: ALICE_UID,
      })
    );
  });

  test("M4: a co-owner cannot create an access doc for another user either", async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", CHILD_ID, "access", CHARLIE_UID), {
        userId: CHARLIE_UID,
        role: "owner",
        grantedBy: ALICE_UID,
      });
    });
    await assertFails(
      setDoc(doc(authedFirestore(CHARLIE_UID), "children", CHILD_ID, "access", "dana"), {
        userId: "dana",
        role: "owner",
        grantedBy: CHARLIE_UID,
      })
    );
  });

  test("M4: user_child_access cannot be created for another user, even by the owner", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      setDoc(doc(db, "user_child_access", `${CHARLIE_UID}_${CHILD_ID}`), {
        userId: CHARLIE_UID,
        childId: CHILD_ID,
      })
    );
  });

  test("M4: an owner can still update an existing user_child_access index entry", async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "user_child_access", `${BOB_UID}_${CHILD_ID}`), {
        userId: BOB_UID,
        childId: CHILD_ID,
      });
    });
    await assertSucceeds(
      updateDoc(doc(authedFirestore(ALICE_UID), "user_child_access", `${BOB_UID}_${CHILD_ID}`), {
        role: "viewer",
      })
    );
  });

  test("Sprint 12.6: an owner cannot change a member's role from the client (setMemberRole only)", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      updateDoc(doc(db, "children", CHILD_ID, "access", BOB_UID), {
        role: "admin",
        canWriteEvents: true,
      })
    );
  });

  test("non-owner cannot bootstrap access with role=owner", async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", "childNew"), {
        name: "New Baby",
        birthDate: now,
        ownerId: CHARLIE_UID,
      });
    });
    const db = authedFirestore(BOB_UID);
    await assertFails(
      setDoc(doc(db, "children", "childNew", "access", BOB_UID), {
        userId: BOB_UID,
        role: "owner",
        grantedBy: BOB_UID,
      })
    );
  });
});

// ===========================================================================
// 3. EVENTS COLLECTION
// ===========================================================================

describe("events collection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      // Child + access docs
      await setDoc(doc(db, "children", CHILD_ID), {
        name: "Baby",
        birthDate: now,
        ownerId: ALICE_UID,
      });
      await setDoc(doc(db, "children", CHILD_ID, "access", ALICE_UID), {
        userId: ALICE_UID,
        role: "owner",
        grantedBy: ALICE_UID,
      });
      await setDoc(doc(db, "children", CHILD_ID, "access", BOB_UID), {
        userId: BOB_UID,
        role: "viewer",
        grantedBy: ALICE_UID,
      });
      // Existing event
      await setDoc(doc(db, "events", "event1"), {
        childId: CHILD_ID,
        userId: ALICE_UID,
        type: "biberon",
        createdAt: now,
        data: {},
      });
    });
  });

  test("user with access can read events", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "events", "event1")));
  });

  test("viewer with access can read events", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(getDoc(doc(db, "events", "event1")));
  });

  test("user without access cannot read events", async () => {
    const db = authedFirestore(CHARLIE_UID);
    await assertFails(getDoc(doc(db, "events", "event1")));
  });

  test("unauthenticated cannot read events", async () => {
    const db = unauthFirestore();
    await assertFails(getDoc(doc(db, "events", "event1")));
  });

  test("owner can create event with userId == auth.uid", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(
      setDoc(doc(db, "events", "event2"), {
        childId: CHILD_ID,
        userId: ALICE_UID,
        type: "couche",
        createdAt: now,
        data: {},
      })
    );
  });

  test("cannot create event with userId != auth.uid", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      setDoc(doc(db, "events", "event2"), {
        childId: CHILD_ID,
        userId: BOB_UID, // spoofing
        type: "couche",
        createdAt: now,
        data: {},
      })
    );
  });

  test("viewer cannot create event", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      setDoc(doc(db, "events", "event2"), {
        childId: CHILD_ID,
        userId: BOB_UID,
        type: "couche",
        createdAt: now,
        data: {},
      })
    );
  });

  test("owner can update event preserving immutable fields", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(
      updateDoc(doc(db, "events", "event1"), {
        // Preserve immutable fields
        userId: ALICE_UID,
        childId: CHILD_ID,
        createdAt: now,
        // Mutable field
        type: "tetee",
      })
    );
  });

  test("update cannot change userId", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      updateDoc(doc(db, "events", "event1"), {
        userId: BOB_UID, // changed!
        childId: CHILD_ID,
        createdAt: now,
      })
    );
  });

  test("update cannot change childId", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      updateDoc(doc(db, "events", "event1"), {
        userId: ALICE_UID,
        childId: CHILD2_ID, // changed!
        createdAt: now,
      })
    );
  });

  test("delete event is always denied (CF only)", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(deleteDoc(doc(db, "events", "event1")));
  });
});

// ===========================================================================
// 4. CONTENT REPORTS
// ===========================================================================

describe("reports collection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", CHILD_ID), {
        name: "Baby",
        birthDate: now,
        ownerId: ALICE_UID,
      });
      await setDoc(doc(db, "children", CHILD_ID, "access", ALICE_UID), {
        userId: ALICE_UID,
        role: "owner",
        grantedBy: ALICE_UID,
      });
      await setDoc(doc(db, "children", CHILD_ID, "access", BOB_UID), {
        userId: BOB_UID,
        role: "viewer",
        grantedBy: ALICE_UID,
      });
      await setDoc(doc(db, "reports", "report1"), {
        reporterUserId: BOB_UID,
        childId: CHILD_ID,
        eventId: "event1",
        photoPath: `children/${CHILD_ID}/jalons/test.jpg`,
        reason: "sensitive_child_photo",
        status: "open",
        createdAt: now,
      });
    });
  });

  test("reports cannot be created client-side, even with access (submitContentReportCF only)", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      setDoc(doc(db, "reports", "report2"), {
        reporterUserId: BOB_UID,
        childId: CHILD_ID,
        eventId: "event2",
        photoPath: `children/${CHILD_ID}/jalons/test2.jpg`,
        reason: "sensitive_child_photo",
        status: "open",
        createdAt: serverTimestamp(),
      })
    );
  });

  test("user without access cannot create a report", async () => {
    const db = authedFirestore(CHARLIE_UID);
    await assertFails(
      setDoc(doc(db, "reports", "report2"), {
        reporterUserId: CHARLIE_UID,
        childId: CHILD_ID,
        reason: "privacy",
        status: "open",
        createdAt: serverTimestamp(),
      })
    );
  });

  test("reporter can read own report", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(getDoc(doc(db, "reports", "report1")));
  });

  test("another user cannot read someone else's report", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(getDoc(doc(db, "reports", "report1")));
  });

  test("report cannot be updated client-side", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      updateDoc(doc(db, "reports", "report1"), {
        status: "resolved",
      })
    );
  });
});

// ===========================================================================
// 5. EVENT LIKES / EVENT COMMENTS
// ===========================================================================

describe("eventLikes collection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", CHILD_ID), {
        name: "Baby",
        birthDate: now,
        ownerId: ALICE_UID,
      });
      await setDoc(doc(db, "children", CHILD_ID, "access", ALICE_UID), {
        userId: ALICE_UID,
        role: "owner",
        grantedBy: ALICE_UID,
      });
      await setDoc(doc(db, "children", CHILD_ID, "access", BOB_UID), {
        userId: BOB_UID,
        role: "contributor",
        grantedBy: ALICE_UID,
      });
      await setDoc(doc(db, "events", "event1"), {
        childId: CHILD_ID,
        userId: ALICE_UID,
        type: "jalon",
        createdAt: now,
        photos: [`children/${CHILD_ID}/jalons/p.jpg`],
      });
      await setDoc(doc(db, "eventLikes", "like1"), {
        childId: CHILD_ID,
        eventId: "event1",
        userId: BOB_UID,
      });
    });
  });

  test("user with access can get a like", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "eventLikes", "like1")));
  });

  test("user without access cannot get a like", async () => {
    const db = authedFirestore(CHARLIE_UID);
    await assertFails(getDoc(doc(db, "eventLikes", "like1")));
  });

  test("unauthenticated cannot list likes", async () => {
    const db = unauthFirestore();
    await assertFails(
      getDocs(
        query(
          collection(db, "eventLikes"),
          where("childId", "==", CHILD_ID),
          limit(10)
        )
      )
    );
  });

  test("user without child access denied on list", async () => {
    const db = authedFirestore(CHARLIE_UID);
    await assertFails(
      getDocs(
        query(
          collection(db, "eventLikes"),
          where("childId", "==", CHILD_ID),
          limit(10)
        )
      )
    );
  });

  test("user with access can list likes with a larger client-side limit", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(
      getDocs(
        query(
          collection(db, "eventLikes"),
          where("childId", "==", CHILD_ID),
          limit(500)
        )
      )
    );
  });

  test("contributor can create a like with userId == auth.uid", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(
      setDoc(doc(db, "eventLikes", "like2"), {
        childId: CHILD_ID,
        eventId: "event1",
        userId: BOB_UID,
      })
    );
  });

  test("owner can delete any like", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(deleteDoc(doc(db, "eventLikes", "like1")));
  });

  test("user can delete own like", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(deleteDoc(doc(db, "eventLikes", "like1")));
  });
});

describe("eventComments collection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", CHILD_ID), {
        name: "Baby",
        birthDate: now,
        ownerId: ALICE_UID,
      });
      await setDoc(doc(db, "children", CHILD_ID, "access", ALICE_UID), {
        userId: ALICE_UID,
        role: "owner",
        grantedBy: ALICE_UID,
      });
      await setDoc(doc(db, "children", CHILD_ID, "access", BOB_UID), {
        userId: BOB_UID,
        role: "contributor",
        grantedBy: ALICE_UID,
      });
      await setDoc(doc(db, "events", "event1"), {
        childId: CHILD_ID,
        userId: ALICE_UID,
        type: "jalon",
        createdAt: now,
        photos: [`children/${CHILD_ID}/jalons/p.jpg`],
      });
      await setDoc(doc(db, "eventComments", "comment1"), {
        childId: CHILD_ID,
        eventId: "event1",
        userId: BOB_UID,
        text: "Cute!",
      });
    });
  });

  test("user with access can get a comment", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "eventComments", "comment1")));
  });

  test("user without access cannot list comments", async () => {
    const db = authedFirestore(CHARLIE_UID);
    await assertFails(
      getDocs(
        query(
          collection(db, "eventComments"),
          where("childId", "==", CHILD_ID),
          limit(10)
        )
      )
    );
  });

  test("user with access can list comments with a larger client-side limit", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(
      getDocs(
        query(
          collection(db, "eventComments"),
          where("childId", "==", CHILD_ID),
          limit(500)
        )
      )
    );
  });

  test("contributor can create a comment", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(
      setDoc(doc(db, "eventComments", "comment2"), {
        childId: CHILD_ID,
        eventId: "event1",
        userId: BOB_UID,
        text: "Nice!",
      })
    );
  });

  test("owner can delete any comment", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(deleteDoc(doc(db, "eventComments", "comment1")));
  });

  test("user can delete own comment", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(deleteDoc(doc(db, "eventComments", "comment1")));
  });
});

// ===========================================================================
// 5. USERS / USERS_PUBLIC
// ===========================================================================

describe("users collection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "users", ALICE_UID), {
        displayName: "Alice",
        email: "alice@test.com",
      });
    });
  });

  test("user can read own user doc", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "users", ALICE_UID)));
  });

  test("user cannot read another user's doc", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(getDoc(doc(db, "users", ALICE_UID)));
  });

  test("user can write own user doc", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(
      updateDoc(doc(db, "users", ALICE_UID), { displayName: "Alice Updated" })
    );
  });

  test("user cannot write another user's doc", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      updateDoc(doc(db, "users", ALICE_UID), { displayName: "Hacked" })
    );
  });

  describe("pendingDeletion (M1: at least 29 days ahead)", () => {
    const daysFromNow = (d: number) => new Date(Date.now() + d * 86400000);
    const legacy = (deletionDate: string) => ({
      pendingDeletion: { scheduledAt: new Date().toISOString(), deletionDate },
    });
    const stamped = (deletionDate: Date) => ({
      pendingDeletion: { scheduledAt: Timestamp.now(), deletionDate: Timestamp.fromDate(deletionDate) },
    });
    const userRef = () => doc(authedFirestore(ALICE_UID), "users", ALICE_UID);

    test("app 1.0.8 write (ISO strings, 30 days) is accepted", async () => {
      await assertSucceeds(updateDoc(userRef(), legacy(daysFromNow(30).toISOString())));
    });

    test("ISO string only 1 day ahead, in the past or malformed is refused", async () => {
      await assertFails(updateDoc(userRef(), legacy(daysFromNow(1).toISOString())));
      await assertFails(updateDoc(userRef(), legacy(daysFromNow(-1).toISOString())));
      await assertFails(updateDoc(userRef(), legacy("zzz")));
      await assertFails(updateDoc(userRef(), legacy("2999")));
    });

    test("Timestamp 30 days ahead is accepted, 1 day ahead refused", async () => {
      await assertSucceeds(updateDoc(userRef(), stamped(daysFromNow(30))));
      await assertFails(updateDoc(userRef(), stamped(daysFromNow(1))));
    });

    test("other field types are refused", async () => {
      await assertFails(updateDoc(userRef(), { pendingDeletion: { deletionDate: daysFromNow(30).getTime() } }));
      await assertFails(updateDoc(userRef(), { pendingDeletion: { scheduledAt: "x" } }));
    });

    test("setDoc creating the user doc with a short pendingDeletion is refused", async () => {
      const db = authedFirestore(BOB_UID);
      await assertFails(setDoc(doc(db, "users", BOB_UID), legacy(daysFromNow(0).toISOString())));
      await assertSucceeds(setDoc(doc(db, "users", BOB_UID), legacy(daysFromNow(30).toISOString())));
    });

    test("removing pendingDeletion stays allowed", async () => {
      await seedData(async (db: any) => {
        await setDoc(doc(db, "users", ALICE_UID), {
          email: "alice@test.com",
          ...legacy(daysFromNow(2).toISOString()),
        });
      });
      await assertSucceeds(updateDoc(userRef(), { pendingDeletion: deleteField() }));
    });

    test("an unrelated update keeps working while a (short, server-set) pendingDeletion is untouched", async () => {
      await seedData(async (db: any) => {
        await setDoc(doc(db, "users", ALICE_UID), {
          email: "alice@test.com",
          ...legacy(daysFromNow(2).toISOString()),
        });
      });
      await assertSucceeds(updateDoc(userRef(), { displayName: "New" }));
      await assertFails(updateDoc(userRef(), { "pendingDeletion.deletionDate": daysFromNow(1).toISOString() }));
    });
  });

  test("unauthenticated cannot read user doc", async () => {
    const db = unauthFirestore();
    await assertFails(getDoc(doc(db, "users", ALICE_UID)));
  });
});

describe("users_public collection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "users_public", ALICE_UID), {
        displayName: "Alice",
      });
      await setDoc(doc(db, "users_public", BOB_UID), {
        displayName: "Bob",
      });
    });
  });

  test("any authenticated user can get a public profile", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(getDoc(doc(db, "users_public", ALICE_UID)));
  });

  test("unauthenticated cannot get public profile", async () => {
    const db = unauthFirestore();
    await assertFails(getDoc(doc(db, "users_public", ALICE_UID)));
  });

  test("list is denied on users_public", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      getDocs(query(collection(db, "users_public"), limit(10)))
    );
  });

  test("user can write own public profile", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(
      updateDoc(doc(db, "users_public", ALICE_UID), {
        displayName: "Alice Updated",
      })
    );
  });

  test("user cannot write another user's public profile", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      updateDoc(doc(db, "users_public", ALICE_UID), {
        displayName: "Hacked",
      })
    );
  });
});

// ===========================================================================
// 6. SERVER-ONLY COLLECTIONS
// ===========================================================================

describe("rate_limits collection (server-only)", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "rate_limits", ALICE_UID), {
        count: 5,
        lastReset: now,
      });
    });
  });

  test("authenticated user cannot read rate_limits", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(getDoc(doc(db, "rate_limits", ALICE_UID)));
  });

  test("authenticated user cannot write rate_limits", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      setDoc(doc(db, "rate_limits", ALICE_UID), { count: 0 })
    );
  });

  test("unauthenticated cannot access rate_limits", async () => {
    const db = unauthFirestore();
    await assertFails(getDoc(doc(db, "rate_limits", ALICE_UID)));
  });
});

describe("subscriptions collection (server-write only)", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "subscriptions", ALICE_UID), {
        plan: "premium",
        expiresAt: now,
      });
    });
  });

  test("user can read own subscription", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "subscriptions", ALICE_UID)));
  });

  test("user cannot read another user's subscription", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(getDoc(doc(db, "subscriptions", ALICE_UID)));
  });

  test("user cannot write subscription", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      updateDoc(doc(db, "subscriptions", ALICE_UID), { plan: "free" })
    );
  });

  test("user cannot create subscription", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      setDoc(doc(db, "subscriptions", BOB_UID), {
        plan: "premium",
        expiresAt: now,
      })
    );
  });
});

describe("notification_history collection (server-write only)", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "notification_history", "notif1"), {
        userId: ALICE_UID,
        type: "event",
        sentAt: now,
      });
    });
  });

  test("user can read own notification history", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "notification_history", "notif1")));
  });

  test("user cannot read another user's notification history", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(getDoc(doc(db, "notification_history", "notif1")));
  });

  test("user cannot write notification history", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      setDoc(doc(db, "notification_history", "notif2"), {
        userId: ALICE_UID,
        type: "event",
        sentAt: now,
      })
    );
  });
});

// ===========================================================================
// 7. SHARE INVITATIONS / SHARE CODES
// ===========================================================================

describe("shareInvitations collection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", CHILD_ID), {
        name: "Baby",
        birthDate: now,
        ownerId: ALICE_UID,
      });
      await setDoc(doc(db, "children", CHILD_ID, "access", ALICE_UID), {
        userId: ALICE_UID,
        role: "owner",
        grantedBy: ALICE_UID,
      });
      await setDoc(doc(db, "shareInvitations", "invite1"), {
        inviterId: ALICE_UID,
        invitedUserId: BOB_UID,
        invitedEmail: "bob@test.com",
        inviterEmail: "alice@test.com",
        childId: CHILD_ID,
        status: "pending",
        role: "contributor",
      });
    });
  });

  test("inviter can read invitation", async () => {
    const db = authedFirestore(ALICE_UID, "alice@test.com");
    await assertSucceeds(getDoc(doc(db, "shareInvitations", "invite1")));
  });

  test("invited user can read invitation", async () => {
    const db = authedFirestore(BOB_UID, "bob@test.com");
    await assertSucceeds(getDoc(doc(db, "shareInvitations", "invite1")));
  });

  test("unrelated user cannot read invitation", async () => {
    const db = authedFirestore(CHARLIE_UID, "charlie@test.com");
    await assertFails(getDoc(doc(db, "shareInvitations", "invite1")));
  });

  test("unauthenticated cannot read invitation", async () => {
    const db = unauthFirestore();
    await assertFails(getDoc(doc(db, "shareInvitations", "invite1")));
  });

  test("owner cannot create an invitation directly (createShareInvitation only)", async () => {
    const db = authedFirestore(ALICE_UID, "alice@test.com");
    await assertFails(
      setDoc(doc(db, "shareInvitations", "invite2"), {
        inviterId: ALICE_UID,
        invitedEmail: "dave@test.com",
        childId: CHILD_ID,
        status: "pending",
      })
    );
  });

  test("invited user can reject a pending invitation", async () => {
    const db = authedFirestore(BOB_UID, "bob@test.com");
    await assertSucceeds(
      updateDoc(doc(db, "shareInvitations", "invite1"), {
        status: "rejected",
      })
    );
  });

  test("invitee matched by email can reject", async () => {
    const db = authedFirestore(CHARLIE_UID, "bob@test.com");
    await assertSucceeds(
      updateDoc(doc(db, "shareInvitations", "invite1"), {
        status: "rejected",
      })
    );
  });

  test("invited user cannot accept client-side (CF only)", async () => {
    const db = authedFirestore(BOB_UID, "bob@test.com");
    await assertFails(
      updateDoc(doc(db, "shareInvitations", "invite1"), {
        status: "accepted",
      })
    );
  });

  test("invited user cannot rewrite childId or role", async () => {
    const db = authedFirestore(BOB_UID, "bob@test.com");
    await assertFails(
      updateDoc(doc(db, "shareInvitations", "invite1"), {
        status: "rejected",
        childId: CHILD2_ID,
      })
    );
    await assertFails(
      updateDoc(doc(db, "shareInvitations", "invite1"), {
        role: "owner",
      })
    );
  });

  test("unrelated user cannot update invitation", async () => {
    const db = authedFirestore(CHARLIE_UID, "charlie@test.com");
    await assertFails(
      updateDoc(doc(db, "shareInvitations", "invite1"), {
        status: "accepted",
      })
    );
  });
});

describe("shareCodes collection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", CHILD_ID), {
        name: "Baby",
        birthDate: now,
        ownerId: ALICE_UID,
      });
      await setDoc(doc(db, "children", CHILD_ID, "access", ALICE_UID), {
        userId: ALICE_UID,
        role: "owner",
        grantedBy: ALICE_UID,
      });
      await setDoc(doc(db, "shareCodes", "CODE123"), {
        code: "CODE123",
        childId: CHILD_ID,
        childName: "Baby",
        createdBy: ALICE_UID,
        createdAt: now,
        expiresAt: Timestamp.fromDate(
          new Date(Date.now() + 24 * 60 * 60 * 1000)
        ),
        used: false,
      });
    });
  });

  test("creator can read share code", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "shareCodes", "CODE123")));
  });

  test("B1.2 — non-creator/non-access user CANNOT read share code (anti-enumeration)", async () => {
    // Avant B1.2 : un user authentifié quelconque pouvait lire un code non
    // utilisé/non expiré, ce qui permettait de bruteforcer les codes
    // valides et mapper des childIds. Le redeem passe maintenant uniquement
    // par redeemShareCodeCF (admin SDK), donc le client n'a pas besoin de
    // read direct. La rule a été resserrée à creator ∪ hasAccess(childId).
    const db = authedFirestore(BOB_UID);
    await assertFails(getDoc(doc(db, "shareCodes", "CODE123")));
  });

  test("unauthenticated cannot read share code", async () => {
    const db = unauthFirestore();
    await assertFails(getDoc(doc(db, "shareCodes", "CODE123")));
  });

  test("creator can delete share code", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(deleteDoc(doc(db, "shareCodes", "CODE123")));
  });

  test("non-creator non-owner cannot delete share code", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(deleteDoc(doc(db, "shareCodes", "CODE123")));
  });

  test("a viewer of the child cannot read an active share code", async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", CHILD_ID, "access", BOB_UID), {
        userId: BOB_UID,
        role: "viewer",
        grantedBy: ALICE_UID,
      });
    });
    const db = authedFirestore(BOB_UID);
    await assertFails(getDoc(doc(db, "shareCodes", "CODE123")));
  });

  const codeData = (overrides: Record<string, unknown> = {}) => ({
    code: "NEWCODE",
    childId: CHILD_ID,
    childName: "Baby",
    createdBy: ALICE_UID,
    createdAt: now,
    expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    used: false,
    ...overrides,
  });

  test("transition (app <= 1.0.9): owner/admin may still create a share code, others may not", async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", CHILD_ID, "access", BOB_UID), {
        userId: BOB_UID,
        role: "admin",
        grantedBy: ALICE_UID,
      });
    });
    await assertSucceeds(setDoc(doc(authedFirestore(ALICE_UID), "shareCodes", "NEWCODE"), codeData()));
    await assertSucceeds(
      setDoc(doc(authedFirestore(BOB_UID), "shareCodes", "BOBCODE"), codeData({ code: "BOBCODE", createdBy: BOB_UID }))
    );
    await assertFails(setDoc(doc(authedFirestore(CHARLIE_UID), "shareCodes", "CHACODE"), codeData({ code: "CHACODE", createdBy: CHARLIE_UID })));
    // Pas d'usurpation : createdBy doit être l'appelant.
    await assertFails(setDoc(doc(authedFirestore(BOB_UID), "shareCodes", "SPOOF01"), codeData({ code: "SPOOF01", createdBy: ALICE_UID })));
  });

  describe("transition (app <= 1.0.9): shape of a client-created share code", () => {
    const create = (id: string, overrides: Record<string, unknown> = {}, uid = ALICE_UID) =>
      setDoc(doc(authedFirestore(uid), "shareCodes", id), codeData({ code: id, ...overrides }));
    const inDays = (days: number, extraMinutes = 0) =>
      Timestamp.fromDate(new Date(Date.now() + days * 86400000 + extraMinutes * 60000));

    test("expiresAt: 8 days is accepted, 8 days + 1 minute is refused", async () => {
      await assertSucceeds(create("EXP8D", { expiresAt: inDays(8) }));
      await assertFails(create("EXP8D1", { expiresAt: inDays(8, 1) }));
    });

    test("expiresAt must be a timestamp", async () => {
      await assertFails(create("EXPSTR", { expiresAt: "2099-01-01" }));
      await assertFails(create("EXPNUM", { expiresAt: Date.now() + 1000 }));
    });

    test("a code cannot be born used", async () => {
      await assertFails(create("USED01", { used: true }));
    });

    test("the code field must equal the document id", async () => {
      await assertFails(create("DOCID1", { code: "OTHER1" }));
    });

    test("no extra field, childName is a string of at most 100 characters", async () => {
      await assertFails(create("EXTRA1", { admin: true }));
      await assertFails(create("EXTRA2", { grantRole: "owner" }));
      await assertFails(create("NAME01", { childName: 42 }));
      await assertSucceeds(create("NAME02", { childName: "x".repeat(100) }));
      await assertFails(create("NAME03", { childName: "x".repeat(101) }));
    });

    test("viewer and contributor cannot create codes", async () => {
      await seedData(async (db: any) => {
        await setDoc(doc(db, "children", CHILD_ID, "access", BOB_UID), {
          userId: BOB_UID,
          role: "viewer",
          grantedBy: ALICE_UID,
        });
        await setDoc(doc(db, "children", CHILD_ID, "access", CHARLIE_UID), {
          userId: CHARLIE_UID,
          role: "contributor",
          grantedBy: ALICE_UID,
        });
      });
      await assertFails(create("VIEW01", { createdBy: BOB_UID }, BOB_UID));
      await assertFails(create("CONT01", { createdBy: CHARLIE_UID }, CHARLIE_UID));
    });

    test("the primary owner (children.ownerId) may create a code without an access doc", async () => {
      await seedData(async (db: any) => {
        await setDoc(doc(db, "children", "childOwnerOnly"), {
          name: "Solo",
          birthDate: now,
          ownerId: BOB_UID,
        });
      });
      await assertSucceeds(
        setDoc(doc(authedFirestore(BOB_UID), "shareCodes", "OWNONLY"), codeData({
          code: "OWNONLY",
          childId: "childOwnerOnly",
          createdBy: BOB_UID,
        }))
      );
    });

    test("an existing code cannot be overwritten", async () => {
      await assertFails(create("CODE123", { childName: "Overwritten" }));
    });
  });

  test("a share code cannot be modified from the client", async () => {
    await assertFails(updateDoc(doc(authedFirestore(ALICE_UID), "shareCodes", "CODE123"), { used: true }));
  });
});

// ===========================================================================
// 8. USER PREFERENCES
// ===========================================================================

describe("user_preferences collection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "user_preferences", ALICE_UID), {
        theme: "dark",
        language: "fr",
      });
    });
  });

  test("user can read own preferences", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "user_preferences", ALICE_UID)));
  });

  test("user cannot read another user's preferences", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(getDoc(doc(db, "user_preferences", ALICE_UID)));
  });

  test("user can write own preferences", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(
      updateDoc(doc(db, "user_preferences", ALICE_UID), { theme: "light" })
    );
  });

  // Les règles ne valident pas les préférences champ par champ : les heures
  // calmes (chemin pointé écrit au démarrage) passent, la validation HH:MM /
  // fuseau est faite à la lecture (appli et serveur, repli sur les défauts).
  test("user can write own reminders.quietHours, nobody else can", async () => {
    const quietHours = { enabled: true, start: "22:00", end: "07:00", timeZone: "Europe/Paris" };
    await assertSucceeds(
      updateDoc(doc(authedFirestore(ALICE_UID), "user_preferences", ALICE_UID), {
        "notifications.reminders.quietHours": quietHours,
      })
    );
    await assertFails(
      updateDoc(doc(authedFirestore(BOB_UID), "user_preferences", ALICE_UID), {
        "notifications.reminders.quietHours": quietHours,
      })
    );
  });

  test("user cannot add healthDataConsent to existing preferences", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      updateDoc(doc(db, "user_preferences", ALICE_UID), {
        healthDataConsent: { granted: true, grantedAt: "2026-11-06T00:00:00Z", version: "2.1" },
      })
    );
  });

  test("user cannot create preferences carrying healthDataConsent", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      setDoc(doc(db, "user_preferences", BOB_UID), {
        theme: "dark",
        healthDataConsent: { granted: true, grantedAt: "2026-11-06T00:00:00Z", version: "2.1" },
      })
    );
  });

  test("user can create preferences without healthDataConsent", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(setDoc(doc(db, "user_preferences", BOB_UID), { theme: "dark" }));
  });

  describe("with a server-written consent", () => {
    beforeEach(async () => {
      await seedData(async (db: any) => {
        await setDoc(doc(db, "user_preferences", ALICE_UID), {
          theme: "dark",
          healthDataConsent: { granted: true, grantedAt: "2026-11-06T00:00:00Z", version: "2.1" },
        });
      });
    });

    test("user can still read the consent", async () => {
      const db = authedFirestore(ALICE_UID);
      await assertSucceeds(getDoc(doc(db, "user_preferences", ALICE_UID)));
    });

    test("user can update other fields", async () => {
      const db = authedFirestore(ALICE_UID);
      await assertSucceeds(
        updateDoc(doc(db, "user_preferences", ALICE_UID), { theme: "light" })
      );
    });

    test("user cannot modify healthDataConsent", async () => {
      const db = authedFirestore(ALICE_UID);
      await assertFails(
        updateDoc(doc(db, "user_preferences", ALICE_UID), { "healthDataConsent.version": "9.9" })
      );
    });

    test("user cannot remove healthDataConsent", async () => {
      const db = authedFirestore(ALICE_UID);
      await assertFails(
        updateDoc(doc(db, "user_preferences", ALICE_UID), { healthDataConsent: deleteField() })
      );
    });

    test("user can delete own preferences", async () => {
      const db = authedFirestore(ALICE_UID);
      await assertSucceeds(deleteDoc(doc(db, "user_preferences", ALICE_UID)));
    });

    test("the legacy app cannot overwrite it with a 1.0 consent", async () => {
      const db = authedFirestore(ALICE_UID);
      await assertFails(
        setDoc(
          doc(db, "user_preferences", ALICE_UID),
          { healthDataConsent: { granted: true, grantedAt: "2026-11-07T00:00:00Z", version: "1.0" } },
          { merge: true }
        )
      );
    });
  });

  // App ≤ 1.0.8 still writes its own "1.0" consent at sign-up (transition).
  test("legacy app can create preferences with a 1.0 consent", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(
      setDoc(
        doc(db, "user_preferences", BOB_UID),
        { healthDataConsent: { granted: true, grantedAt: "2026-11-06T00:00:00Z", version: "1.0" } },
        { merge: true }
      )
    );
  });

  test("legacy app can add a 1.0 consent to existing preferences", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(
      setDoc(
        doc(db, "user_preferences", ALICE_UID),
        { healthDataConsent: { granted: true, grantedAt: "2026-11-06T00:00:00Z", version: "1.0" } },
        { merge: true }
      )
    );
  });
});

// ===========================================================================
// SERVER-ONLY PROOF COLLECTIONS (consent_records, apple_tokens)
// ===========================================================================

describe("consent_records and apple_tokens collections", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "consent_records", "c1"), { uid: ALICE_UID, type: "health_data", version: "2.1" });
      await setDoc(doc(db, "apple_tokens", ALICE_UID), { refreshToken: "r" });
    });
  });

  test("owner cannot read own consent record", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(getDoc(doc(db, "consent_records", "c1")));
  });

  test("user cannot list consent records", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(getDocs(query(collection(db, "consent_records"), where("uid", "==", ALICE_UID))));
  });

  test("user cannot create, update or delete consent records", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(setDoc(doc(db, "consent_records", "c2"), { uid: ALICE_UID, version: "2.1" }));
    await assertFails(updateDoc(doc(db, "consent_records", "c1"), { version: "1" }));
    await assertFails(deleteDoc(doc(db, "consent_records", "c1")));
  });

  test("owner cannot read, write or delete own apple token", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(getDoc(doc(db, "apple_tokens", ALICE_UID)));
    await assertFails(setDoc(doc(db, "apple_tokens", ALICE_UID), { refreshToken: "x" }));
    await assertFails(deleteDoc(doc(db, "apple_tokens", ALICE_UID)));
  });
});

// ===========================================================================
// 9. CHILD DELETION REQUESTS
// ===========================================================================

describe("childDeletionRequests collection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "childDeletionRequests", "req1"), {
        childId: CHILD_ID,
        ownerIds: [ALICE_UID, BOB_UID],
        requestedBy: ALICE_UID,
        seenByUserIds: [ALICE_UID],
        status: "pending",
      });
    });
  });

  test("owner in ownerIds can read deletion request", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "childDeletionRequests", "req1")));
  });

  test("non-owner cannot read deletion request", async () => {
    const db = authedFirestore(CHARLIE_UID);
    await assertFails(getDoc(doc(db, "childDeletionRequests", "req1")));
  });

  test("owner can update seenByUserIds only", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(
      updateDoc(doc(db, "childDeletionRequests", "req1"), {
        seenByUserIds: [ALICE_UID, BOB_UID],
      })
    );
  });

  test("owner cannot update other fields", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      updateDoc(doc(db, "childDeletionRequests", "req1"), {
        status: "approved",
      })
    );
  });

  test("create is denied (CF only)", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      setDoc(doc(db, "childDeletionRequests", "req2"), {
        childId: CHILD_ID,
        ownerIds: [ALICE_UID],
        requestedBy: ALICE_UID,
        seenByUserIds: [],
        status: "pending",
      })
    );
  });

  test("delete is denied (CF only)", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(deleteDoc(doc(db, "childDeletionRequests", "req1")));
  });
});

// ===========================================================================
// 10. USAGE LIMITS
// ===========================================================================

describe("user_promos referral fields (audit A2)", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "user_promos", ALICE_UID), {
        seenPromos: [],
        referralCode: "SAM-ALIC-E123",
        referralCount: 2,
        referredBy: BOB_UID,
      });
    });
  });

  test("user can still update their promo tracking fields", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(updateDoc(doc(db, "user_promos", ALICE_UID), { seenPromos: ["p1"] }));
  });

  test("user cannot remove referredBy to reuse a code", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(updateDoc(doc(db, "user_promos", ALICE_UID), { referredBy: deleteField() }));
  });

  test("user cannot change their code or their referral count", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(updateDoc(doc(db, "user_promos", ALICE_UID), { referralCode: "SAM-BOBB-0000" }));
    await assertFails(updateDoc(doc(db, "user_promos", ALICE_UID), { referralCount: 50 }));
  });

  test("a new promo document cannot carry referral fields", async () => {
    const db = authedFirestore(CHARLIE_UID);
    await assertFails(setDoc(doc(db, "user_promos", CHARLIE_UID), { referralCode: "SAM-ALIC-E123" }));
    await assertSucceeds(
      setDoc(doc(db, "user_promos", CHARLIE_UID), { seenPromos: [], referralCount: 0, referralRewards: [] })
    );
  });

  test("referral_codes is server-only", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(getDoc(doc(db, "referral_codes", "SAM-ALIC-E123")));
    await assertFails(setDoc(doc(db, "referral_codes", "SAM-FAKE-0001"), { uid: ALICE_UID }));
  });
});

describe("usage_limits collection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "usage_limits", ALICE_UID), {
        voiceCommands: 5,
        lastReset: now,
      });
    });
  });

  test("user can read own usage limits", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "usage_limits", ALICE_UID)));
  });

  test("user cannot read another user's usage limits", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(getDoc(doc(db, "usage_limits", ALICE_UID)));
  });

  test("user cannot write usage limits", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      updateDoc(doc(db, "usage_limits", ALICE_UID), { voiceCommands: 999 })
    );
  });
});

// ===========================================================================
// 11. TIPS / MILESTONES_REF / APP_CONFIG (read-only)
// ===========================================================================

describe("read-only collections (tips, milestones_ref, app_config)", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "tips", "tip1"), {
        title: "Sleep tip",
        body: "Sleep is important",
      });
      await setDoc(doc(db, "milestones_ref", "ms1"), {
        title: "First smile",
        ageMonths: 2,
      });
      await setDoc(doc(db, "app_config", "version"), {
        minVersion: "2.0.0",
      });
    });
  });

  test("authenticated user can read tips", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "tips", "tip1")));
  });

  test("unauthenticated cannot read tips", async () => {
    const db = unauthFirestore();
    await assertFails(getDoc(doc(db, "tips", "tip1")));
  });

  test("authenticated cannot write tips", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      setDoc(doc(db, "tips", "tip2"), { title: "Hack", body: "Injected" })
    );
  });

  test("authenticated user can read milestones_ref", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "milestones_ref", "ms1")));
  });

  test("authenticated cannot write milestones_ref", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      setDoc(doc(db, "milestones_ref", "ms2"), {
        title: "Hack",
        ageMonths: 0,
      })
    );
  });

  test("authenticated user can read app_config", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "app_config", "version")));
  });

  test("authenticated cannot write app_config", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(
      setDoc(doc(db, "app_config", "version"), { minVersion: "0.0.0" })
    );
  });
});

// ===========================================================================
// 12. DEFAULT DENY RULE
// ===========================================================================

describe("default deny rule", () => {
  test("unknown collection is denied for authenticated user", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertFails(getDoc(doc(db, "unknown_collection", "doc1")));
  });

  test("unknown collection is denied for unauthenticated user", async () => {
    const db = unauthFirestore();
    await assertFails(getDoc(doc(db, "unknown_collection", "doc1")));
  });
});

// ===========================================================================
// 13. DEVICE TOKENS
// ===========================================================================

describe("device_tokens collection", () => {
  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "device_tokens", "token1"), {
        userId: ALICE_UID,
        token: "abc123",
        platform: "ios",
      });
    });
  });

  test("user can read own device token", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(getDoc(doc(db, "device_tokens", "token1")));
  });

  test("user cannot read another user's device token", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(getDoc(doc(db, "device_tokens", "token1")));
  });

  test("user can create own device token", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(
      setDoc(doc(db, "device_tokens", "token2"), {
        userId: BOB_UID,
        token: "def456",
        platform: "android",
      })
    );
  });

  test("user cannot create device token for another user", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      setDoc(doc(db, "device_tokens", "token2"), {
        userId: ALICE_UID,
        token: "def456",
        platform: "android",
      })
    );
  });

  test("user can delete own device token", async () => {
    const db = authedFirestore(ALICE_UID);
    await assertSucceeds(deleteDoc(doc(db, "device_tokens", "token1")));
  });

  test("next account on the same device takes the token over", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(
      setDoc(
        doc(db, "device_tokens", "token1"),
        { userId: BOB_UID, token: "abc123", platform: "ios", enabled: true },
        { merge: true },
      ),
    );
  });

  test("takeover cannot change the token or keep the previous owner", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(
      setDoc(
        doc(db, "device_tokens", "token1"),
        { userId: BOB_UID, token: "other" },
        { merge: true },
      ),
    );
    await assertFails(
      setDoc(doc(db, "device_tokens", "token1"), { enabled: false }, { merge: true }),
    );
  });

  test("user cannot delete another user's device token", async () => {
    const db = authedFirestore(BOB_UID);
    await assertFails(deleteDoc(doc(db, "device_tokens", "token1")));
  });
});

// ===========================================================================
// SPRINT 4.8 — ROLE MATRIX ON EVENTS / LIKES / COMMENTS
// ===========================================================================

describe("sprint 4.8 role matrix", () => {
  const ADMIN_UID = "adminuser";
  const CONTRIB_UID = "contrib";
  const VIEWER_UID = "viewer";
  const FLAGGED_UID = "flagged"; // contributor whose access doc carries legacy write flags
  const photoPath = `children/${CHILD_ID}/jalons/p.jpg`;

  beforeEach(async () => {
    await seedData(async (db: any) => {
      await setDoc(doc(db, "children", CHILD_ID), { name: "Baby", birthDate: now, ownerId: ALICE_UID });
      await setDoc(doc(db, "children", CHILD2_ID), { name: "Other", birthDate: now, ownerId: CHARLIE_UID });
      const grant = (uid: string, role: string, extra: object = {}) =>
        setDoc(doc(db, "children", CHILD_ID, "access", uid), { userId: uid, role, grantedBy: ALICE_UID, ...extra });
      await grant(ALICE_UID, "owner");
      await grant(ADMIN_UID, "admin");
      await grant(CONTRIB_UID, "contributor", { canWriteEvents: false, canWriteLikes: true, canWriteComments: true });
      await grant(VIEWER_UID, "viewer", { canWriteEvents: false, canWriteLikes: false, canWriteComments: false });
      await grant(FLAGGED_UID, "contributor", { canWriteEvents: true, canWriteLikes: true, canWriteComments: true });
      await setDoc(doc(db, "events", "photoEvent"), {
        childId: CHILD_ID, userId: ALICE_UID, type: "jalon", createdAt: now, photos: [photoPath],
      });
      await setDoc(doc(db, "events", "emptyPhotoEvent"), {
        childId: CHILD_ID, userId: ALICE_UID, type: "jalon", createdAt: now, photos: [],
      });
      await setDoc(doc(db, "events", "plainEvent"), {
        childId: CHILD_ID, userId: ALICE_UID, type: "biberon", createdAt: now,
      });
      await setDoc(doc(db, "events", "otherChildPhotoEvent"), {
        childId: CHILD2_ID, userId: CHARLIE_UID, type: "jalon", createdAt: now, photos: [`children/${CHILD2_ID}/x.jpg`],
      });
      await setDoc(doc(db, "eventComments", "bobComment"), {
        childId: CHILD_ID, eventId: "photoEvent", userId: CONTRIB_UID, content: "Cute", createdAt: now,
      });
    });
  });

  const like = (uid: string, eventId: string, childId = CHILD_ID) => ({ childId, eventId, userId: uid });
  const comment = (uid: string, eventId: string, childId = CHILD_ID) => ({
    childId, eventId, userId: uid, content: "Hello", createdAt: now,
  });
  const newEvent = (uid: string) => ({ childId: CHILD_ID, userId: uid, type: "couche", createdAt: now });

  describe("reading events", () => {
    test.each([ALICE_UID, ADMIN_UID, CONTRIB_UID, VIEWER_UID])("%s reads photo and non-photo events", async (uid) => {
      const db = authedFirestore(uid);
      await assertSucceeds(getDoc(doc(db, "events", "photoEvent")));
      await assertSucceeds(getDoc(doc(db, "events", "plainEvent")));
    });
    test("a contributor can list the child's events", async () => {
      const db = authedFirestore(CONTRIB_UID);
      await assertSucceeds(getDocs(query(collection(db, "events"), where("childId", "==", CHILD_ID), limit(50))));
    });
  });

  describe("writing events", () => {
    test.each([ALICE_UID, ADMIN_UID])("%s can create an event", async (uid) => {
      await assertSucceeds(setDoc(doc(authedFirestore(uid), "events", "new1"), newEvent(uid)));
    });
    test.each([CONTRIB_UID, VIEWER_UID, FLAGGED_UID])("%s cannot create an event", async (uid) => {
      await assertFails(setDoc(doc(authedFirestore(uid), "events", "new1"), newEvent(uid)));
    });
    test.each([CONTRIB_UID, VIEWER_UID, FLAGGED_UID])("%s cannot update an event", async (uid) => {
      await assertFails(updateDoc(doc(authedFirestore(uid), "events", "plainEvent"), { note: "x" }));
    });
    test.each([ALICE_UID, ADMIN_UID, CONTRIB_UID, VIEWER_UID])("%s cannot delete an event from the client", async (uid) => {
      await assertFails(deleteDoc(doc(authedFirestore(uid), "events", "plainEvent")));
    });
    test("cannot create an event already flagged as reported", async () => {
      await assertFails(setDoc(doc(authedFirestore(ALICE_UID), "events", "new1"), { ...newEvent(ALICE_UID), reported: true }));
    });
    test.each([
      ["reported", { reported: false }],
      ["createdAt", { createdAt: Timestamp.fromMillis(1) }],
      ["childId", { childId: CHILD2_ID }],
      ["userId", { userId: BOB_UID }],
      ["idempotencyKey", { idempotencyKey: "k" }],
    ])("owner cannot change %s on update", async (_name, patch) => {
      await assertFails(updateDoc(doc(authedFirestore(ALICE_UID), "events", "plainEvent"), patch as any));
    });
    test("owner can still edit ordinary fields", async () => {
      await assertSucceeds(updateDoc(doc(authedFirestore(ALICE_UID), "events", "plainEvent"), { note: "ok" }));
    });
  });

  describe("likes", () => {
    test.each([ALICE_UID, ADMIN_UID])("%s can like any event of the child", async (uid) => {
      await assertSucceeds(setDoc(doc(authedFirestore(uid), "eventLikes", "l1"), like(uid, "plainEvent")));
      await assertSucceeds(setDoc(doc(authedFirestore(uid), "eventLikes", "l2"), like(uid, "photoEvent")));
    });
    test("a contributor can like a photo event", async () => {
      await assertSucceeds(setDoc(doc(authedFirestore(CONTRIB_UID), "eventLikes", "l1"), like(CONTRIB_UID, "photoEvent")));
    });
    test("a contributor cannot like a non-photo event", async () => {
      await assertFails(setDoc(doc(authedFirestore(CONTRIB_UID), "eventLikes", "l1"), like(CONTRIB_UID, "plainEvent")));
    });
    test("a contributor cannot like an event whose photos array is empty", async () => {
      await assertFails(setDoc(doc(authedFirestore(CONTRIB_UID), "eventLikes", "l1"), like(CONTRIB_UID, "emptyPhotoEvent")));
    });
    test("a contributor cannot like a missing event", async () => {
      await assertFails(setDoc(doc(authedFirestore(CONTRIB_UID), "eventLikes", "l1"), like(CONTRIB_UID, "ghost")));
    });
    test("a contributor cannot point a like at another child's photo event", async () => {
      await assertFails(setDoc(doc(authedFirestore(CONTRIB_UID), "eventLikes", "l1"), like(CONTRIB_UID, "otherChildPhotoEvent")));
      await assertFails(setDoc(doc(authedFirestore(CONTRIB_UID), "eventLikes", "l2"), like(CONTRIB_UID, "otherChildPhotoEvent", CHILD2_ID)));
    });
    test("a contributor cannot like in someone else's name", async () => {
      await assertFails(setDoc(doc(authedFirestore(CONTRIB_UID), "eventLikes", "l1"), like(ALICE_UID, "photoEvent")));
    });
    test("a viewer cannot like", async () => {
      await assertFails(setDoc(doc(authedFirestore(VIEWER_UID), "eventLikes", "l1"), like(VIEWER_UID, "photoEvent")));
    });
    test("a like without eventId string is refused", async () => {
      await assertFails(setDoc(doc(authedFirestore(CONTRIB_UID), "eventLikes", "l1"), { childId: CHILD_ID, userId: CONTRIB_UID }));
    });
  });

  describe("comments", () => {
    test.each([ALICE_UID, ADMIN_UID])("%s can comment on any event", async (uid) => {
      await assertSucceeds(setDoc(doc(authedFirestore(uid), "eventComments", "c1"), comment(uid, "plainEvent")));
    });
    test("a contributor can comment on a photo event", async () => {
      await assertSucceeds(setDoc(doc(authedFirestore(CONTRIB_UID), "eventComments", "c1"), comment(CONTRIB_UID, "photoEvent")));
    });
    test("a contributor cannot comment on a non-photo event", async () => {
      await assertFails(setDoc(doc(authedFirestore(CONTRIB_UID), "eventComments", "c1"), comment(CONTRIB_UID, "plainEvent")));
    });
    test("a contributor cannot comment on another child's event", async () => {
      await assertFails(setDoc(doc(authedFirestore(CONTRIB_UID), "eventComments", "c1"), comment(CONTRIB_UID, "otherChildPhotoEvent")));
    });
    test("a viewer cannot comment", async () => {
      await assertFails(setDoc(doc(authedFirestore(VIEWER_UID), "eventComments", "c1"), comment(VIEWER_UID, "photoEvent")));
    });
    test("author can edit the content of own comment", async () => {
      await assertSucceeds(updateDoc(doc(authedFirestore(CONTRIB_UID), "eventComments", "bobComment"), { content: "Edited", updatedAt: now }));
    });
    test.each([
      ["eventId", { eventId: "plainEvent" }],
      ["childId", { childId: CHILD2_ID }],
      ["userId", { userId: ALICE_UID }],
      ["createdAt", { createdAt: Timestamp.fromMillis(1) }],
    ])("author cannot change %s of own comment", async (_n, patch) => {
      await assertFails(updateDoc(doc(authedFirestore(CONTRIB_UID), "eventComments", "bobComment"), patch as any));
    });
    test("someone else cannot edit the comment", async () => {
      await assertFails(updateDoc(doc(authedFirestore(ALICE_UID), "eventComments", "bobComment"), { content: "x" }));
    });
    test("author and owner can delete the comment, a viewer cannot", async () => {
      await assertFails(deleteDoc(doc(authedFirestore(VIEWER_UID), "eventComments", "bobComment")));
      await assertSucceeds(deleteDoc(doc(authedFirestore(CONTRIB_UID), "eventComments", "bobComment")));
    });
  });
});
