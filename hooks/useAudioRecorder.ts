// hooks/useAudioRecorder.ts
// Audio recording concerns: permissions, start/stop recording, cancel.
import { useState } from "react";
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

  const startRecording = async (): Promise<"started" | "no-permission" | "permission-denied-permanent" | "error"> => {
    try {
      const hasPermission = await VoiceCommandService.requestPermissions();
      if (!hasPermission) {
        return "no-permission";
      }

      setIsRecording(true);
      await VoiceCommandService.startRecording();
      console.log("🎤 Enregistrement démarré - Parlez maintenant");
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
      console.log("🎤 Enregistrement arrêté, traitement en cours...");
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
        await VoiceCommandService.stopRecording();
        setIsRecording(false);
        console.log("🚫 Enregistrement annulé");
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
