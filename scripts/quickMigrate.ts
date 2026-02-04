/**
 * Script de migration rapide - Crée les documents d'accès pour l'utilisateur actuel
 *
 * Ce script est plus simple que migratePermissions.ts car il ne migre que pour
 * l'utilisateur qui l'exécute (via son auth Firebase).
 */

import { initializeApp } from 'firebase/app';
import {
  connectFirestoreEmulator,
  getFirestore,
  collection,
  getDocs,
  doc,
  setDoc,
  Timestamp,
  query,
  where,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBJUP-b3NPExx-4RfWFLvrbAM5pEfHvAOg",
  authDomain: "samaye-53723.firebaseapp.com",
  databaseURL: "https://samaye-53723-default-rtdb.firebaseio.com",
  projectId: "samaye-53723",
  storageBucket: "samaye-53723.firebasestorage.app",
  messagingSenderId: "222899144223",
  appId: "1:222899144223:web:bdec5b5754d15fc987372a",
  measurementId: "G-SN50WE00WE"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Optionnel: se connecter à l'émulateur si activé
const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
if (emulatorHost) {
  const [host, port] = emulatorHost.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  console.log(`🔧 Connecté à l'émulateur: ${host}:${port}\n`);
}

async function quickMigrate() {
  console.log('🚀 Migration rapide des permissions...\n');

  // Récupérer l'UID de l'utilisateur depuis les arguments
  const userId = process.argv[2];

  if (!userId) {
    console.error('❌ Usage: npx ts-node scripts/quickMigrate.ts <USER_ID>');
    console.error('   Exemple: npx ts-node scripts/quickMigrate.ts PTKG0fc5f6dhSEw8FAn0Bqiq6SJ3');
    process.exit(1);
  }

  console.log(`👤 Migration pour l'utilisateur: ${userId}\n`);

  try {
    // 1. Trouver tous les enfants où cet utilisateur est dans parentIds
    const childrenRef = collection(db, 'children');
    const q = query(childrenRef, where('parentIds', 'array-contains', userId));
    const childrenSnap = await getDocs(q);

    console.log(`📊 ${childrenSnap.size} enfants trouvés\n`);

    if (childrenSnap.size === 0) {
      console.log('✅ Aucun enfant à migrer');
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const childDoc of childrenSnap.docs) {
      const childId = childDoc.id;
      const childData = childDoc.data();

      console.log(`\n👶 Traitement de l'enfant: ${childId}`);

      try {
        // Déterminer le rôle
        const isOwner = childData.ownerId === userId ||
                        (childData.parentIds?.[0] === userId && !childData.ownerId);

        const role = isOwner ? 'owner' : 'admin';

        // Vérifier si l'accès existe déjà
        const accessRef = doc(db, 'children', childId, 'access', userId);
        const { getDoc } = await import('firebase/firestore');
        const accessSnap = await getDoc(accessRef);

        if (accessSnap.exists()) {
          console.log(`  ℹ️  Accès déjà existant (rôle: ${accessSnap.data()?.role})`);
          successCount++;
          continue;
        }

        // Créer le document d'accès
        await setDoc(accessRef, {
          userId,
          role,
          canWriteEvents: true,
          canWriteLikes: true,
          canWriteComments: true,
          grantedBy: childData.ownerId || userId,
          grantedAt: Timestamp.now(),
        });

        console.log(`  ✅ Accès ${role} créé`);

        // Mettre à jour ownerId si nécessaire
        if (isOwner && !childData.ownerId) {
          await setDoc(
            doc(db, 'children', childId),
            { ownerId: userId },
            { merge: true }
          );
          console.log(`  ✅ ownerId défini`);
        }

        successCount++;
      } catch (error) {
        console.error(`  ❌ Erreur pour ${childId}:`, error);
        errorCount++;
      }
    }

    console.log('\n\n📈 Résumé de la migration:');
    console.log(`  ✅ Succès: ${successCount}`);
    console.log(`  ❌ Erreurs: ${errorCount}`);
    console.log(`  📊 Total: ${childrenSnap.size}`);

    if (errorCount === 0) {
      console.log('\n🎉 Migration terminée avec succès !');
      console.log('\n💡 Redémarrez votre application pour que les changements prennent effet.');
    } else {
      console.log('\n⚠️  Migration terminée avec des erreurs. Vérifiez les logs ci-dessus.');
    }
  } catch (error) {
    console.error('\n❌ Erreur fatale lors de la migration:', error);
    process.exit(1);
  }
}

quickMigrate()
  .then(() => {
    console.log('\n✅ Script terminé');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script échoué:', error);
    process.exit(1);
  });
