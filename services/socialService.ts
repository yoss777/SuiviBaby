// services/socialService.ts
// Service pour gérer les interactions sociales (likes, commentaires) sur les événements
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "../config/firebase";
import { captureServiceError } from "@/utils/errorReporting";
import {
  CommentInfo,
  EventComment,
  EventLike,
  LikeInfo,
  Mention,
} from "../types/social";

// ============================================
// HELPERS
// ============================================

const getUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Utilisateur non connecté");
  return user.uid;
};

// Cache pour les noms d'utilisateurs (évite les requêtes répétées)
const userNameCache = new Map<string, { name: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const ENABLE_USER_PROFILE_LOOKUP = true;

/**
 * Récupérer le nom d'un utilisateur depuis son profil
 * Utilise un cache pour éviter les requêtes répétées
 */
const getUserName = async (userId: string): Promise<string> => {
  if (!ENABLE_USER_PROFILE_LOOKUP) {
    return "Utilisateur";
  }
  const cached = userNameCache.get(userId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.name;
  }

  try {
    const userDoc = await getDoc(doc(db, "users_public", userId));
    if (userDoc.exists()) {
      const userName = userDoc.data().userName || "Utilisateur";
      userNameCache.set(userId, { name: userName, timestamp: Date.now() });
      return userName;
    }
  } catch (error) {
    console.error("Erreur lors de la récupération du nom:", error);
    captureServiceError(error, { service: "social", operation: "getUserName" });
  }

  return "Utilisateur";
};

/**
 * Récupérer les noms de plusieurs utilisateurs en batch
 */
export const getUserNames = async (
  userIds: string[]
): Promise<Map<string, string>> => {
  const result = new Map<string, string>();
  const toFetch: string[] = [];

  // Vérifier le cache d'abord
  userIds.forEach((userId) => {
    const cached = userNameCache.get(userId);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      result.set(userId, cached.name);
    } else {
      toFetch.push(userId);
    }
  });

  // Fetch les utilisateurs manquants (désactivé si lookup interdit)
  if (ENABLE_USER_PROFILE_LOOKUP && toFetch.length > 0) {
    const promises = toFetch.map(async (userId) => {
      const name = await getUserName(userId);
      result.set(userId, name);
    });
    await Promise.all(promises);
  }

  return result;
};

// ============================================
// LIKES
// ============================================

/**
 * Ajouter un like sur un événement
 */
export const ajouterLike = async (
  eventId: string,
  childId: string,
  userName: string
): Promise<string> => {
  const userId = getUserId();

  // Vérifier si déjà liké
  const existingLike = await obtenirMonLike(eventId, childId);
  if (existingLike) {
    return existingLike.id!;
  }

  const like: Omit<EventLike, "id"> = {
    eventId,
    childId,
    userId,
    userName,
    createdAt: Timestamp.now(),
  };

  try {
    const docRef = await addDoc(collection(db, "eventLikes"), like);
    return docRef.id;
  } catch (error) {
    console.error("[Like] Erreur ajout like:", error);
    captureServiceError(error, { service: "social", operation: "ajouterLike" });
    throw error;
  }
};

/**
 * Supprimer un like sur un événement
 */
export const supprimerLike = async (
  eventId: string,
  childId: string,
): Promise<void> => {
  const userId = getUserId();

  const q = query(
    collection(db, "eventLikes"),
    where("childId", "==", childId),
    where("eventId", "==", eventId),
    where("userId", "==", userId),
    limit(1)
  );

  const snapshot = await getDocs(q);
  const deletePromises = snapshot.docs.map((d) =>
    deleteDoc(doc(db, "eventLikes", d.id))
  );
  try {
    await Promise.all(deletePromises);
  } catch (error) {
    console.error("[Like] Erreur suppression like:", error);
    captureServiceError(error, { service: "social", operation: "supprimerLike" });
    throw error;
  }
};

/**
 * Toggle like (ajouter si pas liké, supprimer si déjà liké)
 */
export const toggleLike = async (
  eventId: string,
  childId: string,
  userName: string
): Promise<boolean> => {
  let existingLike: EventLike | null = null;
  try {
    existingLike = await obtenirMonLike(eventId, childId);
  } catch (error) {
    console.error("[Like] Erreur toggle (get):", error);
    captureServiceError(error, { service: "social", operation: "toggleLike.get" });
    throw error;
  }

  if (existingLike) {
    try {
      await supprimerLike(eventId, childId);
    } catch (error) {
      console.error("[Like] Erreur toggle (delete):", error);
      captureServiceError(error, { service: "social", operation: "toggleLike.delete" });
      throw error;
    }
    return false; // N'est plus liké
  } else {
    try {
      await ajouterLike(eventId, childId, userName);
    } catch (error) {
      console.error("[Like] Erreur toggle (add):", error);
      captureServiceError(error, { service: "social", operation: "toggleLike.add" });
      throw error;
    }
    return true; // Est maintenant liké
  }
};

/**
 * Obtenir le like de l'utilisateur courant sur un événement
 */
export const obtenirMonLike = async (
  eventId: string,
  childId: string,
): Promise<EventLike | null> => {
  const userId = getUserId();

  const q = query(
    collection(db, "eventLikes"),
    where("childId", "==", childId),
    where("eventId", "==", eventId),
    where("userId", "==", userId),
    limit(1)
  );

  let snapshot;
  try {
    snapshot = await getDocs(q);
  } catch (error) {
    console.error("[Like] Erreur obtenirMonLike:", error);
    captureServiceError(error, { service: "social", operation: "obtenirMonLike" });
    throw error;
  }
  if (snapshot.empty) return null;

  const docData = snapshot.docs[0];
  return { id: docData.id, ...docData.data() } as EventLike;
};

/**
 * Obtenir tous les likes d'un événement
 */
export const obtenirLikes = async (
  eventId: string,
  childId: string,
): Promise<EventLike[]> => {
  const q = query(
    collection(db, "eventLikes"),
    where("childId", "==", childId),
    where("eventId", "==", eventId),
    orderBy("createdAt", "desc"),
    limit(500)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as EventLike
  );
};

/**
 * Obtenir les infos de like formatées pour l'UI
 * Le nom de l'utilisateur courant est remplacé par "Moi" pour lui
 */
export const obtenirLikeInfo = async (
  eventId: string,
  childId: string,
  _currentUserName?: string
): Promise<LikeInfo> => {
  const userId = getUserId();
  const likes = await obtenirLikes(eventId, childId);

  const likedByMe = likes.some((like) => like.userId === userId);

  // Récupérer les noms à jour depuis les profils
  const uniqueUserIds = [...new Set(likes.slice(0, 3).map((l) => l.userId))];
  const userNames = await getUserNames(uniqueUserIds);

  // Construire la liste des noms (max 3 pour l'affichage)
  // L'utilisateur courant voit "Moi" à la place de son propre nom
  const likedByNames = likes.slice(0, 3).map((like) => {
    if (like.userId === userId) {
      return "Moi";
    }
    return userNames.get(like.userId) || like.userName;
  });

  return {
    count: likes.length,
    likedByMe,
    likedByNames,
  };
};

/**
 * Obtenir les infos de likes pour plusieurs événements (batch)
 */
export const obtenirLikesInfoBatch = async (
  eventIds: string[],
  childId: string,
): Promise<Record<string, LikeInfo>> => {
  if (eventIds.length === 0) return {};

  const userId = getUserId();
  const result: Record<string, LikeInfo> = {};
  const allLikes: EventLike[] = [];

  // Initialiser tous les événements avec des valeurs par défaut
  eventIds.forEach((id) => {
    result[id] = { count: 0, likedByMe: false, likedByNames: [] };
  });

  // Firestore limite à 10 valeurs dans "in", donc on fait par batch
  const batchSize = 10;
  for (let i = 0; i < eventIds.length; i += batchSize) {
    const batch = eventIds.slice(i, i + batchSize);

    const q = query(
      collection(db, "eventLikes"),
      where("childId", "==", childId),
      where("eventId", "in", batch),
      limit(500)
    );

    const snapshot = await getDocs(q);
    snapshot.docs.forEach((d) => {
      allLikes.push({ id: d.id, ...d.data() } as EventLike);
    });
  }

  // Récupérer les noms à jour depuis les profils
  const uniqueUserIds = [...new Set(allLikes.map((l) => l.userId))];
  const userNames = await getUserNames(uniqueUserIds);

  allLikes.forEach((like) => {
    const info = result[like.eventId];
    if (!info) return;

    info.count++;
    if (like.userId === userId) {
      info.likedByMe = true;
    }
    if (info.likedByNames.length < 3) {
      const displayName = like.userId === userId
        ? "Moi"
        : userNames.get(like.userId) || like.userName;
      info.likedByNames.push(displayName);
    }
  });

  return result;
};

/**
 * Écouter les likes d'un événement en temps réel
 */
export const ecouterLikes = (
  eventId: string,
  childId: string,
  onUpdate: (info: LikeInfo) => void
): (() => void) => {
  const userId = getUserId();
  let version = 0;

  const q = query(
    collection(db, "eventLikes"),
    where("childId", "==", childId),
    where("eventId", "==", eventId),
    orderBy("createdAt", "desc"),
    limit(500)
  );

  return onSnapshot(q, (snapshot) => {
    const currentVersion = ++version;
    const likes = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as EventLike
    );

    const uniqueUserIds = [...new Set(likes.slice(0, 3).map((l) => l.userId))];
    getUserNames(uniqueUserIds).then((userNames) => {
      if (currentVersion !== version) return; // Discard stale result

      const likedByMe = likes.some((like) => like.userId === userId);
      const likedByNames = likes.slice(0, 3).map((like) => {
        if (like.userId === userId) return "Moi";
        return userNames.get(like.userId) || like.userName;
      });

      onUpdate({ count: likes.length, likedByMe, likedByNames });
    });
  });
};

// ============================================
// COMMENTS
// ============================================

/**
 * Ajouter un commentaire sur un événement
 */
export const ajouterCommentaire = async (
  eventId: string,
  childId: string,
  userName: string,
  content: string,
  options?: {
    replyToId?: string;
    replyToUserName?: string;
    mentions?: Mention[];
  }
): Promise<string> => {
  const userId = getUserId();

  const comment: Omit<EventComment, "id"> = {
    eventId,
    childId,
    userId,
    userName,
    content,
    createdAt: Timestamp.now(),
    ...(options?.replyToId && { replyToId: options.replyToId }),
    ...(options?.replyToUserName && { replyToUserName: options.replyToUserName }),
    ...(options?.mentions && options.mentions.length > 0 && { mentions: options.mentions }),
  };

  const docRef = await addDoc(collection(db, "eventComments"), comment);
  return docRef.id;
};

/**
 * Modifier un commentaire
 */
export const modifierCommentaire = async (
  commentId: string,
  content: string
): Promise<void> => {
  const userId = getUserId();

  // Vérifier que c'est bien notre commentaire
  const commentDoc = await getDoc(doc(db, "eventComments", commentId));
  if (!commentDoc.exists()) {
    throw new Error("Commentaire non trouvé");
  }

  const comment = commentDoc.data() as EventComment;
  if (comment.userId !== userId) {
    throw new Error("Vous ne pouvez modifier que vos propres commentaires");
  }

  await updateDoc(doc(db, "eventComments", commentId), {
    content,
    updatedAt: Timestamp.now(),
  });
};

/**
 * Supprimer un commentaire
 */
export const supprimerCommentaire = async (
  commentId: string
): Promise<void> => {
  const userId = getUserId();

  // Vérifier que c'est bien notre commentaire
  const commentDoc = await getDoc(doc(db, "eventComments", commentId));
  if (!commentDoc.exists()) {
    throw new Error("Commentaire non trouvé");
  }

  const comment = commentDoc.data() as EventComment;
  if (comment.userId !== userId) {
    throw new Error("Vous ne pouvez supprimer que vos propres commentaires");
  }

  await deleteDoc(doc(db, "eventComments", commentId));
};

/**
 * Obtenir tous les commentaires d'un événement
 */
export const obtenirCommentaires = async (
  eventId: string,
  childId: string,
): Promise<EventComment[]> => {
  const q = query(
    collection(db, "eventComments"),
    where("childId", "==", childId),
    where("eventId", "==", eventId),
    orderBy("createdAt", "asc"),
    limit(500)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(
    (d) => ({ id: d.id, ...d.data() }) as EventComment
  );
};

/**
 * Obtenir les infos de commentaires formatées pour l'UI
 */
export const obtenirCommentaireInfo = async (
  eventId: string,
  childId: string,
): Promise<CommentInfo> => {
  const comments = await obtenirCommentaires(eventId, childId);

  return {
    count: comments.length,
    comments,
  };
};

/**
 * Obtenir le nombre de commentaires pour plusieurs événements (batch)
 */
export const obtenirCommentCountsBatch = async (
  eventIds: string[],
  childId: string,
): Promise<Record<string, number>> => {
  if (eventIds.length === 0) return {};

  const result: Record<string, number> = {};

  // Initialiser tous les événements avec 0
  eventIds.forEach((id) => {
    result[id] = 0;
  });

  // Firestore limite à 10 valeurs dans "in", donc on fait par batch
  const batchSize = 10;
  for (let i = 0; i < eventIds.length; i += batchSize) {
    const batch = eventIds.slice(i, i + batchSize);

    const q = query(
      collection(db, "eventComments"),
      where("childId", "==", childId),
      where("eventId", "in", batch),
      limit(500)
    );

    const snapshot = await getDocs(q);

    snapshot.docs.forEach((d) => {
      const comment = d.data() as EventComment;
      result[comment.eventId]++;
    });
  }

  return result;
};

/**
 * Écouter les commentaires d'un événement en temps réel
 */
export const ecouterCommentaires = (
  eventId: string,
  childId: string,
  onUpdate: (info: CommentInfo) => void
): (() => void) => {
  let version = 0;

  const q = query(
    collection(db, "eventComments"),
    where("childId", "==", childId),
    where("eventId", "==", eventId),
    orderBy("createdAt", "asc"),
    limit(500)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const currentVersion = ++version;
      const comments = snapshot.docs.map(
        (d) => ({ id: d.id, ...d.data() }) as EventComment
      );

      const userIds = [...new Set(comments.map((c) => c.userId))];
      if (userIds.length === 0) {
        onUpdate({ count: comments.length, comments });
        return;
      }

      getUserNames(userIds).then((names) => {
        if (currentVersion !== version) return; // Discard stale result
        comments.forEach((comment) => {
          const resolvedName = names.get(comment.userId);
          if (resolvedName) {
            comment.userName = resolvedName;
          }
        });
        onUpdate({ count: comments.length, comments });
      });
    },
    (error) => {
      console.warn("[SOCIAL] Listener commentaires impossible:", error);
      onUpdate({ count: 0, comments: [] });
    }
  );
};

// ============================================
// COMBINED
// ============================================

/** Nombre maximal de likes / commentaires lus par écouteur d'enfant. */
export const SOCIAL_LISTENER_LIMIT = 500;

/**
 * Écouteur UNIQUE des likes d'un enfant (les plus récents d'abord). Il alimente
 * le provider partagé (`contexts/SocialInteractionsContext.tsx`) : badge de
 * notifications, Moments et Galerie lisent ces mêmes documents au lieu d'ouvrir
 * chacun leur écouteur.
 */
export const ecouterLikesEnfant = (
  childId: string,
  onUpdate: (likes: EventLike[]) => void,
  onError?: (error: unknown) => void
): (() => void) => {
  const q = query(
    collection(db, "eventLikes"),
    where("childId", "==", childId),
    orderBy("createdAt", "desc"),
    limit(SOCIAL_LISTENER_LIMIT)
  );
  return onSnapshot(
    q,
    (snapshot) =>
      onUpdate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as EventLike)),
    onError
  );
};

/** Écouteur UNIQUE des commentaires d'un enfant (les plus récents d'abord). */
export const ecouterCommentairesEnfant = (
  childId: string,
  onUpdate: (comments: EventComment[]) => void,
  onError?: (error: unknown) => void
): (() => void) => {
  const q = query(
    collection(db, "eventComments"),
    where("childId", "==", childId),
    orderBy("createdAt", "desc"),
    limit(SOCIAL_LISTENER_LIMIT)
  );
  return onSnapshot(
    q,
    (snapshot) =>
      onUpdate(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as EventComment)),
    onError
  );
};

/** Agrège les likes d'un enfant par événement (fonction pure). */
export const construireLikesInfo = (
  likes: EventLike[],
  userId: string | undefined,
  userNames: Map<string, string>
): Record<string, LikeInfo> => {
  const result: Record<string, LikeInfo> = {};
  likes.forEach((like) => {
    const info = (result[like.eventId] ??= {
      count: 0,
      likedByMe: false,
      likedByNames: [],
    });
    info.count++;
    if (userId && like.userId === userId) info.likedByMe = true;
    if (info.likedByNames.length < 3) {
      // Nom du profil (à jour) plutôt que le nom stocké dans le like
      info.likedByNames.push(
        userId && like.userId === userId
          ? "Moi"
          : userNames.get(like.userId) || like.userName
      );
    }
  });
  return result;
};

/** Nombre de commentaires par événement (fonction pure). */
export const compterCommentaires = (
  comments: EventComment[]
): Record<string, number> => {
  const counts: Record<string, number> = {};
  comments.forEach((c) => {
    counts[c.eventId] = (counts[c.eventId] ?? 0) + 1;
  });
  return counts;
};
