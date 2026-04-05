import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Stack } from "expo-router";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { InfoModal } from "@/components/ui/InfoModal";
import { db } from "@/config/firebase";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { Child, useBaby } from "@/contexts/BabyContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { getAccessibleChildIds } from "@/utils/permissions";
import { getAgeLabel } from "@/utils/ageUtils";

interface ChildWithOwnership extends Child {
  isOwner: boolean;
}

export default function EditChildScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { user } = useAuth();
  const { children, hiddenChildrenIds } = useBaby();
  const { showToast } = useToast();

  const [allChildren, setAllChildren] = useState<ChildWithOwnership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const hasInitialLoad = useRef(false);
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
  });
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Load all children (visible + hidden) with ownership info
  // Pattern ISO chrono.tsx: refreshTick triggers reload via useEffect
  useEffect(() => {
    if (!user?.uid) {
      setIsLoading(false);
      return;
    }

    const showFullLoading = !hasInitialLoad.current;
    setIsLoading(showFullLoading);
    setIsRefreshing(!showFullLoading);

    let mounted = true;

    (async () => {
      try {
        const childIds = await getAccessibleChildIds(user.uid);
        const childDocs = await Promise.all(
          childIds.map((id) => getDoc(doc(db, "children", id)))
        );

        if (!mounted) return;

        const existingDocs = childDocs.filter((snap) => snap.exists());

        // Load roles from access sub-collection (same pattern as CustomDrawerContent)
        const roles = await Promise.all(
          existingDocs.map(async (snap) => {
            const accessSnap = await getDoc(
              doc(db, "children", snap.id, "access", user.uid)
            );
            return accessSnap.exists() ? accessSnap.data()?.role ?? null : null;
          })
        );

        if (!mounted) return;

        const result: ChildWithOwnership[] = existingDocs.map((snap, i) => {
          const data = snap.data();
          return {
            id: snap.id,
            name: data.name || "",
            birthDate: data.birthDate || "",
            gender: data.gender,
            photoUri: data.photoUri,
            isOwner: roles[i] === "owner",
          };
        });

        result.sort((a, b) => a.name.localeCompare(b.name));
        setAllChildren(result);
        hasInitialLoad.current = true;
      } catch (error) {
        if (!mounted) return;
        console.error("Erreur chargement enfants:", error);
        setModalConfig({
          visible: true,
          title: "Erreur",
          message: "Impossible de charger la liste des enfants.",
        });
      } finally {
        if (mounted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [user?.uid, refreshTick, children.length, hiddenChildrenIds]);

  const handlePullToRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshTick((prev) => prev + 1);
  }, []);

  // Sync names from context (visible children updated via onSnapshot)
  useEffect(() => {
    setAllChildren((prev) =>
      prev.map((child) => {
        const fresh = children.find((c) => c.id === child.id);
        if (fresh && fresh.name !== child.name && child.id !== editingChildId) {
          return { ...child, name: fresh.name };
        }
        return child;
      })
    );
  }, [children, editingChildId]);

  const closeModal = useCallback(() => {
    setModalConfig((prev) => ({ ...prev, visible: false }));
  }, []);

  const startEditing = useCallback(
    (child: ChildWithOwnership) => {
      if (!child.isOwner) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setEditingChildId(child.id);
      setEditName(child.name);
      setOriginalName(child.name);
    },
    []
  );

  const cancelEditing = useCallback(() => {
    setEditingChildId(null);
    setEditName("");
    setOriginalName("");
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setModalConfig({
        visible: true,
        title: "Nom invalide",
        message: "Le nom ne peut pas etre vide.",
      });
      return;
    }

    if (!editingChildId) return;

    try {
      setIsSaving(true);
      await updateDoc(doc(db, "children", editingChildId), {
        name: trimmedName,
      });
      if (!isMountedRef.current) return;

      // Update local state immediately
      setAllChildren((prev) =>
        prev.map((c) =>
          c.id === editingChildId ? { ...c, name: trimmedName } : c
        )
      );

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Nom modifie avec succes");
      setEditingChildId(null);
      setEditName("");
      setOriginalName("");
    } catch (error) {
      if (!isMountedRef.current) return;
      console.error("Erreur modification nom:", error);
      setModalConfig({
        visible: true,
        title: "Erreur",
        message: "Impossible de modifier le nom.",
      });
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  }, [editName, editingChildId, showToast]);

  const trimmedEditName = useMemo(() => editName.trim(), [editName]);
  const isSaveDisabled =
    isSaving || !trimmedEditName || trimmedEditName === originalName;

  return (
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <Stack.Screen
          options={{
            title: "Modifier un enfant",
            headerBackTitle: "Retour",
          }}
        />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handlePullToRefresh}
              tintColor={Colors[colorScheme].tint}
            />
          }
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator
                size="large"
                color={Colors[colorScheme].tint}
              />
              <Text style={[styles.loadingText, { color: nc.textMuted }]}>
                Chargement...
              </Text>
            </View>
          ) : allChildren.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FontAwesome name="baby" size={48} color={nc.textMuted} />
              <Text style={[styles.emptyTitle, { color: nc.textStrong }]}>
                Aucun enfant
              </Text>
            </View>
          ) : (
            <View style={styles.childrenList}>
              <Text style={[styles.infoText, { color: nc.textMuted }]}>
                Appuyez sur un enfant pour modifier son nom. Seuls les enfants
                dont vous etes proprietaire sont modifiables.
              </Text>
              {allChildren.map((child) => {
                const isHidden = hiddenChildrenIds.includes(child.id);
                const isEditing = editingChildId === child.id;
                const ageText = getAgeLabel(child.birthDate);

                return (
                  <View key={child.id}>
                    <TouchableOpacity
                      style={[
                        styles.childCard,
                        { backgroundColor: nc.backgroundCard },
                        !child.isOwner && styles.childCardDisabled,
                        isEditing && {
                          borderColor: Colors[colorScheme].tint,
                          borderWidth: 2,
                        },
                      ]}
                      onPress={() => startEditing(child)}
                      disabled={!child.isOwner || isEditing || isSaving}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={
                        child.isOwner
                          ? `Modifier le nom de ${child.name}`
                          : `${child.name} — non modifiable`
                      }
                    >
                      <View
                        style={[
                          styles.childAvatar,
                          { backgroundColor: nc.borderLight },
                          !child.isOwner && { opacity: 0.4 },
                        ]}
                      >
                        <Text style={styles.childAvatarEmoji}>
                          {child.gender === "male" ? "\uD83D\uDC76" : "\uD83D\uDC67"}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.childDetails,
                          !child.isOwner && { opacity: 0.4 },
                        ]}
                      >
                        <Text
                          style={[styles.childName, { color: nc.textStrong }]}
                        >
                          {child.name}
                        </Text>
                        <Text
                          style={[styles.childAge, { color: nc.textMuted }]}
                        >
                          {ageText}
                          {isHidden ? " • masque" : ""}
                        </Text>
                      </View>
                      {child.isOwner ? (
                        <FontAwesome
                          name="pen"
                          size={14}
                          color={nc.textMuted}
                          style={!child.isOwner && { opacity: 0.4 }}
                        />
                      ) : (
                        <Ionicons
                          name="lock-closed-outline"
                          size={16}
                          color={nc.textMuted}
                          style={{ opacity: 0.4 }}
                        />
                      )}
                    </TouchableOpacity>

                    {/* Inline edit form */}
                    {isEditing && (
                      <View
                        style={[
                          styles.editForm,
                          { backgroundColor: nc.backgroundCard },
                        ]}
                      >
                        <TextInput
                          style={[
                            styles.input,
                            {
                              backgroundColor: nc.backgroundPressed,
                              color: nc.textStrong,
                              borderColor: nc.borderLight,
                            },
                          ]}
                          value={editName}
                          onChangeText={setEditName}
                          placeholder="Nom ou petit nom"
                          placeholderTextColor={nc.textMuted}
                          autoCapitalize="words"
                          autoFocus
                          editable={!isSaving}
                        />
                        <View style={styles.editActions}>
                          <TouchableOpacity
                            style={[
                              styles.editButton,
                              { borderColor: nc.border },
                            ]}
                            onPress={cancelEditing}
                            disabled={isSaving}
                          >
                            <Text
                              style={[
                                styles.editButtonText,
                                { color: nc.textMuted },
                              ]}
                            >
                              Annuler
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.editButton,
                              {
                                backgroundColor: nc.todayAccent,
                                borderColor: nc.todayAccent,
                              },
                              isSaveDisabled && { opacity: 0.5 },
                            ]}
                            onPress={handleSave}
                            disabled={isSaveDisabled}
                          >
                            <Text
                              style={[
                                styles.editButtonText,
                                {
                                  color:
                                    colorScheme === "dark"
                                      ? nc.white
                                      : nc.backgroundCard,
                                  fontWeight: "700",
                                },
                              ]}
                            >
                              {isSaving ? "..." : "Enregistrer"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
        <InfoModal
          visible={modalConfig.visible}
          title={modalConfig.title}
          message={modalConfig.message}
          backgroundColor={nc.background}
          textColor={nc.textStrong}
          onClose={closeModal}
        />
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
    gap: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  childrenList: {
    gap: 4,
  },
  infoText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  childCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: "transparent",
  },
  childCardDisabled: {
    // opacity handled per-element for better visual
  },
  childAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
    marginBottom: 2,
  },
  childAge: {
    fontSize: 13,
  },
  editForm: {
    marginTop: -4,
    marginBottom: 8,
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
  },
  editButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: "600",
  },
});
