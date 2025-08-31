import React, { ReactNode } from "react";
import { ImageBackground, StyleSheet, View } from "react-native";

const logoImage = require("../../assets/logo.png"); // adapte le chemin si besoin

type Props = {
  children?: ReactNode;
};

const BackgroundImage = ({ children }: Props) => {
  return (
    <ImageBackground
      source={logoImage}
      style={styles.backgroundImage}
      resizeMode="cover"
      blurRadius={80}
    >
      <View style={styles.gradientOverlay} />
      <View style={styles.content}>{children}</View>
    </ImageBackground>
  );
};

export default BackgroundImage ;

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  gradientOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  content: {
    flex: 1,
  },
});
