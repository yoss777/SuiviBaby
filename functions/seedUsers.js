// Seed users in Firestore emulator using Admin SDK (bypasses rules)
// Usage:
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
//   OWNER_UID=... OWNER_EMAIL=... OWNER_NAME="Owner" \
//   GUEST_UID=... GUEST_EMAIL=... GUEST_NAME="Guest" \
//   node seedUsers.js

const admin = require("firebase-admin");

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || "samaye-53723";
process.env.GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || "samaye-53723";

admin.initializeApp({
  projectId: "samaye-53723",
});

const db = admin.firestore();

const owner = {
  uid: process.env.OWNER_UID,
  email: process.env.OWNER_EMAIL,
  name: process.env.OWNER_NAME || "Owner",
};

const guest = {
  uid: process.env.GUEST_UID,
  email: process.env.GUEST_EMAIL,
  name: process.env.GUEST_NAME || "Guest",
};

function validate(user, label) {
  if (!user.uid || !user.email) {
    throw new Error(`${label} missing UID or EMAIL`);
  }
}

async function seedUser(user) {
  await db.collection("users").doc(user.uid).set(
    {
      userName: user.name,
      email: user.email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function main() {
  validate(owner, "OWNER");
  validate(guest, "GUEST");

  await seedUser(owner);
  await seedUser(guest);

  console.log("✅ Seed users done:", owner.uid, guest.uid);
  await admin.app().delete();
}

main().catch((err) => {
  console.error("❌ Seed users failed:", err);
  process.exit(1);
});
