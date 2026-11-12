import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
} from "react-native";
import { pressedOpacity, usePressRipple } from "./pressFeedback";

// ============================================
// TYPES
// ============================================

export interface LoadMoreButtonProps {
  hasMore: boolean;
  loading: boolean;
  onPress: () => void;
  text?: string;
  endText?: string;
  accentColor?: string;
}

// ============================================
// COMPONENT
// ============================================

export function LoadMoreButton({
  hasMore,
  loading,
  onPress,
  text = "Charger plus de résultats",
  endText = "📅 Fin de l'historique",
  accentColor: accentColorProp,
}: LoadMoreButtonProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const accentColor = accentColorProp ?? Colors[colorScheme].tint;
  const ripple = usePressRipple();

  if (!hasMore) {
    return null;
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.loadMoreButton,
        { borderColor: accentColor, backgroundColor: nc.backgroundCard },
        pressedOpacity(pressed),
      ]}
      android_ripple={ripple}
      onPress={onPress}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={loading ? "Chargement en cours" : text}
      accessibilityState={{ busy: loading, disabled: loading }}
    >
      {loading ? (
        <ActivityIndicator color={accentColor} size="small" />
      ) : (
        <>
          <FontAwesome
            name="chevron-down"
            size={16}
            color={accentColor}
          />
          <Text style={[styles.loadMoreText, { color: accentColor }]}>
            {text}
          </Text>
        </>
      )}
    </Pressable>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  loadMoreButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 16,
    marginTop: 8,
    // marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden", // borne le ripple Android au bouton
    // backgroundColor applied dynamically via nc.backgroundCard
  },
  loadMoreText: {
    fontSize: 16,
    fontWeight: "600",
  },
  endContainer: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  endText: {
    fontSize: 14,
    fontWeight: "500",
  },
});
