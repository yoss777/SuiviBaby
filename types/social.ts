// Types pour les interactions sociales (likes, commentaires)
import { Timestamp } from "firebase/firestore";

/**
 * Représente un like sur un événement
 */
export interface EventLike {
  id?: string;
  eventId: string; // ID de l'événement (jalon/moment)
  childId: string; // ID de l'enfant (pour sécurité/scope)
  userId: string; // UID de l'utilisateur qui a liké
  userName: string; // Nom affiché (ex: "Papa", "Mamie")
  createdAt: Timestamp;
}

/**
 * Représente un commentaire sur un événement
 */
export interface EventComment {
  id?: string;
  eventId: string; // ID de l'événement
  childId: string; // ID de l'enfant (pour sécurité/scope)
  userId: string; // UID de l'utilisateur qui a commenté
  userName: string; // Nom affiché
  content: string; // Contenu du commentaire
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

/**
 * Info agrégée des likes pour un événement (pour l'UI)
 */
export interface LikeInfo {
  count: number;
  likedByMe: boolean;
  likedByNames: string[]; // Noms des personnes qui ont liké (ex: ["Papa", "Mamie"])
}

/**
 * Info agrégée des commentaires pour un événement
 */
export interface CommentInfo {
  count: number;
  comments: EventComment[];
}

/**
 * Résumé des interactions sociales pour un événement
 */
export interface EventSocialInfo {
  eventId: string;
  likes: LikeInfo;
  comments: CommentInfo;
}

/**
 * Dernier commentaire d'un événement (pour preview)
 */
export interface LatestComment {
  userName: string;
  content: string;
}
