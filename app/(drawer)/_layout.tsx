import { useRouter } from "expo-router";
import { Drawer } from "expo-router/drawer";
import React, { useEffect } from "react";
import { ActivityIndicator, Text, View } from "react-native";

import { CustomDrawerContent } from "@/components/drawer/CustomDrawerContent";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";

function BabyHeaderTitle() {
  const { activeChild } = useBaby();
  const colorScheme = useColorScheme() ?? "light";
  return (
    <Text style={{ color: Colors[colorScheme].text, fontSize: 17, fontWeight: '600' }}>
      {activeChild?.name || 'Suivi Enfant'}
    </Text>
  );
}

export default function DrawerLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const { user, firebaseUser, loading } = useAuth();
  const router = useRouter();

  const patientId = firebaseUser?.uid || user?.uid;

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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors[colorScheme].background }}>
        <ActivityIndicator size="large" color={Colors[colorScheme].tint} />
      </View>
    );
  }

  // Don't render drawer if not authenticated
  if (!user) {
    return null;
  }

  return (
      <Drawer
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
          drawerItemStyle: { display: 'none' },
        }}
      />

      {/* Section: Suivi Bébé */}
      <Drawer.Screen
        name="baby"
        options={{
          headerTitle: () => <BabyHeaderTitle />,
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="add-baby"
        options={{
          title: "Ajouter un enfant",
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="join-child"
        options={{
          title: "Ajouter avec un code",
          drawerItemStyle: { display: 'none' },
        }}
      />
      <Drawer.Screen
        name="share-child"
        options={{
          title: "Partage",
          drawerItemStyle: { display: 'none' },
        }}
      />
      </Drawer>
  );
}
