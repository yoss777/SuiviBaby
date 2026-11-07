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

  const [likes, setLikes] = useState<EventLike[]>(EMPTY_LIKES);
  const [comments, setComments] = useState<EventComment[]>(EMPTY_COMMENTS);
  const [likesInfo, setLikesInfo] = useState<Record<string, LikeInfo>>(EMPTY_LIKES_INFO);

  // Deux écouteurs au total pour l'enfant actif, ouverts après un court délai.
  useEffect(() => {
    setLikes(EMPTY_LIKES);
    setComments(EMPTY_COMMENTS);
    setLikesInfo(EMPTY_LIKES_INFO);
    if (!childId || !userId) return;

    let unsubLikes: (() => void) | undefined;
    let unsubComments: (() => void) | undefined;
    const timer = setTimeout(() => {
      unsubLikes = ecouterLikesEnfant(childId, setLikes, (error) =>
        console.error('[SocialInteractions] Erreur listener likes:', error),
      );
      unsubComments = ecouterCommentairesEnfant(childId, setComments, (error) =>
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
      setLikesInfo(EMPTY_LIKES_INFO);
      return;
    }
    let cancelled = false;
    const uniqueUserIds = [...new Set(likes.map((like) => like.userId))];
    getUserNames(uniqueUserIds)
      .then((names) => {
        if (!cancelled) setLikesInfo(construireLikesInfo(likes, userId, names));
      })
      .catch(() => {
        // Profils illisibles : on garde les noms stockés dans les likes.
        if (!cancelled) setLikesInfo(construireLikesInfo(likes, userId, new Map()));
      });
    return () => {
      cancelled = true;
    };
  }, [likes, userId]);

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
