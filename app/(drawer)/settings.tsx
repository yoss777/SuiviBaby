import { Ionicons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { useNavigation } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { doc, onSnapshot } from "firebase/firestore";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { InfoModal } from "@/components/ui/InfoModal";
import { PromptModal } from "@/components/ui/PromptModal";
import { db } from "@/config/firebase";
import {
  getBackgroundTint,
  getNeutralColors,
} from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useThemePreference } from "@/contexts/ThemeContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { requestAccountDeletion, cancelAccountDeletion, getPendingDeletionDate } from "@/services/accountDeletionService";
import {
  clearCredentials,
  enableBiometric,
  getBiometricType,
  isBiometricAvailable,
  isBiometricEnabled,
} from "@/services/biometricAuthService";

interface SettingItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  value?: string;
  tag?: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  showChevron?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { user, signOut } = useAuth();
  const { activeChild } = useBaby();
  const { preference: themePreference } = useThemePreference();
  const router = useRouter();
  const { delete: deleteParam } = useLocalSearchParams();
  const [hasHiddenChildren, setHasHiddenChildren] = useState(false);
  const [hiddenChildrenCount, setHiddenChildrenCount] = useState(0);
  const [languagePreference, setLanguagePreference] = useState("fr");
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: "",
    message: "",
  });
  const [showDeleteExportModal, setShowDeleteExportModal] = useState(false);
  const [showDeletePasswordModal, setShowDeletePasswordModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteParamHandledRef = useRef(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricLabel, setBiometricLabel] = useState("Biométrie");
  const [pendingDeletionDate, setPendingDeletionDate] = useState<string | null>(null);
  const [isCancellingDeletion, setIsCancellingDeletion] = useState(false);
  const navigation = useNavigation();

  // Check biometric availability + pending deletion on mount
  useEffect(() => {
    (async () => {
      const available = await isBiometricAvailable();
      setBiometricAvailable(available);
      if (available) {
        const [enabled, type] = await Promise.all([
          isBiometricEnabled(),
          getBiometricType(),
        ]);
        setBiometricEnabled(enabled);
        setBiometricLabel(type);
      }
    })();

    getPendingDeletionDate().then(setPendingDeletionDate).catch(() => {});
  }, []);

  // Header right: home shortcut (baby home if activeChild, explore otherwise)
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            if (activeChild) {
              router.replace("/baby/home");
            } else {
              router.replace("/explore");
            }
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginRight: 16 }}
          accessibilityRole="button"
          accessibilityLabel={
            activeChild
              ? `Accueil de ${activeChild.name}`
              : "Retour à l'accueil"
          }
          accessibilityHint="Retourner à l'accueil"
        >
          <FontAwesome
            name="house"
            size={20}
            color={Colors[colorScheme].tint}
          />
        </TouchableOpacity>
      ),
    });
  }, [activeChild, colorScheme, navigation, router]);

  useEffect(() => {
    if (!user) {
      setHasHiddenChildren(false);
      setHiddenChildrenCount(0);
      return;
    }

    const userPrefsRef = doc(db, "user_preferences", user.uid);

    const unsubscribe = onSnapshot(
      userPrefsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const hiddenIds = data.hiddenChildrenIds || [];
          setHasHiddenChildren(hiddenIds.length > 0);
          setHiddenChildrenCount(hiddenIds.length);
          setLanguagePreference(data.language || "fr");
        } else {
          setHasHiddenChildren(false);
          setHiddenChildrenCount(0);
          setLanguagePreference("fr");
        }
      },
      (error) => {
        console.error("Erreur lors de l'écoute des enfants masqués:", error);
        setHasHiddenChildren(false);
        setHiddenChildrenCount(0);
        setLanguagePreference("fr");
      },
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (deleteParam === "1" && !deleteParamHandledRef.current) {
      deleteParamHandledRef.current = true;
      setShowDeletePasswordModal(true);
      router.setParams({ delete: undefined });
    }
  }, [deleteParam, router]);

  const accountSettings: SettingItem[] = useMemo(
    () => [
      {
        id: "profile",
        icon: "person-outline",
        label: "Profil",
        description: "Modifier vos informations personnelles",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/settings/profile");
        },
      },
      {
        id: "password",
        icon: "lock-closed-outline",
        label: "Mot de passe",
        description: "Changer votre mot de passe",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/settings/password");
        },
      },
    ],
    [router],
  );

  const appSettings: SettingItem[] = useMemo(
    () => [
      {
        id: "hidden-children",
        icon: "eye-off-outline",
        label: "Enfants masqués",
        value: `${hiddenChildrenCount}`,
        description: hasHiddenChildren
          ? "Gérer les enfants masqués"
          : "Aucun enfant masqué",
        disabled: !hasHiddenChildren,
        onPress: () => {
          if (hasHiddenChildren) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push("/settings/hidden-children");
          }
        },
      },
      {
        id: "join-child",
        icon: "person-add-outline",
        label: "Ajouter un enfant",
        description: "Entrer un code ou accepter une invitation",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/settings/join-child");
        },
      },
      {
        id: "notifications",
        icon: "notifications-outline",
        label: "Notifications",
        description: "Gérer les notifications",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/settings/notifications");
        },
      },
      {
        id: "theme",
        icon: "moon-outline",
        label: "Thème",
        value:
          themePreference === "auto"
            ? "Automatique"
            : themePreference === "dark"
              ? "Sombre"
              : "Clair",
        onPress: () => {
          router.push("/settings/theme");
        },
      },
      ...(biometricAvailable
        ? [
            {
              id: "biometric",
              icon: (biometricLabel === "Face ID"
                ? "scan-outline"
                : "finger-print-outline") as keyof typeof Ionicons.glyphMap,
              label: biometricLabel,
              value: biometricEnabled ? "Activé" : "Désactivé",
              description: biometricEnabled
                ? "Connexion rapide activée"
                : "Activer la connexion rapide",
              accessibilityLabel: `${biometricLabel}, ${biometricEnabled ? "activé" : "désactivé"}`,
              accessibilityHint: biometricEnabled
                ? `Appuyez pour désactiver ${biometricLabel}`
                : `Appuyez pour activer ${biometricLabel}`,
              onPress: async () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (biometricEnabled) {
                  await clearCredentials();
                  setBiometricEnabled(false);
                } else {
                  await enableBiometric();
                  setBiometricEnabled(true);
                }
              },
            },
          ]
        : []),
      // {
      //   id: 'language',
      //   icon: 'language-outline',
      //   label: 'Langue',
      //   value:
      //     {
      //       fr: 'Français',
      //       en: 'English',
      //       es: 'Español',
      //       de: 'Deutsch',
      //       it: 'Italiano',
      //       pt: 'Português',
      //       ar: 'العربية',
      //     }[languagePreference] || languagePreference.toUpperCase(),
      //   onPress: () => {
      //     router.push('/settings/language');
      //   },
      // },
    ],
    [
      hiddenChildrenCount,
      hasHiddenChildren,
      router,
      themePreference,
      biometricAvailable,
      biometricEnabled,
      biometricLabel,
    ],
  );

  const dataSettings: SettingItem[] = useMemo(
    () => [
      // {
      //   id: 'migration',
      //   icon: 'rocket-outline',
      //   label: 'Migration des données',
      //   description: 'Gérer la migration vers la nouvelle structure',
      //   color: Colors.light.primary,
      //   onPress: () => {
      //     router.push('/settings/migration');
      //   },
      // },
      {
        id: "export",
        icon: "cloud-download-outline",
        label: "Export",
        description: "Télécharger vos données",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/settings/export");
        },
      },
      // {
      //   id: 'backup',
      //   icon: 'cloud-upload-outline',
      //   label: 'Sauvegarde',
      //   description: 'Sauvegarder vos données',
      //   onPress: () => {
      //     router.push('/settings/backup');
      //   },
      // },
    ],
    [router],
  );

  const otherSettings: SettingItem[] = useMemo(
    () => [
      {
        id: "privacy",
        icon: "shield-outline",
        label: "Confidentialité",
        description: "Politique de confidentialité",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/settings/privacy");
        },
      },
      {
        id: "terms",
        icon: "document-text-outline",
        label: "Conditions d'utilisation",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/settings/terms");
        },
      },
      {
        id: "about",
        icon: "information-circle-outline",
        label: "À propos",
        value: "Version 1.0.0",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setModalConfig({
            visible: true,
            title: "SuiviBaby",
            message:
              "Version 1.0.0\n\nSystème de suivi d'événements bébé pour les parents.",
          });
        },
      },
      {
        id: "help",
        icon: "help-circle-outline",
        label: "Aide & Support",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push("/settings/help");
        },
      },
    ],
    [router],
  );

  const dangerSettings: SettingItem[] = useMemo(
    () => [
      {
        id: "delete",
        icon: "trash-outline",
        label: "Supprimer le compte",
        description: "Cette action est irréversible",
        onPress: () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setShowDeleteExportModal(true);
        },
        color: nc.error,
      },
    ],
    [nc.error],
  );

  const renderSettingItem = useCallback(
    (item: SettingItem) => {
      const isDisabled = !!item.disabled;
      const showChevron = item.showChevron ?? !isDisabled;

      return (
        <TouchableOpacity
          key={item.id}
          style={[styles.settingItem, { borderBottomColor: nc.borderLight }]}
          onPress={item.onPress}
          activeOpacity={isDisabled ? 1 : 0.7}
          disabled={isDisabled}
          accessibilityRole="button"
          accessibilityLabel={
            item.accessibilityLabel ||
            `${item.label}${item.value ? `, ${item.value}` : ""}`
          }
          accessibilityHint={item.accessibilityHint || item.description}
          accessibilityState={{ disabled: isDisabled }}
        >
          <View style={styles.settingItemLeft}>
            <View
              style={[
                styles.iconContainer,
                {
                  backgroundColor: getBackgroundTint(
                    item.color || Colors[colorScheme].tint,
                    0.08,
                  ),
                },
                isDisabled && { opacity: 0.35 },
              ]}
            >
              <Ionicons
                name={item.icon}
                size={22}
                color={item.color || Colors[colorScheme].tint}
              />
            </View>
            <View style={styles.settingTextContainer}>
              <Text
                style={[
                  styles.settingLabel,
                  { color: item.color || nc.textStrong },
                  isDisabled && { opacity: 0.35 },
                ]}
              >
                {item.label}
              </Text>
              {item.description && (
                <Text
                  style={[
                    styles.settingDescription,
                    { color: nc.textLight },
                    isDisabled && { opacity: 0.35 },
                  ]}
                >
                  {item.description}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.settingItemRight}>
            {item.value ? (
              <Text
                style={[
                  styles.settingValue,
                  { color: nc.textMuted },
                  isDisabled && { opacity: 0.35 },
                ]}
                numberOfLines={1}
              >
                {item.value}
              </Text>
            ) : null}
            {item.tag ? (
              <View
                style={[
                  styles.tag,
                  { backgroundColor: nc.backgroundPressed },
                  isDisabled && { opacity: 0.35 },
                ]}
              >
                <Text style={[styles.tagText, { color: nc.textLight }]}>
                  {item.tag}
                </Text>
              </View>
            ) : null}
            {showChevron ? (
              <Ionicons
                name="chevron-forward"
                size={20}
                color={nc.textMuted}
                style={isDisabled && { opacity: 0.35 }}
              />
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [nc, colorScheme],
  );

  const renderSection = (title: string, items: SettingItem[]) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: nc.textMuted }]}>
        {title}
      </Text>
      <View
        style={[styles.sectionContent, { backgroundColor: nc.backgroundCard }]}
      >
        {items.map(renderSettingItem)}
      </View>
    </View>
  );

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: nc.background }]}
      edges={["bottom"]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderSection("Compte", accountSettings)}
        {renderSection("Application", appSettings)}
        {renderSection("Donnees", dataSettings)}
        {renderSection("Autres", otherSettings)}
        {renderSection("Zone dangereuse", dangerSettings)}

        {pendingDeletionDate && (
          <View style={[styles.deletionBanner, { backgroundColor: nc.errorBg, borderColor: nc.error }]}>
            <Ionicons name="warning-outline" size={20} color={nc.error} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[styles.deletionBannerText, { color: nc.error }]}>
                Suppression programmee le {new Date(pendingDeletionDate).toLocaleDateString("fr-FR")}
              </Text>
              <Text style={[styles.deletionBannerSubtext, { color: nc.textMuted }]}>
                Vos donnees seront definitivement supprimees a cette date.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.cancelDeletionButton, { borderColor: nc.error }]}
              onPress={async () => {
                setIsCancellingDeletion(true);
                try {
                  await cancelAccountDeletion();
                  setPendingDeletionDate(null);
                  setModalConfig({
                    visible: true,
                    title: "Annulation confirmee",
                    message: "La suppression de votre compte a ete annulee.",
                  });
                } catch {
                  setModalConfig({
                    visible: true,
                    title: "Erreur",
                    message: "Impossible d'annuler la suppression.",
                  });
                } finally {
                  setIsCancellingDeletion(false);
                }
              }}
              disabled={isCancellingDeletion}
            >
              <Text style={{ color: nc.error, fontWeight: "600", fontSize: 13 }}>
                {isCancellingDeletion ? "..." : "Annuler"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: nc.textMuted }]}>
            SuiviBaby © 2026
          </Text>
        </View>
      </ScrollView>
      <InfoModal
        visible={modalConfig.visible}
        title={modalConfig.title}
        message={modalConfig.message}
        backgroundColor={nc.backgroundCard}
        textColor={nc.textStrong}
        onClose={() => setModalConfig((prev) => ({ ...prev, visible: false }))}
      />
      <ConfirmModal
        visible={showDeleteExportModal}
        title="Exporter vos donnees ?"
        message="Pour garder une copie, exportez vos donnees avant la suppression."
        confirmText="Exporter"
        cancelText="Supprimer"
        backgroundColor={nc.backgroundCard}
        textColor={nc.textStrong}
        confirmButtonColor={Colors.light.tint}
        confirmTextColor={colorScheme === "dark" ? nc.white : nc.backgroundCard}
        allowBackdropDismiss
        onDismiss={() => setShowDeleteExportModal(false)}
        onConfirm={() => {
          setShowDeleteExportModal(false);
          router.push("/settings/export?afterDelete=1");
        }}
        onCancel={() => {
          setShowDeleteExportModal(false);
          setShowDeletePasswordModal(true);
        }}
      />
      <PromptModal
        visible={showDeletePasswordModal}
        title="Confirmer la suppression"
        message={
          (isDeleting ? (
            <View style={styles.deleteLoader}>
              <IconPulseDots />
              <Text style={[styles.deleteLoaderText, { color: nc.textStrong }]}>
                Suppression en cours...
              </Text>
            </View>
          ) : (
            "Votre compte sera programme pour suppression dans 30 jours. Vous pourrez annuler a tout moment depuis les parametres."
          )) as any
        }
        value={deletePassword}
        placeholder="Mot de passe"
        secureTextEntry
        multiline={false}
        autoCapitalize="none"
        confirmText={isDeleting ? "Suppression..." : "Supprimer"}
        confirmButtonColor={nc.error}
        confirmDisabled={isDeleting}
        cancelText="Annuler"
        backgroundColor={nc.backgroundCard}
        textColor={nc.textStrong}
        onChangeText={(value) => {
          if (isDeleting) return;
          setDeletePassword(value);
        }}
        onConfirm={async () => {
          if (isDeleting) return;
          if (!deletePassword.trim()) {
            setModalConfig({
              visible: true,
              title: "Erreur",
              message: "Veuillez saisir votre mot de passe.",
            });
            return;
          }

          try {
            setIsDeleting(true);
            await requestAccountDeletion(deletePassword);

            // Envoyer email de confirmation (fire & forget)
            const { httpsCallable } = await import("firebase/functions");
            const { functions } = await import("@/config/firebase");
            const sendEmail = httpsCallable(functions, "sendDeletionRequestEmail");
            sendEmail().catch(() => {});

            const deletionDate = new Date();
            deletionDate.setDate(deletionDate.getDate() + 30);
            setPendingDeletionDate(deletionDate.toISOString());

            setShowDeletePasswordModal(false);
            setDeletePassword("");
            setModalConfig({
              visible: true,
              title: "Suppression programmee",
              message: "Votre compte sera supprime dans 30 jours. Un email de confirmation vous a ete envoye. Vous pouvez annuler a tout moment depuis les parametres.",
            });
          } catch (error: any) {
            const code = error?.code || "";
            const message =
              code === "auth/wrong-password"
                ? "Mot de passe incorrect."
                : code === "auth/requires-recent-login"
                  ? "Veuillez vous reconnecter puis réessayer."
                  : "Impossible de programmer la suppression du compte.";
            setModalConfig({
              visible: true,
              title: "Erreur",
              message,
            });
          } finally {
            setIsDeleting(false);
          }
        }}
        onCancel={() => {
          if (isDeleting) return;
          setShowDeletePasswordModal(false);
          setDeletePassword("");
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionContent: {
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  settingItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  settingItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  settingDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  settingItemRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: 160,
  },
  settingValue: {
    fontSize: 14,
  },
  deleteLoader: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 4,
  },
  deleteLoaderText: {
    fontSize: 14,
    fontWeight: "600",
  },
  tag: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  footer: {
    alignItems: "center",
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 12,
  },
  deletionBanner: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  deletionBannerText: {
    fontSize: 14,
    fontWeight: "600",
  },
  deletionBannerSubtext: {
    fontSize: 12,
    marginTop: 2,
  },
  cancelDeletionButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
});
