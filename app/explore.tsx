import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { ActivityIndicator, Alert, Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  useSharedValue,
  withDelay,
  withTiming
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useBaby, type Child } from '@/contexts/BabyContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width } = Dimensions.get('window');
const CARD_SIZE = Math.min(width * 0.85, 320); // Largeur max pour grands écrans

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
  const { signOut } = useAuth();
  const { children, setActiveChild, loading } = useBaby();

  // Dynamically create categories based on children count
  const categories: MedicalCategory[] = useMemo(() => {
    const childTiles = children.map((child) => ({
      id: child.id,
      emoji: '👶',
      title: child.name || 'Suivi enfant',
      route: 'baby',
      enabled: !loading,
      child,
    }));

    // Montrer "Ajouter un enfant" uniquement si aucun enfant n'existe déjà
    if (children.length === 0) {
      const addTile: MedicalCategory = {
        id: 'add-baby',
        emoji: '➕',
        title: 'Ajouter un enfant',
        route: 'add-baby',
        enabled: true,
      };
      return [...childTiles, addTile];
    }

    return childTiles;
  }, [children, loading]);

  // Animation values - fixed number to comply with Rules of Hooks
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
    // Reset all animations first
    animationValues.forEach((anim) => {
      anim.opacity.value = 0;
      anim.translateY.value = 20;
    });

    // Staggered animations only for visible items
    categories.forEach((_, index) => {
      if (index < animationValues.length) {
        animationValues[index].opacity.value = withDelay(index * 100, withTiming(1, { duration: 600 }));
        animationValues[index].translateY.value = withDelay(index * 100, withTiming(0, { duration: 600 }));
      }
    });
  }, [categories]);

  const handleCategoryPress = (category: MedicalCategory) => {
    if (!category.enabled || !category.route) return;

    if (category.route === 'baby' && category.child) {
      setActiveChild(category.child);
      router.push('/(drawer)/baby' as any);
      return;
    }

    router.push(`/(drawer)/${category.route}` as any);
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
          {/* Header */}
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

            {/* Logout button */}
            <TouchableOpacity
              onPress={handleSignOut}
              style={styles.logoutButton}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={24} color={Colors[colorScheme].tint} />
            </TouchableOpacity>
          </ThemedView>

          {/* Column of categories */}
          <ThemedView style={styles.listContainer}>
            {categories.map((category, index) => renderCategory(category, index))}
          </ThemedView>
        </ThemedView>
      </ScrollView>
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
});