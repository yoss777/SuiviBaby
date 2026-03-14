import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity
} from "react-native";

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
  accentColor = "#4A90E2",
}: LoadMoreButtonProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);

  if (!hasMore) {
    return null;
  }

  return (
    <TouchableOpacity
      style={[styles.loadMoreButton, { borderColor: accentColor, backgroundColor: nc.backgroundCard }]}
      onPress={onPress}
      disabled={loading}
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
    </TouchableOpacity>
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
    color: "#999",
    fontWeight: "500",
  },
});
