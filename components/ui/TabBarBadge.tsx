import React from 'react';
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
  color = '#e63946',
  children,
}: TabBarBadgeProps) {
  return (
    <View style={styles.container}>
      {children}
      {visible && (
        <View
          style={[
            styles.badge,
            type === 'dot' ? styles.dot : styles.countBadge,
            { backgroundColor: color },
          ]}
        >
          {type === 'count' && count > 0 && (
            <Text style={styles.countText}>
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
    borderColor: '#fff',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  countBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  countText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
});
