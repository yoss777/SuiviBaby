import { VoiceDock } from "@/components/suivibaby/VoiceDock";
import { TabBarBadge } from "@/components/ui/TabBarBadge";
import { Colors } from "@/constants/theme";
import { useMomentsNotification } from "@/contexts/MomentsNotificationContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useCanManageContent } from "@/hooks/useCanManageContent";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { BottomTabBar, type BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { Keyboard, Text, View } from "react-native";

/** Plafond d'agrandissement des libellés d'onglets (Dynamic Type) */
const TAB_LABEL_MAX_FONT_SCALE = 1.3;

/** Tabs where parents consult the tracking and may want to add an event. */
const VOICE_DOCK_ROUTES = new Set(["home", "chrono", "croissance", "moments"]);

function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setVisible(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}

/**
 * Default tab bar that reports its height (the dock sits on it) and the
 * focused route (useSegments() drops the leaf name on the initial tab).
 */
function MeasuredTabBar({
  onHeight,
  onRoute,
  ...props
}: BottomTabBarProps & {
  onHeight: (height: number) => void;
  onRoute: (route: string) => void;
}) {
  const route = props.state.routes[props.state.index]?.name ?? "";
  useEffect(() => {
    onRoute(route);
  }, [route, onRoute]);
  return (
    <View onLayout={(e) => onHeight(e.nativeEvent.layout.height)}>
      <BottomTabBar {...props} />
    </View>
  );
}

const hiddenTabOptions = {
  href: null,
  tabBarItemStyle: { display: "none" as const },
};

export default function BabyTabLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const { hasNewMoments, newMomentsCount } = useMomentsNotification();
  const canManageContent = useCanManageContent();
  const [currentRoute, setCurrentRoute] = useState("");
  const keyboardVisible = useKeyboardVisible();
  const [tabBarHeight, setTabBarHeight] = useState(0);
  const showVoiceDock =
    VOICE_DOCK_ROUTES.has(currentRoute) && !keyboardVisible && tabBarHeight > 0;

  const showPlusTab = canManageContent;
  const showStatsTab = !canManageContent;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => (
          <MeasuredTabBar {...props} onHeight={setTabBarHeight} onRoute={setCurrentRoute} />
        )}
        screenOptions={{
          tabBarActiveTintColor: Colors[colorScheme].tint,
          tabBarInactiveTintColor: Colors[colorScheme].tabIconDefault,
          headerShown: false,
          tabBarStyle: {},
          // Dynamic Type : la barre a une hauteur contrainte, on plafonne le texte
          tabBarLabel: ({ color, children }) => (
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={TAB_LABEL_MAX_FONT_SCALE}
              style={{ color, fontSize: 12, textAlign: "center" }}
            >
              {children}
            </Text>
          ),
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
            // Le point de notification est visuel : on annonce le nombre dans le libellé
            tabBarAccessibilityLabel:
              newMomentsCount > 0
                ? `Moments, ${newMomentsCount} ${newMomentsCount > 1 ? "nouveautés" : "nouveauté"}`
                : "Moments",
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
      {canManageContent && (
        <VoiceDock tabBarHeight={tabBarHeight} visible={showVoiceDock} />
      )}
    </View>
  );
}
