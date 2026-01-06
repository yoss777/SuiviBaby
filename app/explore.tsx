import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { db } from '@/config/firebase';
import { Colors, Fonts } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useBaby, type Child } from '@/contexts/BabyContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { afficherEnfant, obtenirPreferences } from '@/services/userPreferencesService';
import { collection, getDocs, query, where } from 'firebase/firestore';

const { width } = Dimensions.get('window');
const CARD_SIZE = Math.min(width * 0.85, 320);

interface MedicalCategory {
  id: string;
  emoji: string;
  title: string;
  route?: string;
  enabled: boolean;
  child?: Child;
}

export default function Explore() {
  const colorScheme = useColorScheme() ?? 'light';
  const { signOut, user } = useAuth();
  const { children, setActiveChild, loading } = useBaby();
  const [showUnhideModal, setShowUnhideModal] = useState(false);
  const [hiddenChildren, setHiddenChildren] = useState<Child[]>([]);
  const [toggledIds, setToggledIds] = useState<Set<string>>(new Set());
  const [loadingHidden, setLoadingHidden] = useState(false);

  const categories: MedicalCategory[] = useMemo(() => {
    const childTiles = children.map((child) => ({
      id: child.id,
      emoji: '👶',
      title: child.name || 'Suivi enfant',
      route: 'baby',
      enabled: !loading,
      child,
    }));

    if (children.length === 0) {
      return [
        {
          id: 'unhide-children',
          emoji: '👁️',
          title: 'Réactiver des enfants',
          route: 'unhide',
          enabled: true,
        },
        {
          id: 'add-baby',
          emoji: '➕',
          title: 'Ajouter un enfant',
          route: 'add-baby',
          enabled: true,
        },
      ];
    }

    return childTiles;
  }, [children, loading]);

  const anim0 = { opacity: useSharedValue(0), translateY: useSharedValue(20) };
  const anim1 = { opacity: useSharedValue(0), translateY: useSharedValue(20) };
  const anim2 = { opacity: useSharedValue(0), translateY: useSharedValue(20) };
  const anim3 = { opacity: useSharedValue(0), translateY: useSharedValue(20) };
  const anim4 = { opacity: useSharedValue(0), translateY: useSharedValue(20) };
  const anim5 = { opacity: useSharedValue(0), translateY: useSharedValue(20) };
  const anim6 = { opacity: useSharedValue(0), translateY: useSharedValue(20) };
  const anim7 = { opacity: useSharedValue(0), translateY: useSharedValue(20) };
  const anim8 = { opacity: useSharedValue(0), translateY: useSharedValue(20) };
  const anim9 = { opacity: useSharedValue(0), translateY: useSharedValue(20) };

  const animationValues = [anim0, anim1, anim2, anim3, anim4, anim5, anim6, anim7, anim8, anim9];

  React.useEffect(() => {
    animationValues.forEach((anim) => {
      anim.opacity.value = 0;
      anim.translateY.value = 20;
    });

    categories.forEach((_, index) => {
      if (index < animationValues.length) {
        animationValues[index].opacity.value = withDelay(index * 100, withTiming(1, { duration: 600 }));
        animationValues[index].translateY.value = withDelay(index * 100, withTiming(0, { duration: 600 }));
      }
    });
  }, [categories]);

  // Rediriger automatiquement vers l'enfant unique après réactivation
  React.useEffect(() => {
    if (children.length === 1 && !loading) {
      console.log('[Explore] Un seul enfant réactivé, redirection automatique');
      setActiveChild(children[0]);
      router.replace('/(drawer)/baby');
    }
  }, [children.length, loading]);

  const handleCategoryPress = async (category: MedicalCategory) => {
    if (!category.enabled || !category.route) return;

    if (category.route === 'unhide') {
      setLoadingHidden(true);
      try {
        if (!user?.uid) return;
        
        const prefs = await obtenirPreferences();
        const q = query(
          collection(db, 'children'),
          where('parentIds', 'array-contains', user.uid)
        );
        const snapshot = await getDocs(q);
        
        const allChildren: Child[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data() as Omit<Child, 'id'>
        }));
        
        const masked = allChildren.filter(child => 
          prefs.hiddenChildrenIds.includes(child.id)
        );
        
        setHiddenChildren(masked);
        setShowUnhideModal(true);
      } catch (error) {
        console.error('Erreur lors du chargement des enfants masqués:', error);
        Alert.alert('Erreur', 'Impossible de charger les enfants masqués');
      } finally {
        setLoadingHidden(false);
      }
      return;
    }

    if (category.route === 'baby' && category.child) {
      setActiveChild(category.child);
      router.push('/(drawer)/baby' as any);
      return;
    }

    router.push(`/(drawer)/${category.route}` as any);
  };

  const handleToggleChild = (childId: string) => {
    setToggledIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(childId)) {
        newSet.delete(childId);
      } else {
        newSet.add(childId);
      }
      return newSet;
    });
  };

  const handleUnhideConfirm = async () => {
    if (toggledIds.size === 0) {
      Alert.alert('Attention', 'Veuillez sélectionner au moins un enfant à réactiver');
      return;
    }

    try {
      const promises = Array.from(toggledIds).map(childId => afficherEnfant(childId));
      await Promise.all(promises);

      setShowUnhideModal(false);
      setToggledIds(new Set());
      setHiddenChildren([]);
      
      // Pas d'alert - le feedback est la redirection automatique ou l'apparition des enfants
    } catch (error) {
      console.error('Erreur lors de la réactivation:', error);
      Alert.alert('Erreur', 'Impossible de réactiver les enfants');
    }
  };

  const handleSignOut = async () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Déconnexion',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/(auth)/login');
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de se déconnecter');
            }
          },
        },
      ]
    );
  };

  const renderCategory = (category: MedicalCategory, index: number) => {
    const isChildTracking = category.route === 'baby' || category.route === 'add-baby';
    const showLoader = isChildTracking && loading;

    return (
      <Animated.View 
        key={category.id}
        style={{
          opacity: animationValues[index]?.opacity,
          transform: [{ translateY: animationValues[index]?.translateY }],
        }}
      >
        <ThemedView
          style={[
            styles.category,
            {
              borderColor: Colors[colorScheme].tint,
              opacity: showLoader || category.enabled ? 1 : 0.5,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => handleCategoryPress(category)}
            disabled={!category.enabled}
            activeOpacity={0.7}
            style={styles.touchable}
          >
            {showLoader ? (
              <View style={styles.loaderContainer}>
                <ActivityIndicator size="small" color={Colors[colorScheme].tint} />
                <ThemedText style={[styles.categoryTitle, { marginTop: 8 }]} numberOfLines={2}>
                  Chargement...
                </ThemedText>
              </View>
            ) : (
              <>
                <ThemedText style={styles.emoji}>{category.emoji}</ThemedText>
                <ThemedText style={styles.categoryTitle} numberOfLines={3}>
                  {category.title}
                </ThemedText>
              </>
            )}
          </TouchableOpacity>
        </ThemedView>
      </Animated.View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors[colorScheme].background }]} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <ThemedView style={styles.screen}>
          <ThemedView style={styles.header}>
            <ThemedText
              type="title"
              style={{
                fontFamily: Fonts.rounded,
                textAlign: 'center',
              }}
            >
              Suivi Baby
            </ThemedText>
            <ThemedText style={styles.subtitle}>
              L&apos;Amour au Cœur de la Vie
            </ThemedText>

            <TouchableOpacity
              onPress={handleSignOut}
              style={styles.logoutButton}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={24} color={Colors[colorScheme].tint} />
            </TouchableOpacity>
          </ThemedView>

          <ThemedView style={styles.listContainer}>
            {categories.map((category, index) => renderCategory(category, index))}
          </ThemedView>
        </ThemedView>
      </ScrollView>

      <Modal
        visible={showUnhideModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowUnhideModal(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowUnhideModal(false)}
        >
          <Pressable
            style={[styles.modalContent, { backgroundColor: Colors[colorScheme].background }]}
            onPress={(e) => e.stopPropagation()}
          >
            <Text style={[styles.modalTitle, { color: Colors[colorScheme].text }]}>
              Réactiver des enfants
            </Text>
            <Text style={[styles.modalSubtitle, { color: Colors[colorScheme].text }]}>
              Sélectionnez les enfants que vous souhaitez réafficher
            </Text>

            <ScrollView style={styles.childrenList} showsVerticalScrollIndicator={false}>
              {loadingHidden ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
                  <Text style={[styles.loadingText, { color: Colors[colorScheme].text }]}>
                    Chargement...
                  </Text>
                </View>
              ) : hiddenChildren.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={[styles.emptyText, { color: Colors[colorScheme].text }]}>
                    Aucun enfant masqué
                  </Text>
                </View>
              ) : (
                hiddenChildren.map((child) => (
                  <TouchableOpacity
                    key={child.id}
                    style={[
                      styles.childItem,
                      {
                        backgroundColor: toggledIds.has(child.id) 
                          ? `${Colors[colorScheme].tint}15` 
                          : Colors[colorScheme].background,
                        borderColor: toggledIds.has(child.id)
                          ? Colors[colorScheme].tint
                          : '#e0e0e0',
                      },
                    ]}
                    onPress={() => handleToggleChild(child.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.childInfo}>
                      <Text style={styles.childEmoji}>👶</Text>
                      <Text style={[styles.childName, { color: Colors[colorScheme].text }]}>
                        {child.name}
                      </Text>
                    </View>
                    <Ionicons
                      name={toggledIds.has(child.id) ? 'eye' : 'eye-off'}
                      size={24}
                      color={toggledIds.has(child.id) ? Colors[colorScheme].tint : '#999'}
                    />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowUnhideModal(false);
                  setToggledIds(new Set());
                }}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.confirmButton,
                  {
                    backgroundColor: Colors[colorScheme].tint,
                    opacity: toggledIds.size === 0 ? 0.5 : 1,
                  },
                ]}
                onPress={handleUnhideConfirm}
                activeOpacity={0.7}
                disabled={toggledIds.size === 0}
              >
                <Text style={styles.confirmButtonText}>
                  Réactiver {toggledIds.size > 0 ? `(${toggledIds.size})` : ''}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingVertical: 40,
  },
  screen: {
    flex: 1,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 40,
    width: '100%',
  },
  subtitle: {
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 8,
    opacity: 0.7,
  },
  logoutButton: {
    position: 'absolute',
    top: 0,
    right: 20,
    padding: 8,
  },
  listContainer: {
    alignItems: 'center',
    width: '100%',
    gap: 16,
    paddingHorizontal: 20,
  },
  category: {
    height: CARD_SIZE * 0.75,
    width: CARD_SIZE,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  touchable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  emoji: {
    fontSize: 56,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 64,
  },
  categoryTitle: {
    fontSize: 18,
    textAlign: 'center',
    fontWeight: '600',
    paddingHorizontal: 12,
    lineHeight: 24,
  },
  loaderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: width * 0.9,
    maxHeight: '80%',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
    opacity: 0.7,
  },
  childrenList: {
    maxHeight: 300,
    marginBottom: 20,
  },
  childItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 2,
  },
  childInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  childEmoji: {
    fontSize: 32,
    marginRight: 12,
  },
  childName: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    opacity: 0.7,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.6,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  confirmButton: {},
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});