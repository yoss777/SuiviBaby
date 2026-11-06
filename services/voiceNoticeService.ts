// First-use information about what the voice command sends and to whom.
// Informational only (consent to health data is handled separately): the
// "seen" flag just avoids showing the notice again.
import AsyncStorage from "@react-native-async-storage/async-storage";

export const VOICE_NOTICE_SEEN_KEY = "@voice_notice_seen_v1";

export const VOICE_NOTICE_TITLE = "Avant d'utiliser la voix";
export const VOICE_NOTICE_MESSAGE =
  "Votre enregistrement est envoyé de façon chiffrée à notre serveur, puis à AssemblyAI pour être transcrit. " +
  "Le texte obtenu (avec le prénom de votre enfant si vous le prononcez) est ensuite envoyé à Anthropic pour repérer les événements à créer.\n\n" +
  "L'audio est supprimé de votre téléphone dès la transcription terminée et la transcription est supprimée chez AssemblyAI. " +
  "Rien n'est enregistré sans votre validation.";

export async function hasSeenVoiceNotice(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(VOICE_NOTICE_SEEN_KEY)) === "1";
  } catch {
    // Storage unreadable: do not block voice, the notice is informational.
    return true;
  }
}

export async function markVoiceNoticeSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(VOICE_NOTICE_SEEN_KEY, "1");
  } catch {
    // Worst case the notice is shown once more.
  }
}
