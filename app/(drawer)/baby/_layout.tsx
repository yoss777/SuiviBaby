import { Stack } from "expo-router";

export default function BabyStackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="gallery" options={{ headerShown: false, presentation: "card" }} />
    </Stack>
  );
}

export { useHeaderLeft, useHeaderRight } from "../_layout";
