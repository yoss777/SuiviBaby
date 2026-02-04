/**
 * Provider pour la migration automatique des permissions
 *
 * Ce provider s'occupe de créer automatiquement les documents d'accès
 * pour les enfants existants quand l'utilisateur se connecte.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const MIGRATION_KEY = '@permissions_migrated_v1';

interface PermissionsMigrationContextValue {
  isMigrating: boolean;
  migrated: boolean;
}

const PermissionsMigrationContext = createContext<PermissionsMigrationContextValue>({
  isMigrating: false,
  migrated: false,
});

export function PermissionsMigrationProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser } = useAuth();
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrated, setMigrated] = useState(false);

  useEffect(() => {
    if (firebaseUser?.uid) {
      checkAndMigrate(firebaseUser.uid);
    }
  }, [firebaseUser?.uid]);

  const checkAndMigrate = async (userId: string) => {
    try {
      // Vérifier si déjà migré
      const migrationStatus = await AsyncStorage.getItem(MIGRATION_KEY);
      if (migrationStatus === userId) {
        console.log('✅ Permissions déjà migrées pour cet utilisateur');
        setMigrated(true);
        return;
      }

      console.log('🔄 Début de la vérification des permissions pour', userId);
      setIsMigrating(true);

      // Trouver tous les enfants où l'utilisateur est dans parentIds
      const childrenRef = collection(db, 'children');
      const q = query(childrenRef, where('parentIds', 'array-contains', userId));

      console.log('📊 Exécution de la requête children...');
      const childrenSnap = await getDocs(q);
      console.log(`📊 Requête terminée: ${childrenSnap.size} enfants trouvés`);

      if (childrenSnap.size === 0) {
        // Pas d'enfants, marquer comme migré
        await AsyncStorage.setItem(MIGRATION_KEY, userId);
        setMigrated(true);
        setIsMigrating(false);
        return;
      }

      console.log(`🔄 Vérification des permissions pour ${childrenSnap.size} enfants...`);

      let migratedCount = 0;

      for (const childDoc of childrenSnap.docs) {
        const childId = childDoc.id;
        const childData = childDoc.data();

        // Vérifier si le document d'accès existe déjà
        const accessRef = doc(db, 'children', childId, 'access', userId);
        const accessSnap = await getDoc(accessRef);

        if (accessSnap.exists()) {
          continue; // Déjà migré
        }

        // Déterminer le rôle
        const isOwner =
          childData.ownerId === userId ||
          (childData.parentIds?.[0] === userId && !childData.ownerId);

        const role = isOwner ? 'owner' : 'admin';

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

        // Mettre à jour ownerId si nécessaire
        if (isOwner && !childData.ownerId) {
          await setDoc(
            doc(db, 'children', childId),
            { ownerId: userId },
            { merge: true }
          );
        }

        migratedCount++;
        console.log(`✅ Permissions migrées pour l'enfant ${childId} (${role})`);
      }

      if (migratedCount > 0) {
        console.log(`🎉 ${migratedCount} enfants migrés avec succès`);
      }

      // Marquer comme migré
      await AsyncStorage.setItem(MIGRATION_KEY, userId);
      setMigrated(true);
    } catch (error) {
      console.error('❌ Erreur lors de la migration des permissions:', error);
      // Ne pas bloquer l'app en cas d'erreur
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <PermissionsMigrationContext.Provider value={{ isMigrating, migrated }}>
      {children}
    </PermissionsMigrationContext.Provider>
  );
}

export function usePermissionsMigration() {
  return useContext(PermissionsMigrationContext);
}
