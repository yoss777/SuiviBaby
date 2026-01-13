import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface Consultation {
  id: number;
  name: string;
  specialite: string;
  tel: string;
  favoris: boolean;
  date: string;
  notes?: string;
  medecinReferent?: string;
  statut: 'terminee' | 'prevue' | 'annulee';
}

type ConsultationCardProps = {
  consultation: Consultation;
  onToggleFavoris: (consultation: Consultation) => void;
  onViewDetails?: (consultation: Consultation) => void;
  onEdit?: (consultation: Consultation) => void;
  onDelete?: (consultation: Consultation) => void;
};

export function ConsultationCard({
  consultation,
  onToggleFavoris,
  onViewDetails,
  onEdit,
  onDelete
}: ConsultationCardProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const cardBackground = Colors[colorScheme].background;
  const borderColor = Colors[colorScheme].tabIconDefault;

  const handleCall = () => {
    if (!consultation.tel) {
      Alert.alert('Numéro non disponible');
      return;
    }

    Alert.alert(
      'Appeler',
      `${consultation.name}\n${consultation.tel}`,
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Appeler',
          onPress: () => {
            const url = `tel:${consultation.tel.replace(/\s+/g, '')}`;
            Linking.openURL(url).catch(() => {
              Alert.alert('Erreur', 'Impossible de lancer l\'appel');
            });
          },
        },
      ]
    );
  };

  const handleToggleFavoris = () => {
    onToggleFavoris(consultation);
  };

  const handleDelete = () => {
    if (!onDelete) return;
    Alert.alert(
      'Supprimer la consultation',
      'Êtes-vous sûr de vouloir supprimer cette consultation ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => onDelete(consultation),
        },
      ]
    );
  };

  const getStatutInfo = () => {
    switch (consultation.statut) {
      case 'terminee':
        return { label: 'Terminée', color: '#34C759', icon: 'checkmark-circle' as const };
      case 'prevue':
        return { label: 'Prévue', color: '#007AFF', icon: 'time-outline' as const };
      case 'annulee':
        return { label: 'Annulée', color: '#FF3B30', icon: 'close-circle' as const };
    }
  };

  const statutInfo = getStatutInfo();

  return (
    <ThemedView
      style={[
        styles.card,
        {
          backgroundColor: cardBackground,
          borderColor: borderColor,
        },
      ]}
    >
      {/* En-tête avec avatar, infos principales et favoris */}
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: tint }]}>
          <ThemedText style={styles.avatarText}>
            {consultation.name.charAt(0).toUpperCase()}
          </ThemedText>
        </View>

        <View style={styles.headerInfo}>
          <View style={styles.titleRow}>
            <ThemedText type="defaultSemiBold" style={[styles.name, { color: textColor }]} numberOfLines={1}>
              {consultation.name}
            </ThemedText>
            <Pressable onPress={handleToggleFavoris} style={styles.favoriteButton}>
              <Ionicons
                name={consultation.favoris ? 'star' : 'star-outline'}
                size={22}
                color={consultation.favoris ? '#FFD700' : borderColor}
              />
            </Pressable>
          </View>

          <View style={styles.metaRow}>
            <Ionicons name="medical" size={13} color={tint} />
            <ThemedText style={[styles.specialite, { color: textColor }]} numberOfLines={1}>
              {consultation.specialite}
            </ThemedText>
          </View>

          <View style={styles.metaRow}>
            <Ionicons name="calendar-outline" size={13} color={tint} />
            <ThemedText style={[styles.date, { color: textColor }]}>
              {consultation.date}
            </ThemedText>
            <View style={[styles.badge, { backgroundColor: statutInfo.color }]}>
              <Ionicons name={statutInfo.icon} size={12} color="#fff" />
              <ThemedText style={styles.badgeText}>{statutInfo.label}</ThemedText>
            </View>
          </View>
        </View>
      </View>

      {/* Médecin référent */}
      {consultation.medecinReferent && (
        <View style={styles.referentContainer}>
          <Ionicons name="person-outline" size={14} color={tint} />
          <ThemedText style={[styles.referentText, { color: textColor }]}>
            Dr. {consultation.medecinReferent}
          </ThemedText>
        </View>
      )}

      {/* Notes */}
      {consultation.notes && (
        <View style={[styles.notesContainer, { backgroundColor: colorScheme === 'dark' ? '#1f1f1f' : '#f5f5f5' }]}>
          <Ionicons name="document-text-outline" size={14} color={tint} />
          <ThemedText style={[styles.notesText, { color: textColor }]} numberOfLines={2}>
            {consultation.notes}
          </ThemedText>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsRow}>
        <Pressable
          onPress={handleCall}
          style={({ pressed }) => [
            styles.actionButton,
            styles.primaryAction,
            {
              backgroundColor: tint,
              opacity: pressed ? 0.8 : 1,
            }
          ]}
        >
          <Ionicons name="call" size={16} color="#fff" />
          <ThemedText style={styles.actionButtonText}>Appeler</ThemedText>
        </Pressable>

        {onViewDetails && (
          <Pressable
            onPress={() => onViewDetails(consultation)}
            style={({ pressed }) => [
              styles.actionButton,
              styles.secondaryAction,
              {
                borderColor: borderColor,
                opacity: pressed ? 0.6 : 1,
              }
            ]}
          >
            <Ionicons name="eye-outline" size={16} color={tint} />
            <ThemedText style={[styles.secondaryActionText, { color: tint }]}>Détails</ThemedText>
          </Pressable>
        )}

        {onEdit && (
          <Pressable
            onPress={() => onEdit(consultation)}
            style={({ pressed }) => [
              styles.iconButton,
              { opacity: pressed ? 0.6 : 1 }
            ]}
          >
            <Ionicons name="create-outline" size={22} color={tint} />
          </Pressable>
        )}

        {onDelete && (
          <Pressable
            onPress={handleDelete}
            style={({ pressed }) => [
              styles.iconButton,
              { opacity: pressed ? 0.6 : 1 }
            ]}
          >
            <Ionicons name="trash-outline" size={22} color="#FF3B30" />
          </Pressable>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    shadowOpacity: 0.1,
    elevation: 3,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    gap: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerInfo: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 17,
    flex: 1,
    marginRight: 8,
  },
  favoriteButton: {
    padding: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  specialite: {
    fontSize: 13,
    opacity: 0.8,
    flex: 1,
  },
  date: {
    fontSize: 12,
    opacity: 0.7,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: 'auto',
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  referentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
  },
  referentText: {
    fontSize: 13,
    fontWeight: '500',
  },
  notesContainer: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  notesText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
    opacity: 0.85,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    flex: 1,
  },
  primaryAction: {
    // Background color set dynamically
  },
  secondaryAction: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  iconButton: {
    padding: 8,
  },
});
