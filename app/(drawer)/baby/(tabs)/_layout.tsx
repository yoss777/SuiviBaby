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
        freezeOnBlur: true,
        tabBarStyle: Platform.select({
          ios: {
            position: "absolute",
          },
          default: {},
        }),
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Accueil",
          tabBarIcon: ({ color }) => (
            <FontAwesome size={28} name="home" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="croissance"
        options={{
          title: "Croissance",
          tabBarIcon: ({ color }) => (
            <FontAwesome size={28} name="seedling" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="chrono"
        options={{
          title: "Journal",
          tabBarIcon: ({ color }) => (
            <FontAwesome size={28} name="clock" color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="plus"
        options={{
          title: "Plus",
          tabBarIcon: ({ color }) => (
            <FontAwesome size={28} name="ellipsis-h" color={color} />
          ),
        }}
      />

      {/* Sous-écrans de Plus - cachés de la tab bar mais persistants */}
      <Tabs.Screen
        name="meals"
        options={{
          href: null, // Caché de la tab bar
        }}
      />
      <Tabs.Screen
        name="pumping"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="immunizations"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="soins"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="diapers"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="sommeil"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="routines"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
