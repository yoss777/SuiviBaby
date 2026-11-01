/**
 * Exemple d'utilisation du système de permissions
 *
 * Ce fichier montre comment utiliser les permissions dans différents contextes.
 * À utiliser comme référence lors de l'implémentation.
 */

import React from 'react';
import { View, Text, Button, FlatList, ActivityIndicator } from 'react-native';
import { useChildPermissions, useChildAccesses } from '@/hooks/useChildPermissions';
import {
  grantChildAccess,
  revokeChildAccess,
  updateChildAccess,
} from '@/utils/permissions';
import { ChildRole, ROLE_LABELS, ROLE_DESCRIPTIONS } from '@/types/permissions';

// ============================================
// Exemple 1: Écran d'événements avec permissions
// ============================================

interface EventScreenProps {
  childId: string;
  currentUserId: string;
}

export function EventScreen({ childId, currentUserId }: EventScreenProps) {
  const permissions = useChildPermissions(childId, currentUserId);

  if (permissions.loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text>Vérification des permissions...</Text>
      </View>
    );
  }

  if (!permissions.hasAccess) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Vous n&apos;avez pas accès à cet enfant</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>
        Événements de bébé
      </Text>

      {/* Afficher le rôle de l'utilisateur */}
      {permissions.role && (
        <Text style={{ marginBottom: 16, color: '#666' }}>
          Votre rôle: {ROLE_LABELS[permissions.role]}
        </Text>
      )}

      {/* Liste des événements (tous peuvent lire) */}
      <View style={{ flex: 1 }}>
        <Text>Liste des événements...</Text>
      </View>

      {/* Bouton ajouter un événement (seulement owner/admin) */}
      {permissions.canWriteEvents && (
        <Button
          title="Ajouter un événement"
          onPress={() => console.log('Ajouter un événement')}
        />
      )}
    </View>
  );
}

// ============================================
// Exemple 2: Composant Like avec permissions
// ============================================

interface LikeButtonProps {
  childId: string;
  eventId: string;
  currentUserId: string;
  isLiked: boolean;
  onToggleLike: () => void;
}

export function LikeButton({
  childId,
  currentUserId,
  isLiked,
  onToggleLike,
}: LikeButtonProps) {
  const permissions = useChildPermissions(childId, currentUserId);

  // Ne pas afficher le bouton si l'utilisateur n'a pas la permission
  if (!permissions.canWriteLikes) {
    return null;
  }

  return (
    <Button
      title={isLiked ? '❤️ J\'aime' : '🤍 Liker'}
      onPress={onToggleLike}
      disabled={permissions.loading}
    />
  );
}

// ============================================
// Exemple 3: Écran de gestion des permissions
// ============================================

interface ManageAccessScreenProps {
  childId: string;
  currentUserId: string;
}

export function ManageAccessScreen({
  childId,
  currentUserId,
}: ManageAccessScreenProps) {
  const myPermissions = useChildPermissions(childId, currentUserId);
  const { accesses, loading } = useChildAccesses(childId);

  if (myPermissions.loading || loading) {
    return <ActivityIndicator size="large" />;
  }

  if (!myPermissions.canManageAccess) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>Vous n&apos;avez pas la permission de gérer les accès</Text>
      </View>
    );
  }

  const handleChangeRole = async (userId: string, newRole: ChildRole) => {
    try {
      await updateChildAccess(childId, userId, { role: newRole });
      console.log(`Rôle mis à jour pour ${userId}`);
    } catch (error) {
      console.error('Erreur lors de la mise à jour du rôle:', error);
    }
  };

  const handleRevoke = async (userId: string) => {
    try {
      await revokeChildAccess(childId, userId);
      console.log(`Accès révoqué pour ${userId}`);
    } catch (error) {
      console.error('Erreur lors de la révocation:', error);
    }
  };

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>
        Gérer les accès
      </Text>

      <FlatList
        data={Object.entries(accesses)}
        keyExtractor={([userId]) => userId}
        renderItem={({ item: [userId, access] }) => (
          <View
            style={{
              padding: 16,
              marginBottom: 8,
              backgroundColor: '#f5f5f5',
              borderRadius: 8,
            }}
          >
            <Text style={{ fontWeight: 'bold' }}>User ID: {userId}</Text>
            <Text>Rôle: {ROLE_LABELS[access.role]}</Text>
            <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              {ROLE_DESCRIPTIONS[access.role]}
            </Text>

            {/* Ne pas permettre de supprimer l'owner (soi-même) */}
            {userId !== currentUserId && (
              <View style={{ marginTop: 8, flexDirection: 'row', gap: 8 }}>
                <Button
                  title="Changer rôle"
                  onPress={() => {
                    // Ouvrir un modal pour choisir le nouveau rôle
                    console.log('Changer rôle de', userId);
                  }}
                />
                <Button
                  title="Révoquer"
                  color="red"
                  onPress={() => handleRevoke(userId)}
                />
              </View>
            )}
          </View>
        )}
      />

      <Button
        title="Inviter un nouveau parent"
        onPress={() => console.log('Ouvrir écran d\'invitation')}
      />
    </View>
  );
}

// ============================================
// Exemple 4: Inviter un nouveau parent
// ============================================

interface InviteParentProps {
  childId: string;
  currentUserId: string;
  invitedUserId: string;
  selectedRole: ChildRole;
}

export async function inviteParent({
  childId,
  currentUserId,
  invitedUserId,
  selectedRole,
}: InviteParentProps) {
  try {
    // Accorder l'accès avec le rôle sélectionné
    await grantChildAccess(childId, invitedUserId, selectedRole, currentUserId);

    console.log(
      `Accès ${ROLE_LABELS[selectedRole]} accordé à ${invitedUserId}`
    );

    return { success: true };
  } catch (error) {
    console.error('Erreur lors de l\'invitation:', error);
    return { success: false, error };
  }
}

// ============================================
// Exemple 5: Composant de sélection de rôle
// ============================================

interface RoleSelectorProps {
  currentRole: ChildRole;
  onSelectRole: (role: ChildRole) => void;
}

export function RoleSelector({ currentRole, onSelectRole }: RoleSelectorProps) {
  const roles: ChildRole[] = ['owner', 'admin', 'contributor', 'viewer'];

  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 12 }}>
        Sélectionner un rôle
      </Text>

      {roles.map((role) => (
        <View
          key={role}
          style={{
            padding: 12,
            marginBottom: 8,
            backgroundColor: role === currentRole ? '#e3f2fd' : '#f5f5f5',
            borderRadius: 8,
            borderWidth: role === currentRole ? 2 : 0,
            borderColor: '#2196f3',
          }}
          onTouchEnd={() => onSelectRole(role)}
        >
          <Text style={{ fontWeight: 'bold' }}>{ROLE_LABELS[role]}</Text>
          <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
            {ROLE_DESCRIPTIONS[role]}
          </Text>
        </View>
      ))}
    </View>
  );
}
