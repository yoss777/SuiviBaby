import FontAwesome from "@expo/vector-icons/FontAwesome6";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export interface MealCardProps {
  meal: {
    id: string;
    type?: "tetee" | "biberon";
    quantite?: number | null;
    date: { seconds: number };
  };
  onEdit: () => void;
}

export function MealCard({ meal, onEdit }: MealCardProps) {
  const isTetee = meal.type === "tetee";
  const accentColor = isTetee ? "#9C27B0" : "#4A90E2";

  const getIcon = () => {
    return isTetee ? "person-breastfeeding" : "jar-wheat";
  };

  const getTypeLabel = () => {
    return isTetee ? "Sein" : "Biberon";
  };

  const getQuantityDisplay = () => {
    if (meal.quantite !== null && meal.quantite !== undefined) {
      return `${meal.quantite} ml`;
    }
    return "N/A";
  };

  const formatTime = () => {
    const date = new Date(meal.date.seconds * 1000);
    return date.toLocaleTimeString("fr-FR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <Pressable
      onPress={onEdit}
      style={({ pressed }) => [
        styles.card,
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={styles.header}>
        {/* Icône circulaire */}
        <View style={[styles.iconCircle, { backgroundColor: accentColor }]}>
          <FontAwesome
            name={getIcon()}
            size={20}
            color="#fff"
          />
        </View>

        {/* Informations principales */}
        <View style={styles.info}>
          <View style={styles.row}>
            <Text style={styles.typeLabel}>{getTypeLabel()}</Text>
          </View>

          <View style={styles.metaRow}>
            <FontAwesome name="clock" size={12} color="#666" />
            <Text style={styles.timeText}>{formatTime()}</Text>
            {meal.quantite !== null && meal.quantite !== undefined && (
              <View style={[styles.badge, { backgroundColor: accentColor }]}>
                <Text style={styles.badgeText}>{meal.quantite} ml</Text>
              </View>
            )}
          </View>
        </View>

        {/* Icône d'édition */}
        <View style={styles.editIcon}>
          <FontAwesome name="chevron-right" size={16} color="#999" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    marginBottom: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  info: {
    flex: 1,
    gap: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  typeLabel: {
    fontSize: 17,
    fontWeight: "600",
    color: "#333",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginLeft: "auto",
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
  timeText: {
    fontSize: 12,
    color: "#666",
    opacity: 0.7,
  },
  editIcon: {
    padding: 8,
  },
});
