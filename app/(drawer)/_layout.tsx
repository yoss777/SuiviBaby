import { useNetInfo } from "@react-native-community/netinfo";
import { useRouter } from "expo-router";
import { Drawer } from "expo-router/drawer";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CustomDrawerContent } from "@/components/drawer/CustomDrawerContent";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";

// Importer la configuration AssemblyAI
import '@/config/assemblyai.config';

// Contexte pour gérer le headerRight dynamiquement
const HeaderRightContext = createContext<{
  setHeaderRight: (component: React.ReactElement | null, ownerId?: string) => void;
}>({ setHeaderRight: () => {} });

export const useHeaderRight = () => useContext(HeaderRightContext);

function BabyHeaderTitle() {
  const { activeChild } = useBaby();
  const colorScheme = useColorScheme() ?? "light";
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        width: "100%",
      }}
    >
      <Text
        style={{
          color: Colors[colorScheme].text,
          fontSize: 17,
          fontWeight: "600",
        }}
      >
        {activeChild?.name || "Suivi Enfant"}
      </Text>
      {/* <VoiceCommandButton size={18} color="#4A90E2" showTestToggle={true} /> */}
    </View>
  );
}

export default function DrawerLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const { user, firebaseUser, loading } = useAuth();
  const router = useRouter();
  const [headerRightState, setHeaderRightState] = useState<{
    component: React.ReactElement | null;
    ownerId?: string;
  }>({ component: null, ownerId: undefined });
  const netInfo = useNetInfo();
  const insets = useSafeAreaInsets();

  const patientId = firebaseUser?.uid || user?.uid;

  const setHeaderRight = useCallback((component: React.ReactElement | null, ownerId?: string) => {
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
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (loading) return;

    if (!user) {
      // User is not signed in, redirect to login
      router.replace("/(auth)/login");
    }
  }, [user, loading]);

  // Show loading screen while checking authentication
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: Colors[colorScheme].background,
        }}
      >
        <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
      </View>
    );
  }

  // Don't render drawer if not authenticated
  if (!user) {
    return null;
  }

  const isOffline =
    netInfo.isInternetReachable === false || netInfo.isConnected === false;

  return (
    <HeaderRightContext.Provider value={{ setHeaderRight }}>
      <ToastProvider>
        <View style={[styles.container, { backgroundColor: Colors[colorScheme].background }]}>
          {isOffline && (
            <View style={[styles.offlineBanner, { paddingTop: insets.top }]}>
              <Text style={styles.offlineText}>Hors ligne</Text>
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
              sceneContainerStyle: {
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
                drawerItemStyle: { display: "none" },
                headerRight: headerRightState.component ? () => headerRightState.component : undefined,
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
              name="join-child"
              options={{
                title: "Ajouter avec un code",
                drawerItemStyle: { display: "none" },
              }}
            />
            <Drawer.Screen
              name="share-child"
              options={{
                title: "Partage",
                drawerItemStyle: { display: "none" },
              }}
            />
          </Drawer>
        </View>
      </ToastProvider>
    </HeaderRightContext.Provider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  offlineBanner: {
    backgroundColor: "#fdecec",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 6,
  },
  offlineText: {
    color: "#b42318",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
});
