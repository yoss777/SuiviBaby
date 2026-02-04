/**
 * Écran de gestion des accès pour un enfant
 * Accessible uniquement par le owner
 */

import React, { useState, useRef } from 'react';
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

/**
 * Composant pour afficher un item d'accès avec les infos utilisateur
 */
function AccessListItem({ item }: { item: [string, ChildAccessDocument] }) {
  const [userId, access] = item;
  const { firebaseUser } = useAuth();
  const { childId } = useLocalSearchParams<{ childId: string }>();
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { showAlert, hide } = useModal();

  const { displayName, loading: userLoading } = useUserInfo(userId);
  const isMe = userId === firebaseUser?.uid;
  const isOwner = access.role === 'owner';

  const handleChangeRole = (userId: string, currentRole: ChildRole) => {
    setSelectedUserId(userId);

    showAlert(
      'Changer le rôle',
      (
        <View style={styles.roleChoiceList}>
          {(Object.keys(ROLE_LABELS) as ChildRole[]).map((role) => {
            const isCurrent = role === currentRole;
            return (
              <TouchableOpacity
                key={role}
                style={[
                  styles.roleChoiceItem,
                  isCurrent && styles.roleChoiceItemActive,
                ]}
                onPress={() => {
                  hide();
                  confirmRoleChange(userId, role);
                }}
              >
                <Text style={styles.roleChoiceLabel}>
                  {getRoleIcon(role)} {ROLE_LABELS[role]}
                </Text>
                <Text style={styles.roleChoiceDescription}>
                  {ROLE_DESCRIPTIONS[role]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ),
      [{ text: 'Fermer', onPress: () => setSelectedUserId(null), style: 'cancel' }],
    );
  };

  const confirmRoleChange = async (userId: string, newRole: ChildRole) => {
    if (!childId) return;

    try {
      await updateChildAccess(childId, userId, { role: newRole });
      showAlert('✅ Succès', `Rôle mis à jour vers ${ROLE_LABELS[newRole]}`);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du rôle:', error);
      showAlert('❌ Erreur', 'Impossible de mettre à jour le rôle');
    } finally {
      setSelectedUserId(null);
    }
  };

  const handleRevoke = (userId: string, userName: string) => {
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
              await revokeChildAccess(childId, userId);
              showAlert('✅ Succès', 'Accès révoqué');
            } catch (error) {
              console.error('Erreur lors de la révocation:', error);
              showAlert('❌ Erreur', 'Impossible de révoquer l\'accès');
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.accessItem}>
      <View style={styles.accessItemHeader}>
        <View style={styles.accessItemInfo}>
          <Text style={styles.accessItemName}>
            {userLoading ? 'Chargement...' : displayName}
            {isMe && <Text style={styles.meBadge}> (Vous)</Text>}
          </Text>
          <Text style={styles.accessItemRole}>
            {getRoleIcon(access.role)} {ROLE_LABELS[access.role]}
          </Text>
          <Text style={styles.accessItemDescription}>
            {ROLE_DESCRIPTIONS[access.role]}
          </Text>
        </View>

        {!isMe && (
          <View style={styles.accessItemActions}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleChangeRole(userId, access.role)}
              disabled={selectedUserId === userId}
            >
              <Ionicons name="swap-horizontal" size={20} color="#007AFF" />
            </TouchableOpacity>

            {!isOwner && (
              <TouchableOpacity
                style={[styles.actionButton, styles.deleteButton]}
                onPress={() => handleRevoke(userId, displayName)}
              >
                <Ionicons name="trash-outline" size={20} color="#FF3B30" />
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

  const child = children.find((c) => c.id === childId);
  const myPermissions = useChildPermissions(childId, firebaseUser?.uid);
  const { accesses, loading } = useChildAccesses(childId);

  // Vérifier les permissions
  if (!myPermissions.loading && !myPermissions.canManageAccess) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Accès interdit',
            headerLeft: () => (
              <TouchableOpacity
                style={{ paddingHorizontal: 12 }}
                onPress={() => router.replace('/baby/plus')}
              >
                <Ionicons name="arrow-back" size={24} color="#007AFF" />
              </TouchableOpacity>
            ),
          }}
        />
        <View style={styles.centeredContainer}>
          <Ionicons name="lock-closed" size={64} color="#999" />
          <Text style={styles.errorText}>
            Vous n'avez pas la permission de gérer les accès
          </Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Retour</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleInvite = () => {
    if (!childId) return;
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
      <View style={styles.container}>
        <Stack.Screen
          options={{
            title: 'Gestion des accès',
            headerLeft: () => (
              <TouchableOpacity
                style={{ paddingHorizontal: 12 }}
                onPress={() => router.replace('/baby/plus')}
              >
                <Ionicons name="arrow-back" size={24} color="#007AFF" />
              </TouchableOpacity>
            ),
          }}
        />
        <View style={styles.centeredContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </View>
    );
  }

  const accessList = Object.entries(accesses);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: `Accès - ${child?.name || 'Enfant'}`,
          headerLeft: () => (
            <TouchableOpacity
              style={{ paddingHorizontal: 12 }}
              onPress={() => router.replace('/baby/plus')}
            >
              <Ionicons name="arrow-back" size={24} color="#007AFF" />
            </TouchableOpacity>
          ),
        }}
      />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>Parents ayant accès</Text>
        <Text style={styles.headerSubtitle}>
          {accessList.length} personne{accessList.length > 1 ? 's' : ''}
        </Text>
      </View>

      <FlatList
        data={accessList}
        keyExtractor={([userId]) => userId}
        renderItem={({ item }) => <AccessListItem item={item} />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>Aucun accès défini</Text>
          </View>
        }
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.inviteButton} onPress={handleInvite}>
          <Ionicons name="person-add" size={20} color="white" />
          <Text style={styles.inviteButtonText}>Inviter un parent</Text>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  header: {
    backgroundColor: 'white',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  listContent: {
    padding: 16,
  },
  accessItem: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
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
    color: '#333',
    marginBottom: 4,
  },
  meBadge: {
    color: '#007AFF',
    fontSize: 14,
    fontWeight: 'normal',
  },
  accessItemRole: {
    fontSize: 15,
    color: '#007AFF',
    marginBottom: 4,
  },
  accessItemDescription: {
    fontSize: 13,
    color: '#666',
  },
  accessItemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    backgroundColor: '#ffe5e5',
  },
  footer: {
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  inviteButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
  },
  backButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#007AFF',
    borderRadius: 8,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
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
    backgroundColor: '#f6f7fb',
  },
  roleChoiceItemActive: {
    borderWidth: 1,
    borderColor: '#007AFF',
    backgroundColor: '#eef6ff',
  },
  roleChoiceLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  roleChoiceDescription: {
    fontSize: 13,
    color: '#6b7280',
  },
});
