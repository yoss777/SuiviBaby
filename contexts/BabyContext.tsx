import { db } from '@/config/firebase';
import { obtenirPreferences } from '@/services/userPreferencesService';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import React, { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

export interface Child {
  id: string;
  name: string;
  birthDate: string; // Format DD/MM/YYYY
  gender?: 'male' | 'female';
  photoUri?: string;
}

interface BabyContextType {
  children: Child[];
  activeChild: Child | null;
  loading: boolean;
  setActiveChild: (child: Child) => void;
  addChild: (child: Child) => void;
  updateChild: (id: string, child: Partial<Child>) => void;
  deleteChild: (id: string) => void;
}

const BabyContext = createContext<BabyContextType | undefined>(undefined);

export function BabyProvider({ children: childrenProp }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [children, setChildren] = useState<Child[]>([]);
  const [activeChild, setActiveChildState] = useState<Child | null>(null);
  const [loading, setLoading] = useState(true);
  const [hiddenChildrenIds, setHiddenChildrenIds] = useState<string[]>([]);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);

  // Écouter les changements des préférences utilisateur en temps réel
  useEffect(() => {
    if (!user?.uid) {
      setHiddenChildrenIds([]);
      setPreferencesLoaded(true);
      return;
    }

    setPreferencesLoaded(false);
    const userPrefsRef = doc(db, 'user_preferences', user.uid);

    const unsubscribe = onSnapshot(userPrefsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setHiddenChildrenIds(data.hiddenChildrenIds || []);
      } else {
        setHiddenChildrenIds([]);
      }
      setPreferencesLoaded(true);
    }, (error) => {
      console.error('Erreur lors de l\'écoute des préférences:', error);
      // En cas d'erreur (document n'existe pas encore), charger de manière asynchrone
      obtenirPreferences().then(prefs => {
        setHiddenChildrenIds(prefs.hiddenChildrenIds || []);
        setPreferencesLoaded(true);
      }).catch(err => {
        console.error('Erreur lors du chargement des préférences:', err);
        setPreferencesLoaded(true);
      });
    });

    return () => unsubscribe();
  }, [user]);

  // Charger les enfants depuis Firestore
  useEffect(() => {
    // Si l'auth est encore en cours de chargement, rester en loading
    if (authLoading) {
      console.log('[BabyContext] Auth en cours de chargement...');
      setLoading(true);
      return;
    }

    if (!user?.uid) {
      console.log('[BabyContext] Pas de user.uid, arrêt du chargement');
      setChildren([]);
      setActiveChildState(null);
      setLoading(false);
      return;
    }

    // Attendre que les préférences soient chargées
    if (!preferencesLoaded) {
      console.log('[BabyContext] En attente du chargement des préférences...');
      setLoading(true); // IMPORTANT : rester en loading tant que les préférences ne sont pas chargées
      return;
    }

    console.log('[BabyContext] Chargement des enfants pour user.uid:', user.uid);
    setLoading(true);

    const q = query(
      collection(db, 'children'),
      where('parentIds', 'array-contains', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      console.log('[BabyContext] Snapshot reçu, nombre de docs:', snapshot.docs.length);

      const childrenData: Child[] = snapshot.docs.map(doc => {
        const data = doc.data();
        console.log('[BabyContext] Enfant trouvé:', doc.id, data.name);
        return {
          id: doc.id,
          ...data as Omit<Child, 'id'>
        };
      });

      // Filtrer les enfants masqués
      console.log('[BabyContext] hiddenChildrenIds:', hiddenChildrenIds);
      const visibleChildren = childrenData.filter(
        child => !hiddenChildrenIds.includes(child.id)
      );

      console.log('[BabyContext] Enfants visibles après filtrage:', visibleChildren.length);
      visibleChildren.forEach(child => console.log('  -', child.name, child.id));

      // Trier par ordre alphabétique
      visibleChildren.sort((a, b) => a.name.localeCompare(b.name));

      setChildren(visibleChildren);

      // Si aucun enfant actif n'est sélectionné, sélectionner le premier
      setActiveChildState(prev => {
        if (!prev && visibleChildren.length > 0) {
          return visibleChildren[0];
        }
        // Si l'enfant actif a été masqué, sélectionner le premier visible
        if (prev && hiddenChildrenIds.includes(prev.id)) {
          return visibleChildren[0] || null;
        }
        return prev;
      });

      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, hiddenChildrenIds, preferencesLoaded, authLoading]);

  const setActiveChild = (child: Child) => {
    setActiveChildState(child);
  };

  const addChild = (child: Child) => {
    setChildren((prev) => [...prev, child]);
  };

  const updateChild = (id: string, updatedChild: Partial<Child>) => {
    setChildren((prev) =>
      prev.map((child) => (child.id === id ? { ...child, ...updatedChild } : child))
    );
    if (activeChild?.id === id) {
      setActiveChildState((prev) => (prev ? { ...prev, ...updatedChild } : null));
    }
  };

  const deleteChild = (id: string) => {
    setChildren((prev) => prev.filter((child) => child.id !== id));
    if (activeChild?.id === id) {
      const remainingChildren = children.filter((child) => child.id !== id);
      setActiveChildState(remainingChildren[0] || null);
    }
  };

  return (
    <BabyContext.Provider
      value={{
        children,
        activeChild,
        loading,
        setActiveChild,
        addChild,
        updateChild,
        deleteChild,
      }}
    >
      {childrenProp}
    </BabyContext.Provider>
  );
}

export function useBaby() {
  const context = useContext(BabyContext);
  if (context === undefined) {
    throw new Error('useBaby must be used within a BabyProvider');
  }
  return context;
}