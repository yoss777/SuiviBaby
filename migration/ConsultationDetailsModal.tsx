import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import type { Consultation } from '@mediscope/shared/components/mediscope/consultation-card';
import { ThemedText } from '@mediscope/shared/components/themed-text';
import { Colors } from '@mediscope/shared/constants/theme';
import { useColorScheme } from '@mediscope/shared/hooks/use-color-scheme';

interface ConsultationDetailsModalProps {
  visible: boolean;
  consultation: Consultation | null;
  onClose: () => void;
  onCancel?: (consultation: Consultation) => void;
  onReschedule?: (consultation: Consultation) => void;
}

export default function ConsultationDetailsModal({
  visible,
  consultation,
  onClose,
  onCancel,
  onReschedule,
}: ConsultationDetailsModalProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const tint = Colors[colorScheme].tint;
  const textColor = Colors[colorScheme].text;
  const backgroundColor = Colors[colorScheme].background;
  const borderColor = Colors[colorScheme].tabIconDefault;

  if (!consultation) return null;

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
  const canModify = consultation.statut === 'prevue';

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor }]}>
          {/* En-tête avec bouton fermer */}
          <View style={styles.modalHeader}>
            <View style={{ width: 32 }} />
            <ThemedText type="subtitle" style={styles.modalTitle}>
              Détails de la consultation
            </ThemedText>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={28} color={textColor} />
            </Pressable>
          </View>

          <ScrollView style={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Avatar et nom */}
            <View style={styles.headerSection}>
              <View style={[styles.avatar, { backgroundColor: tint }]}>
                <ThemedText style={styles.avatarText}>
                  {consultation.name.charAt(0).toUpperCase()}
                </ThemedText>
              </View>
              <ThemedText type="title" style={[styles.name, { color: textColor }]}>
                {consultation.name}
              </ThemedText>
              <View style={[styles.statusBadge, { backgroundColor: statutInfo.color }]}>
                <Ionicons name={statutInfo.icon} size={16} color="#fff" />
                <ThemedText style={styles.statusText}>{statutInfo.label}</ThemedText>
              </View>
            </View>

            {/* Informations détaillées */}
            <View style={styles.detailsSection}>
              {/* Spécialité */}
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}>
                  <Ionicons name="medical" size={20} color={tint} />
                </View>
                <View style={styles.detailContent}>
                  <ThemedText style={styles.detailLabel}>Spécialité</ThemedText>
                  <ThemedText type="defaultSemiBold" style={[styles.detailValue, { color: textColor }]}>
                    {consultation.specialite}
                  </ThemedText>
                </View>
              </View>

              {/* Lieu */}
              {consultation.medecinReferent && (
                <View style={styles.detailRow}>
                  <View style={styles.detailIcon}>
                    <Ionicons name="location" size={20} color={tint} />
                  </View>
                  <View style={styles.detailContent}>
                    <ThemedText style={styles.detailLabel}>Lieu de consultation</ThemedText>
                    <ThemedText type="defaultSemiBold" style={[styles.detailValue, { color: textColor }]}>
                      {consultation.medecinReferent}
                    </ThemedText>
                  </View>
                </View>
              )}

              {/* Date */}
              <View style={styles.detailRow}>
                <View style={styles.detailIcon}>
                  <Ionicons name="calendar-outline" size={20} color={tint} />
                </View>
                <View style={styles.detailContent}>
                  <ThemedText style={styles.detailLabel}>Date</ThemedText>
                  <ThemedText type="defaultSemiBold" style={[styles.detailValue, { color: textColor }]}>
                    {consultation.date}
                  </ThemedText>
                </View>
              </View>

              {/* Téléphone */}
              {consultation.tel && (
                <View style={styles.detailRow}>
                  <View style={styles.detailIcon}>
                    <Ionicons name="call" size={20} color={tint} />
                  </View>
                  <View style={styles.detailContent}>
                    <ThemedText style={styles.detailLabel}>Téléphone</ThemedText>
                    <ThemedText type="defaultSemiBold" style={[styles.detailValue, { color: textColor }]}>
                      {consultation.tel}
                    </ThemedText>
                  </View>
                </View>
              )}
            </View>

            {/* Notes */}
            {consultation.notes && (
              <View style={[styles.notesSection, {
                backgroundColor: colorScheme === 'dark' ? '#1f1f1f' : '#f5f5f5',
                borderColor: borderColor
              }]}>
                <View style={styles.notesTitleRow}>
                  <Ionicons name="document-text-outline" size={20} color={tint} />
                  <ThemedText type="defaultSemiBold" style={[styles.notesTitle, { color: textColor }]}>
                    Notes
                  </ThemedText>
                </View>
                <ThemedText style={[styles.notesText, { color: textColor }]}>
                  {consultation.notes}
                </ThemedText>
              </View>
            )}
          </ScrollView>

          {/* Boutons d'action (uniquement pour consultations prévues) */}
          {canModify && (
            <View style={[styles.actionsSection, { borderTopColor: borderColor }]}>
              <Pressable
                onPress={() => {
                  onReschedule?.(consultation);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.secondaryButton,
                  {
                    borderColor: tint,
                    opacity: pressed ? 0.6 : 1,
                  }
                ]}
              >
                <Ionicons name="calendar-outline" size={20} color={tint} />
                <ThemedText style={[styles.secondaryButtonText, { color: tint }]}>
                  Reprogrammer
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={() => {
                  onCancel?.(consultation);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.dangerButton,
                  {
                    opacity: pressed ? 0.8 : 1,
                  }
                ]}
              >
                <Ionicons name="close-circle-outline" size={20} color="#fff" />
                <ThemedText style={styles.dangerButtonText}>
                  Annuler la consultation
                </ThemedText>
              </Pressable>
            </View>
          )}

          {/* Bouton fermer pour consultations terminées/annulées */}
          {!canModify && (
            <View style={[styles.actionsSection, { borderTopColor: borderColor }]}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.actionButton,
                  styles.primaryButton,
                  {
                    backgroundColor: tint,
                    opacity: pressed ? 0.8 : 1,
                  }
                ]}
              >
                <ThemedText style={styles.primaryButtonText}>Fermer</ThemedText>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingTop: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalTitle: {
    fontSize: 18,
  },
  closeButton: {
    padding: 4,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  headerSection: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
  },
  name: {
    fontSize: 24,
    textAlign: 'center',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  detailsSection: {
    gap: 16,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  detailIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailContent: {
    flex: 1,
    gap: 4,
  },
  detailLabel: {
    fontSize: 13,
    opacity: 0.6,
  },
  detailValue: {
    fontSize: 16,
  },
  notesSection: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    marginBottom: 20,
  },
  notesTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notesTitle: {
    fontSize: 16,
  },
  notesText: {
    fontSize: 15,
    lineHeight: 22,
    opacity: 0.85,
  },
  actionsSection: {
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  primaryButton: {
    // backgroundColor set dynamically
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
  },
  dangerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
