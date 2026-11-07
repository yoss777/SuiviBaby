/**
 * Script de test pour vérifier que les permissions fonctionnent correctement
 *
 * Ce script teste les différents scénarios de permissions pour s'assurer
 * que tout fonctionne comme prévu avant le déploiement.
 *
 * Usage:
 * ```bash
 * npx ts-node scripts/testPermissions.ts
 * ```
 */

import { initializeApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore, doc, getDoc } from 'firebase/firestore';
import { getUserChildAccess, calculatePermissions } from '../utils/permissions';
import {
  grantChildAccess,
  revokeChildAccess,
  updateChildAccess,
} from '../services/accessRepository';

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

// IDs de test (à remplacer par vos IDs réels)
const TEST_CHILD_ID = 'test-child-id';
const TEST_OWNER_ID = 'test-owner-id';
const TEST_ADMIN_ID = 'test-admin-id';
const TEST_CONTRIBUTOR_ID = 'test-contributor-id';
const TEST_VIEWER_ID = 'test-viewer-id';

async function runTests() {
  console.log('🧪 Début des tests de permissions...\n');

  try {
    // Test 1: Vérifier l'accès owner
    console.log('Test 1: Vérifier l\'accès owner');
    const ownerAccess = await getUserChildAccess(TEST_CHILD_ID, TEST_OWNER_ID);
    const ownerPerms = calculatePermissions(ownerAccess);

    console.log('  Owner access:', ownerAccess);
    console.log('  Owner permissions:', ownerPerms);

    if (!ownerPerms.canManageAccess) {
      console.error('  ❌ ÉCHEC: Owner devrait pouvoir gérer les accès');
    } else {
      console.log('  ✅ SUCCÈS: Owner peut gérer les accès');
    }

    // Test 2: Vérifier l'accès admin
    console.log('\nTest 2: Vérifier l\'accès admin');
    const adminAccess = await getUserChildAccess(TEST_CHILD_ID, TEST_ADMIN_ID);
    const adminPerms = calculatePermissions(adminAccess);

    console.log('  Admin permissions:', adminPerms);

    if (!adminPerms.canWriteEvents) {
      console.error('  ❌ ÉCHEC: Admin devrait pouvoir écrire des events');
    } else if (adminPerms.canManageAccess) {
      console.error('  ❌ ÉCHEC: Admin ne devrait pas pouvoir gérer les accès');
    } else {
      console.log('  ✅ SUCCÈS: Admin a les bonnes permissions');
    }

    // Test 3: Vérifier l'accès contributor
    console.log('\nTest 3: Vérifier l\'accès contributor');
    const contributorAccess = await getUserChildAccess(
      TEST_CHILD_ID,
      TEST_CONTRIBUTOR_ID
    );
    const contributorPerms = calculatePermissions(contributorAccess);

    console.log('  Contributor permissions:', contributorPerms);

    if (contributorPerms.canWriteEvents) {
      console.error('  ❌ ÉCHEC: Contributor ne devrait pas pouvoir écrire des events');
    } else if (!contributorPerms.canWriteLikes || !contributorPerms.canWriteComments) {
      console.error('  ❌ ÉCHEC: Contributor devrait pouvoir liker et commenter');
    } else {
      console.log('  ✅ SUCCÈS: Contributor a les bonnes permissions');
    }

    // Test 4: Vérifier l'accès viewer
    console.log('\nTest 4: Vérifier l\'accès viewer');
    const viewerAccess = await getUserChildAccess(TEST_CHILD_ID, TEST_VIEWER_ID);
    const viewerPerms = calculatePermissions(viewerAccess);

    console.log('  Viewer permissions:', viewerPerms);

    if (
      viewerPerms.canWriteEvents ||
      viewerPerms.canWriteLikes ||
      viewerPerms.canWriteComments
    ) {
      console.error('  ❌ ÉCHEC: Viewer ne devrait avoir aucune permission d\'écriture');
    } else if (!viewerPerms.canRead) {
      console.error('  ❌ ÉCHEC: Viewer devrait pouvoir lire');
    } else {
      console.log('  ✅ SUCCÈS: Viewer a les bonnes permissions');
    }

    // Test 5: Vérifier qu'un utilisateur sans accès n'a aucune permission
    console.log('\nTest 5: Vérifier l\'absence d\'accès');
    const noAccess = await getUserChildAccess(TEST_CHILD_ID, 'non-existent-user');
    const noPerms = calculatePermissions(noAccess);

    console.log('  No access permissions:', noPerms);

    if (noPerms.hasAccess) {
      console.error('  ❌ ÉCHEC: Utilisateur sans accès ne devrait pas avoir hasAccess=true');
    } else {
      console.log('  ✅ SUCCÈS: Utilisateur sans accès correctement bloqué');
    }

    // Test 6: Tester la modification de rôle
    console.log('\nTest 6: Tester la modification de rôle');
    console.log('  (Commenté pour éviter les modifications en production)');
    /*
    await updateChildAccess(TEST_CHILD_ID, TEST_CONTRIBUTOR_ID, {
      role: 'admin',
    });
    const updatedAccess = await getUserChildAccess(
      TEST_CHILD_ID,
      TEST_CONTRIBUTOR_ID
    );
    console.log('  Updated access:', updatedAccess);

    // Remettre le rôle d'origine
    await updateChildAccess(TEST_CHILD_ID, TEST_CONTRIBUTOR_ID, {
      role: 'contributor',
    });
    */

    console.log('\n✅ Tous les tests sont terminés !');
  } catch (error) {
    console.error('\n❌ Erreur lors des tests:', error);
    process.exit(1);
  }
}

// Fonction pour créer des accès de test
async function setupTestData() {
  console.log('🔧 Création des données de test...\n');

  try {
    // Créer les accès pour les 4 rôles
    await grantChildAccess(TEST_CHILD_ID, TEST_OWNER_ID, 'owner', TEST_OWNER_ID);
    console.log('✅ Accès owner créé');

    await grantChildAccess(TEST_CHILD_ID, TEST_ADMIN_ID, 'admin', TEST_OWNER_ID);
    console.log('✅ Accès admin créé');

    await grantChildAccess(
      TEST_CHILD_ID,
      TEST_CONTRIBUTOR_ID,
      'contributor',
      TEST_OWNER_ID
    );
    console.log('✅ Accès contributor créé');

    await grantChildAccess(TEST_CHILD_ID, TEST_VIEWER_ID, 'viewer', TEST_OWNER_ID);
    console.log('✅ Accès viewer créé');

    console.log('\n✅ Données de test créées avec succès !');
  } catch (error) {
    console.error('\n❌ Erreur lors de la création des données:', error);
    process.exit(1);
  }
}

// Fonction pour nettoyer les données de test
async function cleanupTestData() {
  console.log('🧹 Nettoyage des données de test...\n');

  try {
    await revokeChildAccess(TEST_CHILD_ID, TEST_ADMIN_ID);
    console.log('✅ Accès admin supprimé');

    await revokeChildAccess(TEST_CHILD_ID, TEST_CONTRIBUTOR_ID);
    console.log('✅ Accès contributor supprimé');

    await revokeChildAccess(TEST_CHILD_ID, TEST_VIEWER_ID);
    console.log('✅ Accès viewer supprimé');

    // Ne pas supprimer l'owner pour éviter les problèmes
    // await revokeChildAccess(TEST_CHILD_ID, TEST_OWNER_ID);

    console.log('\n✅ Données de test nettoyées avec succès !');
  } catch (error) {
    console.error('\n❌ Erreur lors du nettoyage:', error);
    process.exit(1);
  }
}

// Menu principal
const args = process.argv.slice(2);
const command = args[0];

if (command === 'setup') {
  setupTestData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else if (command === 'cleanup') {
  cleanupTestData()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  runTests()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
