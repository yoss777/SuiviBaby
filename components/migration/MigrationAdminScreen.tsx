// Écran admin pour gérer la migration (à mettre dans Settings par exemple)
import { Colors } from '@/constants/theme';
import { useMigration } from '@/migration/MigrationProvider';
import { verifierMigration } from '@/migration/migrationScript';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import { MigrationMonitoringPanel } from './MigrationMonitoringPanel';

interface MigrationAdminScreenProps {
  childId: string;
}

export function MigrationAdminScreen({ childId }: MigrationAdminScreenProps) {
  const {
    phase,
    userId,
    progress,
    error,
    stats,
    lastCheck,
    isMigrating,
    canUseNewFeatures,
    startMigration,
    checkMigrationStatus,
    advanceToNextPhase,
    rollbackToOldSystem,
    resetMigration,
  } = useMigration();

  const [checking, setChecking] = useState(false);
  const [verificationResult, setVerificationResult] = useState<any>(null);

  const handleCheckStatus = async () => {
    if (!userId) return;

    setChecking(true);
    try {
      const result = await verifierMigration(userId, childId);
      setVerificationResult(result);
      Alert.alert(
        '✅ Vérification terminée',
        `Events migrés: ${result.eventCount}\n` +
          Object.entries(result.oldCollectionsCount)
            .map(([coll, count]) => `${coll}: ${count}`)
            .join('\n')
      );
    } catch (error) {
      Alert.alert('❌ Erreur', (error as Error).message);
      console.error('Erreur lors de la vérification de la migration:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleStartMigration = async () => {
    if (!userId) return;

    Alert.alert(
      '⚠️ Démarrer la migration',
      'Cette opération va migrer toutes les données. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Migrer',
          onPress: async () => {
            try {
              await startMigration(userId, childId);
            } catch (error) {
              console.error('Erreur:', error);
            }
          },
        },
      ]
    );
  };

  const getPhaseColor = (currentPhase: string) => {
    switch (currentPhase) {
      case 'NOT_STARTED':
        return '#9E9E9E';
      case 'MIGRATING':
        return '#FF9800';
      case 'DOUBLE_WRITE':
        return '#2196F3';
      case 'VALIDATION':
        return '#FFC107';
      case 'COMPLETE':
        return '#4CAF50';
      default:
        return '#9E9E9E';
    }
  };

  const getPhaseLabel = (currentPhase: string) => {
    switch (currentPhase) {
      case 'NOT_STARTED':
        return '🔴 Non démarrée';
      case 'MIGRATING':
        return '🟡 Migration en cours';
      case 'DOUBLE_WRITE':
        return '🔵 Double écriture';
      case 'VALIDATION':
        return '🟠 Validation';
      case 'COMPLETE':
        return '🟢 Terminée';
      default:
        return currentPhase;
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>État de la Migration</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>Phase actuelle:</Text>
            <View
              style={[
                styles.phaseBadge,
                { backgroundColor: getPhaseColor(phase) },
              ]}
            >
              <Text style={styles.phaseText}>{getPhaseLabel(phase)}</Text>
            </View>
          </View>

          {isMigrating && (
            <View style={styles.row}>
              <Text style={styles.label}>Progression:</Text>
              <Text style={styles.value}>{progress}%</Text>
            </View>
          )}

          <View style={styles.row}>
            <Text style={styles.label}>Nouveau système:</Text>
            <Text style={styles.value}>
              {canUseNewFeatures ? '✅ Actif' : '❌ Inactif'}
            </Text>
          </View>

          {lastCheck && (
            <View style={styles.row}>
              <Text style={styles.label}>Dernière vérif:</Text>
              <Text style={styles.value}>
                {new Date(lastCheck).toLocaleString('fr-FR')}
              </Text>
            </View>
          )}

          {error && (
            <View style={[styles.row, styles.errorRow]}>
              <Text style={styles.errorText}>❌ {error}</Text>
            </View>
          )}
        </View>
      </View>

      {verificationResult && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Résultat Vérification</Text>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.label}>Events migrés:</Text>
              <Text style={styles.value}>{verificationResult.eventCount}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Statut:</Text>
              <Text style={styles.value}>
                {verificationResult.migrated ? '✅ OK' : '⚠️ Incomplet'}
              </Text>
            </View>
            <Text style={[styles.label, { marginTop: 12 }]}>
              Anciennes collections:
            </Text>
            {Object.entries(verificationResult.oldCollectionsCount).map(
              ([coll, count]) => (
                <View key={coll} style={styles.row}>
                  <Text style={styles.subLabel}>• {coll}:</Text>
                  <Text style={styles.value}>{count as number}</Text>
                </View>
              )
            )}
          </View>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>

        {phase === 'NOT_STARTED' && (
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleStartMigration}
          >
            <Text style={styles.buttonText}>🚀 Démarrer la Migration</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.secondaryButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleCheckStatus}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator color={Colors.light.primary} />
          ) : (
            <Text style={[styles.buttonText, styles.secondaryButtonText]}>
              🔍 Vérifier l'Intégrité
            </Text>
          )}
        </Pressable>

        {['DOUBLE_WRITE', 'VALIDATION'].includes(phase) && (
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.successButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={advanceToNextPhase}
          >
            <Text style={styles.buttonText}>➡️ Phase Suivante</Text>
          </Pressable>
        )}

        {phase !== 'NOT_STARTED' && phase !== 'COMPLETE' && (
          <Pressable
            style={({ pressed }) => [
              styles.actionButton,
              styles.dangerButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={rollbackToOldSystem}
          >
            <Text style={styles.buttonText}>⏮️ Rollback (Ancien Système)</Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.warningButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={resetMigration}
        >
          <Text style={styles.buttonText}>🔄 Réinitialiser la Migration</Text>
        </Pressable>
      </View>

      {/* Panel de Monitoring (affiché en phase DOUBLE_WRITE et VALIDATION) */}
      {['DOUBLE_WRITE', 'VALIDATION'].includes(phase) && (
        <MigrationMonitoringPanel childId={childId} />
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Informations</Text>
        <View style={styles.card}>
          <Text style={styles.infoText}>
            🔹 <Text style={styles.bold}>NOT_STARTED:</Text> Ancien système
            uniquement{'\n'}
            🔹 <Text style={styles.bold}>MIGRATING:</Text> Migration des
            données historiques{'\n'}
            🔹 <Text style={styles.bold}>DOUBLE_WRITE:</Text> Écriture dans OLD
            + NEW{'\n'}
            🔹 <Text style={styles.bold}>VALIDATION:</Text> Lecture depuis NEW
            uniquement{'\n'}
            🔹 <Text style={styles.bold}>COMPLETE:</Text> Nouveau système
            uniquement
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  section: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  subLabel: {
    fontSize: 13,
    color: '#888',
    marginLeft: 8,
  },
  value: {
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '600',
  },
  phaseBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  phaseText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  errorRow: {
    backgroundColor: '#FFEBEE',
    padding: 8,
    borderRadius: 6,
    marginTop: 4,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 13,
  },
  actionButton: {
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: Colors.light.primary,
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: Colors.light.primary,
  },
  successButton: {
    backgroundColor: '#4CAF50',
  },
  dangerButton: {
    backgroundColor: '#F44336',
  },
  warningButton: {
    backgroundColor: '#FF9800',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: Colors.light.primary,
  },
  infoText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
    color: '#1A1A1A',
  },
});
