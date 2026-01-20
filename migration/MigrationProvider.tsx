// Context React pour gérer la migration de manière centralisée

import { useAuth } from '@/contexts/AuthContext';
import { useModal } from '@/contexts/ModalContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  setMigrationConfig,
  type MigrationStats
} from './eventsDoubleWriteService';
import {
  setHybridConfig,
  type HybridStats
} from './eventsHybridService';
import { migrerToutesLesCollections, verifierMigration } from './migrationScript';

// ============================================
// TYPES
// ============================================

type MigrationPhase = 
  | 'NOT_STARTED'      // Pas encore migré
  | 'MIGRATING'        // Migration en cours
  | 'DOUBLE_WRITE'     // Double écriture active
  | 'VALIDATION'       // Phase de validation
  | 'COMPLETE';        // Migration terminée

interface MigrationState {
  phase: MigrationPhase;
  userId: string | null;
  childId: string | null;
  progress: number; // 0-100
  error: string | null;
  stats: {
    migration?: MigrationStats;
    hybrid?: HybridStats;
  };
  lastCheck: Date | null;
}

interface MigrationContextValue extends MigrationState {
  // Actions
  startMigration: (userId: string, childId: string) => Promise<void>;
  checkMigrationStatus: (userId: string, childId: string) => Promise<void>;
  advanceToNextPhase: () => Promise<void>;
  rollbackToOldSystem: () => void;
  resetMigration: () => Promise<void>;
  
  // Helpers
  isMigrating: boolean;
  canUseNewFeatures: boolean;
  shouldShowMigrationBanner: boolean;
}

// ============================================
// CONTEXT
// ============================================

const MigrationContext = createContext<MigrationContextValue | null>(null);

// ============================================
// STORAGE KEYS
// ============================================

const STORAGE_KEYS = {
  PHASE: '@migration_phase',
  USER_ID: '@migration_user_id',
  CHILD_ID: '@migration_child_id',
  STARTED_AT: '@migration_started_at',
  LAST_CHECK: '@migration_last_check',
};

// ============================================
// PROVIDER
// ============================================

export function MigrationProvider({ children }: { children: React.ReactNode }) {
  const { firebaseUser } = useAuth();
  const { showAlert } = useModal();

  const [state, setState] = useState<MigrationState>({
    phase: 'COMPLETE', // 🎯 MIGRATION TERMINÉE - Utilise uniquement le nouveau système
    userId: null,
    childId: null,
    progress: 100,
    error: null,
    stats: {},
    lastCheck: null,
  });

  // Mettre à jour userId quand l'utilisateur change
  useEffect(() => {
    if (firebaseUser?.uid) {
      console.log('✅ MigrationProvider - userId mis à jour:', firebaseUser.uid);
      setState(prev => ({ ...prev, userId: firebaseUser.uid }));
    } else {
      console.log('⚠️ MigrationProvider - Pas d\'utilisateur connecté');
    }
  }, [firebaseUser]);

  // ============================================
  // INITIALISATION
  // ============================================

  useEffect(() => {
    loadMigrationState();
  }, []);

  const loadMigrationState = async () => {
    try {
      const [phase, userId, childId, lastCheckStr] = await Promise.all([
        AsyncStorage.getItem(STORAGE_KEYS.PHASE),
        AsyncStorage.getItem(STORAGE_KEYS.USER_ID),
        AsyncStorage.getItem(STORAGE_KEYS.CHILD_ID),
        AsyncStorage.getItem(STORAGE_KEYS.LAST_CHECK),
      ]);

      const lastCheck = lastCheckStr ? new Date(lastCheckStr) : null;

      if (phase && userId && childId) {
        const storedPhase = phase as MigrationPhase;
        const effectivePhase =
          storedPhase === "COMPLETE" ? storedPhase : "COMPLETE";

        if (effectivePhase !== storedPhase) {
          await AsyncStorage.setItem(STORAGE_KEYS.PHASE, effectivePhase);
        }

        setState(prev => ({
          ...prev,
          phase: effectivePhase,
          userId,
          childId,
          lastCheck,
        }));

        // Configurer les services selon la phase
        configureServicesForPhase(effectivePhase);
      } else {
        configureServicesForPhase(state.phase);
      }
    } catch (error) {
      console.error('Erreur chargement état migration:', error);
    }
  };

  const saveMigrationState = async (newState: Partial<MigrationState>) => {
    try {
      if (newState.phase) {
        await AsyncStorage.setItem(STORAGE_KEYS.PHASE, newState.phase);
      }
      if (newState.userId) {
        await AsyncStorage.setItem(STORAGE_KEYS.USER_ID, newState.userId);
      }
      if (newState.childId) {
        await AsyncStorage.setItem(STORAGE_KEYS.CHILD_ID, newState.childId);
      }
      if (newState.lastCheck) {
        await AsyncStorage.setItem(
          STORAGE_KEYS.LAST_CHECK,
          newState.lastCheck.toISOString()
        );
      }
    } catch (error) {
      console.error('Erreur sauvegarde état migration:', error);
    }
  };

  // ============================================
  // CONFIGURATION DES SERVICES
  // ============================================

  const configureServicesForPhase = (phase: MigrationPhase) => {
    switch (phase) {
      case 'NOT_STARTED':
        // Utiliser l'ancien système uniquement
        setMigrationConfig({
          phase: 'OLD_ONLY',
          readFrom: 'OLD',
          failOnError: true,
        });
        setHybridConfig({
          mode: 'OLD_ONLY',
          preferSource: 'OLD',
          deduplicationWindow: 5000,
        });
        break;

      case 'MIGRATING':
        // Pendant la migration, rester sur OLD
        setMigrationConfig({
          phase: 'OLD_ONLY',
          readFrom: 'OLD',
          failOnError: true,
        });
        setHybridConfig({
          mode: 'OLD_ONLY',
          preferSource: 'OLD',
          deduplicationWindow: 5000,
        });
        break;

      case 'DOUBLE_WRITE':
        // Double écriture + lecture hybride
        setMigrationConfig({
          phase: 'DOUBLE_WRITE',
          readFrom: 'NEW',
          failOnError: false, // Ne pas bloquer si OLD échoue
        });
        setHybridConfig({
          mode: 'HYBRID',
          preferSource: 'NEW',
          deduplicationWindow: 5000,
        });
        break;

      case 'VALIDATION':
        // Toujours double écriture, lecture NEW_ONLY pour vraiment tester
        setMigrationConfig({
          phase: 'DOUBLE_WRITE',
          readFrom: 'NEW',
          failOnError: false,
        });
        setHybridConfig({
          mode: 'NEW_ONLY', // Tester la lecture depuis NEW uniquement
          preferSource: 'NEW',
          deduplicationWindow: 5000,
        });
        break;

      case 'COMPLETE':
        // Utiliser uniquement le nouveau système
        setMigrationConfig({
          phase: 'NEW_ONLY',
          readFrom: 'NEW',
          failOnError: true,
        });
        setHybridConfig({
          mode: 'NEW_ONLY',
          preferSource: 'NEW',
          deduplicationWindow: 5000,
        });
        break;
    }

    console.log(`🔧 Configuration pour phase: ${phase}`);
  };

  // ============================================
  // ACTIONS
  // ============================================

  const startMigration = async (userId: string, childId: string) => {
    // Protection anti-double-clic
    if (state.phase === 'MIGRATING') {
      console.log('⚠️ Migration déjà en cours, ignorer');
      return;
    }

    try {
      setState(prev => ({
        ...prev,
        phase: 'MIGRATING',
        userId,
        childId,
        progress: 0,
        error: null,
      }));

      await saveMigrationState({
        phase: 'MIGRATING',
        userId,
        childId,
      });

      configureServicesForPhase('MIGRATING');

      // Lancer la migration
      console.log('🚀 Début migration pour', { userId, childId });
      
      const result = await migrerToutesLesCollections(userId, childId);

      console.log('✅ Migration terminée:', result);

      // Passer en phase DOUBLE_WRITE
      const newState = {
        phase: 'DOUBLE_WRITE' as MigrationPhase,
        progress: 100,
        stats: { migration: result },
        lastCheck: new Date(),
      };

      setState(prev => ({ ...prev, ...newState }));
      await saveMigrationState(newState);
      
      configureServicesForPhase('DOUBLE_WRITE');

      showAlert(
        '✅ Migration réussie !',
        `${result.success} événements migrés avec succès.\n\nL'app utilise maintenant le nouveau système.`,
        [{ text: 'OK' }]
      );

    } catch (error) {
      console.error('❌ Erreur migration:', error);
      
      setState(prev => ({
        ...prev,
        phase: 'NOT_STARTED',
        error: (error as Error).message,
        progress: 0,
      }));

      showAlert(
        '❌ Erreur de migration',
        `La migration a échoué: ${(error as Error).message}\n\nL'app continue d'utiliser l'ancien système.`,
        [{ text: 'OK' }]
      );

      // Rollback
      configureServicesForPhase('NOT_STARTED');
    }
  };

  const checkMigrationStatus = async (userId: string, childId: string) => {
    try {
      const status = await verifierMigration(userId, childId);
      
      console.log('📊 Statut migration:', status);

      setState(prev => ({
        ...prev,
        lastCheck: new Date(),
      }));

      await saveMigrationState({ lastCheck: new Date() });

      return status;
    } catch (error) {
      console.error('Erreur vérification migration:', error);
      throw error;
    }
  };

  const advanceToNextPhase = async () => {
    const { phase } = state;

    let nextPhase: MigrationPhase;
    let message = '';

    switch (phase) {
      case 'DOUBLE_WRITE':
        nextPhase = 'VALIDATION';
        message = 'Phase de validation activée. L\'app lit uniquement depuis le nouveau système.';
        break;

      case 'VALIDATION':
        nextPhase = 'COMPLETE';
        message = 'Migration complète ! Vous pouvez supprimer les anciennes collections.';
        break;

      default:
        showAlert('Info', 'Impossible d\'avancer à la phase suivante.');
        return;
    }

    showAlert(
      'Confirmer la progression',
      `Passer de "${phase}" à "${nextPhase}" ?\n\n${message}`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            setState(prev => ({ ...prev, phase: nextPhase }));
            await saveMigrationState({ phase: nextPhase });
            configureServicesForPhase(nextPhase);

            showAlert('✅ Phase mise à jour', message);
          },
        },
      ]
    );
  };

  const rollbackToOldSystem = () => {
    showAlert(
      '⚠️ Rollback',
      'Revenir à l\'ancien système ? Les nouvelles données ne seront plus visibles.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          style: 'destructive',
          onPress: async () => {
            setState(prev => ({ ...prev, phase: 'NOT_STARTED' }));
            await saveMigrationState({ phase: 'NOT_STARTED' });
            configureServicesForPhase('NOT_STARTED');

            showAlert('✅ Rollback effectué', 'L\'app utilise l\'ancien système.');
          },
        },
      ]
    );
  };

  const resetMigration = async () => {
    showAlert(
      '⚠️ Réinitialiser',
      'Réinitialiser complètement la migration ? Cette action ne supprime pas les données.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
            
            setState({
              phase: 'NOT_STARTED',
              userId: null,
              childId: null,
              progress: 0,
              error: null,
              stats: {},
              lastCheck: null,
            });

            configureServicesForPhase('NOT_STARTED');

            showAlert('✅ Réinitialisé', 'État de migration réinitialisé.');
          },
        },
      ]
    );
  };

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const isMigrating = state.phase === 'MIGRATING';
  
  const canUseNewFeatures = ['DOUBLE_WRITE', 'VALIDATION', 'COMPLETE'].includes(
    state.phase
  );

  const shouldShowMigrationBanner =
    state.phase === 'NOT_STARTED' || state.phase === 'DOUBLE_WRITE';

  // ============================================
  // CONTEXT VALUE
  // ============================================

  const value: MigrationContextValue = {
    ...state,
    startMigration,
    checkMigrationStatus,
    advanceToNextPhase,
    rollbackToOldSystem,
    resetMigration,
    isMigrating,
    canUseNewFeatures,
    shouldShowMigrationBanner,
  };

  return (
    <MigrationContext.Provider value={value}>
      {children}
    </MigrationContext.Provider>
  );
}

// ============================================
// HOOK
// ============================================

export function useMigration() {
  const context = useContext(MigrationContext);
  if (!context) {
    throw new Error('useMigration doit être utilisé dans MigrationProvider');
  }
  return context;
}
