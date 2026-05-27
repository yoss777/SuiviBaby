import { TabBarBadge } from "@/components/ui/TabBarBadge";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useMomentsNotification } from "@/contexts/MomentsNotificationContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { Tabs } from "expo-router";
import { View } from "react-native";

const hiddenTabOptions = {
  href: null,
  tabBarItemStyle: { display: "none" as const },
};

export default function BabyTabLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const { firebaseUser } = useAuth();
  const { activeChild } = useBaby();
  const { hasNewMoments } = useMomentsNotification();
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  const canManageContent =
    permissions.role === "owner" || permissions.role === "admin";

  const showPlusTab = canManageContent;
  const showStatsTab = !canManageContent;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme].tint,
          tabBarInactiveTintColor: Colors[colorScheme].tabIconDefault,
          headerShown: false,
          tabBarStyle: {},
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
          name="moments"
          options={{
            title: "Moments",
            tabBarIcon: ({ focused, color }) => (
              <TabBarBadge visible={hasNewMoments} type="dot" color="#E8A85A">
                <FontAwesome
                  size={28}
                  name="heart"
                  color={focused ? "#e63946" : color}
                  solid={focused}
                />
              </TabBarBadge>
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
            href: showPlusTab ? undefined : null,
            tabBarItemStyle: showPlusTab ? undefined : { display: "none" },
            tabBarIcon: ({ color }) => (
              <FontAwesome size={28} name="ellipsis-h" color={color} />
            ),
          }}
        />

        {/* Sous-écrans de Plus - cachés de la tab bar mais persistants */}
        <Tabs.Screen
          name="meals"
          options={hiddenTabOptions}
        />
        <Tabs.Screen
          name="pumping"
          options={hiddenTabOptions}
        />
        <Tabs.Screen
          name="immunizations"
          options={hiddenTabOptions}
        />
        <Tabs.Screen
          name="soins"
          options={hiddenTabOptions}
        />
        <Tabs.Screen
          name="diapers"
          options={hiddenTabOptions}
        />
        <Tabs.Screen
          name="stats"
          options={{
            title: "Stats",
            href: showStatsTab ? undefined : null,
            tabBarItemStyle: showStatsTab ? undefined : { display: "none" },
            tabBarIcon: ({ color }) => (
              <FontAwesome size={28} name="chart-bar" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="routines"
          options={hiddenTabOptions}
        />
        <Tabs.Screen
          name="activities"
          options={hiddenTabOptions}
        />
        <Tabs.Screen
          name="milestones"
          options={hiddenTabOptions}
        />
        <Tabs.Screen
          name="growth"
          options={hiddenTabOptions}
        />
      </Tabs>
    </View>
  );
}
