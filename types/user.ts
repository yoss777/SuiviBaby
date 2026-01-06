// Types pour la gestion des utilisateurs
import { Timestamp } from 'firebase/firestore';

/**
 * Rôle professionnel de santé
 */
export type ProfessionalRole = 'doctor' | 'midwife' | 'pharmacist';

/**
 * Statut de validation du profil professionnel
 */
export type ValidationStatus =
  | 'pending'      // En attente de validation
  | 'approved'     // Approuvé
  | 'rejected'     // Rejeté
  | 'suspended';   // Suspendu

/**
 * Profil professionnel de santé
 */
export interface ProfessionalProfile {
  // Informations de base
  role: ProfessionalRole;
  speciality?: string;              // Ex: "Pédiatre", "Généraliste", "Sage-femme libérale"
  licenseNumber: string;            // Numéro RPPS ou autre identifiant professionnel

  // Validation
  validationStatus: ValidationStatus;
  validationDate?: Timestamp;       // Date de validation/rejet
  validationNotes?: string;         // Notes de l'administrateur

  // Documents de vérification
  documents?: {
    idCardUrl?: string;             // Carte d'identité professionnelle
    diplomaUrl?: string;            // Diplôme
    rppsCardUrl?: string;           // Carte RPPS
    uploadDate: Timestamp;
  };

  // Informations de pratique
  clinicName?: string;              // Nom du cabinet/établissement
  clinicAddress?: string;
  clinicCity?: string;
  clinicPostalCode?: string;
  phone?: string;
  consultationPrice?: number;       // Prix consultation en euros

  // Disponibilités (pour rendez-vous)
  availableSlots?: {
    day: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
    startTime: string;              // Format "09:00"
    endTime: string;                // Format "17:00"
    slotDuration: number;           // Durée en minutes
  }[];

  // Visibilité
  isVisibleOnMap: boolean;          // Visible sur la carte Mediscope
  acceptsNewPatients: boolean;

  // Bio et présentation
  bio?: string;                     // Présentation du professionnel
  languages?: string[];             // Langues parlées
}

/**
 * Type d'utilisateur
 */
export type UserType = 'patient' | 'professional';

/**
 * Utilisateur de l'application
 */
export interface User {
  // Identité Firebase
  uid: string;
  email: string;

  // Informations de base
  userName: string;
  createdAt: Timestamp;

  // Type de compte
  userType: UserType;

  // Compte dual (professionnel qui a aussi un compte patient)
  dualAccount?: boolean;            // Si true, peut utiliser les deux apps

  // Pour les patients
  babyName?: string;                // Nom du bébé (legacy, déprécié)
  children?: string[];              // IDs des enfants liés au compte

  // Pour les professionnels
  professionalProfile?: ProfessionalProfile;

  // Métadonnées
  lastLogin?: Timestamp;
  appVersion?: string;              // Version de l'app utilisée
  deviceInfo?: {
    platform: 'ios' | 'android' | 'web';
    version: string;
  };

  // Préférences
  preferences?: {
    notifications: boolean;
    language: 'fr' | 'en';
    theme: 'light' | 'dark' | 'auto';
  };
}

/**
 * Demande de validation professionnelle
 */
export interface ProfessionalValidationRequest {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;

  // Informations professionnelles soumises
  professionalData: Omit<ProfessionalProfile, 'validationStatus' | 'validationDate' | 'validationNotes'>;

  // Statut de la demande
  status: ValidationStatus;
  submittedAt: Timestamp;
  reviewedAt?: Timestamp;
  reviewedBy?: string;              // UID de l'admin qui a validé

  // Notes et commentaires
  applicantMessage?: string;        // Message du demandeur
  adminNotes?: string;              // Notes de l'administrateur
}

/**
 * Helper pour vérifier si un utilisateur est un professionnel validé
 */
export function isValidatedProfessional(user: User): boolean {
  return (
    user.userType === 'professional' &&
    user.professionalProfile?.validationStatus === 'approved'
  );
}

/**
 * Helper pour vérifier si un utilisateur peut accéder à l'app pro
 */
export function canAccessProfessionalApp(user: User): boolean {
  return (
    user.userType === 'professional' ||
    (user.dualAccount === true && user.professionalProfile !== undefined)
  );
}

/**
 * Helper pour vérifier si un utilisateur peut accéder à l'app patient
 */
export function canAccessPatientApp(user: User): boolean {
  return (
    user.userType === 'patient' ||
    user.dualAccount === true
  );
}

/**
 * Helper pour obtenir le nom d'affichage du rôle professionnel
 */
export function getProfessionalRoleLabel(role: ProfessionalRole): string {
  const labels: Record<ProfessionalRole, string> = {
    doctor: 'Médecin',
    midwife: 'Sage-femme',
    pharmacist: 'Pharmacien(ne)',
  };
  return labels[role];
}

/**
 * Helper pour obtenir le statut de validation en français
 */
export function getValidationStatusLabel(status: ValidationStatus): string {
  const labels: Record<ValidationStatus, string> = {
    pending: 'En attente de validation',
    approved: 'Validé',
    rejected: 'Rejeté',
    suspended: 'Suspendu',
  };
  return labels[status];
}
