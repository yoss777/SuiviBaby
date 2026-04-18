import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { db } from "@/config/firebase";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { Child } from "@/contexts/BabyContext";
import { useModal } from "@/contexts/ModalContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  afficherEnfant,
} from "@/services/userPreferencesService";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { getAccessibleChildIds } from "@/utils/permissions";

const { width } = Dimensions.get("window");

export default function HiddenChildrenScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const tint = Colors[colorScheme].tint;
  const { showAlert } = useModal();
  const { user } = useAuth();
  const { showToast, showActionToast } = useToast();
  const [hiddenChildren, setHiddenChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [childToRestore, setChildToRestore] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const hadVisibleChildrenRef = useRef(false);

  // P22: Use onSnapshot listener on user preferences doc for real-time updates
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const prefsRef = doc(db, "user_preferences", user.uid);

    const unsubscribe = onSnapshot(
      prefsRef,
      async (snapshot) => {
        try {
          const data = snapshot.data();
          const hiddenIds: string[] = data?.hiddenChildrenIds ?? [];

          if (hiddenIds.length === 0) {
            setHiddenChildren([]);
            setLoading(false);
            return;
          }

          const childIds = await getAccessibleChildIds(user.uid);
          const childDocs = await Promise.all(
            childIds.map((id) => getDoc(doc(db, "children", id)))
          );
          const allChildren: Child[] = childDocs
            .filter((snap) => snap.exists())
            .map((snap) => ({
              id: snap.id,
              ...(snap.data() as Omit<Child, "id">),
            }));

          const hidden = allChildren.filter((child) =>
            hiddenIds.includes(child.id)
          );
          setHiddenChildren(hidden);
        } catch (error) {
          console.error("Erreur lors du chargement des enfants masqués:", error);
          showAlert("Erreur", "Impossible de charger les enfants masqués.");
        } finally {
          setLoading(false);
        }
      },
      (error) => {
        console.error("Erreur onSnapshot preferences:", error);
        showAlert("Erreur", "Impossible de charger les enfants masqués.");
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (loading) return;

    if (hiddenChildren.length > 0) {
      hadVisibleChildrenRef.current = true;
      return;
    }

    if (!hadVisibleChildrenRef.current) {
      return;
    }

    hadVisibleChildrenRef.current = false;
    const timeoutId = setTimeout(() => {
      router.back();
    }, 600);

    return () => clearTimeout(timeoutId);
  }, [hiddenChildren.length, loading, router]);

  // P17a: Memoize calculateAge function
  const calculateAge = useCallback((birthDate: string) => {
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
  }, []);

  // P17a: Memoize age map for all hidden children
  const ageMap = useMemo(() => {
    const map: Record<string, string> = {};
    hiddenChildren.forEach((child) => {
      map[child.id] = calculateAge(child.birthDate);
    });
    return map;
  }, [hiddenChildren, calculateAge]);

  const handleRestoreChild = (childId: string, childName: string) => {
    setChildToRestore({ id: childId, name: childName });
    setShowRestoreModal(true);
  };

  const confirmRestoreChild = async () => {
    if (!childToRestore) return;
    const restoringChild = childToRestore;

    try {
      // P8b: Haptic feedback on restore action
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await afficherEnfant(restoringChild.id);
      setShowRestoreModal(false);
      setChildToRestore(null);
      // P6: Toast on restore success
      showToast(`${restoringChild.name} restauré`);
      // List refreshes automatically via onSnapshot (P22)
    } catch (error) {
      console.error("Erreur lors de la restauration:", error);
      setShowRestoreModal(false);
      setChildToRestore(null);
      // P27: Error retry toast
      showActionToast(
        "Erreur lors de la restauration",
        "Réessayer",
        () => handleRestoreChild(restoringChild.id, restoringChild.name)
      );
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: nc.background },
        ]}
        edges={["bottom"]}
      >
        <Stack.Screen
          options={{
            title: "Enfants masqués",
            headerBackTitle: "Retour",
            headerStyle: { backgroundColor: nc.background },
            headerTintColor: nc.textStrong,
            headerTitleStyle: { color: nc.textStrong },
          }}
        />
        {loading ? (
          <View
            style={styles.center}
            accessible={true}
            accessibilityRole="progressbar"
            accessibilityLabel="Chargement des enfants masqués"
          >
            <ActivityIndicator
              size="large"
              color={tint}
            />
          </View>
        ) : hiddenChildren.length === 0 ? (
          <View
            style={styles.center}
            accessible={true}
            accessibilityRole="summary"
            accessibilityLabel="Aucun enfant masqué. Vous pouvez masquer un enfant de votre liste de suivi depuis le menu principal."
          >
            <FontAwesome
              name="eye-slash"
              size={40}
              color={nc.textMuted}
            />
            <Text
              style={[styles.emptyTitle, { color: nc.textStrong }]}
            >
              Aucun enfant masqué
            </Text>
            <Text
              style={[
                styles.emptyDescription,
                { color: nc.textMuted },
              ]}
            >
              Les enfants que vous masquez depuis le menu principal apparaîtront ici.
            </Text>
          </View>
        ) : (
          <FlatList
            data={hiddenChildren}
            keyExtractor={(item) => item.id}
            renderItem={({ item: child }) => {
              const ageText = ageMap[child.id] ?? "";

              return (
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: nc.backgroundCard,
                      borderColor: nc.borderLight,
                    },
                  ]}
                >
                  <View
                    style={styles.summaryContent}
                    accessible={true}
                    accessibilityRole="summary"
                    accessibilityLabel={`${child.name}, ${ageText}, né le ${child.birthDate}`}
                  >
                    <View
                      style={[
                        styles.childAvatar,
                        { backgroundColor: nc.backgroundPressed },
                      ]}
                      accessible={false}
                    >
                      <Text style={styles.childAvatarEmoji}>
                        {child.gender === "male" ? "👶" : "👧"}
                      </Text>
                    </View>
                    <View style={styles.info}>
                      <Text
                        style={[
                          styles.childName,
                          { color: nc.textStrong },
                        ]}
                        numberOfLines={1}
                      >
                        {child.name}
                      </Text>
                      <Text
                        style={[
                          styles.childMeta,
                          { color: nc.textMuted },
                        ]}
                        numberOfLines={1}
                      >
                        {ageText} • {child.birthDate}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.restoreButton,
                      { borderColor: tint },
                    ]}
                    onPress={() => handleRestoreChild(child.id, child.name)}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Restaurer ${child.name}, ${ageText}`}
                    accessibilityHint="Restaure cet enfant dans votre liste de suivi"
                  >
                    <FontAwesome name="eye" size={16} color={tint} />
                  </TouchableOpacity>
                </View>
              );
            }}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            accessibilityRole="list"
            accessibilityLabel={`${hiddenChildren.length} enfant${hiddenChildren.length > 1 ? "s" : ""} masqué${hiddenChildren.length > 1 ? "s" : ""}`}
          />
        )}

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
                { backgroundColor: nc.backgroundCard },
              ]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text
                style={[styles.modalTitle, { color: nc.textStrong }]}
              >
                Restaurer l'affichage
              </Text>
              <Text
                style={[
                  styles.modalSubtitle,
                  { color: nc.textStrong },
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
                  style={[styles.modalButton, styles.cancelButton, { backgroundColor: nc.borderLight }]}
                  onPress={() => setShowRestoreModal(false)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Annuler la restauration"
                >
                  <Text style={[styles.cancelButtonText, { color: nc.textMuted }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton, { backgroundColor: nc.success }]}
                  onPress={confirmRestoreChild}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Confirmer la restauration de ${childToRestore?.name ?? "cet enfant"}`}
                >
                  <Text style={[styles.confirmButtonText, { color: nc.white }]}>Restaurer</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
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
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 8,
  },
  emptyDescription: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  list: {
    padding: 16,
  },
  separator: {
    height: 10,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  summaryContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  childAvatar: {
    width: 56,
    height: 56,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  childAvatarEmoji: {
    fontSize: 24,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  childName: {
    fontSize: 15,
    fontWeight: "600",
  },
  childMeta: {
    fontSize: 13,
  },
  restoreButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    justifyContent: "center" as const,
    alignItems: "center" as const,
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
    backgroundColor: undefined as unknown as string, // set dynamically
  },
  confirmButton: {
    backgroundColor: undefined as unknown as string, // set dynamically
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: undefined as unknown as string, // set dynamically
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: undefined as unknown as string, // set dynamically
  },
  childNameInModal: {
    fontWeight: "700",
  },
});
