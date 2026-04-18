import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { ContentReportReason } from "@/services/contentReportService";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { memo, useCallback, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

interface ReportModalProps {
  visible: boolean;
  onSubmit: (reason: ContentReportReason, message?: string) => Promise<void>;
  onClose: () => void;
}

const REASONS: { key: ContentReportReason; label: string; icon: string }[] = [
  {
    key: "intimate_child_nudity",
    label: "Nudité intime d'un enfant",
    icon: "triangle-exclamation",
  },
  {
    key: "sensitive_child_photo",
    label: "Photo sensible d'un enfant",
    icon: "shield-halved",
  },
  {
    key: "privacy",
    label: "Problème de confidentialité",
    icon: "eye-slash",
  },
  {
    key: "other",
    label: "Autre",
    icon: "flag",
  },
];

export const ReportModal = memo(function ReportModal({
  visible,
  onSubmit,
  onClose,
}: ReportModalProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const tint = Colors[colorScheme].tint;

  const [selectedReason, setSelectedReason] =
    useState<ContentReportReason | null>(null);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const resetAndClose = useCallback(() => {
    setSelectedReason(null);
    setMessage("");
    setIsSending(false);
    onClose();
  }, [onClose]);

  const handleSubmit = useCallback(async () => {
    if (!selectedReason || isSending) return;
    setIsSending(true);
    try {
      await onSubmit(selectedReason, message.trim() || undefined);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetAndClose();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setIsSending(false);
    }
  }, [selectedReason, message, isSending, onSubmit, resetAndClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={resetAndClose}
    >
      <View style={styles.overlay}>
        <View
          style={[styles.card, { backgroundColor: nc.backgroundCard }]}
        >
          <Text style={[styles.title, { color: nc.textStrong }]}>
            Signaler un problème
          </Text>
          <Text style={[styles.subtitle, { color: nc.textLight }]}>
            Aidez-nous à protéger la sécurité des enfants et la confidentialité
            des familles.
          </Text>

          <View style={styles.reasons}>
            {REASONS.map((reason) => {
              const isSelected = selectedReason === reason.key;
              return (
                <Pressable
                  key={reason.key}
                  style={[
                    styles.reasonRow,
                    {
                      borderColor: isSelected ? tint : nc.borderLight,
                      backgroundColor: isSelected ? tint + "0A" : "transparent",
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedReason(reason.key);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: isSelected }}
                  accessibilityLabel={reason.label}
                >
                  <FontAwesome6
                    name={reason.icon}
                    size={16}
                    color={isSelected ? tint : nc.textMuted}
                  />
                  <Text
                    style={[
                      styles.reasonLabel,
                      { color: isSelected ? nc.textStrong : nc.textNormal },
                    ]}
                  >
                    {reason.label}
                  </Text>
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: isSelected ? tint : nc.textMuted,
                        backgroundColor: isSelected ? tint : "transparent",
                      },
                    ]}
                  >
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                </Pressable>
              );
            })}
          </View>

          <TextInput
            style={[
              styles.messageInput,
              {
                color: nc.textStrong,
                backgroundColor: nc.backgroundPressed,
                borderColor: nc.borderLight,
              },
            ]}
            placeholder="Décrivez le problème (optionnel)"
            placeholderTextColor={nc.textMuted}
            value={message}
            onChangeText={setMessage}
            multiline
            maxLength={500}
            accessibilityLabel="Description du signalement"
          />

          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnCancel, { borderColor: nc.border }]}
              onPress={resetAndClose}
              disabled={isSending}
              accessibilityRole="button"
              accessibilityLabel="Annuler"
            >
              <Text style={[styles.btnText, { color: nc.textNormal }]}>
                Annuler
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.btn,
                styles.btnSubmit,
                { backgroundColor: tint, opacity: selectedReason ? 1 : 0.4 },
              ]}
              onPress={handleSubmit}
              disabled={!selectedReason || isSending}
              accessibilityRole="button"
              accessibilityLabel="Envoyer le signalement"
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[styles.btnText, { color: "#fff" }]}>
                  Envoyer
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 20,
    padding: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  reasons: {
    gap: 10,
    marginBottom: 16,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  reasonLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  messageInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 72,
    textAlignVertical: "top",
    marginBottom: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 46,
  },
  btnCancel: {
    borderWidth: 1,
  },
  btnSubmit: {},
  btnText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
