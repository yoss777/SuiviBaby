/**
 * Migration prod via Firebase Admin SDK (bypass rules)
 *
 * Usage:
 *   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
 *   node scripts/migratePermissionsAdmin.js
 */

const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: "samaye-53723",
});

const db = admin.firestore();

async function migrate() {
  console.log("🚀 Migration permissions (Admin)...");

  const childrenSnap = await db.collection("children").get();
  console.log(`📊 ${childrenSnap.size} enfants trouvés`);

  let success = 0;
  let skipped = 0;
  let errors = 0;

  for (const childDoc of childrenSnap.docs) {
    const childId = childDoc.id;
    const data = childDoc.data() || {};

    try {
      const parentIds = Array.isArray(data.parentIds) ? data.parentIds : [];
      const ownerId = data.ownerId || parentIds[0];

      if (!ownerId) {
        console.warn(`⚠️  ${childId}: aucun owner/parentIds -> skip`);
        skipped += 1;
        continue;
      }

      if (!data.ownerId) {
        await childDoc.ref.set({ ownerId }, { merge: true });
        console.log(`  ✅ ownerId défini pour ${childId}: ${ownerId}`);
      }

      // Owner access
      const ownerAccessRef = childDoc.ref.collection("access").doc(ownerId);
      const ownerAccessSnap = await ownerAccessRef.get();
      if (!ownerAccessSnap.exists) {
        await ownerAccessRef.set({
          userId: ownerId,
          role: "owner",
          canWriteEvents: true,
          canWriteLikes: true,
          canWriteComments: true,
          grantedBy: ownerId,
          grantedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`  ✅ access owner créé: ${ownerId}`);
      }

      // Admin access for other parents
      for (const parentId of parentIds) {
        if (parentId === ownerId) continue;
        const accessRef = childDoc.ref.collection("access").doc(parentId);
        const accessSnap = await accessRef.get();
        if (accessSnap.exists) continue;
        await accessRef.set({
          userId: parentId,
          role: "admin",
          canWriteEvents: true,
          canWriteLikes: true,
          canWriteComments: true,
          grantedBy: ownerId,
          grantedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`  ✅ access admin créé: ${parentId}`);
      }

      success += 1;
    } catch (e) {
      console.error(`❌ ${childId}:`, e);
      errors += 1;
    }
  }

  console.log("\n✅ Migration terminée");
  console.log(`Succès: ${success}`);
  console.log(`Skips: ${skipped}`);
  console.log(`Erreurs: ${errors}`);
}

migrate().catch((e) => {
  console.error("❌ Erreur fatale:", e);
  process.exit(1);
});
