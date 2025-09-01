import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { Stack } from "expo-router";
import { Text, View } from "react-native";

function CustomHeader() {

  return (
    <View
      style={{
        backgroundColor: "white",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
        paddingVertical: 20,
        borderBottomColor: "#cccccc",
        borderBottomWidth: 1,
        gap: 10,
      }}
    >
      <FontAwesome name="baby" size={24} color="#000000" />
      <Text
        style={{ fontSize: 22, fontWeight: "bold", color: "#000000" }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        Suivi Samaye Utéti B.
      </Text>
    </View>
  );
}

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        header: () => <CustomHeader />,
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: true }} />
    </Stack>
  );
}
