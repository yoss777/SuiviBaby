import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export function OfflineBanner() {
  const [isConnected, setIsConnected] = useState(true);
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOfflineRef = useRef(false);
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-60)).current;

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = !!state.isConnected && !!state.isInternetReachable;

      if (!connected) {
        wasOfflineRef.current = true;
        setIsConnected(false);
        setShowReconnected(false);
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      } else if (wasOfflineRef.current) {
        wasOfflineRef.current = false;
        setIsConnected(true);
        setShowReconnected(true);
        setTimeout(() => {
          Animated.timing(slideAnim, {
            toValue: -60,
            duration: 300,
            useNativeDriver: true,
          }).start(() => setShowReconnected(false));
        }, 2500);
      }
    });

    return () => unsubscribe();
  }, [slideAnim]);

  if (isConnected && !showReconnected) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          paddingTop: insets.top + 4,
          transform: [{ translateY: slideAnim }],
          backgroundColor: isConnected ? "#16a34a" : "#dc2626",
        },
      ]}
    >
      <View style={styles.content}>
        <Ionicons
          name={isConnected ? "wifi" : "cloud-offline-outline"}
          size={16}
          color="#fff"
        />
        <Text style={styles.text}>
          {isConnected ? "Connexion rétablie" : "Pas de connexion internet"}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    paddingBottom: 8,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
