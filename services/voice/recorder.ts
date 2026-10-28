import { functions } from "@/config/firebase";
import {
  AudioModule,
  getRecordingPermissionsAsync,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioRecorder,
  type RecordingOptions,
} from "expo-audio";
import * as FileSystem from "expo-file-system";
import { httpsCallable } from "firebase/functions";
import { Platform } from "react-native";
import { captureServiceError } from "@/utils/errorReporting";

let recording: AudioRecorder | null = null;

/**
 * Flatten a preset for the current platform, as expo-audio's own
 * useAudioRecorder does before calling the constructor (that helper isn't
 * exported). Passing the nested preset as-is would silently drop the
 * ios/android encoder settings. Copied from expo-audio 0.4.9
 * (build/utils/options.js) — re-check on upgrade. The cast is needed because
 * the native constructor takes the flat per-platform shape, which
 * RecordingOptions doesn't describe.
 */
function platformRecordingOptions(preset: RecordingOptions): Partial<RecordingOptions> {
  const common = {
    extension: preset.extension,
    sampleRate: preset.sampleRate,
    numberOfChannels: preset.numberOfChannels,
    bitRate: preset.bitRate,
    isMeteringEnabled: preset.isMeteringEnabled ?? false,
  };
  if (Platform.OS === "ios") return { ...common, ...preset.ios } as Partial<RecordingOptions>;
  if (Platform.OS === "android") return { ...common, ...preset.android } as Partial<RecordingOptions>;
  return common;
}

/**
 * T3.3 — minimum useful audio size before we even try to transcribe.
 * HIGH_QUALITY preset records at ~16 KB/s; under 5 KB raw means well below
 * a half-second of actual audio (or a silent tap). Filter client-side to
 * avoid spending the user's daily quota on empty captures, then mirror the
 * same check on the CF for defense in depth.
 */
const MIN_AUDIO_BYTES = 5_000;

/**
 * Custom error type that callers can match on to distinguish "no useful
 * audio" from generic transcription failures. Lets the UI prompt the user
 * to retry without burning a quota slot.
 */
export class EmptyAudioError extends Error {
  constructor(message = "Aucun son détecté. Réessayez en parlant plus fort ou plus longtemps.") {
    super(message);
    this.name = "EmptyAudioError";
  }
}

/**
 * Thrown by startRecording when the OS reports the microphone permission
 * as not granted at record-time (T3.2). Distinct from a first-launch
 * "never asked" — that case still triggers the system prompt. This error
 * is for the "user revoked from Settings between sessions" path, where
 * we need to direct them to re-open Settings.
 */
export class VoicePermissionDeniedError extends Error {
  /** True when the user actively denied (vs. never-asked, which getPermissionsAsync also reports). */
  readonly canAskAgain: boolean;
  constructor(canAskAgain: boolean) {
    super(
      canAskAgain
        ? "Permission micro non accordée. Acceptez l'accès au microphone pour utiliser la voix."
        : "Accès au microphone refusé. Activez-le dans Réglages > Suivi Baby > Microphone."
    );
    this.name = "VoicePermissionDeniedError";
    this.canAskAgain = canAskAgain;
  }
}

function isAudioAvailable(): boolean {
  return !!AudioModule?.AudioRecorder;
}

/**
 * Demande les permissions audio
 */
export async function requestPermissions(): Promise<boolean> {
  try {
    if (!isAudioAvailable()) {
      console.error("Module audio indisponible. Vérifiez expo-audio.");
      return false;
    }
    const { status } = await requestRecordingPermissionsAsync();
    return status === "granted";
  } catch (error) {
    console.error("Erreur permissions audio:", error);
    captureServiceError(error, { service: "voiceRecorder", operation: "requestPermissions" });
    return false;
  }
}

/**
 * Démarre l'enregistrement audio.
 *
 * T3.2 — re-vérifie la permission micro à CHAQUE appel (pas seulement au
 * boot de l'app). iOS peut révoquer la permission depuis Réglages sans
 * prévenir l'app ; si on ne re-check pas, Audio.Recording.createAsync
 * lance une exception générique qu'on ne peut pas distinguer d'un vrai
 * crash. Avec ce check on lève un VoicePermissionDeniedError typé que
 * l'UI peut catcher pour proposer "Ouvrir les réglages".
 */
export async function startRecording(): Promise<void> {
  try {
    if (recording) {
      console.warn("Enregistrement déjà en cours, démarrage ignoré.");
      return;
    }
    if (!isAudioAvailable()) {
      throw new Error("Module audio indisponible. Vérifiez expo-audio.");
    }

    // Re-check au moment du record. getRecordingPermissionsAsync lit l'état
    // actuel sans prompt, donc n'introduit pas de latence perçue.
    const current = await getRecordingPermissionsAsync();
    if (current.status !== "granted") {
      // Si on peut encore demander, prompt l'utilisateur ; sinon, on lève
      // l'erreur "ouvre les réglages" sans tenter le prompt (iOS refuse).
      if (current.canAskAgain) {
        const asked = await requestRecordingPermissionsAsync();
        if (asked.status !== "granted") {
          throw new VoicePermissionDeniedError(asked.canAskAgain ?? false);
        }
      } else {
        throw new VoicePermissionDeniedError(false);
      }
    }

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
    });

    const recorder = new AudioModule.AudioRecorder(
      platformRecordingOptions(RecordingPresets.HIGH_QUALITY)
    );
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (error) {
      // Created imperatively: nothing releases it for us.
      recorder.release();
      throw error;
    }

    recording = recorder;
    console.log("Enregistrement démarré");
  } catch (error) {
    // Ne pas spammer Sentry pour les refus de permission — c'est un cas
    // utilisateur normal, pas un bug.
    if (!(error instanceof VoicePermissionDeniedError)) {
      console.error("Erreur démarrage enregistrement:", error);
      captureServiceError(error, { service: "voiceRecorder", operation: "startRecording" });
    }
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

    const recorder = recording;
    recording = null;
    let uri: string | null;
    try {
      await recorder.stop();
      uri = recorder.uri;
    } finally {
      // The file stays on disk; only the native recorder is freed.
      recorder.release();
    }

    console.log("Enregistrement arrêté:", uri);
    return uri;
  } catch (error) {
    console.error("Erreur arrêt enregistrement:", error);
    captureServiceError(error, { service: "voiceRecorder", operation: "stopRecording" });
    return null;
  }
}

/**
 * Generate a short idempotency key for transcribeAudio retries. Not used as
 * a security token — purely a request dedup tag, scoped per-uid on the server.
 * Format matches the server's regex /^[A-Za-z0-9_-]+$/ (max 100 chars).
 */
function generateIdempotencyKey(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}`;
}

/**
 * Transcrit l'audio en texte via Cloud Function proxy (AssemblyAI)
 * L'API key reste côté serveur — jamais exposée dans le bundle client.
 *
 * T3.3 — pre-check size client-side. If under MIN_AUDIO_BYTES, throw
 * EmptyAudioError without hitting the CF (saves quota + latency).
 */
export async function transcribeAudio(audioUri: string): Promise<string> {
  try {
    // Check file size before reading the whole file into memory + base64ing it.
    const info = await FileSystem.getInfoAsync(audioUri, { size: true });
    if (!info.exists) {
      throw new EmptyAudioError("Le fichier audio est introuvable.");
    }
    const rawSize = (info as { size?: number }).size ?? 0;
    if (rawSize > 0 && rawSize < MIN_AUDIO_BYTES) {
      throw new EmptyAudioError();
    }

    const audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const transcribe = httpsCallable<
      { audioBase64: string; idempotencyKey: string },
      { text: string; cached?: boolean }
    >(functions, "transcribeAudio");

    // Generate a fresh key per call. A retry of the *same* logical recording
    // would need to reuse this key to hit the server cache — that's handled
    // higher up if/when we wire a retry layer; for now each new recording
    // gets a fresh key, which is the safe default.
    const idempotencyKey = generateIdempotencyKey();
    const result = await transcribe({ audioBase64, idempotencyKey });
    return result.data.text || "";
  } catch (error: any) {
    if (error instanceof EmptyAudioError) throw error;
    // T3.3 — CF returns invalid-argument when audio is too small. Surface as
    // EmptyAudioError so the UI shows the same friendly message either way.
    if (
      error?.code === "functions/invalid-argument" &&
      typeof error?.message === "string" &&
      error.message.includes("trop court")
    ) {
      throw new EmptyAudioError();
    }
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
