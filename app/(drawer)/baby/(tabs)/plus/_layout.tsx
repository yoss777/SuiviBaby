import { Stack } from "expo-router";

export default function PlusStackLayout() {
  const detailOptions = {
    animation: "slide_from_right" as const,
    animationDuration: 200,
  };

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="meals" options={detailOptions} />
      <Stack.Screen name="pumping" options={detailOptions} />
      <Stack.Screen name="immunizations" options={detailOptions} />
      <Stack.Screen name="diapers" options={detailOptions} />
      <Stack.Screen name="stats" options={detailOptions} />
    </Stack>
  );
}
