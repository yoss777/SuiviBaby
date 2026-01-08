// Bannière pour informer l'utilisateur de la migration
import { Colors } from '@/constants/theme';
import { useMigration } from '@/migration/MigrationProvider';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

interface MigrationBannerProps {
  childId: string;
}

export function MigrationBanner({ childId }: MigrationBannerProps) {
  const {
    phase,
    shouldShowMigrationBanner,
    startMigration,
    isMigrating,
    userId,
  } = useMigration();

  const [isStarting, setIsStarting] = useState(false);

  if (!shouldShowMigrationBanner) {
    return null;
  }

  const handleStartMigration = async () => {
    console.log('🔍 Debug Migration - userId:', userId);
    console.log('🔍 Debug Migration - childId:', childId);

    if (!userId) {
      Alert.alert('Erreur', 'Utilisateur non connecté. Veuillez vous reconnecter.');
      return;
    }

    Alert.alert(
      '🚀 Migration des données',
      'Cette opération va migrer toutes vos données vers une nouvelle structure plus performante.\n\n• Vos données actuelles restent intactes\n• L\'opération prend quelques secondes\n• L\'app sera plus rapide après\n\nContinuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Migrer maintenant',
          onPress: async () => {
            setIsStarting(true);
            try {
              await startMigration(userId, childId);
            } catch (error) {
              console.error('Erreur migration:', error);
            } finally {
              setIsStarting(false);
            }
          },
        },
      ]
    );
  };

  if (phase === 'NOT_STARTED') {
    return (
      <View style={styles.banner}>
        <View style={styles.content}>
          <Text style={styles.icon}>🚀</Text>
          <View style={styles.textContainer}>
            <Text style={styles.title}>Nouvelle version disponible</Text>
            <Text style={styles.description}>
              Migrez vos données pour une app plus rapide et performante
            </Text>
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={handleStartMigration}
          disabled={isStarting}
        >
          {isStarting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.buttonText}>Migrer</Text>
          )}
        </Pressable>
      </View>
    );
  }

  if (phase === 'DOUBLE_WRITE') {
    return (
      <View style={[styles.banner, styles.successBanner]}>
        <Text style={styles.icon}>✅</Text>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Migration réussie !</Text>
          <Text style={styles.description}>
            Votre app utilise maintenant la nouvelle structure
          </Text>
        </View>
      </View>
    );
  }

  if (isMigrating) {
    return (
      <View style={styles.banner}>
        <ActivityIndicator color={Colors.light.primary} />
        <Text style={[styles.title, { marginLeft: 12 }]}>
          Migration en cours...
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: Colors.light.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  successBanner: {
    backgroundColor: '#E8F5E9',
    borderLeftColor: '#4CAF50',
  },
  content: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 32,
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  description: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  button: {
    backgroundColor: Colors.light.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginLeft: 12,
    minWidth: 80,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
