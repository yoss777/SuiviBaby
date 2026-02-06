// components/BackgroundImage.js
import { memo } from "react";
import { Image, StyleSheet, View } from "react-native";

const logoImage = require("@/assets/images/icon.png");

const BackgroundImage = memo(() => (
  <>
    <Image
      source={logoImage}
      style={styles.backgroundImage}
      resizeMode="cover"
      blurRadius={80}
    />
    <View style={styles.gradientOverlay} />
  </>
));

BackgroundImage.displayName = "BackgroundImage";

const styles = StyleSheet.create({
  backgroundImage: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  gradientOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 50, 70, 0.7)", // Overlay bleu-vert plus sophistiqué
  },
});

export default BackgroundImage;
