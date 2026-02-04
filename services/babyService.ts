// Service pour gérer les enfants (children)
// Note: Garde le nom babyService pour compatibilité avec le code existant
import { collection, doc, getDoc, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../config/firebase';
import type { Timestamp } from 'firebase/firestore';

export interface Baby {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  birthDate: Timestamp;
  gender?: 'male' | 'female' | 'other';
  parentIds?: string[]; // Peut avoir plusieurs parents
  createdAt: Timestamp;
  photoUrl?: string;
  weight?: number; // en grammes
  height?: number; // en cm
  notes?: string;
}

export const babyService = {
  /**
   * Récupérer tous les enfants (pour l'app pro)
   */
  async getAll(): Promise<Baby[]> {
    try {
      const q = query(collection(db, 'children'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);

      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Baby[];
    } catch (error) {
      console.error('Erreur chargement enfants:', error);
      return [];
    }
  },

  /**
   * Récupérer les enfants d'un parent spécifique
   */
  async getByParentId(parentId: string): Promise<Baby[]> {
    try {
      const accessQuery = query(
        collection(db, 'user_child_access'),
        where('userId', '==', parentId)
      );
      const accessSnap = await getDocs(accessQuery);
      const childIds = new Set<string>();
      accessSnap.docs.forEach((docSnap) => {
        const data = docSnap.data() as { childId?: string };
        if (data.childId) childIds.add(data.childId);
      });

      const childDocs = await Promise.all(
        Array.from(childIds.values()).map((childId) =>
          getDoc(doc(db, 'children', childId))
        )
      );

      return childDocs
        .filter((snap) => snap.exists())
        .map((snap) => ({ id: snap.id, ...snap.data() })) as Baby[];
    } catch (error) {
      console.error('Erreur chargement enfants du parent:', error);
      // Fallback: filtrer en local
      try {
        const allBabies = await this.getAll();
        return allBabies.filter(baby =>
          baby.parentIds?.includes(parentId)
        );
      } catch {
        return [];
      }
    }
  },
};
