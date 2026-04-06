// hooks/useAudioRecorder.ts
// Audio recording concerns: permissions, start/stop recording, cancel.
import { useState } from "react";
import VoiceCommandService from "@/services/voiceCommandService";

export interface AudioRecorderState {
  isRecording: boolean;
}

export interface AudioRecorderActions {
  /** Request mic permission, start recording. Returns true if recording started. */
  startRecording: () => Promise<"started" | "no-permission" | "error">;
  /** Stop recording, return the audio URI (or null). */
  stopRecording: () => Promise<string | null>;
  /** Cancel an in-progress recording without processing. */
  cancelRecording: () => Promise<void>;
}

export function useAudioRecorder(): AudioRecorderState & AudioRecorderActions {
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = async (): Promise<"started" | "no-permission" | "error"> => {
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
      console.error("Erreur démarrage commande vocale:", error);
      setIsRecording(false);
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
