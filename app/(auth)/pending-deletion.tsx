import { InfoModal } from "@/components/ui/InfoModal";
import { getNeutralColors } from "@/constants/dashboardColors";
import { useAuth } from "@/contexts/AuthContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  cancelAccountDeletion,
  formatPendingDeletionDate,
  getPendingDeletionDateFromUser,
  hasPendingDeletion,
} from "@/services/accountDeletionService";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function PendingDeletionScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { user, loading, refreshUser, signOut } = useAuth();
  const [isCancelling, setIsCancelling] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [infoModal, setInfoModal] = useState({
    visible: false,
    title: "",
    message: "",
  });

  const pendingDeletionDate = getPendingDeletionDateFromUser(user);
  const busy = isCancelling || isSigningOut;

  const formattedDeletionDate = useMemo(
    () => formatPendingDeletionDate(pendingDeletionDate),
    [pendingDeletionDate],
  );

  useEffect(() => {
    if (loading) return;

    if (!user) {
      router.replace("/(auth)/login");
      return;
    }

    if (!hasPendingDeletion(user)) {
      router.replace("/boot");
    }
  }, [loading, user]);

  const showError = useCallback((message: string) => {
    setInfoModal({
      visible: true,
      title: "Erreur",
      message,
    });
  }, []);

  const handleCancelDeletion = useCallback(async () => {
    if (busy) return;

    setIsCancelling(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await cancelAccountDeletion();
      await refreshUser();
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/boot");
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError("Impossible d'annuler la suppression du compte pour le moment.");
    } finally {
      setIsCancelling(false);
    }
  }, [busy, refreshUser, showError]);

  const handleSignOut = useCallback(async () => {
    if (busy) return;

    setIsSigningOut(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    try {
      await signOut();
      router.replace("/(auth)/login");
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError("Impossible de vous déconnecter pour le moment.");
      setIsSigningOut(false);
    }
  }, [busy, showError, signOut]);

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: nc.background }]}
      edges={["top", "bottom"]}
    >
      <InfoModal
        visible={infoModal.visible}
        title={infoModal.title}
        message={infoModal.message}
        backgroundColor={nc.backgroundCard}
        textColor={nc.textStrong}
        onClose={() => setInfoModal({ visible: false, title: "", message: "" })}
      />

      <View style={styles.content}>
        <View
          style={[
            styles.iconWrapper,
            { backgroundColor: nc.errorBg, borderColor: nc.error },
          ]}
        >
          <FontAwesome
            name="triangle-exclamation"
            size={28}
            color={nc.error}
          />
        </View>

        <View
          style={[
            styles.card,
            {
              backgroundColor: nc.backgroundCard,
              borderColor: nc.borderLight,
            },
          ]}
        >
          <Text
            style={[styles.title, { color: nc.textStrong }]}
            accessibilityRole="header"
          >
            Suppression du compte programmée
          </Text>

          <Text style={[styles.body, { color: nc.textMuted }]}>
            Votre compte sera supprimé définitivement le{" "}
            <Text style={[styles.bodyStrong, { color: nc.textStrong }]}>
              {formattedDeletionDate || "prochainement"}
            </Text>
            .
          </Text>

          <Text style={[styles.body, { color: nc.textMuted }]}>
            Vous pouvez encore annuler cette demande avant cette date. Après
            l&apos;échéance, la suppression sera définitive.
          </Text>

          <View
            style={[
              styles.notice,
              { backgroundColor: nc.backgroundPressed, borderColor: nc.borderLight },
            ]}
          >
            <Text style={[styles.noticeText, { color: nc.textMuted }]}>
              Tant que cette demande est active, l&apos;accès à
              l&apos;application est suspendu jusqu&apos;à annulation.
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.primaryButton,
              { backgroundColor: nc.error },
              busy && styles.buttonDisabled,
            ]}
            onPress={handleCancelDeletion}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Annuler la suppression du compte"
            accessibilityHint={
              isCancelling
                ? "Annulation en cours"
                : "Rétablit votre compte et relance l'application"
            }
          >
            {isCancelling ? (
              <ActivityIndicator color={nc.white} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: nc.white }]}>
                Annuler la suppression
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.secondaryButton,
              { borderColor: nc.borderLight, backgroundColor: nc.background },
              busy && styles.buttonDisabled,
            ]}
            onPress={handleSignOut}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Se déconnecter"
            accessibilityHint={
              isSigningOut
                ? "Déconnexion en cours"
                : "Ferme votre session et retourne à l'écran de connexion"
            }
          >
            {isSigningOut ? (
              <ActivityIndicator color={nc.textStrong} />
            ) : (
              <Text style={[styles.secondaryButtonText, { color: nc.textStrong }]}>
                Se déconnecter
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 20,
  },
  iconWrapper: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  bodyStrong: {
    fontWeight: "700",
  },
  notice: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
