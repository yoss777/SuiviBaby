import { Stack } from "expo-router";
import { Image, Text, View } from "react-native";

function CustomHeader() {
  const avatarSamaye = require("../assets/logo.png"); // adapte le chemin si besoin

  return (
    <View
      style={{
        backgroundColor: "white",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 20,
        paddingTop: 50,
        paddingBottom: 20,
        // height:80,
        borderBottomColor: "#cccccc",
        borderBottomWidth: 1,
        // gap: 10,
      }}
    >
      <Image
        source={avatarSamaye}
        style={{ width: 32, height: 32, borderRadius: 16, marginRight: 10 }}
        // style={{ width: 64, height: 64, borderRadius: 32, marginRight: 10 }}
        resizeMode="cover"
      />
      <Text
        style={{ fontSize: 22, fontWeight: "bold" }}
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
