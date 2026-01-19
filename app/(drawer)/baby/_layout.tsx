import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { Tabs } from "expo-router";
import { Platform } from "react-native";

export default function BabyTabLayout() {
  const colorScheme = useColorScheme() ?? "light";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarInactiveTintColor: Colors[colorScheme].tabIconDefault,
        headerShown: false,
        tabBarStyle: Platform.select({
          ios: {
            position: "absolute",
          },
          default: {},
        }),
      }}
    >
      {/* Tab principal : Journal (hub avec widgets + timeline récente + FAB) */}
      <Tabs.Screen
        name="home"
        options={{
          title: "Accueil",
          tabBarIcon: ({ color }) => (
            <FontAwesome size={28} name="home" color={color} />
          ),
        }}
      />

      {/* Tab Chrono : timeline complète */}
      <Tabs.Screen
        name="chrono"
        options={{
          title: "Chrono",
          tabBarIcon: ({ color }) => (
            <FontAwesome size={28} name="clock" color={color} />
          ),
        }}
      />

      {/* Tab Stats */}
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ color }) => (
            <FontAwesome size={28} name="chart-bar" color={color} />
          ),
        }}
      />

      {/* Écrans masqués (accessibles via navigation depuis Home) */}
      <Tabs.Screen
        name="journal"
        options={{
          href: null, // Masqué de la tab bar
          // title: "Journal",
        }}
      />
      <Tabs.Screen
        name="meals"
        options={{
          href: null, // Masqué de la tab bar
        }}
      />
      <Tabs.Screen
        name="pumping"
        options={{
          href: null, // Masqué de la tab bar
        }}
      />
      <Tabs.Screen
        name="immunizations"
        options={{
          href: null, // Masqué de la tab bar
        }}
      />
      <Tabs.Screen
        name="diapers"
        options={{
          href: null, // Masqué de la tab bar
        }}
      />
    </Tabs>
  );
}
