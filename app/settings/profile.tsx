import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Stack } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { InfoModal } from "@/components/ui/InfoModal";
import { getNeutralColors } from "@/constants/dashboardColors";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { modifierNomUtilisateur } from "@/services/usersService";

export default function ProfileScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { userName, email, refreshUser } = useAuth();
  const { showToast, showActionToast } = useToast();
  const [displayName, setDisplayName] = useState(userName ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
  });
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const closeModal = useCallback(() => {
    setModalConfig((prev) => ({ ...prev, visible: false }));
  }, []);

  useEffect(() => {
    setDisplayName(userName ?? "");
  }, [userName]);

  const handleSave = useCallback(async () => {
    const trimmedName = displayName.trim();
    setErrorMessage("");
    if (trimmedName.length < 6) {
      setModalConfig({
        visible: true,
        title: "Pseudo invalide",
        message: "Le pseudo doit contenir au moins 6 caracteres.",
      });
      return;
    }

    try {
      setIsSaving(true);
      await modifierNomUtilisateur(trimmedName);
      await refreshUser();
      if (!isMountedRef.current) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Profil mis a jour avec succes");
    } catch (error) {
      if (!isMountedRef.current) return;
      const message =
        error instanceof Error ? error.message : "Erreur inconnue.";
      setErrorMessage(message);
      showActionToast(
        "Impossible de mettre a jour le profil.",
        "Reessayer",
        () => {
          handleSave();
        },
      );
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [displayName, refreshUser, showToast, showActionToast]);

  const trimmedName = useMemo(() => displayName.trim(), [displayName]);
  const isInvalid = useMemo(() => trimmedName.length < 6, [trimmedName]);
  const isUnchanged = useMemo(
    () => trimmedName === (userName ?? "").trim(),
    [trimmedName, userName],
  );
  const isSaveDisabled = isSaving || isInvalid || isUnchanged;

  return (
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView
        style={[styles.container, { backgroundColor: nc.background }]}
        edges={["bottom"]}
      >
        <Stack.Screen
          options={{
            title: "Profil",
            headerBackTitle: "Retour",
          }}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[styles.section, { backgroundColor: nc.backgroundCard }]}
          >
            {/* <ThemedText style={[styles.sectionTitle, { color: nc.textMuted }]}>
              Profil
            </ThemedText> */}

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Pseudo</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: nc.backgroundPressed,
                    color: nc.textStrong,
                    borderColor: nc.borderLight,
                  },
                ]}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Entrez votre pseudo"
                placeholderTextColor={nc.textMuted}
              />
              {isInvalid && (
                <Text style={[styles.helperText, { color: nc.textMuted }]}>
                  6 caracteres minimum.
                </Text>
              )}
            </View>

            {!!errorMessage && (
              <Text style={[styles.errorText, { color: nc.error }]}>
                {errorMessage}
              </Text>
            )}

            <View style={styles.inputGroup}>
              <ThemedText style={styles.label}>Email</ThemedText>
              <TextInput
                style={[
                  styles.input,
                  styles.inputDisabled,
                  {
                    backgroundColor: nc.backgroundPressed,
                    color: nc.textMuted,
                    borderColor: nc.borderLight,
                  },
                ]}
                value={email ?? ""}
                editable={false}
                placeholder="Email du compte"
                placeholderTextColor={nc.textMuted}
              />
            </View>
          </View>

          <TouchableOpacity
            style={[
              styles.saveButton,
              { backgroundColor: nc.todayAccent, shadowColor: nc.todayAccent },
              isSaveDisabled && styles.saveButtonDisabled,
            ]}
            onPress={handleSave}
            activeOpacity={0.8}
            disabled={isSaveDisabled}
            accessibilityRole="button"
            accessibilityState={{ disabled: isSaveDisabled }}
          >
            <Ionicons
              name="checkmark"
              size={20}
              color={colorScheme === "dark" ? nc.white : nc.backgroundCard}
            />
            <Text
              style={[
                styles.saveButtonText,
                {
                  color: colorScheme === "dark" ? nc.white : nc.backgroundCard,
                },
              ]}
            >
              {isSaving ? "Enregistrement..." : "Enregistrer"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
        <InfoModal
          visible={modalConfig.visible}
          title={modalConfig.title}
          message={modalConfig.message}
          backgroundColor={nc.background}
          textColor={nc.textStrong}
          onClose={closeModal}
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
    borderRadius: 12,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  helperText: {
    fontSize: 12,
    marginTop: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  inputDisabled: {
    opacity: 0.7,
  },
  errorText: {
    color: undefined as unknown as string, // set dynamically
    fontSize: 12,
    marginBottom: 12,
  },
  saveButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 18,
    fontWeight: "600",
  },
});
