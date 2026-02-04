/**
 * Migration prod: remplir users_public depuis users
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
 *   NODE_PATH=functions/node_modules node scripts/migrateUsersPublicAdmin.js
 */

const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "samaye-53723",
});

const db = admin.firestore();

async function migrate() {
  console.log("🚀 Migration users_public (Admin)...");
  const usersSnap = await db.collection("users").get();
  console.log(`📊 ${usersSnap.size} users trouvés`);

  let created = 0;
  let updated = 0;

  for (const userDoc of usersSnap.docs) {
    const data = userDoc.data() || {};
    const userId = userDoc.id;
    const userName = data.userName || data.displayName || null;
    const email = data.email ? String(data.email).toLowerCase() : null;

    if (!userName && !email) continue;

    const publicRef = db.collection("users_public").doc(userId);
    const publicSnap = await publicRef.get();
    if (!publicSnap.exists) {
      await publicRef.set({
        userName,
        email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      created += 1;
    } else {
      await publicRef.set({
        ...(userName ? { userName } : {}),
        ...(email ? { email } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      updated += 1;
    }
  }

  console.log(`✅ Migration terminée. Créés: ${created}, Màj: ${updated}`);
}

migrate().catch((e) => {
  console.error("❌ Erreur fatale:", e);
  process.exit(1);
});
