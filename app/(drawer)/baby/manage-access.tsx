/**
 * Écran de gestion des accès pour un enfant
 * Accessible uniquement par le owner
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useChildPermissions, useChildAccesses } from '@/hooks/useChildPermissions';
import { updateChildAccess, revokeChildAccess } from '@/utils/permissions';
import { useUserInfo } from '@/hooks/useUserInfo';
import {
  ChildRole,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ChildAccessDocument,
} from '@/types/permissions';
import { Ionicons } from '@expo/vector-icons';
import { useBaby } from '@/contexts/BabyContext';
import { useHeaderLeft } from '../_layout';
import { HeaderBackButton } from "@react-navigation/elements";
import { Colors } from "@/constants/theme";
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
  const { firebaseUser } = useAuth();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { showAlert, hide } = useModal();
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const { displayName, loading: userLoading } = useUserInfo(userId);
  const isMe = userId === firebaseUser?.uid;
  const isOwner = access.role === 'owner';

  const handleChangeRole = useCallback((uid: string, currentRole: ChildRole) => {
    setSelectedUserId(uid);

    showAlert(
      'Changer le rôle',
      (
        <View style={dynamicStyles(nc, tintColor).roleChoiceList}>
          {(Object.keys(ROLE_LABELS) as ChildRole[]).map((role) => {
            const isCurrent = role === currentRole;
            return (
              <TouchableOpacity
                key={role}
                style={[
                  dynamicStyles(nc, tintColor).roleChoiceItem,
                  isCurrent && dynamicStyles(nc, tintColor).roleChoiceItemActive,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Sélectionner le rôle ${ROLE_LABELS[role]}${isCurrent ? ', rôle actuel' : ''}`}
                onPress={() => {
                  hide();
                  confirmRoleChange(uid, role);
                }}
              >
                <Text style={dynamicStyles(nc, tintColor).roleChoiceLabel}>
                  {getRoleIcon(role)} {ROLE_LABELS[role]}
                  {isCurrent ? " (actuel)" : ""}
                </Text>
                <Text style={dynamicStyles(nc, tintColor).roleChoiceDescription}>
                  {ROLE_DESCRIPTIONS[role]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ),
      [{ text: 'Fermer', onPress: () => { if (isMountedRef.current) setSelectedUserId(null); }, style: 'cancel' }],
    );
  }, [childId, nc, tintColor, showAlert, hide]);

  const confirmRoleChange = async (uid: string, newRole: ChildRole) => {
    if (!childId) return;

    try {
      await updateChildAccess(childId, uid, { role: newRole });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (isMountedRef.current) {
        showAlert(
          'Succès',
          `Rôle mis à jour vers ${ROLE_LABELS[newRole]}`,
          [{ text: 'OK' }],
        );
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour du rôle:', error);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (isMountedRef.current) {
        showAlert('Erreur', 'Impossible de mettre à jour le rôle');
      }
    } finally {
      if (isMountedRef.current) {
        setSelectedUserId(null);
      }
    }
  };

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
    <View style={ds.accessItem}>
      <View style={ds.accessItemHeader}>
        <View style={ds.accessItemInfo}>
          <Text style={ds.accessItemName}>
            {userLoading ? 'Chargement...' : displayName}
            {isMe && <Text style={ds.meBadge}> (Vous)</Text>}
          </Text>
          <Text style={ds.accessItemRole}>
            {getRoleIcon(access.role)} {ROLE_LABELS[access.role]}
          </Text>
          <Text style={ds.accessItemDescription}>
            {ROLE_DESCRIPTIONS[access.role]}
          </Text>
        </View>

        {!isMe && (
          <View style={ds.accessItemActions}>
            <TouchableOpacity
              style={ds.actionButton}
              onPress={() => handleChangeRole(userId, access.role)}
              disabled={selectedUserId === userId}
              accessibilityRole="button"
              accessibilityLabel={`Changer le rôle de ${displayName}`}
            >
              <Ionicons name="swap-horizontal" size={20} color={tintColor} />
            </TouchableOpacity>

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
            Vous n'avez pas la permission de gérer les accès
          </Text>
          <TouchableOpacity
            style={ds.backButton}
            onPress={() => router.back()}
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
    router.push({
      pathname: '/(drawer)/share-child',
      params: { childId, returnTo: `/baby/manage-access?childId=${childId}` },
    });
  };

  useFocusEffect(
    React.useCallback(() => {
      const backButton = (
        <HeaderBackButton
          onPress={() => router.replace("/baby/plus")}
          tintColor={Colors[colorScheme].text}
        />
      );
      setHeaderLeft(backButton, headerOwnerId.current);
      return () => setHeaderLeft(null, headerOwnerId.current);
    }, [colorScheme, router, setHeaderLeft])
  );

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
        <View style={ds.centeredContainer}>
          <ActivityIndicator size="large" color={tintColor} />
          <Text style={ds.loadingText}>Chargement...</Text>
        </View>
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
          <Ionicons name="person-add" size={20} color={nc.white} />
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
      justifyContent: 'space-between',
      alignItems: 'flex-start',
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
      color: nc.white,
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
      color: nc.white,
      fontSize: 16,
      fontWeight: '600',
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: nc.textLight,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 64,
    },
    emptyText: {
      fontSize: 16,
      color: nc.textMuted,
      marginTop: 16,
    },
    roleChoiceList: {
      gap: 12,
      marginTop: 12,
    },
    roleChoiceItem: {
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      backgroundColor: nc.backgroundPressed,
    },
    roleChoiceItemActive: {
      borderWidth: 1,
      borderColor: tintColor,
      backgroundColor: tintColor + "15",
    },
    roleChoiceLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: nc.textStrong,
      marginBottom: 2,
    },
    roleChoiceDescription: {
      fontSize: 13,
      color: nc.textLight,
    },
  });
