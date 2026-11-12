import { space } from "@/constants/tokens";
import React from 'react';
import { getNeutralColors } from '@/constants/dashboardColors';
import { getReadableTextColor } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { StyleSheet, Text, View } from 'react-native';

interface TabBarBadgeProps {
  count?: number;
  visible: boolean;
  /** Type de badge: 'dot' pour un simple point, 'count' pour afficher le nombre */
  type?: 'dot' | 'count';
  /** Couleur du badge */
  color?: string;
  children: React.ReactNode;
}

export function TabBarBadge({
  count = 0,
  visible,
  type = 'dot',
  color,
  children,
}: TabBarBadgeProps) {
  const colorScheme = useColorScheme() ?? 'light';
  const nc = getNeutralColors(colorScheme);
  const badgeColor = color ?? nc.error;
  return (
    <View style={styles.container}>
      {children}
      {visible && (
        <View
          // Décoratif : le nombre est annoncé par le libellé d'accessibilité de l'onglet
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.badge,
            type === 'dot' ? styles.dot : styles.countBadge,
            // Liseré de la couleur de la barre d'onglets (fond de l'écran)
            { backgroundColor: badgeColor, borderColor: nc.background },
          ]}
        >
          {type === 'count' && count > 0 && (
            <Text style={[styles.countText, { color: getReadableTextColor(badgeColor) }]}>
              {count > 99 ? '99+' : count}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    borderWidth: 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  countBadge: {
    minWidth: 20,
    minHeight: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xxs,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
