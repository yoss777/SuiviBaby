import { ThemedView } from "@/components/themed-view";
import { db } from "@/config/firebase";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useModal } from "@/contexts/ModalContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  createEmailInvitation,
  createShareCode,
  listenToActiveShareCode,
} from "@/services/childSharingService";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Clipboard,
  KeyboardAvoidingView,
  Platform,
  Share as RNShare,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useHeaderLeft } from "./_layout";
import { HeaderBackButton } from "@react-navigation/elements";

export default function ShareChildScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { showAlert } = useModal();
  const { user } = useAuth();
  const router = useRouter();
  const { setHeaderLeft } = useHeaderLeft();
  const params = useLocalSearchParams();
  const childId = params.childId as string;
  const returnTo = Array.isArray(params.returnTo)
    ? params.returnTo[0]
    : (params.returnTo as string | undefined);

  const [childName, setChildName] = useState("");
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isLoadingCode, setIsLoadingCode] = useState(false);
  const [isLoadingInvite, setIsLoadingInvite] = useState(false);
  const [isLoadingChild, setIsLoadingChild] = useState(true);
  const isSendingInviteRef = useRef(false);

  const dynamicStyles = useMemo(
    () =>
      StyleSheet.create({
        header: {
          alignItems: "center",
          padding: 32,
          paddingTop: 48,
          backgroundColor: nc.backgroundCard,
          borderBottomLeftRadius: 24,
          borderBottomRightRadius: 24,
          shadowColor: nc.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
          marginBottom: 24,
        },
        title: {
          fontSize: 28,
          fontWeight: "700",
          color: nc.textStrong,
          marginTop: 16,
          marginBottom: 8,
        },
        subtitle: {
          fontSize: 15,
          color: nc.textLight,
          textAlign: "center",
          paddingHorizontal: 16,
          lineHeight: 22,
        },
        section: {
          marginHorizontal: 20,
          marginBottom: 32,
          backgroundColor: nc.backgroundCard,
          borderRadius: 16,
          padding: 20,
          shadowColor: nc.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        },
        methodTitle: {
          fontSize: 20,
          fontWeight: "700",
          color: nc.textStrong,
        },
        methodDescription: {
          fontSize: 14,
          color: nc.textLight,
          lineHeight: 20,
          marginBottom: 20,
        },
        codeBox: {
          backgroundColor: nc.backgroundPressed,
          borderWidth: 2,
          borderColor: Colors[colorScheme].tint,
          borderRadius: 12,
          paddingVertical: 20,
          paddingHorizontal: 32,
          marginBottom: 16,
        },
        codeText: {
          fontSize: 32,
          fontWeight: "700",
          color: Colors[colorScheme].tint,
          letterSpacing: 4,
        },
        codeButton: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          gap: 8,
          paddingVertical: 12,
          paddingHorizontal: 20,
          minHeight: 44,
          borderRadius: 10,
          borderWidth: 2,
          borderColor: nc.todayAccent,
          backgroundColor: nc.todayAccent + "15",
        },
        codeButtonText: {
          fontSize: 16,
          fontWeight: "600",
          color: nc.todayAccent,
        },
        codeHelper: {
          fontSize: 13,
          color: nc.textLight,
          textAlign: "center" as const,
          fontStyle: "italic" as const,
        },
        generateButton: {
          backgroundColor: nc.todayAccent,
          flexDirection: "row" as const,
          alignItems: "center" as const,
          justifyContent: "center" as const,
          paddingVertical: 14,
          minHeight: 48,
          gap: 12,
          borderRadius: 12,
          shadowColor: nc.todayAccent,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 5,
        },
        generateButtonText: {
          color: nc.white,
          fontSize: 16,
          fontWeight: "600",
        },
        inputContainer: {
          flexDirection: "row" as const,
          alignItems: "center" as const,
          backgroundColor: nc.backgroundPressed,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          minHeight: 48,
          borderWidth: 1,
          borderColor: nc.borderLight,
          gap: 12,
        },
        input: {
          flex: 1,
          fontSize: 16,
          color: nc.textStrong,
        },
        inviteButton: {
          backgroundColor: nc.success,
          flexDirection: "row" as const,
          alignItems: "center" as const,
          justifyContent: "center" as const,
          paddingVertical: 14,
          minHeight: 48,
          gap: 12,
          borderRadius: 12,
          shadowColor: nc.success,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 8,
          elevation: 5,
        },
        inviteButtonText: {
          color: nc.white,
          fontSize: 16,
          fontWeight: "600",
        },
        inviteHelper: {
          fontSize: 13,
          color: nc.textLight,
          textAlign: "center" as const,
          fontStyle: "italic" as const,
        },
        infoBox: {
          flexDirection: "row" as const,
          backgroundColor: nc.todayAccent + "15",
          padding: 16,
          marginHorizontal: 20,
          marginBottom: 32,
          borderRadius: 12,
          gap: 12,
          borderLeftWidth: 4,
          borderLeftColor: nc.todayAccent,
        },
        infoText: {
          flex: 1,
          fontSize: 14,
          color: nc.todayAccent,
          lineHeight: 20,
        },
      }),
    [nc, colorScheme],
  );

  const loadChildInfo = useCallback(async () => {
    try {
      const childDoc = await getDoc(doc(db, "children", childId));
      if (childDoc.exists()) {
        setChildName(childDoc.data().name);
      }
    } catch (error) {
      console.error("Erreur chargement enfant:", error);
    } finally {
      setIsLoadingChild(false);
    }
  }, [childId]);

  // Charger les infos de l'enfant et le code existant
  useEffect(() => {
    loadChildInfo();
    if (!user?.uid) {
      setShareCode(null);
      return;
    }
    const unsubscribe = listenToActiveShareCode(childId, setShareCode);
    return () => {
      unsubscribe();
    };
  }, [childId, user?.uid, loadChildInfo]);

  useFocusEffect(
    useCallback(() => {
      if (!returnTo) {
        setHeaderLeft(null, childId);
        return () => setHeaderLeft(null, childId);
      }

      const backButton = (
        <HeaderBackButton
          onPress={() => router.replace(returnTo as any)}
          tintColor={Colors[colorScheme].text}
        />
      );
      setHeaderLeft(backButton, childId);
      return () => setHeaderLeft(null, childId);
    }, [childId, colorScheme, returnTo, router, setHeaderLeft])
  );

  const handleGenerateCode = useCallback(async () => {
    setIsLoadingCode(true);
    try {
      const code = await createShareCode(childId, childName);
      setShareCode(code);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert("Succes", "Code de partage cree avec succes !", [{ text: "" }]);
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showAlert("Erreur", error.message || "Impossible de creer le code");
    } finally {
      setIsLoadingCode(false);
    }
  }, [childId, childName, showAlert]);

  const handleCopyCode = useCallback(() => {
    if (shareCode) {
      Clipboard.setString(shareCode);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      showAlert("\u2705", "Code copie dans le presse-papier", [{ text: "" }]);
    }
  }, [shareCode, showAlert]);

  const handleShareCode = useCallback(async () => {
    if (!shareCode) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await RNShare.share({
        message: `Voici le code pour acceder au suivi de ${childName} : ${shareCode}\n\nUtilise ce code dans l'app Suivi Baby pour voir les informations de notre enfant. Le code est valide pendant 7 jours.`,
      });
    } catch (error) {
      console.error("Erreur partage:", error);
    }
  }, [shareCode, childName]);

  const handleSendInvitation = useCallback(async () => {
    if (isSendingInviteRef.current || isLoadingInvite) return;
    const trimmedEmail = inviteEmail.trim();
    if (!trimmedEmail) {
      showAlert("Erreur", "Veuillez saisir une adresse email");
      return;
    }

    // Validation email simple
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      showAlert("Erreur", "Veuillez saisir une adresse email valide");
      return;
    }

    isSendingInviteRef.current = true;
    setIsLoadingInvite(true);
    try {
      console.log("[Invitation] handleSendInvitation", {
        childId,
        childName,
        inviterId: user?.uid ?? null,
        invitedEmail: trimmedEmail,
      });
      await createEmailInvitation(childId, childName, trimmedEmail);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showAlert(
        "Invitation envoyee",
        `Une invitation a ete envoyee a ${trimmedEmail}. L'autre parent recevra une notification dans l'app.`,
        [{ text: "" }],
      );
      setInviteEmail("");
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      if (error?.code === "already-linked") {
        const email = error?.email ?? trimmedEmail;
        showAlert(
          "Deja lie",
          `Cet enfant est deja lie au destinataire ${email}.`,
          [{ text: "" }],
        );
      } else {
        showAlert(
          "Erreur",
          error.message || "Impossible d'envoyer l'invitation",
        );
      }
    } finally {
      setIsLoadingInvite(false);
      isSendingInviteRef.current = false;
    }
  }, [childId, childName, inviteEmail, isLoadingInvite, showAlert, user?.uid]);

  if (isLoadingChild) {
    return (
      <ThemedView style={styles.screen}>
        <KeyboardAvoidingView
          style={styles.safeArea}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
        >
          <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
            <View style={styles.loadingContainer}>
              <ActivityIndicator
                size="large"
                color={Colors[colorScheme].tint}
              />
            </View>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <KeyboardAvoidingView
        style={styles.safeArea}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        <SafeAreaView
          style={styles.safeArea}
          edges={["bottom"]}
        >
          <ScrollView
            style={styles.container}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <View style={dynamicStyles.header}>
              <FontAwesome name="share-alt" size={48} color={nc.todayAccent} />
              <Text style={dynamicStyles.title}>Partager {childName}</Text>
              <Text style={dynamicStyles.subtitle}>
                Donnez acces au suivi de votre enfant a un autre parent
              </Text>
            </View>

            {/* Methode 1 : Code de partage rapide */}
            <View style={dynamicStyles.section}>
              <View style={styles.methodHeader}>
                <FontAwesome
                  name="qrcode"
                  size={24}
                  color={Colors[colorScheme].tint}
                />
                <Text style={dynamicStyles.methodTitle}>
                  Code de partage rapide
                </Text>
              </View>
              <Text style={dynamicStyles.methodDescription}>
                Generez un code a partager par SMS, WhatsApp ou autre. Valide
                pendant 7 jours.
              </Text>

              {shareCode ? (
                <View style={styles.codeContainer}>
                  <View style={dynamicStyles.codeBox}>
                    <Text style={dynamicStyles.codeText}>{shareCode}</Text>
                  </View>

                  <View style={styles.codeActions}>
                    <TouchableOpacity
                      style={dynamicStyles.codeButton}
                      onPress={handleCopyCode}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Copier le code de partage"
                    >
                      <FontAwesome
                        name="copy"
                        size={18}
                        color={nc.todayAccent}
                      />
                      <Text style={dynamicStyles.codeButtonText}>Copier</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={dynamicStyles.codeButton}
                      onPress={handleShareCode}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Partager le code via une autre application"
                    >
                      <FontAwesome
                        name="share"
                        size={18}
                        color={nc.todayAccent}
                      />
                      <Text style={dynamicStyles.codeButtonText}>Partager</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={dynamicStyles.codeHelper}>
                    L'autre parent devra aller dans "Ajouter un enfant" puis
                    "J'ai un code"
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    dynamicStyles.generateButton,
                    isLoadingCode && styles.buttonDisabled,
                  ]}
                  onPress={handleGenerateCode}
                  disabled={isLoadingCode}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Generer un code de partage"
                >
                  {isLoadingCode ? (
                    <ActivityIndicator size="small" color={nc.white} />
                  ) : (
                    <>
                      <FontAwesome
                        name="plus-circle"
                        size={18}
                        color={nc.white}
                      />
                      <Text style={dynamicStyles.generateButtonText}>
                        Generer un code
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Methode 2 : Invitation par email */}
            <View style={dynamicStyles.section}>
              <View style={styles.methodHeader}>
                <FontAwesome name="envelope" size={24} color={nc.success} />
                <Text style={dynamicStyles.methodTitle}>
                  Invitation par email
                </Text>
              </View>
              <Text style={dynamicStyles.methodDescription}>
                Invitez directement un autre parent en saisissant son adresse
                email.
              </Text>

              <View style={styles.inviteForm}>
                <View style={dynamicStyles.inputContainer}>
                  <FontAwesome name="at" size={16} color={nc.textLight} />
                  <TextInput
                    style={dynamicStyles.input}
                    placeholder="email@exemple.com"
                    placeholderTextColor={nc.textMuted}
                    value={inviteEmail}
                    onChangeText={setInviteEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!isLoadingInvite}
                    accessibilityLabel="Adresse email du parent a inviter"
                  />
                </View>

                <TouchableOpacity
                  style={[
                    dynamicStyles.inviteButton,
                    isLoadingInvite && styles.buttonDisabled,
                  ]}
                  onPress={handleSendInvitation}
                  disabled={isLoadingInvite}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Envoyer l'invitation par email"
                >
                  {isLoadingInvite ? (
                    <ActivityIndicator size="small" color={nc.white} />
                  ) : (
                    <>
                      <FontAwesome
                        name="paper-plane"
                        size={18}
                        color={nc.white}
                      />
                      <Text style={dynamicStyles.inviteButtonText}>
                        Envoyer l'invitation
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <Text style={dynamicStyles.inviteHelper}>
                  L'autre parent recevra une notification dans l'app et pourra
                  accepter l'invitation
                </Text>
              </View>
            </View>

            {/* Information de securite */}
            <View
              style={dynamicStyles.infoBox}
              accessibilityRole="text"
              accessibilityLabel="Information de securite : les deux parents auront un acces complet au suivi de l'enfant"
            >
              <FontAwesome
                name="shield-alt"
                size={20}
                color={nc.todayAccent}
              />
              <Text style={dynamicStyles.infoText}>
                Les deux parents auront un acces complet au suivi de l'enfant.
                Vous pourrez retirer l'acces a tout moment depuis les
                parametres.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  methodHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  codeContainer: {
    alignItems: "center",
  },
  codeActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  inviteForm: {
    gap: 16,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
