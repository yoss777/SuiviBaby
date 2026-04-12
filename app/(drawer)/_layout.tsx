import { useNetInfo } from "@react-native-community/netinfo";
import { Drawer } from "expo-router/drawer";
import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { CustomDrawerContent } from "@/components/drawer/CustomDrawerContent";
import { BabySwitcherModal } from "@/components/ui/BabySwitcherModal";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useColorScheme } from "@/hooks/use-color-scheme";

import { useBaby } from "@/contexts/BabyContext";
import { DeletionRequestNotifier } from "@/components/suivibaby/DeletionRequestNotifier";

// Contexte pour gérer le headerRight dynamiquement
const HeaderRightContext = createContext<{
  setHeaderRight: (
    component: React.ReactElement | null,
    ownerId?: string,
  ) => void;
}>({ setHeaderRight: () => {} });

// Contexte pour gérer le headerLeft dynamiquement
const HeaderLeftContext = createContext<{
  setHeaderLeft: (
    component: React.ReactElement | null,
    ownerId?: string,
  ) => void;
}>({ setHeaderLeft: () => {} });

export const useHeaderRight = () => useContext(HeaderRightContext);
export const useHeaderLeft = () => useContext(HeaderLeftContext);

function BabyHeaderTitle() {
  const { activeChild, children, setActiveChild } = useBaby();
  const colorScheme = useColorScheme() ?? "light";
  const [showSwitcher, setShowSwitcher] = useState(false);

  const hasMultiple = children.length > 1;

  const titleContent = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        style={{
          color: Colors[colorScheme].text,
          fontSize: 17,
          fontWeight: "600",
          maxWidth: 200,
        }}
      >
        {activeChild?.name || "Suivi Enfant"}
      </Text>
      {hasMultiple && (
        <FontAwesome
          name="chevron-down"
          size={10}
          color={Colors[colorScheme].tabIconDefault}
        />
      )}
    </View>
  );

  if (!hasMultiple) {
    return titleContent;
  }

  return (
    <>
      <Pressable
        onPress={() => setShowSwitcher(true)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Changer d'enfant"
      >
        {titleContent}
      </Pressable>
      <BabySwitcherModal
        visible={showSwitcher}
        childOptions={children}
        activeChild={activeChild}
        onSelect={(child) => {
          setActiveChild(child);
          setShowSwitcher(false);
        }}
        onClose={() => setShowSwitcher(false)}
      />
    </>
  );
}

export default function DrawerLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const { user, loading, status: authStatus } = useAuth();
  const { status: babyStatus } = useBaby();
  const [headerRightState, setHeaderRightState] = useState<{
    component: React.ReactElement | null;
    ownerId?: string;
  }>({ component: null, ownerId: undefined });
  const [headerLeftState, setHeaderLeftState] = useState<{
    component: React.ReactElement | null;
    ownerId?: string;
  }>({ component: null, ownerId: undefined });
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();

  const setHeaderRight = useCallback(
    (component: React.ReactElement | null, ownerId?: string) => {
      setHeaderRightState((prev) => {
        if (component === null) {
          if (!ownerId) {
            return { component: null, ownerId: undefined };
          }
          if (prev.ownerId && prev.ownerId !== ownerId) {
            return prev;
          }
          return { component: null, ownerId: undefined };
        }

        return { component, ownerId };
      });
    },
    [],
  );

  const setHeaderLeft = useCallback(
    (component: React.ReactElement | null, ownerId?: string) => {
      setHeaderLeftState((prev) => {
        if (component === null) {
          if (!ownerId) {
            return { component: null, ownerId: undefined };
          }
          if (prev.ownerId && prev.ownerId !== ownerId) {
            return prev;
          }
          return { component: null, ownerId: undefined };
        }

        return { component, ownerId };
      });
    },
    [],
  );

  // R10: Auth redirect is handled by boot.tsx — just guard against null user
  if (loading || !user) {
    return null;
  }

  const isOffline =
    netInfo.isInternetReachable === false || netInfo.isConnected === false;
  const showSyncBanner =
    authStatus === "degraded" || babyStatus === "degraded";

  return (
    <HeaderRightContext.Provider value={{ setHeaderRight }}>
      <HeaderLeftContext.Provider value={{ setHeaderLeft }}>
        <View
          style={[
            styles.container,
            { backgroundColor: Colors[colorScheme].background },
          ]}
        >
          {isOffline && (
            <View style={[styles.offlineBanner, { paddingTop: insets.top, backgroundColor: colorScheme === "dark" ? "rgba(153, 27, 27, 0.3)" : "#fdecec" }]}>
              <Text style={[styles.offlineText, { color: colorScheme === "dark" ? "#fca5a5" : "#b42318" }]} accessibilityRole="alert">Hors ligne</Text>
            </View>
          )}
          {showSyncBanner && (
            <View
              style={[
                styles.syncBanner,
                {
                  paddingTop: isOffline ? 4 : insets.top + 4,
                  backgroundColor:
                    colorScheme === "dark"
                      ? "rgba(56, 189, 248, 0.18)"
                      : "#e0f2fe",
                },
              ]}
            >
              <Text
                style={[
                  styles.syncText,
                  {
                    color: colorScheme === "dark" ? "#7dd3fc" : "#075985",
                  },
                ]}
                accessibilityLabel="Synchronisation en cours"
              >
                Synchronisation en cours
              </Text>
            </View>
          )}
          <Drawer
            initialRouteName="baby"
            backBehavior="initialRoute"
            drawerContent={(props) => <CustomDrawerContent {...props} />}
            screenOptions={{
              drawerActiveTintColor: Colors[colorScheme].tint,
              headerTintColor: Colors[colorScheme].text,
              headerStyle: {
                backgroundColor: Colors[colorScheme].background,
              },
              sceneStyle: {
                backgroundColor: Colors[colorScheme].background,
              },
            }}
          >
            <Drawer.Screen
              name="settings"
              options={{
                title: "Paramètres",
                drawerItemStyle: { display: "none" },
              }}
            />

            {/* Section: Suivi Bébé */}
            <Drawer.Screen
              name="baby"
              options={{
                headerTitle: () => <BabyHeaderTitle />,
                headerTitleAlign: "center",
                drawerItemStyle: { display: "none" },
                headerRight: headerRightState.component
                  ? () => headerRightState.component
                  : undefined,
                headerLeft: headerLeftState.component
                  ? () => headerLeftState.component
                  : undefined,
              }}
            />
            <Drawer.Screen
              name="add-baby"
              options={{
                title: "Ajouter un enfant",
                drawerItemStyle: { display: "none" },
              }}
            />
            <Drawer.Screen
              name="share-child"
              options={{
                title: "Partage",
                drawerItemStyle: { display: "none" },
                headerLeft: headerLeftState.component
                  ? () => headerLeftState.component
                  : undefined,
              }}
            />
          </Drawer>
          <DeletionRequestNotifier />
        </View>
      </HeaderLeftContext.Provider>
    </HeaderRightContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  offlineBanner: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 6,
  },
  offlineText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  syncBanner: {
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 8,
  },
  syncText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
