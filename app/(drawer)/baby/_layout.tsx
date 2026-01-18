import { Colors } from '@/constants/theme';
import { useSheet } from "@/contexts/SheetContext";
import { useColorScheme } from '@/hooks/use-color-scheme';
import FontAwesome from '@expo/vector-icons/FontAwesome5';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

export default function BabyTabLayout() {
  const colorScheme = useColorScheme() ?? 'light';
  const { isOpen } = useSheet();

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
        name="chrono"
        options={{
          title: 'Chrono',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="clock" color={color} />,
        }}
      />
      <Tabs.Screen
        name="meals"
        options={{
          title: 'Repas',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="baby" color={color} />,
        }}
      />
      <Tabs.Screen
        name="pumping"
        options={{
          title: 'Tire-lait',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="pump-medical" color={color} />,
        }}
      />
      <Tabs.Screen
        name="immunizations"
        options={{
          title: 'Immunos',
          tabBarIcon: ({ color }) => <FontAwesome size={28} name="prescription-bottle" color={color} />,
        }}
      />
      <Tabs.Screen
          name="diapers"
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
