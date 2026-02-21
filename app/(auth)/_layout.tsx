// app/(auth)/_layout.tsx
import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack 
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#f8f9fa' },
      }}
    >
      <Stack.Screen name="login" />
      <Stack.Screen
        name="reset-password"
        options={{
          headerShown: true,
          title: 'Nouveau mot de passe',
          headerBackTitle: 'Retour',
        }}
      />
      <Stack.Screen
        name="privacy"
        options={{
          headerShown: true,
          title: 'Confidentialité',
          headerBackTitle: 'Retour',
        }}
      />
      <Stack.Screen
        name="terms"
        options={{
          headerShown: true,
          title: "Conditions d'utilisation",
          headerBackTitle: 'Retour',
        }}
      />
    </Stack>
  );
}
