import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { Stack } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

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
      {/* <LinearGradient
        colors={["#f8f9fa", "#7db4ebff", "#132f4cff"]}
        style={styles.backgroundGradient}
      /> */}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  backgroundGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
});
