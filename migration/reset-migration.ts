// Script temporaire pour réinitialiser la migration manuellement
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function resetMigrationManual() {
  const STORAGE_KEYS = {
    PHASE: '@migration_phase',
    USER_ID: '@migration_user_id',
    CHILD_ID: '@migration_child_id',
    STARTED_AT: '@migration_started_at',
    LAST_CHECK: '@migration_last_check',
  };

  try {
    await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
    console.log('✅ Migration réinitialisée avec succès');
    console.log('🔄 Redémarrez l\'app pour voir les changements');
    return true;
  } catch (error) {
    console.error('❌ Erreur lors du reset:', error);
    return false;
  }
}

// Utilisation :
// import { resetMigrationManual } from './migration/reset-migration';
// await resetMigrationManual();
