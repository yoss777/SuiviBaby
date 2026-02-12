import { useState, useEffect } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ChildPermissions, ChildAccessDocument } from '@/types/permissions';
import { calculatePermissions } from '@/utils/permissions';

/**
 * Hook pour récupérer les permissions d'un utilisateur sur un enfant en temps réel
 *
 * @param childId - ID de l'enfant
 * @param userId - ID de l'utilisateur (si null, retourne des permissions vides)
 * @returns Permissions calculées avec état de chargement
 *
 * @example
 * ```tsx
 * const permissions = useChildPermissions(childId, currentUser?.uid);
 *
 * if (permissions.loading) return <Spinner />;
 * if (!permissions.hasAccess) return <NoAccessScreen />;
 *
 * return (
 *   <View>
 *     {permissions.canWriteEvents && <AddEventButton />}
 *     {permissions.canWriteLikes && <LikeButton />}
 *   </View>
 * );
 * ```
 */
export function useChildPermissions(
  childId: string | null | undefined,
  userId: string | null | undefined
): ChildPermissions {
  const [permissions, setPermissions] = useState<ChildPermissions>({
    hasAccess: false,
    role: null,
    canRead: false,
    canWriteEvents: false,
    canWriteLikes: false,
    canWriteComments: false,
    canManageAccess: false,
    loading: true,
  });

  useEffect(() => {
    // Si pas de childId ou userId, retourner des permissions vides
    if (!childId || !userId) {
      setPermissions({
        hasAccess: false,
        role: null,
        canRead: false,
        canWriteEvents: false,
        canWriteLikes: false,
        canWriteComments: false,
        canManageAccess: false,
        loading: false,
      });
      return;
    }

    // Écouter les changements en temps réel
    const accessRef = doc(db, 'children', childId, 'access', userId);

    const unsubscribe = onSnapshot(
      accessRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const accessDoc = snapshot.data() as ChildAccessDocument;
          setPermissions(calculatePermissions(accessDoc));
        } else {
          // L'utilisateur n'a pas d'accès
          setPermissions({
            hasAccess: false,
            role: null,
            canRead: false,
            canWriteEvents: false,
            canWriteLikes: false,
            canWriteComments: false,
            canManageAccess: false,
            loading: false,
          });
        }
      },
      (error) => {
        console.error('Error listening to child access:', error);
        setPermissions((prev) => ({
          ...prev,
          loading: false,
          error,
        }));
      }
    );

    return () => unsubscribe();
  }, [childId, userId]);

  return permissions;
}

/**
 * Hook pour récupérer tous les accès d'un enfant (pour l'écran de gestion des permissions)
 *
 * @param childId - ID de l'enfant
 * @returns Map des accès (userId -> ChildAccessDocument) avec état de chargement
 *
 * @example
 * ```tsx
 * const { accesses, loading } = useChildAccesses(childId);
 *
 * return (
 *   <FlatList
 *     data={Object.entries(accesses)}
 *     renderItem={({ item: [userId, access] }) => (
 *       <UserAccessItem userId={userId} access={access} />
 *     )}
 *   />
 * );
 * ```
 */
export function useChildAccesses(childId: string | null | undefined) {
  const [accesses, setAccesses] = useState<Record<string, ChildAccessDocument>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!childId) {
      setAccesses({});
      setLoading(false);
      return;
    }

    const accessCollectionRef = collection(db, 'children', childId, 'access');

    const unsubscribe = onSnapshot(
      accessCollectionRef,
      (snapshot) => {
        const newAccesses: Record<string, ChildAccessDocument> = {};
        snapshot.forEach((doc) => {
          newAccesses[doc.id] = doc.data() as ChildAccessDocument;
        });
        setAccesses(newAccesses);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to child accesses:', err);
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [childId]);

  return { accesses, loading, error };
}
