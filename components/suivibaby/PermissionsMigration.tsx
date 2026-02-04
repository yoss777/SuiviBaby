/**
 * Composant de migration automatique des permissions
 *
 * À placer dans l'app au niveau du AuthContext pour migrer automatiquement
 * les permissions quand l'utilisateur se connecte.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
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

interface PermissionsMigrationProps {
  userId: string | null;
  onComplete?: () => void;
}

export function PermissionsMigration({
  userId,
  onComplete,
}: PermissionsMigrationProps) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'migrating' | 'done'>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  useEffect(() => {
    if (!userId) {
      setStatus('done');
      return;
    }

    checkAndMigrate();
  }, [userId]);

  const checkAndMigrate = async () => {
    if (!userId) return;

    try {
      setStatus('checking');

      // 1. Trouver tous les enfants où l'utilisateur est dans parentIds
      const childrenRef = collection(db, 'children');
      const q = query(childrenRef, where('parentIds', 'array-contains', userId));
      const childrenSnap = await getDocs(q);

      if (childrenSnap.size === 0) {
        setStatus('done');
        onComplete?.();
        return;
      }

      setProgress({ current: 0, total: childrenSnap.size });

      // 2. Vérifier si des documents d'accès sont manquants
      let needsMigration = false;
      const childrenToMigrate: Array<{ id: string; data: any }> = [];

      for (const childDoc of childrenSnap.docs) {
        const childId = childDoc.id;
        const accessRef = doc(db, 'children', childId, 'access', userId);
        const accessSnap = await getDoc(accessRef);

        if (!accessSnap.exists()) {
          needsMigration = true;
          childrenToMigrate.push({ id: childId, data: childDoc.data() });
        }
      }

      if (!needsMigration) {
        console.log('✅ Permissions déjà migrées');
        setStatus('done');
        onComplete?.();
        return;
      }

      // 3. Migrer les documents manquants
      setStatus('migrating');
      console.log(`🔄 Migration de ${childrenToMigrate.length} enfants...`);

      let migrated = 0;
      for (const child of childrenToMigrate) {
        const isOwner =
          child.data.ownerId === userId ||
          (child.data.parentIds?.[0] === userId && !child.data.ownerId);

        const role = isOwner ? 'owner' : 'admin';

        // Créer le document d'accès
        await setDoc(doc(db, 'children', child.id, 'access', userId), {
          userId,
          role,
          canWriteEvents: true,
          canWriteLikes: true,
          canWriteComments: true,
          grantedBy: child.data.ownerId || userId,
          grantedAt: Timestamp.now(),
        });

        // Mettre à jour ownerId si nécessaire
        if (isOwner && !child.data.ownerId) {
          await setDoc(
            doc(db, 'children', child.id),
            { ownerId: userId },
            { merge: true }
          );
        }

        migrated++;
        setProgress({ current: migrated, total: childrenToMigrate.length });
        console.log(`✅ Migré ${migrated}/${childrenToMigrate.length}: ${child.id}`);
      }

      console.log('🎉 Migration terminée !');
      setStatus('done');
      onComplete?.();
    } catch (error) {
      console.error('❌ Erreur lors de la migration:', error);
      setStatus('done'); // Continue malgré l'erreur
      onComplete?.();
    }
  };

  // Ne rien afficher si la migration n'est pas nécessaire
  if (status === 'idle' || status === 'done') {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#007AFF" />

        {status === 'checking' && (
          <Text style={styles.text}>Vérification des permissions...</Text>
        )}

        {status === 'migrating' && (
          <>
            <Text style={styles.text}>Migration des permissions</Text>
            <Text style={styles.progress}>
              {progress.current} / {progress.total}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  content: {
    backgroundColor: 'white',
    padding: 24,
    borderRadius: 12,
    alignItems: 'center',
    minWidth: 200,
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  progress: {
    marginTop: 8,
    fontSize: 14,
    color: '#666',
  },
});
