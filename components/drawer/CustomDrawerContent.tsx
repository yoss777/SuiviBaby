import FontAwesome from "@expo/vector-icons/FontAwesome6";
import {
  DrawerContentComponentProps,
  DrawerContentScrollView,
  getDrawerStatusFromState,
} from "expo-router/drawer";
import * as Haptics from "expo-haptics";
import { usePathname, useRouter } from "expo-router";
import { useGuardedNavigation } from "@/hooks/useGuardedNavigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router/react-navigation";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { AddChildModal } from "@/components/suivibaby/AddChildModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { InfoModal } from "@/components/ui/InfoModal";
import { getBackgroundTint, getChartColors, getNeutralColors, neutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useToast } from "@/contexts/ToastContext";
import { useChildPermissions, useChildRoles } from "@/hooks/useChildPermissions";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { masquerEnfant, obtenirPreferencesNotifications } from "@/services/userPreferencesService";
import { getUserPromoState, fetchActivePromos, trackClick, dismissPromo as dismissPromoService } from "@/services/promoService";
import { ReferralCard } from "@/components/suivibaby/dashboard/ReferralCard";
import { PromoBanner } from "@/components/suivibaby/dashboard/PromoBanner";
import { formatBirthDate, getAgeInMonths, getAgeLabel } from "@/utils/ageUtils";

/** Le menu ne relit promo/préférences que si la dernière lecture date de plus de 2 min. */
const DRAWER_REFRESH_TTL_MS = 2 * 60 * 1000;

export function CustomDrawerContent(props: DrawerContentComponentProps) {
  const router = useRouter();
  const { push: guardedPush } = useGuardedNavigation();
  const pathname = usePathname();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const chartColors = getChartColors(colorScheme);
  const { width } = useWindowDimensions();
  const {
    activeChild,
    children,
    childrenLoaded,
    setActiveChild,
    hideChildOptimistically,
    unhideChildOptimistically,
  } = useBaby();
  const { signOut, user, userName, email, firebaseUser } = useAuth();
  const { showToast } = useToast();
  const isMountedRef = useRef(true);
  const lastDrawerLoadRef = useRef<{ key: string; at: number } | null>(null);
  const [showHideModal, setShowHideModal] = useState(false);
  const [childToHide, setChildToHide] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showAddChildModal, setShowAddChildModal] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, message: "" });
  const [referralCode, setReferralCode] = useState("");
  const [referralCount, setReferralCount] = useState(0);
  const [marketingEnabled, setMarketingEnabled] = useState(false);
  const [currentPromo, setCurrentPromo] = useState<import("@/types/promo").Promotion | null>(null);
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  const canAddChild =
    permissions.role === "owner" || permissions.role === "admin";

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Load referral data + marketing preference (re-check on every drawer focus)
  useFocusEffect(
    useCallback(() => {
      if (!firebaseUser) return;
      // Pas de relecture si le menu a été chargé il y a moins de 2 minutes
      // pour le même compte et le même enfant (ouvertures successives).
      const cacheKey = `${firebaseUser.uid}|${activeChild?.birthDate ?? ""}`;
      if (
        lastDrawerLoadRef.current?.key === cacheKey &&
        Date.now() - lastDrawerLoadRef.current.at < DRAWER_REFRESH_TTL_MS
      ) {
        return;
      }
      let mounted = true;
      Promise.all([getUserPromoState(), obtenirPreferencesNotifications()])
        .then(async ([promoState, prefs]) => {
          if (!mounted) return;
          lastDrawerLoadRef.current = { key: cacheKey, at: Date.now() };
          setReferralCode(promoState.referralCode ?? "");
          setReferralCount(promoState.referralCount);
          setMarketingEnabled(prefs.marketing);
          // Load active promos if marketing enabled
          if (prefs.marketing && activeChild?.birthDate) {
            const ageMonths = getAgeInMonths(activeChild.birthDate);
            const promos = await fetchActivePromos(ageMonths);
            if (!mounted) return;
            const dismissed = new Set(promoState.dismissedPromos ?? []);
            const available = promos.filter((p) => !dismissed.has(p.id));
            setCurrentPromo(available[0] ?? null);
          } else if (!prefs.marketing) {
            setCurrentPromo(null);
          }
        })
        .catch(() => {});
      return () => { mounted = false; };
    }, [firebaseUser, activeChild?.birthDate]),
  );

  // Rôles par enfant : écouteurs partagés (hooks/useChildPermissions), plus de
  // lecture ponctuelle à chaque changement de la liste d'enfants.
  const childRoles = useChildRoles(
    useMemo(() => children.map((child) => child.id), [children]),
    firebaseUser?.uid,
  );

  // Rediriger vers le sélecteur d'enfant si tous les enfants sont masqués
  useEffect(() => {
    if (!childrenLoaded) return;
    if (children.length === 0 && pathname.includes("/baby")) {
      if (__DEV__) console.log(
        "[CustomDrawer] Tous les enfants masqués, redirection vers le sélecteur d'enfant",
      );
      router.replace("/child-picker");
    }
  }, [children.length, childrenLoaded, pathname, router]);

  // Centralized in utils/ageUtils — getAgeLabel handles legacy DD/MM/YYYY
  // strings and Firestore Timestamps transparently.
  const calculateAge = getAgeLabel;

  const handleSignOut = useCallback(() => {
    setShowSignOutModal(true);
  }, []);

  const handleHideChild = useCallback((childId: string, childName: string) => {
    setChildToHide({ id: childId, name: childName });
    setShowHideModal(true);
  }, []);

  const confirmHideChild = useCallback(async () => {
    if (!childToHide) return;

    const nextVisibleChild = children.find(
      (child) => child.id !== childToHide.id,
    );

    try {
      // P8b: Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      hideChildOptimistically(childToHide.id);

      if (activeChild?.id === childToHide.id) {
        if (nextVisibleChild) {
          setActiveChild(nextVisibleChild);
        } else if (pathname.includes("/baby")) {
          router.replace("/child-picker");
        }
      }

      await masquerEnfant(childToHide.id);
      if (!isMountedRef.current) return;
      setShowHideModal(false);
      setChildToHide(null);
      // P6: Success toast
      showToast(`${childToHide.name} masqué`);
    } catch (error) {
      if (!isMountedRef.current) return;
      unhideChildOptimistically(childToHide.id);
      setErrorModal({
        visible: true,
        message: "Impossible de masquer l'enfant.",
      });
    }
  }, [
    activeChild?.id,
    childToHide,
    children,
    hideChildOptimistically,
    pathname,
    router,
    setActiveChild,
    showToast,
    unhideChildOptimistically,
  ]);

  // Menu fermé : son contenu reste monté hors écran ; on le retire de l'arbre
  // d'accessibilité pour que VoiceOver/TalkBack ne puissent pas y naviguer.
  const isDrawerClosed = getDrawerStatusFromState(props.state, "closed") === "closed";

  return (
    <DrawerContentScrollView
      {...props}
      style={{ backgroundColor: Colors[colorScheme].background }}
      accessibilityElementsHidden={isDrawerClosed}
      importantForAccessibility={isDrawerClosed ? "no-hide-descendants" : "auto"}
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
          accessibilityRole="header"
          style={[
            styles.sectionHeader,
            { color: Colors[colorScheme].tabIconDefault },
          ]}
        >
          SUIVI POUR
        </Text>

        {/* Liste des enfants */}
        {children.map((child) => {
          const ageText = calculateAge(child.birthDate);
          const isActive = child.id === activeChild?.id;
          const itemColor = isActive
            ? (colorScheme === "dark" ? chartColors.tetees.gold : Colors[colorScheme].tint)
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
                      // Pas d'opacité sur la teinte (≈ 2.5:1) : textLight garantit ≥ 4.5:1
                      { color: nc.textLight },
                    ]}
                  >
                    {ageText} • {formatBirthDate(child.birthDate)}
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Actions sur l'enfant */}
              <View style={styles.childActions}>
                {canShareThisChild && (
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() =>
                      guardedPush(
                        `/(drawer)/share-child?childId=${child.id}` as any,
                      )
                    }
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Partager ${child.name}`}
                  >
                    <FontAwesome name="share-nodes" size={16} color={nc.todayAccent} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleHideChild(child.id, child.name)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Masquer ${child.name}`}
                >
                  <FontAwesome name="eye-slash" size={16} color={nc.error} />
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
            guardedPush("/settings/join-child" as any);
          }}
          accessibilityRole="button"
          accessibilityLabel="Ajouter un enfant"
        >
          <View style={styles.buttonContent}>
            <FontAwesome name="plus" size={14} color={Colors[colorScheme].tint} />
            <Text
              style={[styles.addBabyText, { color: colorScheme === "dark" ? nc.white : Colors[colorScheme].tint }]}
            >
              Ajouter un enfant
            </Text>
          </View>
        </TouchableOpacity>

        {/* Bouton J'ai un code - Retiré car intégré dans la modale */}
      </View>

      {/* Section: Compte utilisateur */}
      <View style={[styles.section, styles.actionsSection, { borderTopColor: nc.border }]}>

        {/* Promo banner (controlled by marketing toggle) */}
        {marketingEnabled && currentPromo && (
          <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
            <PromoBanner
              promo={currentPromo}
              onPress={(p) => {
                trackClick(p.id).catch(() => {});
                if (p.deepLink) {
                  import("react-native").then(({ Linking }) =>
                    Linking.openURL(p.deepLink).catch(() => {}),
                  );
                }
              }}
              onDismiss={(promoId) => {
                setCurrentPromo(null);
                dismissPromoService(promoId).catch(() => {});
              }}
              onCopyCode={() => showToast("Code copié !")}
              colorScheme={colorScheme}
              transparent
            />
          </View>
        )}

        {/* Referral card (controlled by marketing toggle) */}
        {marketingEnabled && referralCode && (
          <View style={{ marginHorizontal: 16, marginBottom: 12 }}>
            <ReferralCard
              referralCode={referralCode}
              referralCount={referralCount}
              onCopyCode={() => showToast("Code copié !")}
              colorScheme={colorScheme}
              transparent
            />
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.settingsButton,
            { borderColor: Colors[colorScheme].tint, backgroundColor: getBackgroundTint(Colors[colorScheme].tint, 0.08) },
          ]}
          onPress={() => guardedPush("/(drawer)/settings")}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir les paramètres"
        >
          <View style={styles.buttonContent}>
            <FontAwesome name="gear" size={14} color={Colors[colorScheme].tint} />
            <Text
              style={[styles.settingsText, { color: colorScheme === "dark" ? nc.white : Colors[colorScheme].tint }]}
            >
              Paramètres
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.signOutButton, { borderColor: nc.error, backgroundColor: getBackgroundTint(nc.error, 0.08) }]}
          onPress={handleSignOut}
          accessibilityRole="button"
          accessibilityLabel="Déconnexion"
        >
          <View style={styles.buttonContent}>
            <FontAwesome name="right-from-bracket" size={14} color={nc.error} />
            <Text style={[styles.signOutText, { color: nc.errorText }]}>
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
          accessible={false}
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
              L&apos;enfant restera accessible aux autres parents et vous pourrez le
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
                style={[styles.modalButton, { backgroundColor: nc.destructive }]}
                onPress={confirmHideChild}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Confirmer masquer l'enfant"
              >
                <Text style={[styles.deleteButtonText, { color: nc.onDestructive }]}>Masquer</Text>
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
    marginHorizontal: 16,
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
    // Cible tactile réelle ≥ 44 pt
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
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
    shadowColor: neutralColors.shadow,
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
