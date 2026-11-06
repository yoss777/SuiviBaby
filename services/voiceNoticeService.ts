// First-use information about what the voice command sends and to whom.
// Informational only (consent to health data is handled separately): the
// "seen" flag just avoids showing the notice again.
import AsyncStorage from "@react-native-async-storage/async-storage";

/** "Seen" flag is stored per account (uid), not per device. */
export const VOICE_NOTICE_SEEN_KEY_PREFIX = "@voice_notice_seen_v2:";
export const voiceNoticeSeenKey = (uid: string) =>
  `${VOICE_NOTICE_SEEN_KEY_PREFIX}${uid}`;

export const VOICE_NOTICE_TITLE = "Avant d'utiliser la voix";
export const VOICE_NOTICE_MESSAGE =
  "Votre enregistrement est envoyé de façon chiffrée à notre serveur, puis à AssemblyAI pour être transcrit. " +
  "Le texte obtenu (avec le prénom de votre enfant si vous le prononcez) est ensuite envoyé à Anthropic pour repérer les événements à créer.\n\n" +
  "L'audio est supprimé de votre téléphone dès la transcription terminée et la transcription est supprimée chez AssemblyAI. " +
  "Rien n'est enregistré sans votre validation.";

export async function hasSeenVoiceNotice(uid: string | null | undefined): Promise<boolean> {
  // No account: nothing to attach the flag to; do not block voice.
  if (!uid) return true;
  try {
    return (await AsyncStorage.getItem(voiceNoticeSeenKey(uid))) === "1";
  } catch {
    // Storage unreadable: do not block voice, the notice is informational.
    return true;
  }
}

export async function markVoiceNoticeSeen(uid: string | null | undefined): Promise<void> {
  if (!uid) return;
  try {
    await AsyncStorage.setItem(voiceNoticeSeenKey(uid), "1");
  } catch {
    // Worst case the notice is shown once more.
  }
}
