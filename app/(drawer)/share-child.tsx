import { ThemedView } from "@/components/themed-view";
import { db } from "@/config/firebase";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useModal } from "@/contexts/ModalContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  createEmailInvitation,
  createShareCode,
  cleanupExpiredShareCodes,
  listenToActiveShareCode,
} from "@/services/childSharingService";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
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

export default function ShareChildScreen() {
  const colorScheme = useColorScheme();
  const { showAlert } = useModal();
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const childId = params.childId as string;

  const [childName, setChildName] = useState("");
  const [shareCode, setShareCode] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isLoadingCode, setIsLoadingCode] = useState(false);
  const [isLoadingInvite, setIsLoadingInvite] = useState(false);
  const [isLoadingChild, setIsLoadingChild] = useState(true);
  const isSendingInviteRef = useRef(false);

  // Charger les infos de l'enfant et le code existant
  useEffect(() => {
    loadChildInfo();
    cleanupExpiredShareCodes(childId).catch((error) => {
      console.warn("[ShareChild] cleanup expired codes failed:", error);
    });
    const unsubscribe = listenToActiveShareCode(childId, setShareCode);
    return () => {
      unsubscribe();
    };
  }, [childId]);

  const loadChildInfo = async () => {
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
  };


  const handleGenerateCode = async () => {
    setIsLoadingCode(true);
    try {
      const code = await createShareCode(childId, childName);
      setShareCode(code);
      showAlert("Succès", "Code de partage créé avec succès !", [{ text: "" }]);
    } catch (error: any) {
      showAlert("Erreur", error.message || "Impossible de créer le code");
    } finally {
      setIsLoadingCode(false);
    }
  };

  const handleCopyCode = () => {
    if (shareCode) {
      Clipboard.setString(shareCode);
      showAlert("✅", "Code copié dans le presse-papier", [{ text: "" }]);
    }
  };

  const handleShareCode = async () => {
    if (!shareCode) return;

    try {
      await RNShare.share({
        message: `Voici le code pour accéder au suivi de ${childName} : ${shareCode}\n\nUtilise ce code dans l'app Suivi Baby pour voir les informations de notre enfant. Le code est valide pendant 7 jours.`,
      });
    } catch (error) {
      console.error("Erreur partage:", error);
    }
  };

  const handleSendInvitation = async () => {
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
      await createEmailInvitation(childId, childName, trimmedEmail);
      showAlert(
        "Invitation envoyée",
        `Une invitation a été envoyée à ${trimmedEmail}. L'autre parent recevra une notification dans l'app.`,
        [{ text: "" }],
      );
      setInviteEmail("");
    } catch (error: any) {
      if (error?.code === "already-linked") {
        const email = error?.email ?? trimmedEmail;
        showAlert(
          "Déjà lié",
          `Cet enfant est déjà lié au destinataire ${email}.`,
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
  };
  const testHandleSendInvitation = async () => {
    if (isSendingInviteRef.current || isLoadingInvite) return;

    const inviteEmail = "nessy107@gmail.com"; // Example email for testing
    if (!inviteEmail.trim()) {
      showAlert("Erreur", "Veuillez saisir une adresse email");
      return;
    }

    // Validation email simple
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
      showAlert("Erreur", "Veuillez saisir une adresse email valide");
      return;
    }

    isSendingInviteRef.current = true;
    setIsLoadingInvite(true);
    try {
      await createEmailInvitation(childId, childName, inviteEmail);
      showAlert(
        "Invitation envoyée",
        `Une invitation a été envoyée à ${inviteEmail}. L'autre parent recevra une notification dans l'app.`,
        [{ text: "" }],
      );
      setInviteEmail("");
    } catch (error: any) {
      if (error?.code === "already-linked") {
        const email = error?.email ?? inviteEmail;
        showAlert(
          "Déjà lié",
          `Cet enfant est déjà lié au destinataire ${email}.`,
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
  };

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
          style={[
            styles.safeArea,
            { backgroundColor: Colors[colorScheme].background },
          ]}
          edges={["bottom"]}
        >
          <ScrollView
            style={styles.container}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.header}>
              <TouchableOpacity
                activeOpacity={1}
                onPress={testHandleSendInvitation}
              >
                <FontAwesome name="share-alt" size={48} color="#4A90E2" />
              </TouchableOpacity>
              <Text style={styles.title}>Partager {childName}</Text>
              <Text style={styles.subtitle}>
                Donnez accès au suivi de votre enfant à un autre parent
              </Text>
            </View>

            {/* Méthode 1 : Code de partage rapide */}
            <View style={styles.section}>
              <View style={styles.methodHeader}>
                <FontAwesome name="qrcode" size={24} color="#9C27B0" />
                <Text style={styles.methodTitle}>Code de partage rapide</Text>
              </View>
              <Text style={styles.methodDescription}>
                Générez un code à partager par SMS, WhatsApp ou autre. Valide
                pendant 7 jours.
              </Text>

              {shareCode ? (
                <View style={styles.codeContainer}>
                  <View style={styles.codeBox}>
                    <Text style={styles.codeText}>{shareCode}</Text>
                  </View>

                  <View style={styles.codeActions}>
                    <TouchableOpacity
                      style={styles.codeButton}
                      onPress={handleCopyCode}
                      activeOpacity={0.7}
                    >
                      <FontAwesome name="copy" size={18} color="#4A90E2" />
                      <Text style={styles.codeButtonText}>Copier</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.codeButton}
                      onPress={handleShareCode}
                      activeOpacity={0.7}
                    >
                      <FontAwesome name="share" size={18} color="#4A90E2" />
                      <Text style={styles.codeButtonText}>Partager</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.codeHelper}>
                    L'autre parent devra aller dans "Ajouter un enfant" puis
                    "J'ai un code"
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.generateButton,
                    isLoadingCode && styles.buttonDisabled,
                  ]}
                  onPress={handleGenerateCode}
                  disabled={isLoadingCode}
                  activeOpacity={0.7}
                >
                  {isLoadingCode ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <FontAwesome name="plus-circle" size={18} color="white" />
                      <Text style={styles.generateButtonText}>
                        Générer un code
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>

            {/* Méthode 2 : Invitation par email */}
            <View style={styles.section}>
              <View style={styles.methodHeader}>
                <FontAwesome name="envelope" size={24} color="#28a745" />
                <Text style={styles.methodTitle}>Invitation par email</Text>
              </View>
              <Text style={styles.methodDescription}>
                Invitez directement un autre parent en saisissant son adresse
                email.
              </Text>

              <View style={styles.inviteForm}>
                <View style={styles.inputContainer}>
                  <FontAwesome name="at" size={16} color="#666" />
                  <TextInput
                    style={styles.input}
                    placeholder="email@exemple.com"
                    value={inviteEmail}
                    onChangeText={setInviteEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    editable={!isLoadingInvite}
                  />
                </View>

                <TouchableOpacity
                  style={[
                    styles.inviteButton,
                    isLoadingInvite && styles.buttonDisabled,
                  ]}
                  onPress={handleSendInvitation}
                  disabled={isLoadingInvite}
                  activeOpacity={0.7}
                >
                  {isLoadingInvite ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <FontAwesome name="paper-plane" size={18} color="white" />
                      <Text style={styles.inviteButtonText}>
                        Envoyer l'invitation
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                <Text style={styles.inviteHelper}>
                  L'autre parent recevra une notification dans l'app et pourra
                  accepter l'invitation
                </Text>
              </View>
            </View>

            {/* Information de sécurité */}
            <View style={styles.infoBox}>
              <FontAwesome name="shield-alt" size={20} color="#17a2b8" />
              <Text style={styles.infoText}>
                Les deux parents auront un accès complet au suivi de l'enfant.
                Vous pourrez retirer l'accès à tout moment depuis les
                paramètres.
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
  header: {
    alignItems: "center",
    padding: 32,
    paddingTop: 48,
    backgroundColor: "white",
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#212529",
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: "#6c757d",
    textAlign: "center",
    paddingHorizontal: 16,
    lineHeight: 22,
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 32,
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  methodHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  methodTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#212529",
  },
  methodDescription: {
    fontSize: 14,
    color: "#6c757d",
    lineHeight: 20,
    marginBottom: 20,
  },
  codeContainer: {
    alignItems: "center",
  },
  codeBox: {
    backgroundColor: "#f8f9fa",
    borderWidth: 2,
    borderColor: "#9C27B0",
    borderRadius: 12,
    paddingVertical: 20,
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  codeText: {
    fontSize: 32,
    fontWeight: "700",
    color: "#9C27B0",
    letterSpacing: 4,
  },
  codeActions: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  codeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#4A90E2",
    backgroundColor: "#f0f8ff",
  },
  codeButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#4A90E2",
  },
  codeHelper: {
    fontSize: 13,
    color: "#6c757d",
    textAlign: "center",
    fontStyle: "italic",
  },
  generateButton: {
    backgroundColor: "#9C27B0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 12,
    borderRadius: 12,
    shadowColor: "#9C27B0",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  generateButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  inviteForm: {
    gap: 16,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "#e9ecef",
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: "#333",
  },
  inviteButton: {
    backgroundColor: "#28a745",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 12,
    borderRadius: 12,
    shadowColor: "#28a745",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  inviteButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  inviteHelper: {
    fontSize: 13,
    color: "#6c757d",
    textAlign: "center",
    fontStyle: "italic",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: "#d1ecf1",
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 32,
    borderRadius: 12,
    gap: 12,
    borderLeftWidth: 4,
    borderLeftColor: "#17a2b8",
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: "#0c5460",
    lineHeight: 20,
  },
});
