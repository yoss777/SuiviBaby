import { functions } from "@/config/firebase";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system";
import { httpsCallable } from "firebase/functions";
import { captureServiceError } from "@/utils/errorReporting";

let recording: Audio.Recording | null = null;

function isAudioAvailable(): boolean {
  return !!Audio?.requestPermissionsAsync && !!Audio?.Recording?.createAsync;
}

/**
 * Demande les permissions audio
 */
export async function requestPermissions(): Promise<boolean> {
  try {
    if (!isAudioAvailable()) {
      console.error("Module audio indisponible. Vérifiez expo-av.");
      return false;
    }
    const { status } = await Audio.requestPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("Erreur permissions audio:", error);
    captureServiceError(error, { service: "voiceRecorder", operation: "requestPermissions" });
    return false;
  }
}

/**
 * Démarre l'enregistrement audio
 */
export async function startRecording(): Promise<void> {
  try {
    if (recording) {
      console.warn("Enregistrement déjà en cours, démarrage ignoré.");
      return;
    }
    if (!isAudioAvailable()) {
      throw new Error("Module audio indisponible. Vérifiez expo-av.");
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const result = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY
    );

    recording = result.recording;
    console.log("Enregistrement démarré");
  } catch (error) {
    console.error("Erreur démarrage enregistrement:", error);
    captureServiceError(error, { service: "voiceRecorder", operation: "startRecording" });
    throw error;
  }
}

/**
 * Arrête l'enregistrement et retourne l'URI du fichier
 */
export async function stopRecording(): Promise<string | null> {
  try {
    if (!recording) {
      console.warn("Aucun enregistrement en cours, arrêt ignoré.");
      return null;
    }

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    recording = null;

    console.log("Enregistrement arrêté:", uri);
    return uri;
  } catch (error) {
    console.error("Erreur arrêt enregistrement:", error);
    captureServiceError(error, { service: "voiceRecorder", operation: "stopRecording" });
    return null;
  }
}

/**
 * Transcrit l'audio en texte via Cloud Function proxy (AssemblyAI)
 * L'API key reste côté serveur — jamais exposée dans le bundle client.
 */
export async function transcribeAudio(audioUri: string): Promise<string> {
  try {
    const audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const transcribe = httpsCallable<
      { audioBase64: string },
      { text: string }
    >(functions, "transcribeAudio");

    const result = await transcribe({ audioBase64 });
    return result.data.text || "";
  } catch (error: any) {
    if (error?.code === "functions/resource-exhausted") {
      throw new Error(error.message || "Limite de transcriptions atteinte.");
    }
    if (error?.code === "functions/unauthenticated") {
      throw new Error("Vous devez être connecté pour utiliser la voix.");
    }
    throw error;
  }
}

/**
 * La transcription passe désormais par Cloud Function.
 * Toujours disponible si l'utilisateur est authentifié.
 */
export function hasApiKey(): boolean {
  return true;
}
