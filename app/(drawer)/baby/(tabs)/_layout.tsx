import { VOICE_DOCK_INSET, VoiceDock } from "@/components/suivibaby/VoiceDock";
import { TabBarBadge } from "@/components/ui/TabBarBadge";
import { categoryColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useMomentsNotification } from "@/contexts/MomentsNotificationContext";
import { useToastBottomInset } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useCanManageContent } from "@/hooks/useCanManageContent";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import { BottomTabBar, type BottomTabBarProps } from "expo-router/tabs";
import { Tabs } from "expo-router";
import { useEffect, useState } from "react";
import { Keyboard, Text, View } from "react-native";

/** Plafond d'agrandissement des libellés d'onglets (Dynamic Type) */
const TAB_LABEL_MAX_FONT_SCALE = 1.3;
/** Taille des icônes d'onglets (HIG / Material : 24-25 pt). */
const TAB_ICON_SIZE = 24;

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

// Onglet sans bouton mais toujours navigable (sous-écrans de Plus). Ne PAS
// utiliser `href: null` : depuis expo-router 58 il marque l'écran « hidden »
// et toute navigation vers lui est redirigée vers l'onglet initial (Accueil).
const hiddenTabOptions = {
  tabBarButton: () => null,
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
  // Les toasts du bas se posent au-dessus de la barre d'onglets et du dock.
  useToastBottomInset(
    tabBarHeight + (canManageContent && showVoiceDock ? VOICE_DOCK_INSET : 0),
  );

  const showPlusTab = canManageContent;
  const showStatsTab = !canManageContent;

  // Onglets visibles, dans l'ordre : Accueil, Journal, Moments, Croissance,
  // puis Plus (gestionnaires) ou Stats (lecture seule). Le libellé annonce la
  // position (« Accueil, onglet 1 sur 5 ») ; iOS ne la donne pas toujours.
  const visibleTabs = [
    "home",
    "chrono",
    "moments",
    "croissance",
    showPlusTab ? "plus" : "stats",
  ];
  const tabA11yLabel = (name: string, label: string) =>
    `${label}, onglet ${visibleTabs.indexOf(name) + 1} sur ${visibleTabs.length}`;

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
            tabBarAccessibilityLabel: tabA11yLabel("home", "Accueil"),
            tabBarIcon: ({ color }) => (
              <FontAwesome size={TAB_ICON_SIZE} name="house" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="chrono"
          options={{
            title: "Journal",
            tabBarAccessibilityLabel: tabA11yLabel("chrono", "Journal"),
            tabBarIcon: ({ color }) => (
              <FontAwesome size={TAB_ICON_SIZE} name="clock" color={color} />
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
                ? `${tabA11yLabel("moments", "Moments")}, ${newMomentsCount} ${newMomentsCount > 1 ? "nouveautés" : "nouveauté"}`
                : tabA11yLabel("moments", "Moments"),
            tabBarIcon: ({ focused, color }) => (
              <TabBarBadge
                visible={hasNewMoments}
                type="dot"
                color={categoryColors.moments.primary}
              >
                {/* Même teinte active que les autres onglets ; le cœur plein
                    suffit à marquer l'état sélectionné. */}
                <FontAwesome
                  size={TAB_ICON_SIZE}
                  name="heart"
                  color={color}
                  solid={focused}
                />
              </TabBarBadge>
            ),
          }}
        />
        <Tabs.Screen
          name="croissance"
          options={{
            title: "Croissance",
            tabBarAccessibilityLabel: tabA11yLabel("croissance", "Croissance"),
            tabBarIcon: ({ color }) => (
              <FontAwesome size={TAB_ICON_SIZE} name="seedling" color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="plus"
          options={{
            title: "Plus",
            tabBarAccessibilityLabel: tabA11yLabel("plus", "Plus"),
            ...(showPlusTab ? {} : hiddenTabOptions),
            tabBarIcon: ({ color }) => (
              <FontAwesome size={TAB_ICON_SIZE} name="ellipsis" color={color} />
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
            tabBarAccessibilityLabel: tabA11yLabel("stats", "Stats"),
            ...(showStatsTab ? {} : hiddenTabOptions),
            tabBarIcon: ({ color }) => (
              <FontAwesome size={TAB_ICON_SIZE} name="chart-column" color={color} />
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
        {/* APERÇU TEMPORAIRE : écran Croissance fusionné (à supprimer après décision) */}
        <Tabs.Screen
          name="croissance-fusion"
          options={hiddenTabOptions}
        />
        {/* Galerie et gestion des accès : dans les onglets pour garder la barre
            du bas (et sa marge au-dessus des boutons Android) comme les autres
            sous-écrans de Plus. */}
        <Tabs.Screen
          name="gallery"
          options={hiddenTabOptions}
        />
        <Tabs.Screen
          name="manage-access"
          options={hiddenTabOptions}
        />
      </Tabs>
      {canManageContent && (
        <VoiceDock tabBarHeight={tabBarHeight} visible={showVoiceDock} />
      )}
    </View>
  );
}
