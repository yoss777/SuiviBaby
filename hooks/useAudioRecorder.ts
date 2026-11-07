// hooks/useAudioRecorder.ts
// Audio recording concerns: permissions, start/stop recording, cancel.
import { useEffect, useRef, useState } from "react";
import VoiceCommandService from "@/services/voiceCommandService";
import { VoicePermissionDeniedError } from "@/services/voice/recorder";

export interface AudioRecorderState {
  isRecording: boolean;
}

export interface AudioRecorderActions {
  /**
   * Request mic permission, start recording. Returns:
   *   - "started" : recording in progress.
   *   - "no-permission" : permission missing AND we can still re-ask
   *     (UI should re-prompt or explain).
   *   - "permission-denied-permanent" : T3.2 — OS won't show the prompt
   *     anymore (user revoked from Settings). UI should deep-link to
   *     Settings instead of re-prompting.
   *   - "error" : generic failure (audio module missing, hardware issue).
   */
  startRecording: () => Promise<"started" | "no-permission" | "permission-denied-permanent" | "error">;
  /** Stop recording, return the audio URI (or null). */
  stopRecording: () => Promise<string | null>;
  /** Cancel an in-progress recording without processing. */
  cancelRecording: () => Promise<void>;
}

export function useAudioRecorder(): AudioRecorderState & AudioRecorderActions {
  const [isRecording, setIsRecording] = useState(false);
  // Miroir synchrone de isRecording pour le nettoyage au démontage.
  const isRecordingRef = useRef(false);
  isRecordingRef.current = isRecording;

  // Démontage : on ne laisse jamais le micro ouvert ni un fichier audio
  // temporaire sur le disque (promesse du texte de confidentialité).
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (isRecordingRef.current) {
        void VoiceCommandService.cancelRecording().catch((error) => {
          console.warn("Nettoyage de l'enregistrement au démontage impossible:", error);
        });
      }
    };
  }, []);

  const startRecording = async (): Promise<"started" | "no-permission" | "permission-denied-permanent" | "error"> => {
    try {
      const hasPermission = await VoiceCommandService.requestPermissions();
      if (!hasPermission) {
        return "no-permission";
      }

      // Écran quitté pendant la demande de permission : ne pas démarrer le micro.
      if (unmountedRef.current) return "error";

      setIsRecording(true);
      isRecordingRef.current = true;
      await VoiceCommandService.startRecording();
      if (unmountedRef.current) {
        // Démonté pendant le démarrage : le nettoyage a pu passer avant.
        await VoiceCommandService.cancelRecording();
        return "error";
      }
      if (__DEV__) console.log("🎤 Enregistrement démarré - Parlez maintenant");
      return "started";
    } catch (error) {
      setIsRecording(false);
      // T3.2 — permission revoked between requestPermissions() above and
      // the actual startRecording. Surface the distinction so the UI can
      // route to Settings if the user can no longer be re-asked.
      if (error instanceof VoicePermissionDeniedError) {
        return error.canAskAgain ? "no-permission" : "permission-denied-permanent";
      }
      console.error("Erreur démarrage commande vocale:", error);
      return "error";
    }
  };

  const stopRecording = async (): Promise<string | null> => {
    try {
      if (!isRecording) return null;
      setIsRecording(false);
      const audioUri = await VoiceCommandService.stopRecording();
      if (__DEV__) console.log("🎤 Enregistrement arrêté, traitement en cours...");
      return audioUri;
    } catch (error) {
      console.error("Erreur arrêt enregistrement:", error);
      setIsRecording(false);
      return null;
    }
  };

  const cancelRecording = async () => {
    try {
      if (isRecording) {
        setIsRecording(false);
        // Arrête le micro ET supprime le fichier audio temporaire.
        await VoiceCommandService.cancelRecording();
        if (__DEV__) console.log("🚫 Enregistrement annulé");
      }
    } catch (error) {
      console.error("Erreur annulation:", error);
    }
  };

  return {
    isRecording,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}
