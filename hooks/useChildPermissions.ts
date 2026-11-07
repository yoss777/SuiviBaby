import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { ChildPermissions, ChildAccessDocument, ChildRole } from '@/types/permissions';
import { calculatePermissions } from '@/utils/permissions';

const NO_ACCESS: Omit<ChildPermissions, 'loading'> = {
  hasAccess: false,
  role: null,
  canRead: false,
  canWriteEvents: false,
  canWriteLikes: false,
  canWriteComments: false,
  canManageAccess: false,
};

/** Pas de childId/userId : permissions vides, rien à charger. */
const EMPTY_PERMISSIONS: ChildPermissions = { ...NO_ACCESS, loading: false };
/** Écouteur démarré, première réponse pas encore reçue. */
const LOADING_PERMISSIONS: ChildPermissions = { ...NO_ACCESS, loading: true };

// ============================================
// STORE PARTAGÉ : UN SEUL ÉCOUTEUR PAR (enfant, utilisateur)
// ============================================
// Avant, chaque écran (onglets, galerie, menu latéral...) ouvrait son propre
// onSnapshot sur le même document `children/{id}/access/{uid}`. Ici, tous les
// consommateurs partagent un écouteur compté par références. Quand le dernier
// se démonte, l'écouteur reste ouvert un court instant : un retour d'écran ou
// la réouverture du menu ne relit rien.

interface AccessEntry {
  state: ChildPermissions;
  listeners: Set<() => void>;
  unsubscribe: (() => void) | null;
  releaseTimer: ReturnType<typeof setTimeout> | null;
  /** Relance d'un écouteur arrêté (erreur ou reset) ; no-op si déjà actif. */
  restart: () => void;
  /** Reprise automatique après une erreur tant que des consommateurs sont montés. */
  retryTimer: ReturnType<typeof setTimeout> | null;
}

/** Durée pendant laquelle un écouteur sans consommateur reste ouvert. */
export const ACCESS_LISTENER_LINGER_MS = 30_000;
/** Délai avant de relancer un écouteur tombé en erreur (consommateurs toujours montés). */
export const ACCESS_ERROR_RETRY_MS = 10_000;

const accessEntries = new Map<string, AccessEntry>();

const accessKey = (childId: string, userId: string) => `${childId}/${userId}`;

function startAccessEntry(childId: string, userId: string, key: string): AccessEntry {
  const entry: AccessEntry = {
    state: LOADING_PERMISSIONS,
    listeners: new Set(),
    unsubscribe: null,
    releaseTimer: null,
    retryTimer: null,
    restart: () => {},
  };
  const publish = (state: ChildPermissions) => {
    entry.state = state;
    entry.listeners.forEach((listener) => listener());
  };
  const clearRetry = () => {
    if (entry.retryTimer) {
      clearTimeout(entry.retryTimer);
      entry.retryTimer = null;
    }
  };

  const listen = () => {
    if (entry.unsubscribe) return;
    let active = true;
    const unsubscribe = onSnapshot(
      doc(db, 'children', childId, 'access', userId),
      (snapshot) => {
        if (!active) return;
        // Réponse reçue : l'éventuelle erreur précédente est derrière nous.
        clearRetry();
        if (snapshot.exists()) {
          publish(calculatePermissions(snapshot.data() as ChildAccessDocument));
        } else {
          // L'utilisateur n'a pas d'accès
          publish({ ...NO_ACCESS, loading: false });
        }
      },
      (error) => {
        if (!active) return;
        console.error('Error listening to child access:', error);
        // Écouteur mort : on ne garde surtout pas les droits précédents
        // (ex. écriture encore autorisée après une révocation).
        active = false;
        entry.unsubscribe?.();
        entry.unsubscribe = null;
        publish({ ...NO_ACCESS, loading: false, error });
        // Reprise automatique tant que des consommateurs sont montés ; sinon
        // le prochain subscribe relance un écouteur frais.
        clearRetry();
        entry.retryTimer = setTimeout(() => {
          entry.retryTimer = null;
          if (entry.listeners.size > 0) entry.restart();
        }, ACCESS_ERROR_RETRY_MS);
      },
    );
    entry.unsubscribe = () => {
      active = false;
      unsubscribe();
    };
  };

  entry.restart = listen;
  listen();
  accessEntries.set(key, entry);
  return entry;
}

function subscribeToAccess(childId: string, userId: string, onChange: () => void): () => void {
  const key = accessKey(childId, userId);
  let entry = accessEntries.get(key);
  if (!entry) entry = startAccessEntry(childId, userId, key);
  // Écouteur arrêté (erreur / reset) : un nouveau consommateur en relance un frais.
  else if (!entry.unsubscribe) entry.restart();
  if (entry.releaseTimer) {
    clearTimeout(entry.releaseTimer);
    entry.releaseTimer = null;
  }
  entry.listeners.add(onChange);
  const current = entry;

  return () => {
    current.listeners.delete(onChange);
    if (current.listeners.size > 0 || current.releaseTimer) return;
    current.releaseTimer = setTimeout(() => {
      current.unsubscribe?.();
      current.unsubscribe = null;
      if (current.retryTimer) clearTimeout(current.retryTimer);
      current.retryTimer = null;
      if (accessEntries.get(key) === current) accessEntries.delete(key);
    }, ACCESS_LISTENER_LINGER_MS);
  };
}

/** Nombre d'écouteurs d'accès ouverts (diagnostic et tests). */
export function getOpenAccessListenerCount(): number {
  let count = 0;
  accessEntries.forEach((entry) => {
    if (entry.unsubscribe) count += 1;
  });
  return count;
}

/**
 * Referme tous les écouteurs partagés (déconnexion, tests) et notifie les
 * consommateurs montés : ils passent à « sans accès » (pas de chargement
 * infini). Une entrée encore consommée est conservée, arrêtée ; le prochain
 * subscribe en relance un écouteur frais.
 */
export function resetChildPermissionsStore(): void {
  accessEntries.forEach((entry, key) => {
    if (entry.releaseTimer) clearTimeout(entry.releaseTimer);
    entry.releaseTimer = null;
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
    entry.unsubscribe?.();
    entry.unsubscribe = null;
    if (entry.listeners.size === 0) {
      accessEntries.delete(key);
      return;
    }
    entry.state = { ...NO_ACCESS, loading: false };
    entry.listeners.forEach((listener) => listener());
  });
}

/**
 * Hook pour récupérer les permissions d'un utilisateur sur un enfant en temps réel
 * (écouteur partagé : voir le store ci-dessus).
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
  const active = Boolean(childId && userId);

  const subscribe = useCallback(
    (onChange: () => void) =>
      active ? subscribeToAccess(childId as string, userId as string, onChange) : () => {},
    [active, childId, userId],
  );
  const getSnapshot = useCallback(
    () =>
      active
        ? accessEntries.get(accessKey(childId as string, userId as string))?.state ?? LOADING_PERMISSIONS
        : EMPTY_PERMISSIONS,
    [active, childId, userId],
  );

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Rôle de l'utilisateur sur plusieurs enfants (menu latéral). Réutilise les
 * écouteurs partagés : plus de lecture ponctuelle à chaque changement de liste.
 */
export function useChildRoles(
  childIds: string[],
  userId: string | null | undefined,
): Record<string, ChildRole | null> {
  const idsKey = childIds.join(',');
  const [roles, setRoles] = useState<Record<string, ChildRole | null>>({});

  useEffect(() => {
    if (!userId || !idsKey) {
      setRoles({});
      return;
    }
    const ids = idsKey.split(',');
    const compute = () => {
      const next: Record<string, ChildRole | null> = {};
      for (const id of ids) {
        const state = accessEntries.get(accessKey(id, userId))?.state;
        // Pas encore de réponse : on n'écrase pas, le consommateur retombe sur son défaut.
        if (state && !state.loading) next[id] = state.role;
      }
      setRoles((prev) => {
        const same =
          Object.keys(next).length === Object.keys(prev).length &&
          Object.keys(next).every((id) => prev[id] === next[id]);
        return same ? prev : next;
      });
    };
    const unsubs = ids.map((id) => subscribeToAccess(id, userId, compute));
    compute();
    return () => unsubs.forEach((unsub) => unsub());
  }, [idsKey, userId]);

  return roles;
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
