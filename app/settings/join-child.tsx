import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DotsLoader } from "@/components/ui/DotsLoader";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useBaby, type Child } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { obtenirEvenementsDuJourHybrid } from "@/migration/eventsHybridService";
import {
  acceptInvitation,
  cleanupAlreadyLinkedInvitations,
  cleanupDuplicatePendingInvitations,
  listenToPendingInvitations,
  rejectInvitation,
  redeemShareCode,
  type ShareInvitation,
} from "@/services/childSharingService";
import {
  buildTodayEventsData,
  setTodayEventsCache,
} from "@/services/todayEventsCache";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import * as Haptics from "expo-haptics";
import { Stack, router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function JoinChildScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { showAlert } = useModal();
  const { showToast } = useToast();
  const {
    activeChild,
    children,
    setActiveChild,
    loading: babyLoading,
    childrenLoaded,
  } = useBaby();
  const [shareCode, setShareCode] = useState("");
  const [isLoadingCode, setIsLoadingCode] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<
    ShareInvitation[]
  >([]);
  const [loadingInvitations, setLoadingInvitations] = useState(true);
  const [processingInvitation, setProcessingInvitation] = useState<
    string | null
  >(null);
  const [pendingChildId, setPendingChildId] = useState<string | null>(null);
  const hasNavigatedRef = useRef(false);
  const [switchPromptVisible, setSwitchPromptVisible] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<Child | null>(null);
  const [isPreparingChild, setIsPreparingChild] = useState(false);
  const queueNavigateToChild = useCallback((childId: string) => {
    hasNavigatedRef.current = false;
    setPendingChildId(childId);
  }, []);

  const prefetchTodayForChild = useCallback(async (child: Child) => {
    try {
      const preloadTimeout = new Promise((resolve) =>
        setTimeout(resolve, 2000),
      );
      await Promise.race([
        obtenirEvenementsDuJourHybrid(child.id).then((events) => {
          setTodayEventsCache(child.id, buildTodayEventsData(events));
        }),
        preloadTimeout,
      ]);
    } catch (error) {
      console.warn("[JoinChild] Preload today failed:", error);
    }
  }, []);

  const prepareChildAndNavigate = useCallback(
    async (child: Child) => {
      setIsPreparingChild(true);
      try {
        setActiveChild(child);
        await prefetchTodayForChild(child);
        router.replace("/(drawer)/baby" as any);
      } finally {
        setIsPreparingChild(false);
      }
    },
    [prefetchTodayForChild, setActiveChild],
  );

  // Charger les invitations en attente
  useEffect(() => {
    cleanupDuplicatePendingInvitations().catch((error) => {
      console.warn("[JoinChild] cleanup failed:", error);
    });
    cleanupAlreadyLinkedInvitations().catch((error) => {
      console.warn("[JoinChild] cleanup linked failed:", error);
    });

    const unsubscribe = listenToPendingInvitations((invites) => {
      setPendingInvitations(invites);
      setLoadingInvitations(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!pendingChildId || hasNavigatedRef.current) return;
    if (babyLoading || !childrenLoaded) return;
    const matchedChild = children.find((child) => child.id === pendingChildId);
    if (!matchedChild) return;
    const hasVisibleActiveChild =
      !!activeChild && children.some((child) => child.id === activeChild.id);
    if (hasVisibleActiveChild && children.length > 1) {
      setSwitchTarget(matchedChild);
      setSwitchPromptVisible(true);
      hasNavigatedRef.current = true;
      setPendingChildId(null);
      return;
    }
    hasNavigatedRef.current = true;
    prepareChildAndNavigate(matchedChild);
    setPendingChildId(null);
  }, [
    activeChild,
    babyLoading,
    children,
    childrenLoaded,
    pendingChildId,
    prepareChildAndNavigate,
  ]);

  const handleUseCode = useCallback(async () => {
    if (!shareCode.trim()) {
      showAlert("Erreur", "Veuillez saisir un code");
      return;
    }

    setIsLoadingCode(true);
    try {
      const result = await redeemShareCode(shareCode.trim().toUpperCase());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Code validé avec succès");
      queueNavigateToChild(result.childId);
      setShareCode("");
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast(error.message || "Code invalide. Réessayez.");
      showAlert("Erreur", error.message || "Code invalide");
    } finally {
      setIsLoadingCode(false);
    }
  }, [shareCode, showAlert, showToast, queueNavigateToChild]);

  const handleAcceptInvitation = useCallback(
    async (invitationId: string, childName: string) => {
      setProcessingInvitation(invitationId);
      try {
        await acceptInvitation(invitationId);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast(`Invitation pour ${childName} acceptée`);
        const accepted = pendingInvitations.find(
          (invite) => invite.id === invitationId,
        );
        if (accepted?.childId) {
          queueNavigateToChild(accepted.childId);
        }
      } catch (error: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showToast(
          error.message || "Impossible d'accepter l'invitation. Réessayez.",
        );
        showAlert(
          "Erreur",
          error.message || "Impossible d'accepter l'invitation",
        );
      } finally {
        setProcessingInvitation(null);
      }
    },
    [pendingInvitations, queueNavigateToChild, showAlert, showToast],
  );

  const handleRejectInvitation = useCallback(
    async (invitationId: string) => {
      showAlert(
        "Refuser l'invitation",
        "Êtes-vous sûr de vouloir refuser cette invitation ?",
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Refuser",
            style: "destructive",
            onPress: async () => {
              setProcessingInvitation(invitationId);
              try {
                await rejectInvitation(invitationId);
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Success,
                );
                showToast("Invitation refusée");
              } catch (error) {
                Haptics.notificationAsync(
                  Haptics.NotificationFeedbackType.Error,
                );
                showToast("Impossible de refuser l'invitation. Réessayez.");
                showAlert("Erreur", "Impossible de refuser l'invitation");
              } finally {
                setProcessingInvitation(null);
              }
            },
          },
        ],
      );
    },
    [showAlert, showToast],
  );

  const handleSwitchConfirm = useCallback(() => {
    if (!switchTarget) return;
    setSwitchPromptVisible(false);
    setSwitchTarget(null);
    void prepareChildAndNavigate(switchTarget);
  }, [prepareChildAndNavigate, switchTarget]);

  const handleSwitchLater = useCallback(() => {
    setSwitchPromptVisible(false);
    setSwitchTarget(null);
    router.replace("/(drawer)/baby" as any);
  }, []);

  const headerStyle = useMemo(
    () => [styles.header, { backgroundColor: nc.backgroundCard, shadowColor: nc.shadow }],
    [nc.backgroundCard, nc.shadow],
  );

  const sectionStyle = useMemo(
    () => [styles.section, { backgroundColor: nc.backgroundCard, shadowColor: nc.shadow }],
    [nc.backgroundCard, nc.shadow],
  );

  const invitationCardStyle = useMemo(
    () => [
      styles.invitationCard,
      { backgroundColor: nc.backgroundPressed, borderLeftColor: nc.success },
    ],
    [nc.backgroundPressed, nc.success],
  );

  const inputContainerStyle = useMemo(
    () => [
      styles.inputContainer,
      { backgroundColor: nc.backgroundPressed, borderColor: nc.borderLight },
    ],
    [nc.backgroundPressed, nc.borderLight],
  );

  const submitButtonStyle = useMemo(
    () => [styles.submitButton, { backgroundColor: nc.todayAccent, shadowColor: nc.todayAccent }],
    [nc.todayAccent],
  );

  return (
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <KeyboardAvoidingView
        style={styles.safeArea}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <SafeAreaView
          style={[
            styles.safeArea,
            { backgroundColor: nc.background },
          ]}
          edges={["bottom"]}
        >
          <Stack.Screen
            options={{
              title: "Ajouter avec un code",
              headerBackTitle: "Retour",
            }}
          />
          <ScrollView
            style={styles.container}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <View style={headerStyle}>
              <FontAwesome
                name="user-plus"
                size={48}
                color={Colors[colorScheme].tint}
              />
              <Text style={[styles.title, { color: nc.textStrong }]}>
                Rejoindre un suivi
              </Text>
              <Text style={[styles.subtitle, { color: nc.textLight }]}>
                Accédez au suivi d'un enfant partagé avec vous
              </Text>
            </View>

            {/* Invitations en attente */}
            {!loadingInvitations && pendingInvitations.length > 0 && (
              <View style={sectionStyle}>
                <View style={styles.sectionHeader}>
                  <FontAwesome name="envelope" size={20} color={nc.success} />
                  <Text style={[styles.sectionTitle, { color: nc.textStrong }]}>
                    Invitation{pendingInvitations.length > 1 ? "s" : ""} en
                    attente
                  </Text>
                </View>

                {pendingInvitations.map((invitation) => (
                  <View key={invitation.id} style={invitationCardStyle}>
                    <View style={styles.invitationHeader}>
                      <FontAwesome
                        name="baby"
                        size={24}
                        color={Colors[colorScheme].tint}
                      />
                      <View style={styles.invitationInfo}>
                        <Text
                          style={[
                            styles.invitationChildName,
                            { color: nc.textStrong },
                          ]}
                        >
                          {invitation.childName}
                        </Text>
                        <Text
                          style={[
                            styles.invitationFrom,
                            { color: nc.textLight },
                          ]}
                        >
                          De : {invitation.inviterEmail}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.invitationActions}>
                      <TouchableOpacity
                        style={[
                          styles.invitationButton,
                          styles.rejectButton,
                          { borderColor: "transparent", backgroundColor: nc.error, opacity: 0.85 },
                        ]}
                        onPress={() => handleRejectInvitation(invitation.id!)}
                        disabled={processingInvitation === invitation.id}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Refuser l'invitation de ${invitation.childName}`}
                      >
                        {processingInvitation === invitation.id ? (
                          <ActivityIndicator size="small" color={nc.white} />
                        ) : (
                          <>
                            <FontAwesome
                              name="times"
                              size={16}
                              color={nc.white}
                            />
                            <Text
                              style={[
                                styles.rejectButtonText,
                                { color: nc.white },
                              ]}
                            >
                              Refuser
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.invitationButton,
                          styles.acceptButton,
                          {
                            backgroundColor: nc.success,
                            shadowColor: nc.success,
                          },
                        ]}
                        onPress={() =>
                          handleAcceptInvitation(
                            invitation.id!,
                            invitation.childName,
                          )
                        }
                        disabled={processingInvitation === invitation.id}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Accepter l'invitation de ${invitation.childName}`}
                      >
                        {processingInvitation === invitation.id ? (
                          <ActivityIndicator
                            size="small"
                            color={nc.white}
                          />
                        ) : (
                          <>
                            <FontAwesome
                              name="check"
                              size={16}
                              color={nc.white}
                            />
                            <Text
                              style={[
                                styles.acceptButtonText,
                                { color: nc.white },
                              ]}
                            >
                              Accepter
                            </Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Empty state invitations */}
            {!loadingInvitations && pendingInvitations.length === 0 && (
              <View style={sectionStyle}>
                <View style={styles.sectionHeader}>
                  <FontAwesome
                    name="envelope"
                    size={20}
                    color={nc.textLight}
                  />
                  <Text style={[styles.sectionTitle, { color: nc.textStrong }]}>
                    Invitations
                  </Text>
                </View>
                <Text style={[styles.emptyStateText, { color: nc.textLight }]}>
                  Aucune invitation en attente. Si quelqu'un partage un enfant
                  avec vous, l'invitation apparaîtra ici.
                </Text>
              </View>
            )}

            {/* Utiliser un code */}
            <View style={sectionStyle}>
              <View style={styles.sectionHeader}>
                <FontAwesome name="qrcode" size={20} color={nc.todayAccent} />
                <Text style={[styles.sectionTitle, { color: nc.textStrong }]}>
                  Code de partage
                </Text>
              </View>
              <Text
                style={[styles.sectionDescription, { color: nc.textLight }]}
              >
                Saisissez le code de 6 caractères qui vous a été partagé
              </Text>

              <View style={styles.codeForm}>
                <View style={inputContainerStyle}>
                  <FontAwesome name="key" size={16} color={nc.textLight} />
                  <TextInput
                    style={[styles.input, { color: nc.textStrong }]}
                    placeholder="ABC123"
                    placeholderTextColor={nc.textLight}
                    value={shareCode}
                    onChangeText={(text) => setShareCode(text.toUpperCase())}
                    autoCapitalize="characters"
                    maxLength={6}
                    editable={!isLoadingCode}
                    accessibilityLabel="Code de partage"
                  />
                </View>

                <TouchableOpacity
                  style={[
                    submitButtonStyle,
                    isLoadingCode && styles.buttonDisabled,
                  ]}
                  onPress={handleUseCode}
                  disabled={isLoadingCode}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Valider le code de partage"
                >
                  {isLoadingCode ? (
                    <ActivityIndicator
                      size="small"
                      color={nc.backgroundCard}
                    />
                  ) : (
                    <>
                      <FontAwesome
                        name="unlock"
                        size={18}
                        color={nc.backgroundCard}
                      />
                      <Text
                        style={[
                          styles.submitButtonText,
                          { color: colorScheme === 'dark' ? nc.white : nc.backgroundCard },
                        ]}
                      >
                        Valider le code
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {/* Information */}
            <View
              style={[
                styles.infoBox,
                {
                  backgroundColor: nc.todayAccent + "15",
                  borderLeftColor: nc.todayAccent,
                },
              ]}
            >
              <FontAwesome
                name="info-circle"
                size={20}
                color={nc.todayAccent}
              />
              <Text style={[styles.infoText, { color: nc.textStrong }]}>
                Une fois l'accès validé, vous pourrez voir toutes les
                informations et le suivi de l'enfant partagé avec vous.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
        <ConfirmModal
          visible={switchPromptVisible && !!switchTarget}
          title="Profil ajouté"
          message={`Voulez-vous ouvrir ${switchTarget?.name ?? "ce profil"} maintenant ?`}
          confirmText="Voir le profil"
          cancelText="Plus tard"
          confirmButtonColor={Colors[colorScheme].tint}
          confirmTextColor={
            colorScheme === "dark" ? nc.textStrong : nc.white
          }
          cancelButtonColor={`${nc.textMuted}20`}
          cancelTextColor={nc.textStrong}
          backgroundColor={nc.background}
          textColor={nc.textStrong}
          onConfirm={handleSwitchConfirm}
          onCancel={handleSwitchLater}
          onDismiss={handleSwitchLater}
          allowBackdropDismiss
        />
        {isPreparingChild && (
          <View style={styles.prepOverlay} pointerEvents="auto">
            <View
              style={[
                styles.prepCard,
                { backgroundColor: nc.background },
              ]}
            >
              <DotsLoader color={Colors[colorScheme].tint} />
              <IconPulseDots color={Colors[colorScheme].tint} />
              <Text
                style={[styles.prepText, { color: nc.textStrong }]}
              >
                Chargement du profil...
              </Text>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  header: {
    alignItems: "center",
    padding: 32,
    paddingTop: 48,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: 16,
    lineHeight: 22,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    padding: 20,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  sectionDescription: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyStateText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    paddingVertical: 12,
  },
  invitationCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
  },
  invitationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  invitationInfo: {
    flex: 1,
  },
  invitationChildName: {
    fontSize: 18,
    fontWeight: "700",
  },
  invitationFrom: {
    fontSize: 14,
    marginTop: 4,
  },
  invitationActions: {
    flexDirection: "row",
    gap: 12,
  },
  invitationButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    minHeight: 44,
    borderRadius: 10,
    gap: 8,
  },
  rejectButton: {
    borderWidth: 2,
  },
  rejectButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  acceptButton: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  codeForm: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 48,
    borderWidth: 1,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 4,
  },
  submitButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    minHeight: 48,
    gap: 12,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  infoBox: {
    flexDirection: "row",
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 32,
    borderRadius: 12,
    gap: 12,
    borderLeftWidth: 4,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  prepOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  prepCard: {
    width: "100%",
    maxWidth: 360,
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 16,
    alignItems: "center",
    gap: 12,
  },
  prepText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
