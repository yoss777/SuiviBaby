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

const PROJECT_ID = "samaye-53723";
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
// 4. EVENT LIKES / EVENT COMMENTS
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

  test("invited user can update invitation (accept/refuse)", async () => {
    const db = authedFirestore(BOB_UID, "bob@test.com");
    await assertSucceeds(
      updateDoc(doc(db, "shareInvitations", "invite1"), {
        status: "accepted",
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

  test("valid unused code is readable by any authenticated user (not expired)", async () => {
    const db = authedFirestore(BOB_UID);
    await assertSucceeds(getDoc(doc(db, "shareCodes", "CODE123")));
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
});
