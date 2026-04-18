import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { doc, setDoc, Timestamp } from "firebase/firestore";

const PROJECT_ID = "samaye-53723";
const FIRESTORE_RULES_PATH = "firestore.rules";
const STORAGE_RULES_PATH = "storage.rules";
const STORAGE_BUCKET = "gs://samaye-53723.firebasestorage.app";

const ALICE_UID = "alice";
const BOB_UID = "bob";
const CHARLIE_UID = "charlie";
const DANA_UID = "dana";
const CHILD_ID = "child1";
const FILE_PATH = `children/${CHILD_ID}/jalons/test-photo.jpg`;

let testEnv: RulesTestEnvironment;

function authedStorage(uid: string) {
  return testEnv.authenticatedContext(uid).storage(STORAGE_BUCKET);
}

function unauthStorage() {
  return testEnv.unauthenticatedContext().storage(STORAGE_BUCKET);
}

function asPromise<T>(value: { then: Promise<T>["then"] }): Promise<T> {
  return value as Promise<T>;
}

async function seedAccess() {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = Timestamp.now();

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

    await setDoc(doc(db, "children", CHILD_ID, "access", CHARLIE_UID), {
      userId: CHARLIE_UID,
      role: "viewer",
      grantedBy: ALICE_UID,
      canWriteEvents: true,
    });
  });
}

async function seedPhoto(path = FILE_PATH) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx
      .storage(STORAGE_BUCKET)
      .ref(path)
      .putString("seed-image", "raw", {
        contentType: "image/jpeg",
      });
  });
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(FIRESTORE_RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
    storage: {
      rules: readFileSync(STORAGE_RULES_PATH, "utf8"),
      host: "127.0.0.1",
      port: 9199,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

afterEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

describe("storage.rules", () => {
  beforeEach(async () => {
    await seedAccess();
  });

  test("authorized user can read a child milestone photo", async () => {
    await seedPhoto();

    await assertSucceeds(authedStorage(BOB_UID).ref(FILE_PATH).getMetadata());
  });

  test("unauthenticated user cannot read a child milestone photo", async () => {
    await seedPhoto();

    await assertFails(unauthStorage().ref(FILE_PATH).getMetadata());
  });

  test("authenticated user without child access cannot read a child milestone photo", async () => {
    await seedPhoto();

    await assertFails(authedStorage(DANA_UID).ref(FILE_PATH).getMetadata());
  });

  test("owner can upload a child milestone photo", async () => {
    await assertSucceeds(
      asPromise(
        authedStorage(ALICE_UID).ref(FILE_PATH).putString("jpeg-data", "raw", {
          contentType: "image/jpeg",
        }),
      ),
    );
  });

  test("viewer without write permission cannot upload a child milestone photo", async () => {
    await assertFails(
      asPromise(
        authedStorage(BOB_UID).ref(FILE_PATH).putString("jpeg-data", "raw", {
          contentType: "image/jpeg",
        }),
      ),
    );
  });

  test("user with canWriteEvents can upload and delete a child milestone photo", async () => {
    const storage = authedStorage(CHARLIE_UID).ref(FILE_PATH);

    await assertSucceeds(
      asPromise(
        storage.putString("jpeg-data", "raw", {
          contentType: "image/jpeg",
        }),
      ),
    );
    await assertSucceeds(storage.delete());
  });

  test("non-image uploads are rejected", async () => {
    await assertFails(
      asPromise(
        authedStorage(ALICE_UID)
          .ref(`children/${CHILD_ID}/jalons/test-note.txt`)
          .putString("not-an-image", "raw", {
            contentType: "text/plain",
          }),
      ),
    );
  });

  test("files above 5MB are rejected", async () => {
    await assertFails(
      asPromise(
        authedStorage(ALICE_UID).ref(FILE_PATH).putString(
          "a".repeat(5 * 1024 * 1024 + 1),
          "raw",
          {
            contentType: "image/jpeg",
          },
        ),
      ),
    );
  });
});
