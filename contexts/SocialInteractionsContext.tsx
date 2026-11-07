// contexts/SocialInteractionsContext.tsx
//
// S7.2 : UN écouteur de likes et UN écouteur de commentaires par enfant, partagés
// par le badge de notifications, l'écran Moments et la Galerie.
//
// Avant, chaque consommateur ouvrait ses propres écouteurs (badge : 2, Moments :
// 2, Galerie : 2, chacun jusqu'à 500 documents, et une réouverture complète à
// chaque nouvelle photo). Ici, les documents sont lus une seule fois et les
// agrégats (likes par événement, nombre de commentaires) calculés une seule fois.
import { useAuth } from '@/contexts/AuthContext';
import { useBaby } from '@/contexts/BabyContext';
import {
  compterCommentaires,
  construireLikesInfo,
  ecouterCommentairesEnfant,
  ecouterLikesEnfant,
  getUserNames,
} from '@/services/socialService';
import type { EventComment, EventLike, LikeInfo } from '@/types/social';
import React, { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';

/** Délai avant d'ouvrir les écouteurs : l'accueil s'affiche d'abord. */
export const SOCIAL_LISTENERS_START_DELAY_MS = 1500;

interface SocialInteractionsContextType {
  /** Likes les plus récents de l'enfant actif (500 au plus). */
  likes: EventLike[];
  /** Commentaires les plus récents de l'enfant actif (500 au plus). */
  comments: EventComment[];
  /** Likes agrégés par eventId (noms à jour, « Moi » pour l'utilisateur). */
  likesInfo: Record<string, LikeInfo>;
  /** Nombre de commentaires par eventId. */
  commentCounts: Record<string, number>;
}

type Owned<T> = { childId: string | undefined; data: T };

const EMPTY_LIKES: EventLike[] = [];
const EMPTY_COMMENTS: EventComment[] = [];
const EMPTY_LIKES_INFO: Record<string, LikeInfo> = {};
const EMPTY_COUNTS: Record<string, number> = {};

const SocialInteractionsContext = createContext<SocialInteractionsContextType | undefined>(undefined);

export function SocialInteractionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeChild } = useBaby();
  const childId = activeChild?.id;
  const userId = user?.uid;

  // Chaque jeu de données est rattaché à l'enfant qui l'a produit : après un
  // changement d'enfant, ceux du précédent ne sont jamais exposés (même une frame).
  const [likesState, setLikesState] = useState<Owned<EventLike[]>>({ childId, data: EMPTY_LIKES });
  const [commentsState, setCommentsState] = useState<Owned<EventComment[]>>({ childId, data: EMPTY_COMMENTS });
  const [likesInfoState, setLikesInfoState] = useState<Owned<Record<string, LikeInfo>>>({
    childId,
    data: EMPTY_LIKES_INFO,
  });
  const likes = likesState.childId === childId ? likesState.data : EMPTY_LIKES;
  const comments = commentsState.childId === childId ? commentsState.data : EMPTY_COMMENTS;
  const likesInfo = likesInfoState.childId === childId ? likesInfoState.data : EMPTY_LIKES_INFO;

  // Deux écouteurs au total pour l'enfant actif, ouverts après un court délai.
  useEffect(() => {
    setLikesState({ childId, data: EMPTY_LIKES });
    setCommentsState({ childId, data: EMPTY_COMMENTS });
    setLikesInfoState({ childId, data: EMPTY_LIKES_INFO });
    if (!childId || !userId) return;

    let unsubLikes: (() => void) | undefined;
    let unsubComments: (() => void) | undefined;
    const timer = setTimeout(() => {
      unsubLikes = ecouterLikesEnfant(childId, (data) => setLikesState({ childId, data }), (error) =>
        console.error('[SocialInteractions] Erreur listener likes:', error),
      );
      unsubComments = ecouterCommentairesEnfant(childId, (data) => setCommentsState({ childId, data }), (error) =>
        console.error('[SocialInteractions] Erreur listener commentaires:', error),
      );
    }, SOCIAL_LISTENERS_START_DELAY_MS);

    return () => {
      clearTimeout(timer);
      unsubLikes?.();
      unsubComments?.();
    };
  }, [childId, userId]);

  // Agrégat des likes : noms à jour depuis les profils (cache 5 min dans le service).
  useEffect(() => {
    if (likes.length === 0) {
      setLikesInfoState({ childId, data: EMPTY_LIKES_INFO });
      return;
    }
    let cancelled = false;
    const uniqueUserIds = [...new Set(likes.map((like) => like.userId))];
    getUserNames(uniqueUserIds)
      .then((names) => {
        if (!cancelled) setLikesInfoState({ childId, data: construireLikesInfo(likes, userId, names) });
      })
      .catch(() => {
        // Profils illisibles : on garde les noms stockés dans les likes.
        if (!cancelled) setLikesInfoState({ childId, data: construireLikesInfo(likes, userId, new Map()) });
      });
    return () => {
      cancelled = true;
    };
  }, [likes, userId, childId]);

  const commentCounts = useMemo(
    () => (comments.length === 0 ? EMPTY_COUNTS : compterCommentaires(comments)),
    [comments],
  );

  const value = useMemo<SocialInteractionsContextType>(
    () => ({ likes, comments, likesInfo, commentCounts }),
    [likes, comments, likesInfo, commentCounts],
  );

  return (
    <SocialInteractionsContext.Provider value={value}>
      {children}
    </SocialInteractionsContext.Provider>
  );
}

export function useSocialInteractions() {
  const context = useContext(SocialInteractionsContext);
  if (context === undefined) {
    throw new Error('useSocialInteractions must be used within a SocialInteractionsProvider');
  }
  return context;
}
