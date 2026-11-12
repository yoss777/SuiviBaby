/**
 * Écran de gestion des accès pour un enfant
 * Accessible uniquement par le owner
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  BackHandler,
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useGuardedNavigation } from '@/hooks/useGuardedNavigation';
import { useAuth } from '@/contexts/AuthContext';
import { useChildPermissions, useChildAccesses } from '@/hooks/useChildPermissions';
import { revokeChildAccess } from '@/services/accessRepository';
import { setMemberRole } from '@/services/childSharingService';
import { useUserInfo } from '@/hooks/useUserInfo';
import { SkeletonBlock, SkeletonList } from '@/components/ui/Skeleton';
import {
  ChildRole,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ChildAccessDocument,
} from '@/types/permissions';
import { Ionicons } from '@expo/vector-icons';
import { useBaby } from '@/contexts/BabyContext';
import { useHeaderLeft } from '../../_layout';
import { HeaderBackButton } from "expo-router/react-navigation";
import { Colors, flatInDark, getReadableTextColor } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useModal } from "@/contexts/ModalContext";
import { getNeutralColors } from "@/constants/dashboardColors";
import * as Haptics from "expo-haptics";

/**
 * Composant pour afficher un item d'accès avec les infos utilisateur
 */
function AccessListItem({
  item,
  nc,
  tintColor,
}: {
  item: [string, ChildAccessDocument];
  nc: ReturnType<typeof getNeutralColors>;
  tintColor: string;
}) {
  const [userId, access] = item;
  const colorScheme = useColorScheme() ?? "light";
  const { firebaseUser } = useAuth();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { showAlert } = useModal();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const { displayName, loading: userLoading } = useUserInfo(userId);
  const isMe = userId === firebaseUser?.uid;
  const isOwner = access.role === 'owner';

  // Sprint 12.6 : deux rôles proposés, « Parent » (admin) et « Proche »
  // (contributor). Seul le propriétaire (cet écran) bascule un membre de l'un
  // à l'autre, via la Cloud Function setMemberRole.
  const isParent = access.role === 'admin';
  const targetRole: 'admin' | 'contributor' = isParent ? 'contributor' : 'admin';
  const roleActionLabel = isParent ? 'Repasser en Proche' : 'Passer en Parent';

  const confirmRoleChange = useCallback(async (uid: string, newRole: 'admin' | 'contributor') => {
    if (!childId) return;
    setSelectedUserId(uid);
    try {
      await setMemberRole(childId, uid, newRole);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (isMountedRef.current) {
        showAlert('Succès', `Rôle mis à jour : ${ROLE_LABELS[newRole]}`, [{ text: 'OK' }]);
      }
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (isMountedRef.current) {
        showAlert('Erreur', error?.message || 'Impossible de mettre à jour le rôle');
      }
    } finally {
      if (isMountedRef.current) {
        setSelectedUserId(null);
      }
    }
  }, [childId, showAlert]);

  const handleChangeRole = useCallback((uid: string, name: string, toRole: 'admin' | 'contributor') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const who = name || 'cette personne';
    const message = toRole === 'admin'
      ? `${who} deviendra Parent : elle pourra saisir et modifier le suivi, l'exporter en entier et partager l'enfant. Elle pourra aussi consulter, aimer et commenter les photos, comme un proche.`
      : `${who} redeviendra Proche : elle pourra tout consulter, aimer et commenter les photos, mais ne pourra plus saisir ni modifier le suivi. Son export sera limité à ses likes et commentaires.`;
    showAlert(
      toRole === 'admin' ? `Passer ${who} en Parent ?` : `Repasser ${who} en Proche ?`,
      message,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: toRole === 'admin' ? 'Passer en Parent' : 'Repasser en Proche',
          onPress: () => { void confirmRoleChange(uid, toRole); },
        },
      ],
    );
  }, [showAlert, confirmRoleChange]);

  const handleRevoke = useCallback((uid: string, userName: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    showAlert(
      'Révoquer l\'accès',
      `Êtes-vous sûr de vouloir révoquer l'accès de ${userName || 'cet utilisateur'} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Révoquer',
          style: 'destructive',
          onPress: async () => {
            if (!childId) return;
            try {
              await revokeChildAccess(childId, uid);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              if (isMountedRef.current) {
                showAlert('Succès', 'Accès révoqué', [{ text: 'OK' }]);
              }
            } catch (error) {
              console.error('Erreur lors de la révocation:', error);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              if (isMountedRef.current) {
                showAlert('Erreur', 'Impossible de révoquer l\'accès');
              }
            }
          },
        },
      ],
    );
  }, [childId, showAlert]);

  const ds = dynamicStyles(nc, tintColor);

  return (
    <View style={[ds.accessItem, flatInDark(colorScheme)]}>
      <View style={ds.accessItemHeader}>
        <View style={ds.accessItemInfo}>
          {userLoading ? (
            <SkeletonBlock width="50%" height={16} style={{ marginBottom: 6 }} />
          ) : (
            <Text style={ds.accessItemName}>
              {displayName}
              {isMe && <Text style={ds.meBadge}> (Vous)</Text>}
            </Text>
          )}
          <Text style={ds.accessItemRole}>
            {getRoleIcon(access.role)} {ROLE_LABELS[access.role]}
          </Text>
          <Text style={ds.accessItemDescription}>
            {ROLE_DESCRIPTIONS[access.role]}
          </Text>
        </View>

        {!isMe && (
          <View style={ds.accessItemActions}>
            {!isOwner && (
              <TouchableOpacity
                style={[ds.roleActionButton, selectedUserId === userId && { opacity: 0.5 }]}
                onPress={() => handleChangeRole(userId, displayName, targetRole)}
                disabled={selectedUserId === userId}
                accessibilityRole="button"
                accessibilityLabel={`${roleActionLabel} : ${displayName}`}
              >
                <Ionicons name="swap-horizontal" size={18} color={tintColor} />
                <Text style={ds.roleActionText}>{roleActionLabel}</Text>
              </TouchableOpacity>
            )}

            {!isOwner && (
              <TouchableOpacity
                style={[ds.actionButton, ds.deleteButton]}
                onPress={() => handleRevoke(userId, displayName)}
                accessibilityRole="button"
                accessibilityLabel={`Révoquer l'accès de ${displayName}`}
              >
                <Ionicons name="trash-outline" size={20} color={nc.error} />
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

export default function ManageAccessScreen() {
  const router = useRouter();
  const { push: guardedPush } = useGuardedNavigation();
  const { setHeaderLeft } = useHeaderLeft();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const { firebaseUser } = useAuth();
  const { children } = useBaby();
  const colorScheme = useColorScheme() ?? "light";
  const headerOwnerId = useRef(`manage-access-${Math.random().toString(36).slice(2)}`);

  const nc = useMemo(() => getNeutralColors(colorScheme), [colorScheme]);
  const tintColor = Colors[colorScheme].tint;

  const child = useMemo(
    () => children.find((c) => c.id === childId),
    [children, childId]
  );
  const myPermissions = useChildPermissions(childId, firebaseUser?.uid);
  const { accesses, loading } = useChildAccesses(childId);

  const ds = useMemo(() => dynamicStyles(nc, tintColor), [nc, tintColor]);

  const accessList = useMemo(
    () => Object.entries(accesses),
    [accesses]
  );

  // Hooks must run before any early return (rules of hooks).
  useFocusEffect(
    React.useCallback(() => {
      const backButton = (
        <HeaderBackButton
          onPress={() => router.replace("/baby/plus")}
          tintColor={Colors[colorScheme].text}
        />
      );
      setHeaderLeft(backButton, headerOwnerId.current);
      // Onglet masqué : le retour Android suivrait l'historique des onglets
      // (Accueil) ; on revient à Plus comme le bouton de l'en-tête.
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        router.replace("/baby/plus");
        return true;
      });
      return () => {
        subscription.remove();
        setHeaderLeft(null, headerOwnerId.current);
      };
    }, [colorScheme, router, setHeaderLeft])
  );

  // Vérifier les permissions
  if (!myPermissions.loading && !myPermissions.canManageAccess) {
    return (
      <View style={ds.container}>
        <Stack.Screen
          options={{
            title: 'Accès interdit',
            headerLeft: () => (
              <TouchableOpacity
                style={{ paddingHorizontal: 12 }}
                onPress={() => router.replace('/baby/plus')}
                accessibilityRole="button"
                accessibilityLabel="Retour"
              >
                <Ionicons name="arrow-back" size={24} color={tintColor} />
              </TouchableOpacity>
            ),
          }}
        />
        <View style={ds.centeredContainer}>
          <Ionicons name="lock-closed" size={64} color={nc.textMuted} />
          <Text style={ds.errorText}>
            Vous n&apos;avez pas la permission de gérer les accès
          </Text>
          <TouchableOpacity
            style={ds.backButton}
            onPress={() => router.replace('/baby/plus')}
            accessibilityRole="button"
            accessibilityLabel="Retour à l'écran précédent"
          >
            <Text style={ds.backButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleInvite = () => {
    if (!childId) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    guardedPush({
      pathname: '/(drawer)/share-child',
      params: { childId, returnTo: `/baby/manage-access?childId=${childId}` },
    });
  };

  if (loading || myPermissions.loading) {
    return (
      <View style={ds.container}>
        <Stack.Screen
          options={{
            title: 'Gestion des accès',
            headerLeft: () => (
              <TouchableOpacity
                style={{ paddingHorizontal: 12 }}
                onPress={() => router.replace('/baby/plus')}
                accessibilityRole="button"
                accessibilityLabel="Retour"
              >
                <Ionicons name="arrow-back" size={24} color={tintColor} />
              </TouchableOpacity>
            ),
          }}
        />
        <SkeletonList rows={3} style={ds.listContent} />
      </View>
    );
  }

  return (
    <View style={ds.container}>
      <Stack.Screen
        options={{
          title: `Accès - ${child?.name || 'Enfant'}`,
          headerLeft: () => (
            <TouchableOpacity
              style={{ paddingHorizontal: 12 }}
              onPress={() => router.replace('/baby/plus')}
              accessibilityRole="button"
              accessibilityLabel="Retour"
            >
              <Ionicons name="arrow-back" size={24} color={tintColor} />
            </TouchableOpacity>
          ),
        }}
      />

      <View style={ds.header}>
        <Text style={ds.headerTitle}>Parents ayant accès</Text>
        <Text style={ds.headerSubtitle}>
          {accessList.length} personne{accessList.length > 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={accessList}
        keyExtractor={([userId]) => userId}
        renderItem={({ item }) => (
          <AccessListItem item={item} nc={nc} tintColor={tintColor} />
        )}
        contentContainerStyle={ds.listContent}
        ListEmptyComponent={
          <View style={ds.emptyContainer}>
            <Ionicons name="people-outline" size={64} color={nc.textMuted} />
            <Text style={ds.emptyText}>Aucun accès défini</Text>
          </View>
        }
      />

      <View style={ds.footer}>
        <TouchableOpacity
          style={ds.inviteButton}
          onPress={handleInvite}
          accessibilityRole="button"
          accessibilityLabel="Inviter un parent à accéder au profil de l'enfant"
        >
          <Ionicons name="person-add" size={20} color={getReadableTextColor(tintColor)} />
          <Text style={ds.inviteButtonText}>Inviter un parent</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getRoleIcon(role: ChildRole): string {
  switch (role) {
    case 'owner':
      return '👑';
    case 'admin':
      return '🔧';
    case 'contributor':
      return '✍️';
    case 'viewer':
      return '👁️';
    default:
      return '👤';
  }
}

const dynamicStyles = (
  nc: ReturnType<typeof getNeutralColors>,
  tintColor: string
) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: nc.background,
    },
    centeredContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 24,
    },
    header: {
      backgroundColor: nc.backgroundCard,
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: nc.border,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: nc.textStrong,
    },
    headerSubtitle: {
      fontSize: 14,
      color: nc.textLight,
      marginTop: 4,
    },
    listContent: {
      padding: 16,
    },
    accessItem: {
      backgroundColor: nc.backgroundCard,
      borderRadius: 12,
      padding: 16,
      marginBottom: 12,
      shadowColor: nc.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    accessItemHeader: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 8,
    },
    accessItemInfo: {
      flex: 1,
    },
    accessItemName: {
      fontSize: 16,
      fontWeight: '600',
      color: nc.textStrong,
      marginBottom: 4,
    },
    meBadge: {
      color: tintColor,
      fontSize: 14,
      fontWeight: 'normal',
    },
    accessItemRole: {
      fontSize: 15,
      color: tintColor,
      marginBottom: 4,
    },
    accessItemDescription: {
      fontSize: 13,
      color: nc.textLight,
    },
    accessItemActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    actionButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: nc.backgroundPressed,
      justifyContent: 'center',
      alignItems: 'center',
    },
    deleteButton: {
      backgroundColor: nc.error + "15",
    },
    footer: {
      padding: 16,
      backgroundColor: nc.backgroundCard,
      borderTopWidth: 1,
      borderTopColor: nc.border,
    },
    inviteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: tintColor,
      paddingVertical: 14,
      borderRadius: 12,
      gap: 8,
    },
    inviteButtonText: {
      color: getReadableTextColor(tintColor),
      fontSize: 16,
      fontWeight: '600',
    },
    errorText: {
      fontSize: 16,
      color: nc.textLight,
      textAlign: 'center',
      marginTop: 16,
    },
    backButton: {
      marginTop: 24,
      paddingVertical: 12,
      paddingHorizontal: 24,
      backgroundColor: tintColor,
      borderRadius: 8,
    },
    backButtonText: {
      color: getReadableTextColor(tintColor),
      fontSize: 16,
      fontWeight: '600',
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 64,
    },
    emptyText: {
      fontSize: 16,
      color: nc.textLight,
      marginTop: 16,
    },
    roleActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 22,
      backgroundColor: nc.backgroundPressed,
    },
    roleActionText: {
      fontSize: 14,
      fontWeight: '600',
      color: tintColor,
    },
  });
