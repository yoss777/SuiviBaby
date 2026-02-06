import { LinearGradient } from "expo-linear-gradient";
import { memo } from "react";
import { StyleSheet } from "react-native";

const AppBackground = memo(() => (
  <LinearGradient
    pointerEvents="none"
    colors={["#C5D89A", "#8BC6A0", "#7DBBA0"]}
    start={{ x: 0, y: 0 }}
    end={{ x: 1, y: 1 }}
    style={styles.container}
  />
));

AppBackground.displayName = "AppBackground";

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default AppBackground;
