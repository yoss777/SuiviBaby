// app/(tabs)/_layout.tsx
import FontAwesome from '@expo/vector-icons/FontAwesome5';
import { router, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StatusBar, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from '../../contexts/AuthContext';
import { ecouterProfil } from '../../services/usersService';

function CustomHeader() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const [babyName, setBabyName] = useState<string | null>(null);

  // Écouter en temps réel le profil utilisateur
  useEffect(() => {
    if (!user) return;

    const unsubscribe = ecouterProfil((profil) => {
      if (profil) {
        setBabyName(profil.babyName);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  const handleSignOut = () => {
    Alert.alert(
      'Déconnexion',
      'Voulez-vous vraiment vous déconnecter ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Déconnexion',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut();
              router.replace('/login');
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de se déconnecter');
            }
          },
        },
      ]
    );
  };

  return (
    <View
      style={{
        paddingTop: insets.top + 20,
        backgroundColor: "white",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingBottom: 20,
        borderBottomColor: "#cccccc",
        borderBottomWidth: 1,
        gap: 10,
      }}
    >
      <StatusBar barStyle="dark-content" backgroundColor="white" />
      <View />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <FontAwesome name="baby" size={24} color="#000000" />
        <Text
          style={{ fontSize: 22, fontWeight: "bold", color: "#000000" }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          Suivi {babyName || "Bébé"}
        </Text>
      </View>

      <TouchableOpacity onPress={handleSignOut}>
        <FontAwesome name="sign-out-alt" size={20} color="#dc3545" />
      </TouchableOpacity>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs 
      screenOptions={{ 
        header: () => <CustomHeader />,
      }}
    >
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