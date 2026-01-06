import type { Timestamp } from 'firebase/firestore';

// Interface pour un enfant (child)
// Note: Garde le nom Baby pour compatibilité avec le code existant
export interface Baby {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  birthDate: Timestamp;
  gender?: 'male' | 'female' | 'other';
  parentIds?: string[]; // Tableau de UIDs des parents
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  photoUrl?: string;
  weight?: number; // en grammes
  height?: number; // en cm
  notes?: string;
  bloodType?: string;
  allergies?: string[];
  medications?: string[];
}

export interface BabyStats {
  childId: string;
  childName: string;
  lastFeedingTime?: Timestamp;
  lastDiaperChange?: Timestamp;
  totalFeedings: number;
  totalDiaperChanges: number;
  averageWeight?: number;
  lastCheckup?: Timestamp;
}

// Alias pour plus de clarté
export type Child = Baby;
export type ChildStats = BabyStats;
