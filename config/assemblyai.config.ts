// config/assemblyai.config.ts
import Constants from 'expo-constants';
import VoiceCommandService from '@/services/voiceCommandService';

// Configuration de l'API Key AssemblyAI
// Option 1: Via variables d'environnement (recommandé)
const ASSEMBLYAI_API_KEY =
  process.env.EXPO_PUBLIC_ASSEMBLYAI_API_KEY ||
  Constants.expoConfig?.extra?.assemblyAiApiKey ||
  Constants.manifest?.extra?.assemblyAiApiKey ||
  '';

// Option 2: Configuration manuelle (pour le développement uniquement)
// const ASSEMBLYAI_API_KEY = 'votre_clé_api_ici';

// Initialiser le service avec la clé API
if (ASSEMBLYAI_API_KEY) {
  VoiceCommandService.setApiKey(ASSEMBLYAI_API_KEY);
  console.log('✅ AssemblyAI configuré');
} else {
  console.warn('⚠️ AssemblyAI non configuré - Mode test uniquement');
}

if (__DEV__) {
  console.log('[assemblyai] apiKey loaded:', ASSEMBLYAI_API_KEY ? 'yes' : 'no');
}

export { ASSEMBLYAI_API_KEY };
