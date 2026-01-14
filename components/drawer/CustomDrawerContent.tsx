import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { DrawerContentScrollView } from "@react-navigation/drawer";
import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Dimensions, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { AddChildModal } from "@/components/suivibaby/AddChildModal";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { masquerEnfant } from "@/services/userPreferencesService";

const { width } = Dimensions.get('window');

export function CustomDrawerContent(props: any) {
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme() ?? "light";
  const { activeChild, children, setActiveChild } = useBaby();
  const { signOut, user, userName, email } = useAuth();
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showHideModal, setShowHideModal] = useState(false);
  const [childToHide, setChildToHide] = useState<{ id: string; name: string } | null>(null);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const isActive = (routeName: string) => pathname.includes(routeName);

  // Réinitialiser le champ de recherche quand on change de route
  useEffect(() => {
    setIsSearchActive(false);
    setSearchQuery("");
  }, [pathname]);

  // Rediriger vers explore si tous les enfants sont masqués
  useEffect(() => {
    if (children.length === 0 && pathname.includes('/baby')) {
      console.log('[CustomDrawer] Tous les enfants masqués, redirection vers explore');
      router.replace('/explore');
    }
  }, [children.length, pathname]);

  // Calculate baby's age in years and months
  const calculateAge = (birthDate: string) => {
    const [day, month, year] = birthDate.split("/").map(Number);
    const birth = new Date(year, month - 1, day);
    const today = new Date();
    const totalMonths =
      (today.getFullYear() - birth.getFullYear()) * 12 +
      (today.getMonth() - birth.getMonth());

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

  const handleSignOut = async () => {
    Alert.alert("Déconnexion", "Êtes-vous sûr de vouloir vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Déconnexion",
        style: "destructive",
        onPress: async () => {
          try {
            await signOut();
            router.replace("/(auth)/login");
          } catch (error) {
            Alert.alert("Erreur", "Impossible de se déconnecter");
          }
        },
      },
    ]);
  };

  const handleHideChild = (childId: string, childName: string) => {
    setChildToHide({ id: childId, name: childName });
    setShowHideModal(true);
  };

  const confirmHideChild = async () => {
    if (!childToHide) return;

    try {
      await masquerEnfant(childToHide.id);
      setShowHideModal(false);
      setChildToHide(null);
      
      // Si c'était le dernier enfant visible, la redirection se fera via useEffect
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de masquer l\'enfant.');
    }
  };

  return (
    <DrawerContentScrollView
      {...props}
      style={{ backgroundColor: Colors[colorScheme].background }}
    >
      {/* Section: Informations utilisateur */}
      {user && (
        <View style={styles.userInfoSection}>
          <View style={styles.userInfoContainer}>
            <Text
              style={[styles.userName, { color: Colors[colorScheme].text }]}
            >
              {userName || email?.split('@')[0] || user.email?.split('@')[0]}
            </Text>

            <Text
              style={[
                styles.userEmail,
                { color: Colors[colorScheme].tabIconDefault },
              ]}
            >
              {email || user.email}
            </Text>
          </View>

        </View>
      )}

      {/* Section: Suivi Enfant */}
      <View style={[styles.section, styles.babySection]}>
        <Text
          style={[
            styles.sectionHeader,
            { color: Colors[colorScheme].tabIconDefault },
          ]}
        >
          <FontAwesome name="baby" size={16} color="#4A90E2" />
          &nbsp;SUIVI POUR
        </Text>

        {/* Liste des enfants */}
        {children.map((child) => {
          const ageText = calculateAge(child.birthDate);
          const isActive = child.id === activeChild?.id && pathname.includes("/baby");
          const itemColor = isActive ? Colors[colorScheme].tint : Colors[colorScheme].text;

          return (
            <View key={child.id} style={styles.childItemContainer}>
              <TouchableOpacity
                style={[
                  styles.childItem,
                  isActive && { backgroundColor: Colors[colorScheme].tint + '15' }
                ]}
                onPress={() => {
                  setActiveChild(child);
                  router.push("/(drawer)/baby" as any);
                }}
                activeOpacity={0.7}
              >
                <View style={styles.childAvatar}>
                  <Text style={styles.childAvatarEmoji}>
                    {child.gender === "male" ? "👶" : "👧"}
                  </Text>
                </View>
                <View style={styles.childInfo}>
                  <Text style={[styles.childName, { color: itemColor }]}>
                    {child.name}
                  </Text>
                  <Text style={[styles.childBirthDate, { color: itemColor, opacity: 0.7 }]}>
                    {ageText} • {child.birthDate}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Actions sur l'enfant */}
              <View style={styles.childActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => router.push(`/(drawer)/share-child?childId=${child.id}` as any)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <FontAwesome name="share-alt" size={16} color="#4A90E2" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleHideChild(child.id, child.name)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <FontAwesome name="trash-alt" size={16} color="#dc3545" />
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {/* Bouton Ajouter un enfant */}
        <TouchableOpacity
          style={[
            styles.addBabyButton,
            { borderColor: Colors[colorScheme].tint },
          ]}
          onPress={() => setShowAddChildModal(true)}
        >
          <Text
            style={[styles.addBabyText, { color: Colors[colorScheme].tint }]}
          >
            ➕ Ajouter un enfant
          </Text>
        </TouchableOpacity>

        {/* Bouton J'ai un code - Retiré car intégré dans la modale */}
      </View>

      {/* Section: Compte utilisateur */}
      <View style={[styles.section, styles.actionsSection]}>
        <TouchableOpacity
          style={[
            styles.settingsButton,
            { borderColor: Colors[colorScheme].tint },
          ]}
          onPress={() => router.push("/(drawer)/settings")}
        >
          <Text
            style={[styles.settingsText, { color: Colors[colorScheme].tint }]}
          >
            ⚙️ Paramètres
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.signOutButton, { borderColor: "#dc3545" }]}
          onPress={handleSignOut}
        >
          <Text style={[styles.signOutText, { color: "#dc3545" }]}>
            🚪 Déconnexion
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modal de confirmation pour masquer un enfant */}
      <Modal
        visible={showHideModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowHideModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowHideModal(false)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: Colors[colorScheme].background }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: Colors[colorScheme].text }]}>
              Masquer de la liste
            </Text>
            <Text style={[styles.modalSubtitle, { color: Colors[colorScheme].text }]}>
              Êtes-vous sûr de vouloir masquer <Text style={styles.childNameInModal}>{childToHide?.name}</Text> de votre liste de suivi ?
              {'\n\n'}
              L'enfant restera accessible aux autres parents et vous pourrez le réafficher à tout moment depuis les paramètres.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowHideModal(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.deleteButton]}
                onPress={confirmHideChild}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteButtonText}>Masquer</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Modal de choix pour ajouter un enfant */}
      <AddChildModal 
        visible={showAddChildModal}
        onClose={() => setShowAddChildModal(false)}
      />
    </DrawerContentScrollView>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
  },
  emoji: {
    fontSize: 20,
  },
  userInfoSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
    marginBottom: 8,
  },
  userInfoContainer: {
    backgroundColor: "#f8f9fa",
    padding: 12,
    borderRadius: 10,
  },
  userName: {
    fontSize: 14,
    fontWeight: "600",
  },
  userEmail: {
    fontSize: 12,
    marginTop: 4,
  },
  babySection: {},
  childAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  childAvatarEmoji: {
    fontSize: 14,
  },
  childInfo: {
    flex: 1,
  },
  childName: {
    fontSize: 14,
    fontWeight: "500",
  },
  childBirthDate: {
    fontSize: 12,
    marginTop: 2,
  },
  addBabyButton: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
  },
  addBabyText: {
    fontSize: 14,
    fontWeight: "600",
  },
  actionsSection: {
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    paddingTop: 12,
  },
  settingsButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    backgroundColor: "#f0f8ff",
  },
  settingsText: {
    fontSize: 14,
    fontWeight: "600",
  },
  signOutButton: {
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    backgroundColor: "#fff5f5",
  },
  signOutText: {
    fontSize: 14,
    fontWeight: "600",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  searchButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 10,
  },
  searchText: {
    fontSize: 13,
    fontWeight: "600",
  },
  searchInputWrapper: {},
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    padding: 0,
    margin: 0,
  },
  mapButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  childItemContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 8,
    marginVertical: 4,
    gap: 4,
  },
  childItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    gap: 12,
  },
  childActions: {
    flexDirection: 'row',
    gap: 4,
  },
  actionButton: {
    padding: 8,
  },
  hideButton: {
    padding: 8,
  },
  joinChildButton: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: "dashed",
    alignItems: "center",
    backgroundColor: '#f8f0ff',
  },
  joinChildText: {
    fontSize: 14,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width * 0.85,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 24,
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  deleteButton: {
    backgroundColor: '#dc3545',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  childNameInModal: {
    fontWeight: '700',
  },
});