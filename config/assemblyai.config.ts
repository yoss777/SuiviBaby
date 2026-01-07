// config/assemblyai.config.ts
import VoiceCommandService from '@/services/voiceCommandService';

// Configuration de l'API Key AssemblyAI
// Option 1: Via variables d'environnement (recommandé)
const ASSEMBLYAI_API_KEY = process.env.EXPO_PUBLIC_ASSEMBLYAI_API_KEY || '';

// Option 2: Configuration manuelle (pour le développement uniquement)
// const ASSEMBLYAI_API_KEY = 'votre_clé_api_ici';

// Initialiser le service avec la clé API
if (ASSEMBLYAI_API_KEY) {
  VoiceCommandService.setApiKey(ASSEMBLYAI_API_KEY);
  console.log('✅ AssemblyAI configuré');
} else {
  console.warn('⚠️ AssemblyAI non configuré - Mode test uniquement');
}

export { ASSEMBLYAI_API_KEY };
