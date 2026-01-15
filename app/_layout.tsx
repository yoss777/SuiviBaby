import { Colors } from "@/constants/theme";
import { AuthProvider } from "@/contexts/AuthContext";
import { BabyProvider } from "@/contexts/BabyContext";
import { ThemeProvider as AppThemeProvider } from "@/contexts/ThemeContext";
import { SheetProvider } from "@/contexts/SheetContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { MigrationProvider } from "@/migration/MigrationProvider";
import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

export const unstable_settings = {
  anchor: "(drawer)",
};

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <AppThemeProvider>
            <BabyProvider>
              <MigrationProvider>
                <SheetProvider>
                  <AppNavigation />
                </SheetProvider>
              </MigrationProvider>
            </BabyProvider>
          </AppThemeProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppNavigation() {
  const colorScheme = useColorScheme() ?? "light";
  const baseTheme = colorScheme === "dark" ? DarkTheme : DefaultTheme;
  const navigationTheme = {
    ...baseTheme,
    colors: {
      ...baseTheme.colors,
      background: Colors[colorScheme].background,
      card: Colors[colorScheme].background,
      text: Colors[colorScheme].text,
      primary: Colors[colorScheme].tint,
      border: Colors[colorScheme].tabIconDefault + "30",
    },
  };

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <Stack initialRouteName="boot">
        <Stack.Screen
          name="(auth)"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="(drawer)"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="boot"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="explore"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="index"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="modal"
          options={{ presentation: "modal", title: "Modal" }}
        />
      </Stack>
      <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
    </NavigationThemeProvider>
  );
}
