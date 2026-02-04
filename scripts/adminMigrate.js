/**
 * Script de migration ADMIN - Utilise Firebase Admin SDK
 *
 * Ce script bypasse complètement les règles Firestore et migre directement
 * tous les enfants de tous les utilisateurs.
 *
 * Usage:
 * node scripts/adminMigrate.js
 */

const admin = require('firebase-admin');

// Initialiser avec les credentials par défaut
// Utilise GOOGLE_APPLICATION_CREDENTIALS ou les credentials de gcloud
admin.initializeApp({
  projectId: 'samaye-53723',
});

const db = admin.firestore();

async function migrateAll() {
  console.log('🚀 Début de la migration ADMIN...\n');

  try {
    // 1. Récupérer TOUS les enfants
    const childrenSnap = await db.collection('children').get();

    console.log(`📊 ${childrenSnap.size} enfants trouvés\n`);

    if (childrenSnap.size === 0) {
      console.log('✅ Aucun enfant à migrer');
      return;
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    // 2. Pour chaque enfant
    for (const childDoc of childrenSnap.docs) {
      const childId = childDoc.id;
      const childData = childDoc.data();

      console.log(`\n👶 Traitement de l'enfant: ${childId}`);

      try {
        const parentIds = childData.parentIds || [];
        const ownerId = childData.ownerId;

        if (parentIds.length === 0) {
          console.log('  ⚠️  Aucun parent trouvé, ignoré');
          skippedCount++;
          continue;
        }

        // Déterminer l'owner
        const effectiveOwnerId = ownerId || parentIds[0];

        // Mettre à jour ownerId si nécessaire
        if (!ownerId) {
          await childDoc.ref.update({
            ownerId: effectiveOwnerId
          });
          console.log(`  ✅ ownerId défini: ${effectiveOwnerId}`);
        }

        // 3. Pour chaque parent, créer ou vérifier le document d'accès
        for (const parentId of parentIds) {
          const accessRef = childDoc.ref.collection('access').doc(parentId);
          const accessSnap = await accessRef.get();

          if (accessSnap.exists) {
            console.log(`  ℹ️  Accès déjà existant pour ${parentId}`);
            continue;
          }

          // Déterminer le rôle
          const role = parentId === effectiveOwnerId ? 'owner' : 'admin';

          // Créer le document d'accès
          await accessRef.set({
            userId: parentId,
            role,
            canWriteEvents: true,
            canWriteLikes: true,
            canWriteComments: true,
            grantedBy: effectiveOwnerId,
            grantedAt: admin.firestore.Timestamp.now(),
          });

          console.log(`  ✅ Accès ${role} créé pour ${parentId}`);
        }

        successCount++;
      } catch (error) {
        console.error(`  ❌ Erreur pour ${childId}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n\n📈 Résumé de la migration:');
    console.log(`  ✅ Succès: ${successCount}`);
    console.log(`  ⚠️  Ignorés: ${skippedCount}`);
    console.log(`  ❌ Erreurs: ${errorCount}`);
    console.log(`  📊 Total: ${childrenSnap.size}`);

    if (errorCount === 0) {
      console.log('\n🎉 Migration terminée avec succès !');
      console.log('\n💡 Vous pouvez maintenant relancer votre application.');
    } else {
      console.log('\n⚠️  Migration terminée avec des erreurs. Vérifiez les logs ci-dessus.');
    }
  } catch (error) {
    console.error('\n❌ Erreur fatale lors de la migration:', error);
    process.exit(1);
  }
}

// Exécuter la migration
migrateAll()
  .then(() => {
    console.log('\n✅ Script terminé');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script échoué:', error);
    process.exit(1);
  });
