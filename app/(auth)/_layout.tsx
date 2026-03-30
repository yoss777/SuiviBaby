// app/(auth)/_layout.tsx
import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Stack } from "expo-router";

export default function AuthLayout() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: nc.background },
        headerStyle: { backgroundColor: nc.background },
        headerTintColor: nc.textStrong,
      }}
    >
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="login" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      <Stack.Screen name="verify-email" />
      <Stack.Screen
        name="privacy"
        options={{
          headerShown: true,
          title: "Confidentialité",
          headerBackTitle: "Retour",
        }}
      />
      <Stack.Screen
        name="terms"
        options={{
          headerShown: true,
          title: "Conditions d'utilisation",
          headerBackTitle: "Retour",
        }}
      />
    </Stack>
  );
}
