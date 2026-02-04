/**
 * Hook pour récupérer les informations d'un utilisateur
 */

import { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

interface UserInfo {
  displayName?: string;
  userName?: string;
  email?: string;
  photoURL?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * Récupère les informations d'un utilisateur depuis la collection users_public
 */
export function useUserInfo(userId: string | null | undefined) {
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setUserInfo(null);
      setLoading(false);
      return;
    }

    const fetchUserInfo = async () => {
      try {
        const userRef = doc(db, 'users_public', userId);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
          setUserInfo(userSnap.data() as UserInfo);
        } else {
          setUserInfo(null);
        }
      } catch (error) {
        console.error('Erreur lors de la récupération des infos utilisateur:', error);
        setUserInfo(null);
      } finally {
        setLoading(false);
      }
    };

    fetchUserInfo();
  }, [userId]);

  // Générer un nom d'affichage à partir des données disponibles
  const displayName = userInfo?.userName ||
    userInfo?.displayName ||
    (userInfo?.firstName && userInfo?.lastName
      ? `${userInfo.firstName} ${userInfo.lastName}`
      : userInfo?.firstName ||
        userInfo?.email?.split('@')[0] ||
        userId?.substring(0, 8) + '...');

  return {
    userInfo,
    loading,
    displayName,
  };
}

/**
 * Hook pour récupérer les informations de plusieurs utilisateurs
 */
export function useUsersInfo(userIds: string[]) {
  const [usersInfo, setUsersInfo] = useState<Record<string, UserInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userIds || userIds.length === 0) {
      setUsersInfo({});
      setLoading(false);
      return;
    }

    const fetchUsersInfo = async () => {
      try {
        const usersData: Record<string, UserInfo> = {};

        await Promise.all(
          userIds.map(async (userId) => {
            const userRef = doc(db, 'users_public', userId);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
              usersData[userId] = userSnap.data() as UserInfo;
            }
          })
        );

        setUsersInfo(usersData);
      } catch (error) {
        console.error('Erreur lors de la récupération des infos utilisateurs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsersInfo();
  }, [userIds.join(',')]);

  return { usersInfo, loading };
}
