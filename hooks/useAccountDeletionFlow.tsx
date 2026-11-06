// hooks/useAccountDeletionFlow.tsx
// Shared account-deletion flow (Settings and consent screen): ownership
// blockers -> OwnershipTransferModal -> provider re-auth (password prompt or
// Google/Apple confirm) -> requestAccountDeletion -> sign out -> login.
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { InfoModal } from "@/components/ui/InfoModal";
import { OwnershipTransferModal } from "@/components/ui/OwnershipTransferModal";
import { PromptModal } from "@/components/ui/PromptModal";
import { useAuth } from "@/contexts/AuthContext";
import {
  DELETE_CHILD_CHOICE,
  deletionEmailNotice,
  getDeletionAuthMethod,
  getOwnershipBlockers,
  mapDeletionError,
  requestAccountDeletion,
  type OwnershipBlocker,
} from "@/services/accountDeletionService";

export interface AccountDeletionColors {
  backgroundCard: string;
  textStrong: string;
  textMuted: string;
  borderLight: string;
  error: string;
  white: string;
  accent: string;
}

export function useAccountDeletionFlow(colors: AccountDeletionColors) {
  const router = useRouter();
  const { firebaseUser, signOut, refreshUser } = useAuth();
  const method = getDeletionAuthMethod(firebaseUser);

  const [infoModal, setInfoModal] = useState({ visible: false, title: "", message: "" });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSocialModal, setShowSocialModal] = useState(false);
  const [password, setPassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [blockers, setBlockers] = useState<OwnershipBlocker[]>([]);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [showOwnerModal, setShowOwnerModal] = useState(false);

  const showError = useCallback((message: string) => {
    setInfoModal({ visible: true, title: "Erreur", message });
  }, []);

  const openConfirmation = useCallback(() => {
    if (method === "password") setShowPasswordModal(true);
    else setShowSocialModal(true);
  }, [method]);

  /** Checks ownership blockers first, then opens the re-auth confirmation. */
  const start = useCallback(async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      const found = await getOwnershipBlockers();
      if (found.length > 0) {
        setBlockers(found);
        setChoices({});
        setShowOwnerModal(true);
      } else {
        setBlockers([]);
        openConfirmation();
      }
    } catch {
      showError(
        "Impossible de vérifier vos enfants partagés pour le moment. Vérifiez votre connexion puis réessayez.",
      );
    } finally {
      setIsChecking(false);
    }
  }, [isChecking, openConfirmation, showError]);

  const perform = useCallback(
    async (pwd?: string) => {
      if (isDeleting) return;
      let scheduled = false;
      try {
        setIsDeleting(true);
        // Default choice (no explicit pick) is to delete the child's tracking.
        const chosen = blockers.map((b) => ({
          childId: b.childId,
          choice: choices[b.childId] ?? DELETE_CHILD_CHOICE,
        }));
        const deletion = await requestAccountDeletion({
          password: pwd,
          transfers: chosen
            .filter((c) => c.choice !== DELETE_CHILD_CHOICE)
            .map((c) => ({ childId: c.childId, newOwnerId: c.choice })),
          childDeletions: chosen
            .filter((c) => c.choice === DELETE_CHILD_CHOICE)
            .map((c) => c.childId),
        });
        scheduled = true;
        // The confirmation e-mail is sent by the server. If it could not be
        // sent, say so (native alert: it outlives the redirect to the login).
        const notice = deletionEmailNotice(deletion);
        if (notice) Alert.alert(notice.title, notice.message);
        await refreshUser();
        setShowPasswordModal(false);
        setShowSocialModal(false);
        setPassword("");
        await signOut();
        router.replace("/(auth)/login");
      } catch (error) {
        setShowSocialModal(false);
        showError(
          scheduled
            ? "Votre compte est bien programmé pour suppression, mais la déconnexion automatique a échoué. Déconnectez-vous manuellement."
            : mapDeletionError(error),
        );
      } finally {
        setIsDeleting(false);
      }
    },
    [isDeleting, blockers, choices, refreshUser, signOut, router, showError],
  );

  const loader = (
    <View style={styles.loader}>
      <IconPulseDots />
      <Text style={[styles.loaderText, { color: colors.textStrong }]}>
        Suppression en cours...
      </Text>
    </View>
  );

  const modals = (
    <>
      <InfoModal
        visible={infoModal.visible}
        title={infoModal.title}
        message={infoModal.message}
        backgroundColor={colors.backgroundCard}
        textColor={colors.textStrong}
        onClose={() => setInfoModal((prev) => ({ ...prev, visible: false }))}
      />
      <OwnershipTransferModal
        visible={showOwnerModal}
        blockers={blockers}
        choices={choices}
        backgroundColor={colors.backgroundCard}
        textColor={colors.textStrong}
        mutedColor={colors.textMuted}
        borderColor={colors.borderLight}
        accentColor={colors.accent}
        onSelect={(childId, uid) => setChoices((prev) => ({ ...prev, [childId]: uid }))}
        onCancel={() => {
          setShowOwnerModal(false);
          setBlockers([]);
          setChoices({});
        }}
        onConfirm={() => {
          setShowOwnerModal(false);
          openConfirmation();
        }}
      />
      <ConfirmModal
        visible={showSocialModal}
        title="Confirmer la suppression"
        message={
          isDeleting
            ? loader
            : `Votre compte sera programmé pour suppression dans 30 jours. Vous pourrez annuler à tout moment depuis les paramètres. Pour confirmer, vous allez devoir vous reconnecter avec ${method === "apple" ? "Apple" : "Google"}.`
        }
        confirmText={isDeleting ? "Suppression..." : "Continuer"}
        cancelText="Annuler"
        backgroundColor={colors.backgroundCard}
        textColor={colors.textStrong}
        confirmButtonColor={colors.error}
        confirmTextColor={colors.white}
        onConfirm={() => {
          if (isDeleting) return;
          perform();
        }}
        onCancel={() => {
          if (isDeleting) return;
          setShowSocialModal(false);
        }}
      />
      <PromptModal
        visible={showPasswordModal}
        title="Confirmer la suppression"
        message={
          (isDeleting
            ? loader
            : "Votre compte sera programmé pour suppression dans 30 jours. Vous pourrez annuler à tout moment depuis les paramètres.") as any
        }
        value={password}
        placeholder="Mot de passe"
        secureTextEntry
        multiline={false}
        autoCapitalize="none"
        confirmText={isDeleting ? "Suppression..." : "Supprimer"}
        confirmButtonColor={colors.error}
        confirmDisabled={isDeleting}
        cancelText="Annuler"
        backgroundColor={colors.backgroundCard}
        textColor={colors.textStrong}
        onChangeText={(value) => {
          if (isDeleting) return;
          setPassword(value);
        }}
        onConfirm={async () => {
          if (isDeleting) return;
          if (!password.trim()) {
            showError("Veuillez saisir votre mot de passe.");
            return;
          }
          await perform(password);
        }}
        onCancel={() => {
          if (isDeleting) return;
          setShowPasswordModal(false);
          setPassword("");
        }}
      />
    </>
  );

  return { start, isChecking, isDeleting, modals };
}

const styles = StyleSheet.create({
  loader: { alignItems: "center", gap: 12, paddingVertical: 8 },
  loaderText: { fontSize: 15, fontWeight: "600" },
});
