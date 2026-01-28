import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedView } from "@/components/themed-view";
import { db } from "@/config/firebase";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { Child } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  afficherEnfant,
  obtenirPreferences,
} from "@/services/userPreferencesService";
import { collection, getDocs, query, where } from "firebase/firestore";

const { width } = Dimensions.get("window");

export default function HiddenChildrenScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const router = useRouter();
  const { showAlert } = useModal();
  const { user } = useAuth();
  const [hiddenChildren, setHiddenChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [childToRestore, setChildToRestore] = useState<{
    id: string;
    name: string;
  } | null>(null);

  useEffect(() => {
    loadHiddenChildren();
  }, [user]);

  const loadHiddenChildren = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Récupérer les préférences pour obtenir la liste des IDs masqués
      const prefs = await obtenirPreferences();
      const hiddenIds = prefs.hiddenChildrenIds || [];

      if (hiddenIds.length === 0) {
        setHiddenChildren([]);
        setLoading(false);
        return;
      }

      // Récupérer tous les enfants de l'utilisateur
      const q = query(
        collection(db, "children"),
        where("parentIds", "array-contains", user.uid),
      );

      const snapshot = await getDocs(q);
      const allChildren: Child[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Child, "id">),
      }));

      // Filtrer uniquement les enfants masqués
      const hidden = allChildren.filter((child) =>
        hiddenIds.includes(child.id),
      );
      setHiddenChildren(hidden);
    } catch (error) {
      console.error("Erreur lors du chargement des enfants masqués:", error);
      showAlert("Erreur", "Impossible de charger les enfants masqués.");
    } finally {
      setLoading(false);
    }
  };

  const calculateAge = (birthDate: string) => {
    const [day, month, year] = birthDate.split("/").map(Number);
    const birth = new Date(year, month - 1, day);
    const today = new Date();
    let totalMonths =
      (today.getFullYear() - birth.getFullYear()) * 12 +
      (today.getMonth() - birth.getMonth());
    if (today.getDate() < birth.getDate()) {
      totalMonths -= 1;
    }
    if (totalMonths < 0) totalMonths = 0;

    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;

    if (years === 0) {
      return `${totalMonths} mois`;
    } else if (months === 0) {
      return years === 1 ? `${years} an` : `${years} ans`;
    } else {
      const yearText = years === 1 ? "an" : "ans";
      return `${years} ${yearText} ${months} mois`;
    }
  };

  const handleRestoreChild = (childId: string, childName: string) => {
    setChildToRestore({ id: childId, name: childName });
    setShowRestoreModal(true);
  };

  const confirmRestoreChild = async () => {
    if (!childToRestore) return;

    try {
      await afficherEnfant(childToRestore.id);
      setShowRestoreModal(false);
      setChildToRestore(null);
      // Recharger la liste
      await loadHiddenChildren();
    } catch (error) {
      console.error("Erreur lors de la restauration:", error);
      showAlert("Erreur", "Impossible de restaurer l'enfant.");
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: Colors[colorScheme].background },
        ]}
        edges={["top", "bottom"]}
      >
        <Stack.Screen
          options={{
            title: "Enfants masqués",
            headerBackTitle: "Retour",
          }}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator
                size="large"
                color={Colors[colorScheme].tint}
              />
              <Text
                style={[
                  styles.loadingText,
                  { color: Colors[colorScheme].tabIconDefault },
                ]}
              >
                Chargement...
              </Text>
            </View>
          ) : hiddenChildren.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FontAwesome
                name="eye-slash"
                size={48}
                color={Colors[colorScheme].tabIconDefault}
              />
              <Text
                style={[styles.emptyTitle, { color: Colors[colorScheme].text }]}
              >
                Aucun enfant masqué
              </Text>
              <Text
                style={[
                  styles.emptyDescription,
                  { color: Colors[colorScheme].tabIconDefault },
                ]}
              >
                Vous pouvez masquer un enfant de votre liste de suivi depuis le
                menu principal.
              </Text>
            </View>
          ) : (
            <View style={styles.childrenList}>
              <Text
                style={[
                  styles.infoText,
                  { color: Colors[colorScheme].tabIconDefault },
                ]}
              >
                Ces enfants sont masqués de votre liste de suivi. Vous pouvez
                les restaurer à tout moment.
              </Text>
              {hiddenChildren.map((child) => {
                const ageText = calculateAge(child.birthDate);
                return (
                  <View key={child.id} style={styles.childItemContainer}>
                    <ThemedView style={styles.childCard}>
                      <View style={styles.childAvatar}>
                        <Text style={styles.childAvatarEmoji}>
                          {child.gender === "male" ? "👶" : "👧"}
                        </Text>
                      </View>
                      <View style={styles.childDetails}>
                        <Text
                          style={[
                            styles.childName,
                            { color: Colors[colorScheme].text },
                          ]}
                        >
                          {child.name}
                        </Text>
                        <Text
                          style={[
                            styles.childAge,
                            { color: Colors[colorScheme].tabIconDefault },
                          ]}
                        >
                          {ageText} • {child.birthDate}
                        </Text>
                      </View>
                    </ThemedView>
                    <TouchableOpacity
                      style={styles.restoreButton}
                      onPress={() => handleRestoreChild(child.id, child.name)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <FontAwesome name="eye" size={20} color="#28a745" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Modal de confirmation pour restaurer un enfant */}
        <Modal
          visible={showRestoreModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowRestoreModal(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setShowRestoreModal(false)}
          >
            <Pressable
              style={[
                styles.modalContent,
                { backgroundColor: Colors[colorScheme].background },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text
                style={[styles.modalTitle, { color: Colors[colorScheme].text }]}
              >
                Restaurer l'affichage
              </Text>
              <Text
                style={[
                  styles.modalSubtitle,
                  { color: Colors[colorScheme].text },
                ]}
              >
                Êtes-vous sûr de vouloir restaurer{" "}
                <Text style={styles.childNameInModal}>
                  {childToRestore?.name}
                </Text>{" "}
                dans votre liste de suivi ?
              </Text>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setShowRestoreModal(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelButtonText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={confirmRestoreChild}
                  activeOpacity={0.7}
                >
                  <Text style={styles.confirmButtonText}>Restaurer</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </ThemedView>
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
    flexGrow: 1,
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  childrenList: {
    paddingHorizontal: 16,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  childItemContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  childCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  childAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  childAvatarEmoji: {
    fontSize: 20,
  },
  childDetails: {
    flex: 1,
  },
  childName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4,
  },
  childAge: {
    fontSize: 13,
  },
  restoreButton: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: width * 0.85,
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: "center",
    opacity: 0.7,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    backgroundColor: "#f0f0f0",
  },
  confirmButton: {
    backgroundColor: "#28a745",
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#666",
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  childNameInModal: {
    fontWeight: "700",
  },
});
