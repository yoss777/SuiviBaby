import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Alert, Dimensions, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Fonts } from '@/constants/theme';
import { useAuth } from '@/contexts/AuthContext';
import { useBaby, type Child } from '@/contexts/BabyContext';
import { useColorScheme } from '@/hooks/use-color-scheme';

const { width, height } = Dimensions.get('window');
const ITEM_HEIGHT = height * 0.15;
const ITEM_WIDTH = width * 0.4;

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
  const autoNavigated = useRef(false);

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

  // Split categories into rows of two tiles
  const rows = useMemo(() => {
    const chunks: MedicalCategory[][] = [];
    for (let i = 0; i < categories.length; i += 2) {
      chunks.push(categories.slice(i, i + 2));
    }
    return chunks;
  }, [categories]);

  // Animation values for each row
  const row1Opacity = useSharedValue(0);
  const row1TranslateY = useSharedValue(20);
  const row2Opacity = useSharedValue(0);
  const row2TranslateY = useSharedValue(20);
  const row3Opacity = useSharedValue(0);
  const row3TranslateY = useSharedValue(20);
  const row4Opacity = useSharedValue(0);
  const row4TranslateY = useSharedValue(20);

  useEffect(() => {
    // Staggered animations
    row1Opacity.value = withDelay(0, withTiming(1, { duration: 800 }));
    row1TranslateY.value = withDelay(0, withTiming(0, { duration: 800 }));

    row2Opacity.value = withDelay(200, withTiming(1, { duration: 800 }));
    row2TranslateY.value = withDelay(200, withTiming(0, { duration: 800 }));

    row3Opacity.value = withDelay(400, withTiming(1, { duration: 800 }));
    row3TranslateY.value = withDelay(400, withTiming(0, { duration: 800 }));

    row4Opacity.value = withDelay(600, withTiming(1, { duration: 800 }));
    row4TranslateY.value = withDelay(600, withTiming(0, { duration: 800 }));
  }, [row1Opacity, row1TranslateY, row2Opacity, row2TranslateY, row3Opacity, row3TranslateY, row4Opacity, row4TranslateY]);

  // Si un seul enfant existe, ouvrir directement son suivi
  useEffect(() => {
    if (!loading && children.length === 1 && !autoNavigated.current) {
      setActiveChild(children[0]);
      autoNavigated.current = true;
      router.replace('/(drawer)/baby' as any);
    }
  }, [children, loading, setActiveChild]);

  const row1Style = useAnimatedStyle(() => ({
    opacity: row1Opacity.value,
    transform: [{ translateY: row1TranslateY.value }],
  }));

  const row2Style = useAnimatedStyle(() => ({
    opacity: row2Opacity.value,
    transform: [{ translateY: row2TranslateY.value }],
  }));

  const row3Style = useAnimatedStyle(() => ({
    opacity: row3Opacity.value,
    transform: [{ translateY: row3TranslateY.value }],
  }));

  const row4Style = useAnimatedStyle(() => ({
    opacity: row4Opacity.value,
    transform: [{ translateY: row4TranslateY.value }],
  }));

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

  const renderCategory = (category: MedicalCategory) => {
    // Show loading indicator for child tracking tile while data is loading
    const isChildTracking = category.route === 'baby' || category.route === 'add-baby';
    const showLoader = isChildTracking && loading;

    return (
      <ThemedView
        key={category.id}
        style={[
          styles.category,
          {
            borderColor: Colors[colorScheme].tint,
            shadowColor: Colors[colorScheme].text,
            // Don't reduce opacity when showing loader
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
              <ThemedText style={styles.categoryTitle} numberOfLines={2}>
                {category.title}
              </ThemedText>
            </>
          )}
        </TouchableOpacity>
      </ThemedView>
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

          {/* Grid of categories */}
          <ThemedView style={styles.gridContainer}>
            {rows.map((rowCategories, index) => {
              const rowStyles = [row1Style, row2Style, row3Style, row4Style];
              const animationStyle = rowStyles[index] ?? rowStyles[rowStyles.length - 1];
              return (
                <Animated.View key={`row-${index}`} style={[styles.row, animationStyle]}>
                  {rowCategories.map(renderCategory)}
                </Animated.View>
              );
            })}
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
    justifyContent: 'center',
    minHeight: height,
  },
  screen: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
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
  gridContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 10,
    gap: 20,
  },
  category: {
    height: ITEM_HEIGHT,
    width: ITEM_WIDTH,
    borderRadius: 24,
    borderWidth: 2,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    shadowOpacity: 0.1,
    elevation: 5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  touchable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 15,
  },
  emoji: {
    fontSize: 32,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 38,
  },
  categoryTitle: {
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
    paddingHorizontal: 5,
  },
  loaderContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
