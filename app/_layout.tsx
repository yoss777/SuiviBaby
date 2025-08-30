import { Stack } from "expo-router";
import { Image } from "react-native";

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerTitle: "SAMAYE", // 👈 titre global
        headerTitleAlign: "center",
        headerLeft: () => (
          <Image
            source={{ uri: "https://i.pravatar.cc/40" }} // 👈 ton avatar (URL ou require)
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              marginLeft: 10,
            }}
          />
        ),
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: true }} />
    </Stack>
  );
}
