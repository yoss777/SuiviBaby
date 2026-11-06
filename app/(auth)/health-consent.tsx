// app/(auth)/health-consent.tsx
// Blocking health-data consent screen (GDPR art. 9). Shown by app/boot.tsx
// whenever the signed-in user has no valid consent for the current version
// (social sign-in, legacy accounts, new policy version).
import { InfoModal } from "@/components/ui/InfoModal";
import { getNeutralColors } from "@/constants/dashboardColors";
import { useAuth } from "@/contexts/AuthContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useAccountDeletionFlow } from "@/hooks/useAccountDeletionFlow";
import {
  HEALTH_CONSENT_VERSION,
  recordHealthConsent,
} from "@/services/healthConsentService";
import { trackOnboardingEvent } from "@/services/onboardingAnalytics";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COLLECTED_DATA =
  "repas, sommeil, croissance, couches, symptômes, température, médicaments, vaccins, allergies, notes libres, photos et notes vocales";

export default function HealthConsentScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { user, firebaseUser, loading, signOut } = useAuth();
  const [isAccepting, setIsAccepting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const deletion = useAccountDeletionFlow({
    backgroundCard: nc.backgroundCard,
    textStrong: nc.textStrong,
    textMuted: nc.textMuted,
    borderLight: nc.borderLight,
    error: nc.error,
    white: nc.white,
    accent: nc.todayAccent,
  });
  const busy =
    isAccepting || isSigningOut || deletion.isChecking || deletion.isDeleting;

  useEffect(() => {
    if (loading || isSigningOut) return;
    if (!user && !firebaseUser) {
      router.replace("/(auth)/login");
    }
  }, [loading, user, firebaseUser, isSigningOut]);

  const handleAccept = useCallback(async () => {
    const uid = firebaseUser?.uid;
    if (busy || !uid) return;
    setIsAccepting(true);
    setErrorMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await recordHealthConsent(uid);
      trackOnboardingEvent("health_consent_granted");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/boot");
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage(
        "Impossible d'enregistrer votre consentement pour le moment. Vérifiez votre connexion puis réessayez.",
      );
      setIsAccepting(false);
    }
  }, [busy, firebaseUser?.uid]);

  const handleDecline = useCallback(async () => {
    if (busy) return;
    setIsSigningOut(true);
    setErrorMessage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await signOut();
      router.replace("/(auth)/login");
    } catch {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrorMessage("Impossible de vous déconnecter pour le moment.");
      setIsSigningOut(false);
    }
  }, [busy, signOut]);

  const Bullet = ({ children }: { children: React.ReactNode }) => (
    <View style={styles.bulletRow}>
      <Text style={[styles.bulletDot, { color: nc.textMuted }]}>•</Text>
      <Text style={[styles.body, styles.bulletText, { color: nc.textMuted }]}>
        {children}
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: nc.background }]}
      edges={["top", "bottom"]}
    >
      <InfoModal
        visible={!!errorMessage}
        title="Erreur"
        message={errorMessage ?? ""}
        backgroundColor={nc.backgroundCard}
        textColor={nc.textStrong}
        onClose={() => setErrorMessage(null)}
      />

      {deletion.modals}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator
      >
        <View
          style={[
            styles.iconWrapper,
            { backgroundColor: nc.backgroundPressed, borderColor: nc.borderLight },
          ]}
        >
          <FontAwesome name="shield-heart" size={28} color={nc.textStrong} />
        </View>

        <Text
          style={[styles.title, { color: nc.textStrong }]}
          accessibilityRole="header"
        >
          Vos données de santé
        </Text>

        <View
          style={[
            styles.card,
            { backgroundColor: nc.backgroundCard, borderColor: nc.borderLight },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: nc.textStrong }]}>
            Ce que nous collectons
          </Text>
          <Text style={[styles.body, { color: nc.textMuted }]}>
            Pour le suivi de votre enfant : {COLLECTED_DATA}. Ce sont des
            données de santé : la loi exige votre consentement explicite pour
            les traiter. En acceptant, vous confirmez agir en tant que
            titulaire de l&apos;autorité parentale de cet enfant.
          </Text>

          <Text style={[styles.sectionTitle, { color: nc.textStrong }]}>
            Pourquoi
          </Text>
          <Text style={[styles.body, { color: nc.textMuted }]}>
            Uniquement pour faire fonctionner l&apos;application : enregistrer
            le suivi, l&apos;afficher, le partager avec les personnes que vous
            invitez et produire vos statistiques.
          </Text>

          <Text style={[styles.sectionTitle, { color: nc.textStrong }]}>
            Qui les traite
          </Text>
          <Bullet>
            Google Cloud / Firebase : hébergement des données en Europe
            (Firestore eur3), fonctions serveur et authentification (assurée
            par Google).
          </Bullet>
          <Bullet>
            RevenueCat : gestion des abonnements (identifiant pseudonyme).
          </Bullet>
          <Bullet>Sentry (hébergé dans l'UE) : diagnostic des erreurs, sans identifiant de compte.</Bullet>
          <Bullet>
            Resend : envoi des e-mails (confirmations, invitations).
          </Bullet>
          <Bullet>
            Expo : notifications push, qui contiennent le prénom de
            l&apos;enfant et des horaires.
          </Bullet>
          <Bullet>
            AssemblyAI : transcription de la voix, uniquement si vous utilisez
            la commande vocale. Anthropic : interprétation du texte dicté pour
            cette même commande.
          </Bullet>
          <Text style={[styles.body, { color: nc.textMuted }]}>
            Certains prestataires sont situés aux États-Unis ; ces transferts
            sont encadrés (EU-US Data Privacy Framework ou clauses
            contractuelles types).
          </Text>

          <Text style={[styles.sectionTitle, { color: nc.textStrong }]}>
            Retrait du consentement
          </Text>
          <Text style={[styles.body, { color: nc.textMuted }]}>
            Vous pouvez retirer votre consentement à tout moment dans les
            Réglages (Retirer mon consentement aux données de santé) ou en
            supprimant votre compte. La preuve de votre consentement (date,
            version) est conservée 5 ans après la suppression du compte, pour
            pouvoir se défendre en cas de litige.
          </Text>

          <TouchableOpacity
            onPress={() => router.push("/(auth)/privacy")}
            disabled={busy}
            accessibilityRole="link"
            accessibilityLabel="Lire la politique de confidentialité"
            style={styles.linkButton}
          >
            <Text style={[styles.linkText, { color: nc.textStrong }]}>
              Lire la politique de confidentialité
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { backgroundColor: nc.background, borderTopColor: nc.borderLight },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.primaryButton,
            { backgroundColor: nc.textStrong },
            busy && styles.buttonDisabled,
          ]}
          onPress={handleAccept}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="J'accepte le traitement de mes données de santé"
          accessibilityHint={
            isAccepting
              ? "Enregistrement en cours"
              : `Enregistre votre consentement (version ${HEALTH_CONSENT_VERSION}) et continue`
          }
          accessibilityState={{ disabled: busy, busy: isAccepting }}
        >
          {isAccepting ? (
            <ActivityIndicator color={nc.background} />
          ) : (
            <Text style={[styles.primaryButtonText, { color: nc.background }]}>
              J&apos;accepte
            </Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.secondaryButton,
            { borderColor: nc.borderLight, backgroundColor: nc.background },
            busy && styles.buttonDisabled,
          ]}
          onPress={handleDecline}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Refuser et me déconnecter"
          accessibilityHint={
            isSigningOut
              ? "Déconnexion en cours"
              : "Ferme votre session sans enregistrer de consentement"
          }
          accessibilityState={{ disabled: busy, busy: isSigningOut }}
        >
          {isSigningOut ? (
            <ActivityIndicator color={nc.textStrong} />
          ) : (
            <Text style={[styles.secondaryButtonText, { color: nc.textStrong }]}>
              Refuser et me déconnecter
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={deletion.start}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Supprimer mon compte"
          accessibilityHint="Programme la suppression de votre compte et de vos données"
          style={[styles.deleteButton, busy && styles.buttonDisabled]}
        >
          <Text style={[styles.deleteText, { color: nc.error }]}>
            Supprimer mon compte
          </Text>
        </TouchableOpacity>
        <Text style={[styles.declineNote, { color: nc.textMuted }]}>
          Si vous refusez, vous serez déconnecté et aucune donnée de santé ne
          sera traitée. Vous pouvez aussi supprimer votre compte ici, ou depuis
          les Réglages (Supprimer le compte).
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 16,
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
  title: { fontSize: 24, fontWeight: "700", textAlign: "center" },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginTop: 6 },
  body: { fontSize: 15, lineHeight: 22 },
  bulletRow: { flexDirection: "row", gap: 8 },
  bulletDot: { fontSize: 15, lineHeight: 22 },
  bulletText: { flex: 1 },
  linkButton: { minHeight: 44, justifyContent: "center", marginTop: 6 },
  linkText: { fontSize: 15, fontWeight: "600", textDecorationLine: "underline" },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: { fontSize: 15, fontWeight: "700" },
  secondaryButton: {
    minHeight: 52,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryButtonText: { fontSize: 15, fontWeight: "600" },
  deleteButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  deleteText: { fontSize: 15, fontWeight: "600", textDecorationLine: "underline" },
  declineNote: { fontSize: 12, lineHeight: 17, textAlign: "center" },
  buttonDisabled: { opacity: 0.6 },
});
