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
import {
  CommentInfo,
  EventComment,
  EventLike,
  LatestComment,
  LikeInfo,
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
  }

  return "Utilisateur";
};

/**
 * Récupérer les noms de plusieurs utilisateurs en batch
 */
const getUserNames = async (
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
  const existingLike = await obtenirMonLike(eventId);
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
    throw error;
  }
};

/**
 * Supprimer un like sur un événement
 */
export const supprimerLike = async (eventId: string): Promise<void> => {
  const userId = getUserId();

  const q = query(
    collection(db, "eventLikes"),
    where("eventId", "==", eventId),
    where("userId", "==", userId),
    limit(10000)
  );

  const snapshot = await getDocs(q);
  const deletePromises = snapshot.docs.map((d) =>
    deleteDoc(doc(db, "eventLikes", d.id))
  );
  try {
    await Promise.all(deletePromises);
  } catch (error) {
    console.error("[Like] Erreur suppression like:", error);
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
    existingLike = await obtenirMonLike(eventId);
  } catch (error) {
    console.error("[Like] Erreur toggle (get):", error);
    throw error;
  }

  if (existingLike) {
    try {
      await supprimerLike(eventId);
    } catch (error) {
      console.error("[Like] Erreur toggle (delete):", error);
      throw error;
    }
    return false; // N'est plus liké
  } else {
    try {
      await ajouterLike(eventId, childId, userName);
    } catch (error) {
      console.error("[Like] Erreur toggle (add):", error);
      throw error;
    }
    return true; // Est maintenant liké
  }
};

/**
 * Obtenir le like de l'utilisateur courant sur un événement
 */
export const obtenirMonLike = async (
  eventId: string
): Promise<EventLike | null> => {
  const userId = getUserId();

  const q = query(
    collection(db, "eventLikes"),
    where("eventId", "==", eventId),
    where("userId", "==", userId),
    limit(1)
  );

  let snapshot;
  try {
    snapshot = await getDocs(q);
  } catch (error) {
    console.error("[Like] Erreur obtenirMonLike:", error);
    throw error;
  }
  if (snapshot.empty) return null;

  const docData = snapshot.docs[0];
  return { id: docData.id, ...docData.data() } as EventLike;
};

/**
 * Obtenir tous les likes d'un événement
 */
export const obtenirLikes = async (eventId: string): Promise<EventLike[]> => {
  const q = query(
    collection(db, "eventLikes"),
    where("eventId", "==", eventId),
    orderBy("createdAt", "desc"),
    limit(10000)
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
  currentUserName?: string
): Promise<LikeInfo> => {
  const userId = getUserId();
  const likes = await obtenirLikes(eventId);

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
  eventIds: string[]
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
      where("eventId", "in", batch),
      limit(10000)
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
  onUpdate: (info: LikeInfo) => void
): (() => void) => {
  const userId = getUserId();

  const q = query(
    collection(db, "eventLikes"),
    where("eventId", "==", eventId),
    orderBy("createdAt", "desc"),
    limit(10000)
  );

  return onSnapshot(q, async (snapshot) => {
    const likes = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as EventLike
    );

    // Récupérer les noms à jour
    const uniqueUserIds = [...new Set(likes.slice(0, 3).map((l) => l.userId))];
    const userNames = await getUserNames(uniqueUserIds);

    const likedByMe = likes.some((like) => like.userId === userId);
    const likedByNames = likes.slice(0, 3).map((like) => {
      if (like.userId === userId) {
        return "Moi";
      }
      return userNames.get(like.userId) || like.userName;
    });

    onUpdate({
      count: likes.length,
      likedByMe,
      likedByNames,
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
  content: string
): Promise<string> => {
  const userId = getUserId();

  const comment: Omit<EventComment, "id"> = {
    eventId,
    childId,
    userId,
    userName,
    content,
    createdAt: Timestamp.now(),
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
  eventId: string
): Promise<EventComment[]> => {
  const q = query(
    collection(db, "eventComments"),
    where("eventId", "==", eventId),
    orderBy("createdAt", "asc"),
    limit(10000)
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
  eventId: string
): Promise<CommentInfo> => {
  const comments = await obtenirCommentaires(eventId);

  return {
    count: comments.length,
    comments,
  };
};

/**
 * Obtenir le nombre de commentaires pour plusieurs événements (batch)
 */
export const obtenirCommentCountsBatch = async (
  eventIds: string[]
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
      where("eventId", "in", batch),
      limit(10000)
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
  onUpdate: (info: CommentInfo) => void
): (() => void) => {
  const q = query(
    collection(db, "eventComments"),
    where("eventId", "==", eventId),
    orderBy("createdAt", "asc"),
    limit(10000)
  );

  return onSnapshot(q, (snapshot) => {
    const comments = snapshot.docs.map(
      (d) => ({ id: d.id, ...d.data() }) as EventComment
    );

    onUpdate({
      count: comments.length,
      comments,
    });
  });
};

// ============================================
// COMBINED
// ============================================

/**
 * Écouter toutes les interactions sociales d'un enfant en temps réel
 * Utile pour mettre à jour l'UI quand un autre parent ajoute un like/commentaire
 */
export const ecouterInteractionsSociales = (
  childId: string,
  eventIds: string[],
  onLikesUpdate: (likesInfo: Record<string, LikeInfo>) => void,
  onCommentsUpdate: (commentCounts: Record<string, number>) => void,
  onLatestCommentsUpdate?: (latestComments: Record<string, LatestComment>) => void
): (() => void) => {
  const userId = getUserId();

  // Listener pour les likes
  const likesQuery = query(
    collection(db, "eventLikes"),
    where("childId", "==", childId),
    limit(10000)
  );

  const unsubLikes = onSnapshot(likesQuery, async (snapshot) => {
    const likesInfo: Record<string, LikeInfo> = {};

    // Initialiser
    eventIds.forEach((id) => {
      likesInfo[id] = { count: 0, likedByMe: false, likedByNames: [] };
    });

    // Collecter tous les userIds uniques pour les récupérer en batch
    const likes = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as EventLike);
    const uniqueUserIds = [...new Set(likes.map((l) => l.userId))];

    // Récupérer les noms à jour depuis les profils
    const userNames = await getUserNames(uniqueUserIds);

    likes.forEach((like) => {
      if (!likesInfo[like.eventId]) {
        likesInfo[like.eventId] = {
          count: 0,
          likedByMe: false,
          likedByNames: [],
        };
      }

      const info = likesInfo[like.eventId];
      info.count++;
      if (like.userId === userId) {
        info.likedByMe = true;
      }
      if (info.likedByNames.length < 3) {
        // Utiliser le nom du profil (à jour) au lieu du nom stocké
        const displayName = like.userId === userId
          ? "Moi"
          : userNames.get(like.userId) || like.userName;
        info.likedByNames.push(displayName);
      }
    });

    onLikesUpdate(likesInfo);
  });

  // Listener pour les commentaires
  const commentsQuery = query(
    collection(db, "eventComments"),
    where("childId", "==", childId),
    limit(10000)
  );

  const unsubComments = onSnapshot(commentsQuery, async (snapshot) => {
    const commentCounts: Record<string, number> = {};
    const latestComments: Record<string, LatestComment> = {};

    // Initialiser
    eventIds.forEach((id) => {
      commentCounts[id] = 0;
    });

    // Grouper les commentaires par eventId et trouver le plus récent
    const commentsByEvent: Record<string, EventComment[]> = {};

    snapshot.docs.forEach((d) => {
      const comment = { id: d.id, ...d.data() } as EventComment;
      if (commentCounts[comment.eventId] === undefined) {
        commentCounts[comment.eventId] = 0;
      }
      commentCounts[comment.eventId]++;

      // Grouper pour trouver le dernier commentaire
      if (!commentsByEvent[comment.eventId]) {
        commentsByEvent[comment.eventId] = [];
      }
      commentsByEvent[comment.eventId].push(comment);
    });

    // Trouver le dernier commentaire de chaque événement
    if (onLatestCommentsUpdate) {
      // Collecter les userIds des derniers commentaires
      const latestCommentsPerEvent: EventComment[] = [];

      Object.entries(commentsByEvent).forEach(([eventId, comments]) => {
        // Trier par date décroissante et prendre le premier
        const sorted = comments.sort(
          (a, b) => b.createdAt.toMillis() - a.createdAt.toMillis()
        );
        if (sorted.length > 0) {
          latestCommentsPerEvent.push(sorted[0]);
        }
      });

      // Récupérer les noms à jour
      const uniqueUserIds = [...new Set(latestCommentsPerEvent.map((c) => c.userId))];
      const userNames = await getUserNames(uniqueUserIds);

      latestCommentsPerEvent.forEach((comment) => {
        const displayName = comment.userId === userId
          ? "Moi"
          : userNames.get(comment.userId) || comment.userName;
        latestComments[comment.eventId] = {
          userName: displayName,
          content: comment.content,
        };
      });

      onLatestCommentsUpdate(latestComments);
    }

    onCommentsUpdate(commentCounts);
  });

  // Retourner une fonction pour se désabonner des deux listeners
  return () => {
    unsubLikes();
    unsubComments();
  };
};
