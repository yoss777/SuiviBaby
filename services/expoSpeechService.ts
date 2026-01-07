// services/ExpoSpeechService.ts
// Version Expo Speech Recognition (officiel)
import {
  ExpoSpeechRecognitionModule,
  addSpeechRecognitionListener,
} from "expo-speech-recognition";

export type TranscriptionMethod = 'expo' | 'manual';

class ExpoSpeechService {
  private transcription: string = '';
  private isListening: boolean = false;
  private listeners: any[] = [];

  /**
   * Vérifie la disponibilité
   */
  async isAvailable(): Promise<boolean> {
    try {
      const state = await ExpoSpeechRecognitionModule.getStateAsync();
      console.log('Speech state:', state);
      return state !== 'unavailable';
    } catch (error) {
      console.warn('Speech non disponible:', error);
      return false;
    }
  }

  /**
   * Demande les permissions
   */
  async requestPermissions(): Promise<boolean> {
    try {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      console.log('Permissions result:', result);
      return result.granted;
    } catch (error) {
      console.error('Erreur permissions:', error);
      return false;
    }
  }

  /**
   * Configure les listeners
   */
  setupListeners(callbacks: {
    onResult?: (text: string) => void;
    onError?: (error: any) => void;
    onEnd?: () => void;
  }) {
    this.removeListeners();

    if (callbacks.onResult) {
      const listener = addSpeechRecognitionListener('result', (event) => {
        console.log('Speech result event:', event);
        if (event.results && event.results.length > 0) {
          const result = event.results[0];
          if (result?.transcript) {
            this.transcription = result.transcript;
            if (result.isFinal) {
              callbacks.onResult!(result.transcript);
            }
          }
        }
      });
      this.listeners.push(listener);
    }

    if (callbacks.onError) {
      const listener = addSpeechRecognitionListener('error', (event) => {
        console.error('Speech error:', event);
        this.isListening = false;
        callbacks.onError!(event.error);
      });
      this.listeners.push(listener);
    }

    if (callbacks.onEnd) {
      const listener = addSpeechRecognitionListener('end', () => {
        console.log('Speech end');
        this.isListening = false;
        callbacks.onEnd!();
      });
      this.listeners.push(listener);
    }
  }

  /**
   * Démarre la reconnaissance
   */
  async startRecognition(languageCode: string = 'fr-FR'): Promise<void> {
    try {
      if (this.isListening) {
        console.warn('Déjà en écoute');
        return;
      }

      this.transcription = '';
      this.isListening = true;

      await ExpoSpeechRecognitionModule.start({
        lang: languageCode,
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        requiresOnDeviceRecognition: false,
        addsPunctuation: false,
        contextualStrings: ['biberon', 'tétée', 'pipi', 'popo', 'sommeil'],
      });

      console.log('🎤 Reconnaissance Expo démarrée');
    } catch (error) {
      this.isListening = false;
      console.error('Erreur démarrage:', error);
      throw error;
    }
  }

  /**
   * Arrête la reconnaissance
   */
  async stopRecognition(): Promise<string> {
    try {
      if (!this.isListening) {
        return this.transcription;
      }

      await ExpoSpeechRecognitionModule.stop();
      this.isListening = false;

      console.log('🛑 Reconnaissance arrêtée');
      return this.transcription;
    } catch (error) {
      console.error('Erreur arrêt:', error);
      return this.transcription;
    }
  }

  /**
   * Annule
   */
  async cancelRecognition(): Promise<void> {
    try {
      await ExpoSpeechRecognitionModule.abort();
      this.isListening = false;
      this.transcription = '';
    } catch (error) {
      console.error('Erreur annulation:', error);
    }
  }

  /**
   * Retire les listeners
   */
  removeListeners() {
    this.listeners.forEach(listener => {
      if (listener?.remove) listener.remove();
    });
    this.listeners = [];
  }

  /**
   * Cleanup
   */
  async destroy(): Promise<void> {
    try {
      this.removeListeners();
      if (this.isListening) {
        await this.stopRecognition();
      }
    } catch (error) {
      console.error('Erreur destroy:', error);
    }
  }

  getIsListening(): boolean {
    return this.isListening;
  }

  getTranscription(): string {
    return this.transcription;
  }
}

export default new ExpoSpeechService();