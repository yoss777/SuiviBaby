// components/suivibaby/voice/VoiceCommandModals.tsx
// Modals of the voice flow (confirmation, diaper choice, info, microphone
// permission, transcription error, free-tier quota), extracted unchanged from
// the former VoiceCommandButton so every voice entry point shares them.
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InfoModal } from "@/components/ui/InfoModal";
import { PromptModal } from "@/components/ui/PromptModal";
import { VOICE_NOTICE_MESSAGE, VOICE_NOTICE_TITLE } from "@/services/voiceNoticeService";
import { getBackgroundTint, getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { VoiceInput, VoiceLimitKind } from "@/hooks/useVoiceInput";
import { FREE_LIMITS, PAYWALL_MESSAGES, PREMIUM_LIMITS } from "@/services/premiumGatingService";
import * as Haptics from "expo-haptics";
import { useGuardedNavigation } from "@/hooks/useGuardedNavigation";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";

interface VoiceCommandModalsProps {
  input: VoiceInput;
}


/** Night hours when no paywall is shown (local time). */
export function isQuietHours(date = new Date()): boolean {
  const h = date.getHours();
  return h >= 22 || h < 7;
}

export function voiceLimitMessage(kind: VoiceLimitKind | false, date = new Date()): string {
  if (kind === "premium") {
    return `Vous avez atteint vos ${PREMIUM_LIMITS.voiceCommandsPerDay} commandes vocales du jour. Le compteur repart à zéro à minuit ; la saisie manuelle reste disponible.`;
  }
  if (isQuietHours(date)) {
    return `Vous avez utilisé vos ${FREE_LIMITS.voiceCommandsPerDay} commandes vocales du jour. La saisie manuelle reste disponible, et le compteur repart à zéro à minuit.`;
  }
  return PAYWALL_MESSAGES.voice_limit.description;
}

export function VoiceCommandModals({ input }: VoiceCommandModalsProps) {
  const { voice, voiceLimitReached, setVoiceLimitReached, voiceNoticeVisible, dismissVoiceNotice } = input;
  const showPremiumOffer = voiceLimitReached === "free" && !isQuietHours();
  const {
    testPromptVisible,
    testPromptText,
    pendingCommand,
    diaperChoice,
    excretionSelection,
    infoModal,
    confirmModal,
    permissionModal,
    transcriptionErrorModal,
    stopVoiceCommand,
    toggleTestMode,
    setTestPromptText,
    cancelTestPrompt,
    submitTestPrompt,
    setDiaperChoice,
    setExcretionSelection,
    clearPendingCommand,
    setInfoModal,
    setConfirmModal,
    setPermissionModal,
    setTranscriptionErrorModal,
  } = voice;

  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { push: guardedPush } = useGuardedNavigation();

  const choiceTextColor = nc.textStrong;
  const choiceAccent = Colors[colorScheme].tint;
  const choiceBorder = Colors[colorScheme].tabIconDefault + "40";
  const excretionSelectionLabel =
    excretionSelection.pipi && excretionSelection.popo
      ? "Pipi + Popo"
      : excretionSelection.pipi
      ? "Pipi"
      : excretionSelection.popo
      ? "Popo"
      : "Pipi/Popo (à sélectionner)";
  const coucheMessage =
    typeof confirmModal.message === "string"
      ? confirmModal.message.replace(
          /💧 Type:.*$/m,
          `💧 Type: ${excretionSelectionLabel}`
        )
      : confirmModal.message;

  const choiceButton = (active: boolean, label: string, onPress: () => void) => (
    <Pressable
      style={[
        styles.choiceButton,
        { borderColor: choiceBorder },
        active && { borderColor: choiceAccent, backgroundColor: getBackgroundTint(choiceAccent, 0.12) },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.choiceButtonText, { color: active ? choiceAccent : choiceTextColor }]}>{label}</Text>
    </Pressable>
  );

  return (
    <>
      <PromptModal
        visible={testPromptVisible}
        title="Commande vocale (mode test)"
        subtitle="Le mode test n'utilise pas le micro."
        message={
          "Exemples:\n• Ajoute un biberon de 150ml\n• Ajoute une tétée gauche il y a 10min\n• Ajoute un pipi popo"
        }
        value={testPromptText}
        placeholder="Entrez votre commande..."
        onChangeText={setTestPromptText}
        onCancel={cancelTestPrompt}
        onConfirm={submitTestPrompt}
      />

      <InfoModal
        visible={infoModal.visible}
        title={infoModal.title}
        message={infoModal.message}
        onClose={() => setInfoModal({ visible: false, title: "", message: "" })}
      />

      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={
          pendingCommand?.type === "couche" ? (
            <View style={styles.choiceContainer}>
              <Text style={[styles.choiceTitle, { color: choiceTextColor }]}>
                {coucheMessage}
              </Text>
              <View style={styles.choiceRow}>
                {choiceButton(excretionSelection.pipi, "Pipi", () =>
                  setExcretionSelection({
                    pipi: !excretionSelection.pipi,
                    popo: excretionSelection.popo,
                  })
                )}
                {choiceButton(excretionSelection.popo, "Popo", () =>
                  setExcretionSelection({
                    pipi: excretionSelection.pipi,
                    popo: !excretionSelection.popo,
                  })
                )}
              </View>
            </View>
          ) : pendingCommand?.type === "miction" ||
            pendingCommand?.type === "selle" ? (
            <View style={styles.choiceContainer}>
              <Text style={[styles.choiceTitle, { color: choiceTextColor }]}>
                {confirmModal.message}
              </Text>
              <Text style={[styles.choiceSubtitle, { color: choiceTextColor }]}>
                Dans une couche ?
              </Text>
              <View style={styles.choiceRow}>
                {choiceButton(!diaperChoice, "Sans couche", () => setDiaperChoice(false))}
                {choiceButton(diaperChoice, "Avec couche", () => setDiaperChoice(true))}
              </View>
            </View>
          ) : (
            confirmModal.message
          )
        }
        confirmText="Confirmer"
        cancelText="Annuler"
        confirmButtonColor={nc.success}
        onConfirm={async () => {
          if (
            pendingCommand?.type === "couche" &&
            !excretionSelection.pipi &&
            !excretionSelection.popo
          ) {
            setInfoModal({
              visible: true,
              title: "Sélection requise",
              message: "Choisissez Pipi et/ou Popo.",
            });
            return;
          }
          const onConfirm = confirmModal.onConfirm;
          setConfirmModal({ visible: false, title: "", message: "", onConfirm: null });
          if (onConfirm) {
            const didSucceed = await onConfirm();
            if (didSucceed === true) {
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          }
          clearPendingCommand();
        }}
        onCancel={() => {
          setConfirmModal({ visible: false, title: "", message: "", onConfirm: null });
          clearPendingCommand();
        }}
      />

      <ConfirmModal
        visible={permissionModal}
        title="Permission requise"
        message="L'accès au microphone est nécessaire pour utiliser les commandes vocales."
        confirmText="Paramètres"
        cancelText="Annuler"
        confirmButtonColor={nc.success}
        onConfirm={() => {
          setPermissionModal(false);
          if (Platform.OS === "ios") {
            Linking.openURL("app-settings:");
          } else {
            Linking.openSettings();
          }
        }}
        onCancel={() => setPermissionModal(false)}
      />

      <ConfirmModal
        visible={transcriptionErrorModal}
        title="Erreur de transcription"
        message="Impossible de transcrire l'audio. Voulez-vous réessayer en mode test ?"
        confirmText="Mode test"
        cancelText="Annuler"
        confirmButtonColor={nc.success}
        onConfirm={() => {
          setTranscriptionErrorModal(false);
          toggleTestMode();
          stopVoiceCommand();
        }}
        onCancel={() => {
          setTranscriptionErrorModal(false);
          cancelTestPrompt();
        }}
      />

      <InfoModal
        visible={voiceNoticeVisible}
        title={VOICE_NOTICE_TITLE}
        message={VOICE_NOTICE_MESSAGE}
        dismissText="Compris"
        onClose={dismissVoiceNotice}
      />

      <InfoModal
        visible={voiceLimitReached !== false}
        title="Commandes vocales épuisées"
        message={voiceLimitMessage(voiceLimitReached)}
        // Premium is offered only to free users, and never at night (22 h-7 h):
        // a parent feeding a baby at 3 a.m. needs the manual entry, not a paywall.
        confirmText={showPremiumOffer ? PAYWALL_MESSAGES.voice_limit.ctaText : "Compris"}
        dismissText={showPremiumOffer ? "Plus tard" : undefined}
        onConfirm={() => {
          setVoiceLimitReached(false);
          if (showPremiumOffer) guardedPush("/settings/premium");
        }}
        onClose={() => setVoiceLimitReached(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  choiceContainer: {
    gap: 12,
  },
  choiceTitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  choiceSubtitle: {
    fontSize: 13,
    textAlign: "center",
    opacity: 0.7,
  },
  choiceRow: {
    flexDirection: "row",
    gap: 12,
  },
  choiceButton: {
    flex: 1,
    minHeight: 44,
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  choiceButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
