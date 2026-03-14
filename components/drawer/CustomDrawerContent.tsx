import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { DrawerContentComponentProps, DrawerContentScrollView } from "@react-navigation/drawer";
import * as Haptics from "expo-haptics";
import { usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { doc, getDoc } from "firebase/firestore";

import { AddChildModal } from "@/components/suivibaby/AddChildModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InfoModal } from "@/components/ui/InfoModal";
import { getBackgroundTint, getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useToast } from "@/contexts/ToastContext";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { masquerEnfant } from "@/services/userPreferencesService";
import { db } from "@/config/firebase";
import type { ChildRole } from "@/types/permissions";

export function CustomDrawerContent(props: DrawerContentComponentProps) {
  const router = useRouter();
  const pathname = usePathname();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { width } = useWindowDimensions();
  const { activeChild, children, childrenLoaded, setActiveChild } = useBaby();
  const { signOut, user, userName, email, firebaseUser } = useAuth();
  const { showToast } = useToast();
  const isMountedRef = useRef(true);
  const [showHideModal, setShowHideModal] = useState(false);
  const [childToHide, setChildToHide] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: "" });
  const [childRoles, setChildRoles] = useState<Record<string, ChildRole | null>>({});
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  const canAddChild =
    permissions.role === "owner" || permissions.role === "admin";

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadRoles = async () => {
      if (!firebaseUser?.uid || children.length === 0) {
        if (isMounted) setChildRoles({});
        return;
      }
      try {
        const entries = await Promise.all(
          children.map(async (child) => {
            const accessSnap = await getDoc(
              doc(db, "children", child.id, "access", firebaseUser.uid)
            );
            const role = accessSnap.exists()
              ? ((accessSnap.data()?.role ?? null) as ChildRole | null)
              : null;
            return [child.id, role] as const;
          })
        );
        if (isMounted) {
          setChildRoles(Object.fromEntries(entries));
        }
      } catch (error) {
        console.error("[CustomDrawer] Erreur chargement roles:", error);
      }
    };

    loadRoles();
    return () => {
      isMounted = false;
    };
  }, [children, firebaseUser?.uid]);

  // Rediriger vers explore si tous les enfants sont masqués
  useEffect(() => {
    if (!childrenLoaded) return;
    if (children.length === 0 && pathname.includes("/baby")) {
      console.log(
        "[CustomDrawer] Tous les enfants masqués, redirection vers explore",
      );
      router.replace("/explore");
    }
  }, [children.length, childrenLoaded, pathname]);

  // Calculate baby's age in years and months
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

  const handleSignOut = useCallback(() => {
    setShowSignOutModal(true);
  }, []);

  const handleHideChild = useCallback((childId: string, childName: string) => {
    setChildToHide({ id: childId, name: childName });
    setShowHideModal(true);
  }, []);

  const confirmHideChild = useCallback(async () => {
    if (!childToHide) return;

    try {
      // P8b: Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await masquerEnfant(childToHide.id);
      if (!isMountedRef.current) return;
      setShowHideModal(false);
      setChildToHide(null);
      // P6: Success toast
      showToast(`${childToHide.name} masqué`);
    } catch (error) {
      if (!isMountedRef.current) return;
      setErrorModal({
        visible: true,
        message: "Impossible de masquer l'enfant.",
      });
    }
  }, [childToHide, showToast]);

  return (
    <DrawerContentScrollView
      {...props}
      style={{ backgroundColor: Colors[colorScheme].background }}
    >
      {/* Section: Informations utilisateur */}
      {user && (
        <View style={[styles.userInfoSection, { borderBottomColor: nc.border }]}>
          <View style={[styles.userInfoContainer, { backgroundColor: nc.backgroundPressed }]}>
            <Text
              style={[styles.userName, { color: nc.textStrong }]}
            >
              {userName || email?.split("@")[0] || user.email?.split("@")[0]}
            </Text>

            <Text
              style={[styles.userEmail, { color: nc.textLight }]}
            >
              {email || user.email}
            </Text>
          </View>
        </View>
      )}

      {/* Section: Suivi Enfant */}
      <View style={styles.section}>
        <Text
          style={[
            styles.sectionHeader,
            { color: Colors[colorScheme].tabIconDefault },
          ]}
        >
          <FontAwesome name="baby" size={16} color={nc.todayAccent} />
          &nbsp;SUIVI POUR
        </Text>

        {/* Liste des enfants */}
        {children.map((child) => {
          const ageText = calculateAge(child.birthDate);
          const isActive = child.id === activeChild?.id;
          const itemColor = isActive
            ? Colors[colorScheme].tint
            : Colors[colorScheme].text;
          const childRole = childRoles[child.id] ?? permissions.role;
          const canShareThisChild =
            childRole === "owner" || childRole === "admin";

          return (
            <View key={child.id} style={styles.childItemContainer}>
              <TouchableOpacity
                style={[
                  styles.childItem,
                  isActive && {
                    backgroundColor: Colors[colorScheme].tint + "15",
                  },
                ]}
                onPress={() => {
                  setActiveChild(child);
                  props.navigation.closeDrawer();
                  if (!pathname.includes("/baby")) {
                    router.replace("/(drawer)/baby" as any);
                  }
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`Sélectionner ${child.name}`}
                accessibilityState={{ selected: isActive }}
              >
                <View style={[styles.childAvatar, { backgroundColor: nc.backgroundPressed }]}>
                  <Text style={styles.childAvatarEmoji}>
                    {child.gender === "male" ? "👶" : "👧"}
                  </Text>
                </View>
                <View style={styles.childInfo}>
                  <Text style={[styles.childName, { color: itemColor }]}>
                    {child.name}
                  </Text>
                  <Text
                    style={[
                      styles.childBirthDate,
                      { color: itemColor, opacity: 0.7 },
                    ]}
                  >
                    {ageText} • {child.birthDate}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Actions sur l'enfant */}
              <View style={styles.childActions}>
                {canShareThisChild && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() =>
                      router.push(
                        `/(drawer)/share-child?childId=${child.id}` as any,
                      )
                    }
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Partager ${child.name}`}
                  >
                    <FontAwesome name="share-alt" size={16} color={nc.todayAccent} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleHideChild(child.id, child.name)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Masquer ${child.name}`}
                >
                  <FontAwesome name="trash-alt" size={16} color={nc.error} />
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
          onPress={() => {
            if (canAddChild) {
              setShowAddChildModal(true);
              return;
            }
            router.push("/settings/join-child" as any);
          }}
          accessibilityRole="button"
          accessibilityLabel="Ajouter un enfant"
        >
          <View style={styles.buttonContent}>
            <FontAwesome name="plus" size={14} color={Colors[colorScheme].tint} />
            <Text
              style={[styles.addBabyText, { color: Colors[colorScheme].tint }]}
            >
              Ajouter un enfant
            </Text>
          </View>
        </TouchableOpacity>

        {/* Bouton J'ai un code - Retiré car intégré dans la modale */}
      </View>

      {/* Section: Compte utilisateur */}
      <View style={[styles.section, styles.actionsSection, { borderTopColor: nc.border }]}>
        <TouchableOpacity
          style={[
            styles.settingsButton,
            { borderColor: Colors[colorScheme].tint, backgroundColor: getBackgroundTint(Colors[colorScheme].tint, 0.08) },
          ]}
          onPress={() => router.push("/(drawer)/settings")}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir les paramètres"
        >
          <View style={styles.buttonContent}>
            <FontAwesome name="cog" size={14} color={Colors[colorScheme].tint} />
            <Text
              style={[styles.settingsText, { color: Colors[colorScheme].tint }]}
            >
              Paramètres
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.signOutButton, { borderColor: nc.error, backgroundColor: getBackgroundTint(nc.error, 0.08) }]}
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel="Se déconnecter"
        >
          <View style={styles.buttonContent}>
            <FontAwesome name="sign-out-alt" size={14} color={nc.error} />
            <Text style={[styles.signOutText, { color: nc.error }]}>
              Déconnexion
            </Text>
          </View>
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
            style={[
              styles.modalContent,
              { backgroundColor: Colors[colorScheme].background, width: width * 0.85 },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text
              style={[styles.modalTitle, { color: Colors[colorScheme].text }]}
            >
              Masquer de la liste
            </Text>
            <Text
              style={[
                styles.modalSubtitle,
                { color: Colors[colorScheme].text },
              ]}
            >
              Êtes-vous sûr de vouloir masquer{" "}
              <Text style={styles.childNameInModal}>{childToHide?.name}</Text>{" "}
              de votre liste de suivi ?{"\n\n"}
              L'enfant restera accessible aux autres parents et vous pourrez le
              réafficher à tout moment depuis les paramètres.
            </Text>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: nc.backgroundPressed }]}
                onPress={() => setShowHideModal(false)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Annuler"
              >
                <Text style={[styles.cancelButtonText, { color: nc.textNormal }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, { backgroundColor: nc.error }]}
                onPress={confirmHideChild}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Confirmer masquer l'enfant"
              >
                <Text style={[styles.deleteButtonText, { color: nc.white }]}>Masquer</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ConfirmModal
        visible={showSignOutModal}
        title="Déconnexion"
        message="Êtes-vous sûr de vouloir vous déconnecter ?"
        confirmText="Déconnexion"
        cancelText="Annuler"
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        onCancel={() => setShowSignOutModal(false)}
        onConfirm={async () => {
          setShowSignOutModal(false);
          try {
            await signOut();
            router.replace("/(auth)/login");
          } catch (error) {
            setErrorModal({
              visible: true,
              message: "Impossible de se déconnecter.",
            });
          }
        }}
      />
      <InfoModal
        visible={errorModal.visible}
        title="Erreur"
        message={errorModal.message}
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        onClose={() => setErrorModal({ visible: false, message: "" })}
      />

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
  userInfoSection: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  userInfoContainer: {
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
  childAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
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
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
    paddingTop: 12,
  },
  settingsButton: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
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
  },
  signOutText: {
    fontSize: 14,
    fontWeight: "600",
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
    flexDirection: "row",
    gap: 4,
  },
  actionButton: {
    padding: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
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
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: undefined as unknown as string,
  },
  childNameInModal: {
    fontWeight: "700",
  },
});
