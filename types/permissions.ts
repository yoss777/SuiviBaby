import { Timestamp } from 'firebase/firestore';

/**
 * Rôles disponibles pour l'accès à un enfant
 */
export type ChildRole = 'owner' | 'admin' | 'contributor' | 'viewer';

/**
 * Document d'accès stocké dans children/{childId}/access/{uid}
 */
export interface ChildAccessDocument {
  /** ID utilisateur (pour requêtes collectionGroup) */
  userId: string;

  /** Rôle de l'utilisateur */
  role: ChildRole;

  /** Permissions explicites (overrides du rôle si nécessaire) */
  canWriteEvents: boolean;
  canWriteLikes: boolean;
  canWriteComments: boolean;

  /** Métadonnées */
  grantedBy: string;           // uid du parent qui a donné l'accès
  grantedAt: Timestamp;
  invitationId?: string;       // lien vers shareInvitations si applicable
}

/**
 * Permissions calculées pour un utilisateur sur un enfant
 */
export interface ChildPermissions {
  /** L'utilisateur a-t-il accès à cet enfant ? */
  hasAccess: boolean;

  /** Rôle de l'utilisateur */
  role: ChildRole | null;

  /** Permissions de lecture (toujours true si hasAccess = true) */
  canRead: boolean;

  /** Permissions d'écriture */
  canWriteEvents: boolean;      // Créer/modifier events, pumping, etc.
  canWriteLikes: boolean;       // Créer/supprimer ses likes
  canWriteComments: boolean;    // Créer/modifier/supprimer ses commentaires

  /** Permission de gestion */
  canManageAccess: boolean;     // Gérer les permissions (owner uniquement)

  /** État de chargement */
  loading: boolean;
  error?: Error;
}

/**
 * Mapping des rôles vers les permissions par défaut
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<
  ChildRole,
  Omit<ChildAccessDocument, 'userId' | 'grantedBy' | 'grantedAt' | 'invitationId'>
> = {
  owner: {
    role: 'owner',
    canWriteEvents: true,
    canWriteLikes: true,
    canWriteComments: true,
  },
  admin: {
    role: 'admin',
    canWriteEvents: true,
    canWriteLikes: true,
    canWriteComments: true,
  },
  contributor: {
    role: 'contributor',
    canWriteEvents: false,
    canWriteLikes: true,
    canWriteComments: true,
  },
  viewer: {
    role: 'viewer',
    canWriteEvents: false,
    canWriteLikes: false,
    canWriteComments: false,
  },
};

/**
 * Labels pour l'affichage des rôles
 */
export const ROLE_LABELS: Record<ChildRole, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  contributor: 'Contributeur',
  viewer: 'Observateur',
};

/**
 * Descriptions des rôles
 */
export const ROLE_DESCRIPTIONS: Record<ChildRole, string> = {
  owner: 'Contrôle total sur l\'enfant et les permissions',
  admin: 'Peut tout modifier sauf les permissions',
  contributor: 'Peut liker et commenter uniquement',
  viewer: 'Peut seulement consulter les données',
};
