import { Stack } from "expo-router";

export default function BabyStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}

export { useHeaderLeft, useHeaderRight } from "../_layout";
