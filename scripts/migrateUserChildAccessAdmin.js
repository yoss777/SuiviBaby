/**
 * Migration prod: créer user_child_access à partir de children/{childId}/access/*
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
 *   node scripts/migrateUserChildAccessAdmin.js
 */

const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "samaye-53723",
});

const db = admin.firestore();

async function migrate() {
  console.log("🚀 Migration user_child_access (Admin)...");

  const childrenSnap = await db.collection("children").get();
  console.log(`📊 ${childrenSnap.size} enfants trouvés`);

  let created = 0;
  let skipped = 0;

  for (const childDoc of childrenSnap.docs) {
    const childId = childDoc.id;
    const accessSnap = await childDoc.ref.collection("access").get();

    for (const accessDoc of accessSnap.docs) {
      const access = accessDoc.data() || {};
      const userId = access.userId || accessDoc.id;
      if (!userId) {
        skipped += 1;
        continue;
      }

      const indexRef = db.collection("user_child_access").doc(`${userId}_${childId}`);
      const indexSnap = await indexRef.get();
      if (indexSnap.exists) {
        skipped += 1;
        continue;
      }

      await indexRef.set({
        userId,
        childId,
        invitationId: access.invitationId || null,
        grantedBy: access.grantedBy || null,
        grantedAt: access.grantedAt || admin.firestore.FieldValue.serverTimestamp(),
      });
      created += 1;
    }
  }

  console.log(`✅ Migration terminée. Créés: ${created}, Skips: ${skipped}`);
}

migrate().catch((e) => {
  console.error("❌ Erreur fatale:", e);
  process.exit(1);
});
