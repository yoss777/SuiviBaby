import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import FontAwesome from '@expo/vector-icons/FontAwesome5';

export default function BabyTabLayout() {
  const colorScheme = useColorScheme() ?? 'light';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarInactiveTintColor: Colors[colorScheme].tabIconDefault,
        headerShown: false,
        tabBarStyle: Platform.select({
          ios: {
            position: 'absolute',
          },
          default: {},
        }),
      }}>
      <Tabs.Screen
        name="home"
        options={{
          title: 'Accueil',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="home" color={color} />,
        }}
      />
      <Tabs.Screen
        name="tetees"
        options={{
          title: 'Tétées',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="baby" color={color} />,
        }}
      />
      <Tabs.Screen
        name="pompages"
        options={{
          title: 'Tire-lait',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="pump-medical" color={color} />,
        }}
      />
      <Tabs.Screen
        name="immunos"
        options={{
          title: 'Immunos',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="prescription-bottle" color={color} />,
        }}
      />
        <Tabs.Screen
          name="excretions"
          options={{
            title: 'Pipi popo',
            tabBarIcon: ({ color }) => <FontAwesome size={28} name="toilet" color={color} />,
          }}
        />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="chart-bar" color={color} />,
        }}
      />
    </Tabs>
  );
}
