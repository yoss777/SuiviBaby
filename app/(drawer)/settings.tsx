import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { ConfirmModal } from '@/components/ui/ConfirmModal';
import { InfoModal } from '@/components/ui/InfoModal';
import { PromptModal } from '@/components/ui/PromptModal';
import { IconPulseDots } from '@/components/ui/IconPulseDtos';
import { db } from '@/config/firebase';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useThemePreference } from '@/contexts/ThemeContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { deleteAccountAndData } from '@/services/accountDeletionService';

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
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const { user, signOut } = useAuth();
  const { preference: themePreference } = useThemePreference();
  const router = useRouter();
  const { delete: deleteParam } = useLocalSearchParams();
  const [hasHiddenChildren, setHasHiddenChildren] = useState(false);
  const [hiddenChildrenCount, setHiddenChildrenCount] = useState(0);
  const [languagePreference, setLanguagePreference] = useState('fr');
  const [modalConfig, setModalConfig] = useState({
    visible: false,
    title: '',
    message: '',
  });
  const [showDeleteExportModal, setShowDeleteExportModal] = useState(false);
  const [showDeletePasswordModal, setShowDeletePasswordModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteParamHandledRef = useRef(false);

  useEffect(() => {
    if (!user) {
      setHasHiddenChildren(false);
      setHiddenChildrenCount(0);
      return;
    }

    const userPrefsRef = doc(db, 'user_preferences', user.uid);

    const unsubscribe = onSnapshot(userPrefsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const hiddenIds = data.hiddenChildrenIds || [];
        setHasHiddenChildren(hiddenIds.length > 0);
        setHiddenChildrenCount(hiddenIds.length);
        setLanguagePreference(data.language || 'fr');
      } else {
        setHasHiddenChildren(false);
        setHiddenChildrenCount(0);
        setLanguagePreference('fr');
      }
    }, (error) => {
      console.error('Erreur lors de l\'écoute des enfants masqués:', error);
      setHasHiddenChildren(false);
      setHiddenChildrenCount(0);
      setLanguagePreference('fr');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (deleteParam === '1' && !deleteParamHandledRef.current) {
      deleteParamHandledRef.current = true;
      setShowDeletePasswordModal(true);
      router.setParams({ delete: undefined });
    }
  }, [deleteParam, router]);

  const accountSettings: SettingItem[] = [
    {
      id: 'profile',
      icon: 'person-outline',
      label: 'Profil',
      description: 'Modifier vos informations personnelles',
      onPress: () => {
        router.push('/settings/profile');
      },
    },
    {
      id: 'password',
      icon: 'lock-closed-outline',
      label: 'Mot de passe',
      description: 'Changer votre mot de passe',
      onPress: () => {
        router.push('/settings/password');
      },
    },
  ];

  const appSettings: SettingItem[] = [
    {
      id: 'hidden-children',
      icon: 'eye-off-outline',
      label: 'Enfants masqués',
      value: `${hiddenChildrenCount}`,
      description: hasHiddenChildren ? 'Gérer les enfants masqués' : 'Aucun enfant masqué',
      disabled: !hasHiddenChildren,
      onPress: () => {
        if (hasHiddenChildren) {
          router.push('/settings/hidden-children');
        }
      },
    },
    {
      id: 'join-child',
      icon: 'person-add-outline',
      label: 'Ajouter un enfant',
      description: 'Entrer un code ou accepter une invitation',
      onPress: () => {
        router.push('/(drawer)/join-child');
      },
    },
    {
      id: 'notifications',
      icon: 'notifications-outline',
      label: 'Notifications',
      description: 'Gérer les notifications',
      onPress: () => {
        router.push('/settings/notifications');
      },
    },
    {
      id: 'theme',
      icon: 'moon-outline',
      label: 'Thème',
      value:
        themePreference === 'auto'
          ? 'Automatique'
          : themePreference === 'dark'
          ? 'Sombre'
          : 'Clair',
      onPress: () => {
        router.push('/settings/theme');
      },
    },
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
  ];

  const dataSettings: SettingItem[] = [
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
      id: 'export',
      icon: 'cloud-download-outline',
      label: 'Export',
      description: 'Télécharger vos données',
      onPress: () => {
        router.push('/settings/export');
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
  ];

  const otherSettings: SettingItem[] = [
    {
      id: 'privacy',
      icon: 'shield-outline',
      label: 'Confidentialité',
      description: 'Politique de confidentialité',
      onPress: () => {
        router.push('/settings/privacy');
      },
    },
    {
      id: 'terms',
      icon: 'document-text-outline',
      label: 'Conditions d\'utilisation',
      onPress: () => {
        router.push('/settings/terms');
      },
    },
    {
      id: 'about',
      icon: 'information-circle-outline',
      label: 'À propos',
      value: 'Version 1.0.0',
      onPress: () => {
        setModalConfig({
          visible: true,
          title: 'SuiviBaby',
          message: 'Version 1.0.0\n\nSystème de suivi d\'événements bébé pour les parents.',
        });
      },
    },
    {
      id: 'help',
      icon: 'help-circle-outline',
      label: 'Aide & Support',
      onPress: () => {
        router.push('/settings/help');
      },
    },
  ];

  const dangerSettings: SettingItem[] = [
    {
      id: 'delete',
      icon: 'trash-outline',
      label: 'Supprimer le compte',
      description: 'Cette action est irréversible',
      onPress: () => setShowDeleteExportModal(true),
      color: '#dc3545',
    },
  ];

  const renderSettingItem = (item: SettingItem) => {
    const isDisabled = !!item.disabled;
    const showChevron = item.showChevron ?? (!isDisabled);

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.settingItem,
          { borderBottomColor: Colors[colorScheme].tabIconDefault + '20' },
        ]}
        onPress={item.onPress}
        activeOpacity={isDisabled ? 1 : 0.7}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityState={{ disabled: isDisabled }}
      >
        <View style={styles.settingItemLeft}>
          <View
            style={[
              styles.iconContainer,
              { backgroundColor: (item.color || Colors[colorScheme].tint) + '15' },
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
            <Text style={[
              styles.settingLabel,
              { color: item.color || Colors[colorScheme].text },
              isDisabled && { opacity: 0.35 },
            ]}>
              {item.label}
            </Text>
            {item.description && (
              <Text style={[
                styles.settingDescription,
                { color: Colors[colorScheme].tabIconDefault },
                isDisabled && { opacity: 0.35 },
              ]}>
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
                { color: Colors[colorScheme].tabIconDefault },
                isDisabled && { opacity: 0.35 },
              ]}
              numberOfLines={1}
            >
              {item.value}
            </Text>
          ) : null}
          {item.tag ? (
            <View style={[styles.tag, isDisabled && { opacity: 0.35 }]}>
              <Text style={styles.tagText}>{item.tag}</Text>
            </View>
          ) : null}
          {showChevron ? (
            <Ionicons
              name="chevron-forward"
              size={20}
              color={Colors[colorScheme].tabIconDefault}
              style={isDisabled && { opacity: 0.35 }}
            />
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSection = (title: string, items: SettingItem[]) => (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: Colors[colorScheme].tabIconDefault }]}>
        {title}
      </Text>
      <ThemedView style={styles.sectionContent}>
        {items.map(renderSettingItem)}
      </ThemedView>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderSection('Compte', accountSettings)}
        {renderSection('Application', appSettings)}
        {renderSection('Donnees', dataSettings)}
        {renderSection('Autres', otherSettings)}
        {renderSection('Zone dangereuse', dangerSettings)}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: Colors[colorScheme].tabIconDefault }]}>
            SuiviBaby © 2026
          </Text>
        </View>
      </ScrollView>
      <InfoModal
        visible={modalConfig.visible}
        title={modalConfig.title}
        message={modalConfig.message}
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        onClose={() => setModalConfig((prev) => ({ ...prev, visible: false }))}
      />
      <ConfirmModal
        visible={showDeleteExportModal}
        title="Exporter vos donnees ?"
        message="Pour garder une copie, exportez vos donnees avant la suppression."
        confirmText="Exporter"
        cancelText="Supprimer"
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        confirmButtonColor={Colors[colorScheme].tint}
        onConfirm={() => {
          setShowDeleteExportModal(false);
          router.push('/settings/export?afterDelete=1');
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
          isDeleting ? (
            <View style={styles.deleteLoader}>
              <IconPulseDots />
              <Text style={[styles.deleteLoaderText, { color: Colors[colorScheme].text }]}>
                Suppression en cours...
              </Text>
            </View>
          ) : (
            "Votre compte et vos donnees seront supprimes immediatement."
          )
        }
        value={deletePassword}
        placeholder="Mot de passe"
        secureTextEntry
        multiline={false}
        autoCapitalize="none"
        confirmText={isDeleting ? "Suppression..." : "Supprimer"}
        confirmButtonColor="#dc3545"
        confirmDisabled={isDeleting}
        cancelText="Annuler"
        backgroundColor={Colors[colorScheme].background}
        textColor={Colors[colorScheme].text}
        onChangeText={(value) => {
          if (isDeleting) return;
          setDeletePassword(value);
        }}
        onConfirm={async () => {
          if (isDeleting) return;
          if (!deletePassword.trim()) {
            setModalConfig({
              visible: true,
              title: 'Erreur',
              message: 'Veuillez saisir votre mot de passe.',
            });
            return;
          }

          try {
            setIsDeleting(true);
            await deleteAccountAndData(deletePassword);
            setShowDeletePasswordModal(false);
            setDeletePassword('');
            await signOut();
            router.replace('/(auth)/login');
          } catch (error: any) {
            const code = error?.code || '';
            const message =
              code === 'auth/wrong-password'
                ? 'Mot de passe incorrect.'
                : code === 'auth/requires-recent-login'
                  ? 'Veuillez vous reconnecter puis réessayer.'
                  : 'Impossible de supprimer le compte.';
            setModalConfig({
              visible: true,
              title: 'Erreur',
              message,
            });
          } finally {
            setIsDeleting(false);
          }
        }}
        onCancel={() => {
          if (isDeleting) return;
          setShowDeletePasswordModal(false);
          setDeletePassword('');
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
    fontWeight: '600',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionContent: {
    borderRadius: 12,
    marginHorizontal: 16,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 13,
    marginTop: 2,
  },
  settingItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: 160,
  },
  settingValue: {
    fontSize: 14,
  },
  deleteLoader: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  deleteLoaderText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tag: {
    backgroundColor: '#f2f2f2',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555',
    textTransform: 'uppercase',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 12,
  },
});
