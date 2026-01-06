import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  BabyData,
  createAttachmentRequest,
  searchBabyBySimId,
} from "@/services/babyAttachmentService";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';

// Import conditionnel de la caméra pour éviter les erreurs
let CameraView: any = null;
let CameraPermissionComponent: any = null;
let cameraAvailable = false;

try {
  const cameraModule = require("expo-camera");
  CameraView = cameraModule.CameraView;
  const useCameraPermissions = cameraModule.useCameraPermissions;

  // Composant qui utilise le hook de permissions
  CameraPermissionComponent = function CameraPermissions({
    children,
  }: {
    children: (permission: any, requestPermission: any) => React.ReactNode;
  }) {
    const [permission, requestPermission] = useCameraPermissions();
    return <>{children(permission, requestPermission)}</>;
  };

  cameraAvailable = true;
} catch (error) {
  console.log("expo-camera not available, QR scanner will be disabled");

  // Composant fallback qui ne fait rien
  CameraPermissionComponent = function NoCamera({
    children,
  }: {
    children: (permission: any, requestPermission: any) => React.ReactNode;
  }) {
    return <>{children(null, null)}</>;
  };
}

function AddBabyScreenContent({
  permission,
  requestPermission,
}: {
  permission: any;
  requestPermission: any;
}) {
  const { addBaby } = useBaby();
  const colorScheme = useColorScheme();
  const [simId, setSimId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [babyInfo, setBabyInfo] = useState<BabyData | null>(null);
  const [selectedParentEmail, setSelectedParentEmail] = useState<string>("");

  // Vérifier si la caméra est disponible
  const isCameraAvailable = cameraAvailable && CameraView !== null;

  // Masquer partiellement l'email pour la confidentialité
  const maskEmail = (email: string): string => {
    const [localPart, domain] = email.split("@");
    if (!localPart || !domain) return email;

    const visibleStart = localPart.slice(0, 2);
    const visibleEnd = localPart.slice(-1);
    const masked = `${visibleStart}***${visibleEnd}@${domain}`;
    return masked;
  };

  // Gérer le scan du QR code
  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    setShowScanner(false);
    setSimId(data);
    await handleSearchBaby(data);
  };

  // Rechercher le bébé et afficher les informations
  const handleSearchBaby = async (scannedSimId?: string) => {
    const idToUse = scannedSimId || simId;

    if (!idToUse.trim()) {
      Alert.alert("Erreur", "Veuillez saisir un ID SIM valide");
      return;
    }

    setIsLoading(true);

    try {
      // Rechercher le bébé dans la base de données
      const babyData = await searchBabyBySimId(idToUse);

      if (!babyData) {
        Alert.alert(
          "Bébé introuvable",
          "Aucun bébé n'a été trouvé avec cet ID SIM. Veuillez vérifier l'ID et réessayer."
        );
        setBabyInfo(null);
        setIsLoading(false);
        return;
      }

      // Vérifier qu'au moins un email parent est présent
      if (!babyData.parentEmails || babyData.parentEmails.length === 0) {
        Alert.alert(
          "Erreur de configuration",
          "Aucun email parent n'est enregistré pour ce bébé. Veuillez contacter la maternité."
        );
        setBabyInfo(null);
        setIsLoading(false);
        return;
      }

      // Afficher les informations du bébé
      setBabyInfo(babyData);

      // Si un seul parent, le sélectionner automatiquement
      if (babyData.parentEmails.length === 1) {
        setSelectedParentEmail(babyData.parentEmails[0]);
      } else {
        // Réinitialiser la sélection pour forcer le choix
        setSelectedParentEmail("");
      }

      setIsLoading(false);
    } catch (error: any) {
      console.error("Erreur lors de la recherche du bébé:", error);
      Alert.alert(
        "Erreur",
        "Une erreur est survenue lors de la recherche. Veuillez réessayer."
      );
      setBabyInfo(null);
      setIsLoading(false);
    }
  };

  // Envoyer la demande de rattachement
  const handleSendRequest = async () => {
    if (!babyInfo || !simId) {
      Alert.alert("Erreur", "Veuillez d'abord scanner ou saisir un ID SIM");
      return;
    }

    if (!selectedParentEmail) {
      Alert.alert("Erreur", "Veuillez sélectionner l'email du parent");
      return;
    }

    setIsLoading(true);

    try {
      // Créer une demande de rattachement avec l'email sélectionné
      const requestId = await createAttachmentRequest(
        simId,
        babyInfo,
        selectedParentEmail
      );

      Alert.alert(
        "Demande envoyée",
        `Un email de validation a été envoyé à ${maskEmail(
          selectedParentEmail
        )}. Vous devez valider le lien reçu par email pour confirmer le rattachement de ${
          babyInfo.name
        }.`,
        [
          {
            text: "OK",
            onPress: () => {
              // Retourner à la page d'accueil ou à la liste des bébés
              router.back();
            },
          },
        ]
      );

      // Réinitialiser les champs
      setSimId("");
      setBabyInfo(null);
      setSelectedParentEmail("");
    } catch (error: any) {
      console.error("Erreur lors de la demande de rattachement:", error);
      Alert.alert(
        "Erreur",
        error.message ||
          "Une erreur est survenue lors de la demande de rattachement. Veuillez réessayer."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Ouvrir le scanner
  const openScanner = async () => {
    if (!isCameraAvailable) {
      Alert.alert(
        "Caméra non disponible",
        "Le module caméra n'est pas encore configuré. Veuillez redémarrer l'application après avoir exécuté 'npx expo prebuild'. Pour l'instant, utilisez la saisie manuelle de l'ID SIM."
      );
      return;
    }

    if (!permission?.granted) {
      if (requestPermission) {
        const { granted } = await requestPermission();
        if (!granted) {
          Alert.alert(
            "Permission refusée",
            "Vous devez autoriser l'accès à la caméra pour scanner un QR code"
          );
          return;
        }
      }
    }
    setShowScanner(true);
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <FontAwesome name="baby" size={48} color="#4A90E2" />
            <Text style={styles.title}>Ajouter un bébé</Text>

            <Text style={styles.subtitle}>
              Scannez le QR code fourni par la maternité ou saisissez l&apos;ID SIM
            </Text>
          </View>

          {/* Bouton de scan QR code en premier */}
          <View style={styles.section}>
            <TouchableOpacity
              style={[
                styles.scanButton,
                !isCameraAvailable && styles.scanButtonDisabled,
              ]}
              onPress={openScanner}
              disabled={isLoading || !isCameraAvailable}
              activeOpacity={0.7}
            >
              <FontAwesome name="qrcode" size={24} color="white" />
              <Text style={styles.scanButtonText}>
                {isCameraAvailable
                  ? "Scanner le QR Code"
                  : "Scanner QR (Configuration requise)"}
              </Text>
            </TouchableOpacity>
            {!isCameraAvailable && (
              <Text style={styles.cameraNotAvailableText}>
                ⚠️ Scanner QR désactivé. Exécutez &apos;npx expo prebuild&apos; et
                redémarrez l&apos;app.
              </Text>
            )}
          </View>

          {/* Saisie manuelle de l'ID SIM */}
          <View style={styles.section}>
            <Text style={styles.dividerText}>OU</Text>
            <Text style={styles.label}>ID SIM de l&apos;enfant</Text>
            <View style={styles.inputContainer}>
              <FontAwesome name="id-card" size={16} color="#666" />
              <TextInput
                style={styles.input}
                placeholder="Saisissez l'ID SIM"
                value={simId}
                onChangeText={setSimId}
                autoCapitalize="characters"
                editable={!isLoading}
              />
            </View>
            <Text style={styles.helperText}>
              L&apos;ID SIM se trouve sur le bracelet ou la carte fournie par la
              maternité
            </Text>

            {/* Bouton de recherche */}
            <TouchableOpacity
              style={[
                styles.searchButton,
                isLoading && styles.searchButtonDisabled,
              ]}
              onPress={() => handleSearchBaby()}
              disabled={isLoading || !simId.trim()}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <>
                  <FontAwesome name="search" size={16} color="white" />
                  <Text style={styles.searchButtonText}>Rechercher</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Affichage des informations du bébé */}
          {babyInfo && (
            <View style={styles.babyInfoCard}>
              <View style={styles.babyInfoHeader}>
                <FontAwesome name="baby" size={24} color="#28a745" />
                <Text style={styles.babyInfoTitle}>Bébé trouvé</Text>
              </View>

              <View style={styles.babyInfoRow}>
                <Text style={styles.babyInfoLabel}>Nom:</Text>
                <Text style={styles.babyInfoValue}>{babyInfo.name}</Text>
              </View>

              <View style={styles.babyInfoRow}>
                <Text style={styles.babyInfoLabel}>Date de naissance:</Text>
                <Text style={styles.babyInfoValue}>{babyInfo.birthDate}</Text>
              </View>

              {/* Sélection du parent (si plusieurs) */}
              {babyInfo.parentEmails.length > 1 ? (
                <View style={styles.parentSelection}>
                  <Text style={styles.parentSelectionLabel}>
                    Sélectionnez votre email:
                  </Text>
                  {babyInfo.parentEmails.map((email, index) => (
                    <TouchableOpacity
                      key={index}
                      style={[
                        styles.parentEmailOption,
                        selectedParentEmail === email &&
                          styles.parentEmailOptionSelected,
                      ]}
                      onPress={() => setSelectedParentEmail(email)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.radioButton}>
                        {selectedParentEmail === email && (
                          <View style={styles.radioButtonSelected} />
                        )}
                      </View>
                      <Text
                        style={[
                          styles.parentEmailText,
                          selectedParentEmail === email &&
                            styles.parentEmailTextSelected,
                        ]}
                      >
                        {maskEmail(email)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.babyInfoRow}>
                  <Text style={styles.babyInfoLabel}>Email du parent:</Text>
                  <Text style={styles.babyInfoValue}>
                    {maskEmail(babyInfo.parentEmails[0])}
                  </Text>
                </View>
              )}

              <View style={styles.securityNotice}>
                <FontAwesome name="shield-alt" size={16} color="#17a2b8" />
                <Text style={styles.securityText}>
                  Un email de validation sera automatiquement envoyé à
                  l&apos;adresse sélectionnée
                </Text>
              </View>

              {/* Bouton d'envoi de la demande */}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  isLoading && styles.submitButtonDisabled,
                ]}
                onPress={handleSendRequest}
                disabled={isLoading}
                activeOpacity={0.7}
              >
                {isLoading ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <>
                    <FontAwesome name="paper-plane" size={18} color="white" />
                    <Text style={styles.submitButtonText}>Envoyer la demande</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}

          {/* Information supplémentaire */}
          <View style={styles.infoBox}>
            <FontAwesome name="info-circle" size={20} color="#17a2b8" />
            <Text style={styles.infoText}>
              Après avoir scanné ou saisi l&apos;ID SIM, un email de validation sera
              envoyé au parent enregistré à la maternité. Le bébé n&apos;apparaîtra
              dans l&apos;application qu&apos;après validation du lien reçu par
              email.
            </Text>
          </View>

          {/* Modal Scanner QR Code */}
          {isCameraAvailable && CameraView && (
            <Modal
              visible={showScanner}
              animationType="slide"
              onRequestClose={() => setShowScanner(false)}
            >
              <View style={styles.scannerContainer}>
                <View style={styles.scannerHeader}>
                  <Text style={styles.scannerTitle}>Scanner le QR Code</Text>
                  <TouchableOpacity
                    style={styles.closeButton}
                    onPress={() => setShowScanner(false)}
                  >
                    <FontAwesome name="times" size={24} color="#666" />
                  </TouchableOpacity>
                </View>

                <View style={styles.cameraContainer}>
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    onBarcodeScanned={handleBarcodeScanned}
                    barcodeScannerSettings={{
                      barcodeTypes: ["qr"],
                    }}
                  />
                  <View style={styles.scannerOverlay}>
                    <View style={styles.scannerFrame} />
                    <Text style={styles.scannerInstruction}>
                      Placez le QR code dans le cadre
                    </Text>
                  </View>
                </View>
              </View>
            </Modal>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export default function AddBabyScreen() {
  return (
    <CameraPermissionComponent>
      {(permission: any, requestPermission: any) => (
        <AddBabyScreenContent
          permission={permission}
          requestPermission={requestPermission}
        />
      )}
    </CameraPermissionComponent>
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
    paddingHorizontal: 20,
    marginBottom: 24,
    marginTop: 24,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
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
  helperText: {
    fontSize: 13,
    color: "#6c757d",
    marginTop: 6,
    marginBottom: 12,
    fontStyle: "italic",
  },
  dividerText: {
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: "#999",
    marginBottom: 16,
  },
  scanButton: {
    backgroundColor: "#9C27B0",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 12,
    shadowColor: "#9C27B0",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  scanButtonText: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  scanButtonDisabled: {
    backgroundColor: "#ccc",
    shadowOpacity: 0,
  },
  searchButton: {
    backgroundColor: "#4A90E2",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  searchButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  searchButtonDisabled: {
    backgroundColor: "#ccc",
  },
  cameraNotAvailableText: {
    fontSize: 12,
    color: "#dc3545",
    textAlign: "center",
    marginTop: 8,
    fontStyle: "italic",
  },
  babyInfoCard: {
    backgroundColor: "white",
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 20,
    borderRadius: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: "#28a745",
  },
  babyInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
  },
  babyInfoTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#28a745",
  },
  babyInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  babyInfoLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6c757d",
  },
  babyInfoValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#212529",
    flex: 1,
    textAlign: "right",
  },
  parentSelection: {
    marginVertical: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#e9ecef",
  },
  parentSelectionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  parentEmailOption: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "#e9ecef",
    marginBottom: 8,
    backgroundColor: "#f8f9fa",
  },
  parentEmailOptionSelected: {
    borderColor: "#28a745",
    backgroundColor: "#e8f5e9",
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#6c757d",
    marginRight: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  radioButtonSelected: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#28a745",
  },
  parentEmailText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },
  parentEmailTextSelected: {
    fontWeight: "600",
    color: "#28a745",
  },
  securityNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#d1ecf1",
    padding: 12,
    borderRadius: 8,
    gap: 8,
    marginTop: 8,
    marginBottom: 16,
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: "#0c5460",
    lineHeight: 16,
  },
  submitButton: {
    backgroundColor: "#28a745",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 12,
    shadowColor: "#28a745",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonDisabled: {
    backgroundColor: "#ccc",
    shadowOpacity: 0,
  },
  submitButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
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
  scannerContainer: {
    flex: 1,
    backgroundColor: "black",
  },
  scannerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "white",
  },
  scannerTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
  },
  closeButton: {
    padding: 8,
  },
  cameraContainer: {
    flex: 1,
    position: "relative",
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  scannerFrame: {
    width: 250,
    height: 250,
    borderWidth: 3,
    borderColor: "white",
    borderRadius: 12,
    backgroundColor: "transparent",
  },
  scannerInstruction: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 24,
    textAlign: "center",
  },
});
