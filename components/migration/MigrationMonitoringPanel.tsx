/**
 * Panel de monitoring pour la phase VALIDATION
 * Affiche les statistiques et permet de lancer des vérifications
 */

import { Colors } from '@/constants/theme';
import { useModal } from '@/contexts/ModalContext';
import { MigrationLogger } from '@/migration/monitoringLogger';
import type { FullSyncReport } from '@/migration/verifySync';
import { generateReport, verifyFullSync } from '@/migration/verifySync';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';

interface Props {
  childId: string;
}

export function MigrationMonitoringPanel({ childId }: Props) {
  const { showAlert } = useModal();
  const [stats, setStats] = useState<any>(null);
  const [syncReport, setSyncReport] = useState<FullSyncReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'24h' | '7d' | 'total'>('24h');

  useEffect(() => {
    loadStats();
  }, [activeTab]);

  const loadStats = async () => {
    try {
      const hours = activeTab === '24h' ? 24 : activeTab === '7d' ? 168 : undefined;
      const logStats = await MigrationLogger.getStats(hours);
      setStats(logStats);
    } catch (error) {
      console.error('Erreur chargement stats:', error);
    }
  };

  const handleVerifySync = async () => {
    setLoading(true);
    try {
      const report = await verifyFullSync(childId);
      setSyncReport(report);

      const reportText = generateReport(report);
      console.log(reportText);

      showAlert(
        '✅ Vérification Terminée',
        `Taux de synchronisation: ${report.summary.overallSyncRate.toFixed(2)}%\n\n` +
          `Synchronisés: ${report.summary.totalBoth}\n` +
          `OLD seul: ${report.summary.totalOldOnly}\n` +
          `NEW seul: ${report.summary.totalNewOnly}`,
        [
          { text: 'OK' },
          {
            text: 'Voir Détails',
            onPress: () => console.log(reportText),
          },
        ]
      );
    } catch (error) {
      showAlert('❌ Erreur', (error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLogReport = async () => {
    try {
      const hours = activeTab === '24h' ? 24 : activeTab === '7d' ? 168 : undefined;
      const report = await MigrationLogger.generateReport(hours);
      console.log(report);
      showAlert('📊 Rapport Généré', 'Le rapport a été affiché dans la console.');
    } catch (error) {
      showAlert('❌ Erreur', (error as Error).message);
    }
  };

  const handleClearLogs = () => {
    showAlert(
      '⚠️ Effacer les Logs',
      'Cette action est irréversible. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Effacer',
          style: 'destructive',
          onPress: async () => {
            await MigrationLogger.clearLogs();
            await loadStats();
            showAlert('✅', 'Logs effacés');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>📊 Monitoring VALIDATION</Text>

      {/* Tabs de période */}
      <View style={styles.tabs}>
        <Pressable
          style={[styles.tab, activeTab === '24h' && styles.tabActive]}
          onPress={() => setActiveTab('24h')}
        >
          <Text style={[styles.tabText, activeTab === '24h' && styles.tabTextActive]}>
            24h
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === '7d' && styles.tabActive]}
          onPress={() => setActiveTab('7d')}
        >
          <Text style={[styles.tabText, activeTab === '7d' && styles.tabTextActive]}>
            7 jours
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'total' && styles.tabActive]}
          onPress={() => setActiveTab('total')}
        >
          <Text style={[styles.tabText, activeTab === 'total' && styles.tabTextActive]}>
            Total
          </Text>
        </Pressable>
      </View>

      {/* Statistiques des Logs */}
      {stats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Opérations de Double-Write</Text>
          <View style={styles.card}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Total:</Text>
              <Text style={styles.statValue}>{stats.totalOperations}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>✅ Succès:</Text>
              <Text style={[styles.statValue, styles.successText]}>
                {stats.successCount}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>❌ Erreurs:</Text>
              <Text style={[styles.statValue, styles.errorText]}>
                {stats.errorCount}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>⚠️ Partielles:</Text>
              <Text style={[styles.statValue, styles.warningText]}>
                {stats.partialCount}
              </Text>
            </View>
            <View style={[styles.statRow, styles.divider]}>
              <Text style={[styles.statLabel, styles.bold]}>Taux de Réussite:</Text>
              <Text
                style={[
                  styles.statValue,
                  styles.bold,
                  stats.successRate >= 99
                    ? styles.successText
                    : stats.successRate >= 95
                    ? styles.warningText
                    : styles.errorText,
                ]}
              >
                {stats.successRate.toFixed(2)}%
              </Text>
            </View>

            {stats.errorCount + stats.partialCount > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 12, fontSize: 14 }]}>
                  Erreurs par Type
                </Text>
                {Object.entries(stats.errorsByType).map(([type, count]) => (
                  <View key={type} style={styles.statRow}>
                    <Text style={styles.subLabel}>• {type}:</Text>
                    <Text style={styles.statValue}>{count as number}</Text>
                  </View>
                ))}
              </>
            )}

            {stats.lastError && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 12, fontSize: 14 }]}>
                  Dernière Erreur
                </Text>
                <Text style={styles.errorDetail}>
                  {new Date(stats.lastError.timestamp).toLocaleString('fr-FR')}
                  {'\n'}
                  {stats.lastError.type} - {stats.lastError.operation}
                  {'\n'}
                  {stats.lastError.error}
                </Text>
              </>
            )}
          </View>
        </View>
      )}

      {/* Rapport de Synchronisation */}
      {syncReport && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Synchronisation des IDs</Text>
          <View style={styles.card}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>✅ Synchronisés:</Text>
              <Text style={[styles.statValue, styles.successText]}>
                {syncReport.summary.totalBoth}
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>📦 OLD seul:</Text>
              <Text style={styles.statValue}>{syncReport.summary.totalOldOnly}</Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>⚠️ NEW seul:</Text>
              <Text style={[styles.statValue, styles.errorText]}>
                {syncReport.summary.totalNewOnly}
              </Text>
            </View>
            <View style={[styles.statRow, styles.divider]}>
              <Text style={[styles.statLabel, styles.bold]}>Taux de Sync:</Text>
              <Text
                style={[
                  styles.statValue,
                  styles.bold,
                  syncReport.summary.overallSyncRate >= 99
                    ? styles.successText
                    : syncReport.summary.overallSyncRate >= 95
                    ? styles.warningText
                    : styles.errorText,
                ]}
              >
                {syncReport.summary.overallSyncRate.toFixed(2)}%
              </Text>
            </View>

            <Text style={[styles.sectionTitle, { marginTop: 12, fontSize: 14 }]}>
              Détails par Type
            </Text>
            {[
              { name: 'Tétées', data: syncReport.tetees },
              { name: 'Mictions', data: syncReport.mictions },
              { name: 'Selles', data: syncReport.selles },
              { name: 'Pompages', data: syncReport.pompages },
              { name: 'Vaccins', data: syncReport.vaccins },
              { name: 'Vitamines', data: syncReport.vitamines },
            ].map(({ name, data }) => (
              <View key={name} style={styles.typeRow}>
                <Text style={styles.typeName}>{name}</Text>
                <Text style={styles.typeValue}>
                  {data.both.length}/{data.totalOld} ({data.syncRate.toFixed(0)}%)
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions de Vérification</Text>

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.primaryButton,
            pressed && styles.buttonPressed,
            loading && styles.buttonDisabled,
          ]}
          onPress={handleVerifySync}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>🔍 Vérifier Synchronisation IDs</Text>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.secondaryButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleGenerateLogReport}
        >
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>
            📄 Générer Rapport Logs
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.secondaryButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={loadStats}
        >
          <Text style={[styles.buttonText, styles.secondaryButtonText]}>
            🔄 Actualiser Stats
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.actionButton,
            styles.dangerButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleClearLogs}
        >
          <Text style={styles.buttonText}>🗑️ Effacer Logs</Text>
        </Pressable>
      </View>

      {/* Info */}
      <View style={styles.section}>
        <View style={styles.infoCard}>
          <Text style={styles.infoText}>
            💡 <Text style={styles.bold}>Conseils:</Text>
            {'\n\n'}
            • Vérifiez quotidiennement les stats
            {'\n'}
            • Taux de réussite attendu: {'>'} 99%
            {'\n'}
            • NEW seul doit rester à 0
            {'\n'}
            • OLD seul = données avant migration (normal)
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#fff',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  tabTextActive: {
    color: Colors.light.primary,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  subLabel: {
    fontSize: 13,
    color: '#999',
    marginLeft: 8,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    marginTop: 8,
    paddingTop: 12,
  },
  bold: {
    fontWeight: '700',
  },
  successText: {
    color: '#4CAF50',
  },
  errorText: {
    color: '#F44336',
  },
  warningText: {
    color: '#FF9800',
  },
  errorDetail: {
    fontSize: 12,
    color: '#F44336',
    marginTop: 4,
    padding: 8,
    backgroundColor: '#FFEBEE',
    borderRadius: 6,
  },
  typeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  typeName: {
    fontSize: 13,
    color: '#666',
  },
  typeValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  actionButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
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
  dangerButton: {
    backgroundColor: '#F44336',
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  secondaryButtonText: {
    color: Colors.light.primary,
  },
  infoCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
  },
  infoText: {
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 20,
  },
});
