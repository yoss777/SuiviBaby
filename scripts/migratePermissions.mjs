/**
 * Migration des permissions (version JS, pour éviter ts-node).
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/migratePermissions.mjs
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

const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '';
if (emulatorHost) {
  const [host, port] = emulatorHost.split(':');
  connectFirestoreEmulator(db, host, Number(port));
} else {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

async function migratePermissions() {
  console.log('🚀 Début de la migration des permissions...\n');

  const childrenRef = collection(db, 'children');
  const childrenSnap = await getDocs(childrenRef);

  console.log(`📊 ${childrenSnap.size} enfants trouvés\n`);

  let successCount = 0;
  let errorCount = 0;

  for (const childDoc of childrenSnap.docs) {
    const childId = childDoc.id;
    const childData = childDoc.data();

    console.log(`\n👶 Traitement de l'enfant: ${childId}`);

    try {
      const ownerId = childData.ownerId || childData.parentIds?.[0];

      if (!ownerId) {
        console.warn(`⚠️  Aucun owner trouvé pour ${childId}, ignoré`);
        errorCount += 1;
        continue;
      }

      if (!childData.ownerId) {
        await setDoc(
          doc(db, 'children', childId),
          { ownerId },
          { merge: true }
        );
        console.log(`  ✅ ownerId défini: ${ownerId}`);
      }

      await setDoc(doc(db, 'children', childId, 'access', ownerId), {
        userId: ownerId,
        role: 'owner',
        canWriteEvents: true,
        canWriteLikes: true,
        canWriteComments: true,
        grantedBy: ownerId,
        grantedAt: Timestamp.now(),
      });
      console.log(`  ✅ Accès owner créé pour ${ownerId}`);

      const otherParents = (childData.parentIds || []).filter(
        (parentId) => parentId !== ownerId
      );

      for (const parentId of otherParents) {
        await setDoc(doc(db, 'children', childId, 'access', parentId), {
          userId: parentId,
          role: 'admin',
          canWriteEvents: true,
          canWriteLikes: true,
          canWriteComments: true,
          grantedBy: ownerId,
          grantedAt: Timestamp.now(),
        });
        console.log(`  ✅ Accès admin créé pour ${parentId}`);
      }

      successCount += 1;
    } catch (error) {
      console.error(`  ❌ Erreur pour ${childId}:`, error);
      errorCount += 1;
    }
  }

  console.log('\n\n📈 Résumé de la migration:');
  console.log(`  ✅ Succès: ${successCount}`);
  console.log(`  ❌ Erreurs: ${errorCount}`);
  console.log(`  📊 Total: ${childrenSnap.size}`);

  if (errorCount === 0) {
    console.log('\n🎉 Migration terminée avec succès !');
  } else {
    console.log('\n⚠️  Migration terminée avec des erreurs. Vérifiez les logs ci-dessus.');
  }
}

migratePermissions()
  .then(() => {
    console.log('\n✅ Script terminé');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script échoué:', error);
    process.exit(1);
  });
