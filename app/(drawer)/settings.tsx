import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { db } from '@/config/firebase';
import { Colors } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

interface SettingItem {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
}

export default function SettingsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const { user, userName, email } = useAuth();  
  const router = useRouter();
  const [hasHiddenChildren, setHasHiddenChildren] = useState(false);

  useEffect(() => {
    if (!user) {
      setHasHiddenChildren(false);
      return;
    }

    const userPrefsRef = doc(db, 'user_preferences', user.uid);

    const unsubscribe = onSnapshot(userPrefsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const hiddenIds = data.hiddenChildrenIds || [];
        setHasHiddenChildren(hiddenIds.length > 0);
      } else {
        setHasHiddenChildren(false);
      }
    }, (error) => {
      console.error('Erreur lors de l\'écoute des enfants masqués:', error);
      setHasHiddenChildren(false);
    });

    return () => unsubscribe();
  }, [user]);

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
      id: 'email',
      icon: 'mail-outline',
      label: 'Email',
      description: email || user?.email || '',
      // description: user?.email || '',
      onPress: () => {
        Alert.alert('Email', 'Fonctionnalité à venir');
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
      description: hasHiddenChildren ? 'Gérer les enfants masqués' : 'Aucun enfant masqué',
      disabled: !hasHiddenChildren,
      onPress: () => {
        if (hasHiddenChildren) {
          router.push('/settings/hidden-children');
        }
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
      description: 'Clair / Sombre',
      onPress: () => {
        router.push('/settings/theme');
      },
    },
    {
      id: 'language',
      icon: 'language-outline',
      label: 'Langue',
      description: 'Français',
      onPress: () => {
        router.push('/settings/language');
      },
    },
  ];

  const dataSettings: SettingItem[] = [
    {
      id: 'migration',
      icon: 'rocket-outline',
      label: 'Migration des données',
      description: 'Gérer la migration vers la nouvelle structure',
      color: Colors.light.primary,
      onPress: () => {
        router.push('/settings/migration');
      },
    },
    {
      id: 'export',
      icon: 'cloud-download-outline',
      label: 'Exporter les données',
      description: 'Télécharger vos données médicales',
      onPress: () => {
        router.push('/settings/export');
      },
    },
    {
      id: 'backup',
      icon: 'cloud-upload-outline',
      label: 'Sauvegarde',
      description: 'Sauvegarder vos données',
      onPress: () => {
        router.push('/settings/backup');
      },
    },
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
      description: 'Version 1.0.0',
      onPress: () => {
        Alert.alert('SMILE', 'Version 1.0.0\n\nSystème d\'Information Médicale');
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
      onPress: () => {
        Alert.alert(
          'Supprimer le compte',
          'Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.',
          [
            { text: 'Annuler', style: 'cancel' },
            {
              text: 'Supprimer',
              style: 'destructive',
              onPress: () => {
                Alert.alert('Suppression', 'Fonctionnalité à venir');
              },
            },
          ]
        );
      },
      color: '#dc3545',
    },
  ];

  const renderSettingItem = (item: SettingItem) => (
    <TouchableOpacity
      key={item.id}
      style={[
        styles.settingItem,
        { borderBottomColor: Colors[colorScheme].tabIconDefault + '20' },
      ]}
      onPress={item.onPress}
      activeOpacity={item.disabled ? 1 : 0.7}
      disabled={item.disabled}
    >
      <View style={styles.settingItemLeft}>
        <View
          style={[
            styles.iconContainer,
            { backgroundColor: (item.color || Colors[colorScheme].tint) + '15' },
            item.disabled && { opacity: 0.5 },
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
            item.disabled && { opacity: 0.5 },
          ]}>
            {item.label}
          </Text>
          {item.description && (
            <Text style={[
              styles.settingDescription,
              { color: Colors[colorScheme].tabIconDefault },
              item.disabled && { opacity: 0.5 },
            ]}>
              {item.description}
            </Text>
          )}
        </View>
      </View>
      <Ionicons
        name="chevron-forward"
        size={20}
        color={Colors[colorScheme].tabIconDefault}
        style={item.disabled && { opacity: 0.5 }}
      />
    </TouchableOpacity>
  );

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
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {renderSection('COMPTE', accountSettings)}
        {renderSection('APPLICATION', appSettings)}
        {renderSection('DONNÉES', dataSettings)}
        {renderSection('AUTRES', otherSettings)}
        {renderSection('ZONE DANGEREUSE', dangerSettings)}

        <View style={styles.footer}>
          <Text style={[styles.footerText, { color: Colors[colorScheme].tabIconDefault }]}>
            Mediscope © 2025
          </Text>
        </View>
      </ScrollView>
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
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  footerText: {
    fontSize: 12,
  },
});
