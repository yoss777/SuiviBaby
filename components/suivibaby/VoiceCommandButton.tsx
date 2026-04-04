// components/suivibaby/VoiceCommandButton.tsx
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { InfoModal } from '@/components/ui/InfoModal';
import { PromptModal } from '@/components/ui/PromptModal';
import { getBackgroundTint, getNeutralColors } from '@/constants/dashboardColors';
import { Colors } from '@/constants/theme';
import { useBaby } from '@/contexts/BabyContext';
import { usePremium } from '@/contexts/PremiumContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useVoiceCommand } from '@/hooks/useVoiceCommand';
import { incrementVoiceCommand } from '@/services/premiumGatingService';
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

interface VoiceCommandButtonProps {
  size?: number;
  color?: string;
  showTestToggle?: boolean; // Afficher le bouton de bascule test/prod
  accessibilityLabel?: string;
}

export function VoiceCommandButton({
  size = 18,
  color: colorProp,
  showTestToggle = false,
  accessibilityLabel = "Commande vocale",
}: VoiceCommandButtonProps) {
  const { activeChild } = useBaby();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const color = colorProp ?? Colors[colorScheme].tint;
  const { 
    isRecording, 
    isProcessing,
    testMode,
    testPromptVisible,
    testPromptText,
    pendingCommand,
    diaperChoice,
    excretionSelection,
    infoModal,
    confirmModal,
    permissionModal,
    transcriptionErrorModal,
    startVoiceCommand, 
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
  } = useVoiceCommand(activeChild?.id || '', false); // true = mode test par défaut
  // } = useVoiceCommand(activeChild?.id || '', true); // true = mode test par défaut

  const { checkFeatureAccess } = usePremium();
  const router = useRouter();
  const [voiceLimitReached, setVoiceLimitReached] = useState(false);

  const checkVoiceLimit = async (): Promise<boolean> => {
    if (checkFeatureAccess("unlimited_voice")) return true;
    const allowed = await incrementVoiceCommand();
    if (!allowed) {
      setVoiceLimitReached(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return false;
    }
    return true;
  };

  const handlePress = async () => {
    if (isProcessing) return;
    if (testMode) {
      if (!(await checkVoiceLimit())) return;
      startVoiceCommand();
    }
  };

  const handlePressIn = async () => {
    if (isProcessing || testMode) return;
    if (!(await checkVoiceLimit())) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    startVoiceCommand();
  };

  const handlePressOut = () => {
    if (isProcessing || testMode) return;
    if (isRecording) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      stopVoiceCommand();
    }
  };

  if (isProcessing && !testPromptVisible && !confirmModal.visible) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color={color} />
      </View>
    );
  }

  const choiceTextColor = Colors[colorScheme].text;
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

  return (
    <View style={styles.wrapper}>
      {/* Bouton principal microphone */}
      <Pressable 
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[
          styles.mainButton,
          isRecording && [styles.recording, { backgroundColor: getBackgroundTint(nc.error, 0.15) }],
        ]}
      >
        <FontAwesome 
          name="microphone" 
          size={size} 
          color={isRecording ? nc.error : color}
          solid={isRecording}
        />
        {isRecording && (
          <View style={[styles.recordingDot, { backgroundColor: nc.error }]} />
        )}
      </Pressable>

      {/* Badge indicateur mode test (optionnel) */}
      {showTestToggle && (
        <Pressable
          onPress={toggleTestMode}
          style={[
            styles.modeBadge,
            testMode
              ? { backgroundColor: getBackgroundTint(nc.warning, 0.1), borderColor: nc.warning }
              : { backgroundColor: getBackgroundTint(nc.success, 0.1), borderColor: nc.success },
          ]}
        >
          <Text style={styles.modeText}>
            {testMode ? 'TEST' : 'PROD'}
          </Text>
        </Pressable>
      )}

      <PromptModal
        visible={testPromptVisible}
        title="Commande vocale (mode test)"
        subtitle="Le mode test n'utilise pas le micro."
        message={
          "Exemples:\n• Ajoute un biberon de 150ml\n• Ajoute une tétée gauche il y a 10min\n• Ajoute un pipi popo"
        }
        value={testPromptText}
        placeholder="Entrez votre commande..."
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        onChangeText={setTestPromptText}
        onCancel={cancelTestPrompt}
        onConfirm={submitTestPrompt}
      />

      <InfoModal
        visible={infoModal.visible}
        title={infoModal.title}
        message={infoModal.message}
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
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
                <Pressable
                  style={[
                    styles.choiceButton,
                    { borderColor: choiceBorder },
                    excretionSelection.pipi && [
                      styles.choiceButtonActive,
                      { borderColor: choiceAccent, backgroundColor: getBackgroundTint(choiceAccent, 0.12) },
                    ],
                  ]}
                  onPress={() =>
                    setExcretionSelection({
                      pipi: !excretionSelection.pipi,
                      popo: excretionSelection.popo,
                    })
                  }
                >
                  <Text
                    style={[
                      styles.choiceButtonText,
                      excretionSelection.pipi && [
                        styles.choiceButtonTextActive,
                        { color: choiceAccent },
                      ],
                    ]}
                  >
                    Pipi
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.choiceButton,
                    { borderColor: choiceBorder },
                    excretionSelection.popo && [
                      styles.choiceButtonActive,
                      { borderColor: choiceAccent, backgroundColor: getBackgroundTint(choiceAccent, 0.12) },
                    ],
                  ]}
                  onPress={() =>
                    setExcretionSelection({
                      pipi: excretionSelection.pipi,
                      popo: !excretionSelection.popo,
                    })
                  }
                >
                  <Text
                    style={[
                      styles.choiceButtonText,
                      excretionSelection.popo && [
                        styles.choiceButtonTextActive,
                        { color: choiceAccent },
                      ],
                    ]}
                  >
                    Popo
                  </Text>
                </Pressable>
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
                <Pressable
                  style={[
                    styles.choiceButton,
                    { borderColor: choiceBorder },
                    !diaperChoice && [
                      styles.choiceButtonActive,
                      { borderColor: choiceAccent, backgroundColor: getBackgroundTint(choiceAccent, 0.12) },
                    ],
                  ]}
                  onPress={() => setDiaperChoice(false)}
                >
                  <Text
                    style={[
                      styles.choiceButtonText,
                      !diaperChoice && [
                        styles.choiceButtonTextActive,
                        { color: choiceAccent },
                      ],
                    ]}
                  >
                    Sans couche
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.choiceButton,
                    { borderColor: choiceBorder },
                    diaperChoice && [
                      styles.choiceButtonActive,
                      { borderColor: choiceAccent, backgroundColor: getBackgroundTint(choiceAccent, 0.12) },
                    ],
                  ]}
                  onPress={() => setDiaperChoice(true)}
                >
                  <Text
                    style={[
                      styles.choiceButtonText,
                      diaperChoice && [
                        styles.choiceButtonTextActive,
                        { color: choiceAccent },
                      ],
                    ]}
                  >
                    Avec couche
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            confirmModal.message
          )
        }
        confirmText="Confirmer"
        cancelText="Annuler"
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
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
            await onConfirm();
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          clearPendingCommand();
        }}
        onCancel={() =>
          (() => {
            setConfirmModal({ visible: false, title: "", message: "", onConfirm: null });
            clearPendingCommand();
          })()
        }
      />

      <ConfirmModal
        visible={permissionModal}
        title="Permission requise"
        message="L'accès au microphone est nécessaire pour utiliser les commandes vocales."
        confirmText="Parametres"
        cancelText="Annuler"
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
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
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
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

      {/* Voice limit paywall */}
      <InfoModal
        visible={voiceLimitReached}
        title="Commandes vocales epuisees"
        message="Vous avez utilise vos 3 commandes vocales du jour. Passez a Premium pour des commandes illimitees."
        confirmText="Voir Premium"
        dismissText="OK"
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        onConfirm={() => {
          setVoiceLimitReached(false);
          router.push("/settings/premium");
        }}
        onClose={() => setVoiceLimitReached(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  container: {
    paddingHorizontal: 10,
  },
  mainButton: {
    paddingHorizontal: 10,
    position: 'relative',
  },
  recording: {
    borderRadius: 20,
    padding: 8,
  },
  recordingDot: {
    position: 'absolute',
    top: 4,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
  },
  // testModeBadge/prodModeBadge: dynamic via nc.warning/nc.success inline
  modeText: {
    fontSize: 10,
    fontWeight: '600',
  },
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
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  choiceButtonActive: {
    // backgroundColor applied inline via getBackgroundTint
  },
  choiceButtonText: {
    fontSize: 13,
    fontWeight: "600",
  },
  choiceButtonTextActive: {},
});
