import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { collection, doc, getDoc, getDocs, updateDoc } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InfoModal } from "@/components/ui/InfoModal";
import { db } from "@/config/firebase";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { Child, useBaby } from "@/contexts/BabyContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  requestChildDeletion,
  transferChildAndLeave,
} from "@/services/childDeletionService";
import { getAccessibleChildIds } from "@/utils/permissions";
import { getAgeLabel } from "@/utils/ageUtils";

// ============================================
// TYPES
// ============================================

interface ChildWithOwnership extends Child {
  isOwner: boolean;
  hasOtherParents: boolean;
}

interface ParentInfo {
  userId: string;
  role: string;
  email?: string;
}

// ============================================
// COMPONENT
// ============================================

export default function EditChildScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { user } = useAuth();
  const { children, hiddenChildrenIds } = useBaby();
  const { showToast } = useToast();
  const router = useRouter();

  const [allChildren, setAllChildren] = useState<ChildWithOwnership[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const hasInitialLoad = useRef(false);
  const [editingChildId, setEditingChildId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [originalName, setOriginalName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{
    visible: boolean;
    child: ChildWithOwnership | null;
  }>({ visible: false, child: null });
  const [transferModal, setTransferModal] = useState<{
    visible: boolean;
    child: ChildWithOwnership | null;
    parents: ParentInfo[];
    selectedParentId: string | null;
    loading: boolean;
  }>({ visible: false, child: null, parents: [], selectedParentId: null, loading: false });
  const isMountedRef = useRef(true);

  useEffect(() => {
    return () => { isMountedRef.current = false; };
  }, []);

  // ============================================
  // DATA LOADING (ISO chrono.tsx pattern)
  // ============================================

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
        const accessData = await Promise.all(
          existingDocs.map(async (snap) => {
            const accessSnap = await getDoc(doc(db, "children", snap.id, "access", user.uid));
            const role = accessSnap.exists() ? accessSnap.data()?.role ?? null : null;
            const allAccessSnap = await getDocs(collection(db, "children", snap.id, "access"));
            return { role, totalParents: allAccessSnap.size };
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
            isOwner: accessData[i].role === "owner",
            hasOtherParents: accessData[i].totalParents > 1,
          };
        });
        result.sort((a, b) => a.name.localeCompare(b.name));
        setAllChildren(result);
        hasInitialLoad.current = true;
      } catch (error) {
        if (!mounted) return;
        setModalConfig({ visible: true, title: "Erreur", message: "Impossible de charger la liste des enfants." });
      } finally {
        if (mounted) { setIsLoading(false); setIsRefreshing(false); }
      }
    })();
    return () => { mounted = false; };
  }, [user?.uid, refreshTick, children.length, hiddenChildrenIds]);

  const handlePullToRefresh = useCallback(() => {
    setIsRefreshing(true);
    setRefreshTick((prev) => prev + 1);
  }, []);

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

  // ============================================
  // EDIT NAME HANDLERS
  // ============================================

  const startEditing = useCallback((child: ChildWithOwnership) => {
    if (!child.isOwner) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingChildId(child.id);
    setEditName(child.name);
    setOriginalName(child.name);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingChildId(null);
    setEditName("");
    setOriginalName("");
  }, []);

  const handleSave = useCallback(async () => {
    const trimmedName = editName.trim();
    if (!trimmedName || !editingChildId) return;
    try {
      setIsSaving(true);
      await updateDoc(doc(db, "children", editingChildId), { name: trimmedName });
      if (!isMountedRef.current) return;
      setAllChildren((prev) => prev.map((c) => c.id === editingChildId ? { ...c, name: trimmedName } : c));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Nom modifie avec succes");
      cancelEditing();
    } catch {
      if (!isMountedRef.current) return;
      setModalConfig({ visible: true, title: "Erreur", message: "Impossible de modifier le nom." });
    } finally {
      if (isMountedRef.current) setIsSaving(false);
    }
  }, [editName, editingChildId, showToast, cancelEditing]);

  const trimmedEditName = useMemo(() => editName.trim(), [editName]);
  const isSaveDisabled = isSaving || !trimmedEditName || trimmedEditName === originalName;

  // ============================================
  // DELETE HANDLERS
  // ============================================

  const handleDeletePress = useCallback((child: ChildWithOwnership) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setDeleteConfirm({ visible: true, child });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    const child = deleteConfirm.child;
    if (!child) return;
    setDeleteConfirm({ visible: false, child: null });
    setIsDeleting(true);
    try {
      const result = await requestChildDeletion(child.id);
      if (!isMountedRef.current) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (result.status === "approved") {
        showToast(`${child.name} supprime`);
        setRefreshTick((prev) => prev + 1);
      } else {
        showToast("Demande envoyee aux co-proprietaires");
      }
    } catch (error: any) {
      if (!isMountedRef.current) return;
      const message = error?.message?.includes("already-exists")
        ? "Une demande de suppression est deja en cours."
        : error?.message?.includes("en cours de suppression")
          ? "Cet enfant est deja en cours de suppression."
          : "Impossible de supprimer cet enfant.";
      setModalConfig({ visible: true, title: "Erreur", message });
    } finally {
      if (isMountedRef.current) setIsDeleting(false);
    }
  }, [deleteConfirm.child, showToast]);

  const handleExportFirst = useCallback(() => {
    const child = deleteConfirm.child;
    setDeleteConfirm({ visible: false, child: null });
    if (child) {
      router.push({ pathname: "/settings/export", params: { childId: child.id } } as any);
    }
  }, [deleteConfirm.child, router]);

  // ============================================
  // TRANSFER HANDLERS
  // ============================================

  const handleTransferPress = useCallback(async (child: ChildWithOwnership) => {
    if (!user?.uid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTransferModal({ visible: true, child, parents: [], selectedParentId: null, loading: true });
    try {
      const accessSnap = await getDocs(collection(db, "children", child.id, "access"));
      const parents: ParentInfo[] = [];
      for (const accessDoc of accessSnap.docs) {
        if (accessDoc.id === user.uid) continue;
        const data = accessDoc.data();
        let email: string | undefined;
        try {
          const publicDoc = await getDoc(doc(db, "users_public", accessDoc.id));
          if (publicDoc.exists()) email = publicDoc.data()?.displayName || publicDoc.data()?.email;
        } catch { /* ignore */ }
        parents.push({ userId: accessDoc.id, role: data.role || "viewer", email });
      }
      if (!isMountedRef.current) return;
      setTransferModal((prev) => ({ ...prev, parents, loading: false }));
    } catch {
      if (!isMountedRef.current) return;
      setTransferModal({ visible: false, child: null, parents: [], selectedParentId: null, loading: false });
      setModalConfig({ visible: true, title: "Erreur", message: "Impossible de charger les parents." });
    }
  }, [user?.uid]);

  const handleTransferConfirm = useCallback(async () => {
    const { child, selectedParentId } = transferModal;
    if (!child || !selectedParentId) return;
    setTransferModal((prev) => ({ ...prev, loading: true }));
    try {
      await transferChildAndLeave(child.id, selectedParentId);
      if (!isMountedRef.current) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(`Vous avez quitte ${child.name}`);
      setTransferModal({ visible: false, child: null, parents: [], selectedParentId: null, loading: false });
      setRefreshTick((prev) => prev + 1);
    } catch {
      if (!isMountedRef.current) return;
      setTransferModal((prev) => ({ ...prev, loading: false }));
      setModalConfig({ visible: true, title: "Erreur", message: "Impossible de transferer la propriete." });
    }
  }, [transferModal, showToast]);

  const resetTransferModal = useCallback(() => {
    setTransferModal({ visible: false, child: null, parents: [], selectedParentId: null, loading: false });
  }, []);

  // ============================================
  // RENDER
  // ============================================

  return (
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView style={styles.container} edges={["bottom"]}>
        <Stack.Screen options={{ title: "Profils enfants", headerBackTitle: "Retour" }} />
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={handlePullToRefresh} tintColor={Colors[colorScheme].tint} />
          }
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
              <Text style={[styles.loadingText, { color: nc.textMuted }]}>Chargement...</Text>
            </View>
          ) : allChildren.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FontAwesome name="baby" size={48} color={nc.textMuted} />
              <Text style={[styles.emptyTitle, { color: nc.textStrong }]}>Aucun enfant</Text>
            </View>
          ) : (
            <View style={styles.childrenList}>
              <Text style={[styles.infoText, { color: nc.textMuted }]}>
                Appuyez sur un enfant pour modifier son nom. Seuls les enfants dont vous etes proprietaire sont modifiables.
              </Text>
              {allChildren.map((child) => {
                const isHidden = hiddenChildrenIds.includes(child.id);
                const isEditing = editingChildId === child.id;
                const ageText = getAgeLabel(child.birthDate);

                return (
                  <View key={child.id}>
                    {/* Child card */}
                    <View
                      style={[
                        styles.childCard,
                        { backgroundColor: nc.backgroundCard },
                        isEditing && { borderColor: Colors[colorScheme].tint, borderWidth: 2 },
                      ]}
                    >
                      <View style={[styles.childAvatar, { backgroundColor: nc.borderLight }, !child.isOwner && { opacity: 0.4 }]}>
                        <Text style={styles.childAvatarEmoji}>
                          {child.gender === "male" ? "\uD83D\uDC76" : "\uD83D\uDC67"}
                        </Text>
                      </View>

                      {isEditing ? (
                        /* Inline edit: input + checkmark */
                        <View style={styles.inlineEditRow}>
                          <TextInput
                            style={[styles.inlineInput, { backgroundColor: nc.backgroundPressed, color: nc.textStrong, borderColor: nc.borderLight }]}
                            value={editName}
                            onChangeText={setEditName}
                            placeholder="Nom ou petit nom"
                            placeholderTextColor={nc.textMuted}
                            autoCapitalize="words"
                            autoFocus
                            editable={!isSaving && !isDeleting}
                            onSubmitEditing={handleSave}
                            returnKeyType="done"
                          />
                          <TouchableOpacity
                            style={[styles.inlineValidateButton, { backgroundColor: nc.success }, isSaveDisabled && { opacity: 0.35 }]}
                            onPress={handleSave}
                            disabled={isSaveDisabled}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            accessibilityLabel="Valider le nom"
                          >
                            <Ionicons name="checkmark" size={20} color={nc.white} />
                          </TouchableOpacity>
                        </View>
                      ) : (
                        /* Static name + age */
                        <TouchableOpacity
                          style={[styles.childDetails, !child.isOwner && { opacity: 0.4 }]}
                          onPress={() => startEditing(child)}
                          disabled={!child.isOwner || isSaving || isDeleting}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={child.isOwner ? `Modifier le nom de ${child.name}` : `${child.name}`}
                        >
                          <Text style={[styles.childName, { color: nc.textStrong }]}>{child.name}</Text>
                          <Text style={[styles.childAge, { color: nc.textMuted }]}>
                            {ageText}{isHidden ? " • masque" : ""}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {/* Icon: pen/back/lock */}
                      {child.isOwner ? (
                        <TouchableOpacity
                          onPress={() => isEditing ? cancelEditing() : startEditing(child)}
                          disabled={isSaving || isDeleting}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          accessibilityLabel={isEditing ? "Annuler la modification" : "Modifier le nom"}
                        >
                          <Ionicons
                            name={isEditing ? "arrow-back" : "create-outline"}
                            size={isEditing ? 20 : 18}
                            color={nc.textMuted}
                          />
                        </TouchableOpacity>
                      ) : (
                        <Ionicons name="lock-closed-outline" size={16} color={nc.textMuted} style={{ opacity: 0.4 }} />
                      )}
                    </View>

                    {/* Danger zone below card when editing */}
                    {isEditing && (
                      <View style={[styles.dangerZone, { borderTopColor: nc.border }]}>
                        {child.hasOtherParents && (
                          <TouchableOpacity
                            style={styles.dangerButton}
                            onPress={() => handleTransferPress(child)}
                            disabled={isDeleting}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="exit-outline" size={16} color={nc.todayAccent} />
                            <Text style={[styles.dangerButtonText, { color: nc.todayAccent }]}>Se retirer</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={styles.dangerButton}
                          onPress={() => handleDeletePress(child)}
                          disabled={isDeleting}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <FontAwesome name="trash-alt" size={14} color={nc.error} />
                          <Text style={[styles.dangerButtonText, { color: nc.error }]}>{isDeleting ? "..." : "Supprimer"}</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>

        {/* Info modal */}
        <InfoModal
          visible={modalConfig.visible}
          title={modalConfig.title}
          message={modalConfig.message}
          backgroundColor={nc.background}
          textColor={nc.textStrong}
          onClose={closeModal}
        />

        {/* Delete confirmation modal */}
        <ConfirmModal
          visible={deleteConfirm.visible}
          title={`Supprimer ${deleteConfirm.child?.name || ""} ?`}
          message={
            deleteConfirm.child?.hasOtherParents
              ? "Cette demande sera envoyee aux autres proprietaires pour approbation. Les donnees seront conservees 30 jours avant suppression definitive.\n\nVoulez-vous d'abord exporter les donnees ?"
              : "Toutes les donnees seront supprimees apres 30 jours. Cette action est irreversible.\n\nVoulez-vous d'abord exporter les donnees ?"
          }
          confirmText="Supprimer"
          cancelText="Exporter d'abord"
          backgroundColor={nc.backgroundCard}
          textColor={nc.textStrong}
          confirmButtonColor={nc.error}
          confirmTextColor={nc.white}
          allowBackdropDismiss
          onDismiss={() => setDeleteConfirm({ visible: false, child: null })}
          onConfirm={handleDeleteConfirm}
          onCancel={handleExportFirst}
        />

        {/* Transfer modal */}
        <Modal
          visible={transferModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() => !transferModal.loading && resetTransferModal()}
        >
          <Pressable style={styles.modalOverlay} onPress={() => !transferModal.loading && resetTransferModal()}>
            <Pressable style={[styles.modalContent, { backgroundColor: nc.backgroundCard }]} onPress={(e) => e.stopPropagation()}>
              <Text style={[styles.modalTitle, { color: nc.textStrong }]}>
                Se retirer de {transferModal.child?.name}
              </Text>
              <Text style={[styles.modalSubtitle, { color: nc.textLight }]}>
                Choisissez le nouveau proprietaire :
              </Text>

              {transferModal.loading && transferModal.parents.length === 0 ? (
                <ActivityIndicator size="small" color={Colors[colorScheme].tint} style={{ marginVertical: 20 }} />
              ) : transferModal.parents.length === 0 ? (
                <Text style={[styles.noParentsText, { color: nc.textMuted }]}>Aucun autre parent disponible.</Text>
              ) : (
                <View style={styles.parentsList}>
                  {transferModal.parents.map((parent) => {
                    const isSelected = transferModal.selectedParentId === parent.userId;
                    return (
                      <TouchableOpacity
                        key={parent.userId}
                        style={[styles.parentItem, { borderColor: nc.border }, isSelected && { borderColor: Colors[colorScheme].tint, backgroundColor: Colors[colorScheme].tint + "10" }]}
                        onPress={() => setTransferModal((prev) => ({ ...prev, selectedParentId: parent.userId }))}
                        disabled={transferModal.loading}
                      >
                        <Ionicons name={isSelected ? "radio-button-on" : "radio-button-off"} size={20} color={isSelected ? Colors[colorScheme].tint : nc.textMuted} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.parentName, { color: nc.textStrong }]}>{parent.email || parent.userId.slice(0, 8) + "..."}</Text>
                          <Text style={[styles.parentRole, { color: nc.textMuted }]}>{parent.role}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: nc.backgroundPressed }]}
                  onPress={resetTransferModal}
                  disabled={transferModal.loading}
                >
                  <Text style={[styles.modalButtonText, { color: nc.textNormal }]}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, { backgroundColor: Colors[colorScheme].tint }, (!transferModal.selectedParentId || transferModal.loading) && { opacity: 0.5 }]}
                  onPress={handleTransferConfirm}
                  disabled={!transferModal.selectedParentId || transferModal.loading}
                >
                  {transferModal.loading ? (
                    <ActivityIndicator size="small" color={nc.white} />
                  ) : (
                    <Text style={[styles.modalButtonText, { color: nc.white, fontWeight: "700" }]}>Confirmer</Text>
                  )}
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: { flex: 1 },
  scrollContent: { flexGrow: 1, padding: 16 },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60 },
  loadingText: { marginTop: 12, fontSize: 14 },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 60, gap: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "600" },
  childrenList: { gap: 4 },
  infoText: { fontSize: 14, lineHeight: 20, marginBottom: 16, paddingHorizontal: 4 },
  childCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 2,
    borderWidth: 2,
    borderColor: "transparent",
  },
  childAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  childAvatarEmoji: { fontSize: 20 },
  childDetails: { flex: 1 },
  childName: { fontSize: 16, fontWeight: "600", marginBottom: 2 },
  childAge: { fontSize: 13 },
  // Inline edit: input takes flex space, checkmark button at end
  inlineEditRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  inlineInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  inlineValidateButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  // Danger zone
  dangerZone: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 24,
    paddingVertical: 10,
    marginBottom: 8,
  },
  dangerButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 8 },
  dangerButtonText: { fontSize: 13, fontWeight: "700", letterSpacing: 0.2 },
  // Transfer modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center" },
  modalContent: { width: "85%", borderRadius: 20, padding: 24 },
  modalTitle: { fontSize: 20, fontWeight: "700", marginBottom: 8, textAlign: "center" },
  modalSubtitle: { fontSize: 14, marginBottom: 16, textAlign: "center", lineHeight: 20 },
  noParentsText: { fontSize: 14, textAlign: "center", marginVertical: 20 },
  parentsList: { gap: 8, marginBottom: 20 },
  parentItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  parentName: { fontSize: 15, fontWeight: "600" },
  parentRole: { fontSize: 12, marginTop: 2 },
  modalButtons: { flexDirection: "row", gap: 12 },
  modalButton: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  modalButtonText: { fontSize: 16, fontWeight: "600" },
});
