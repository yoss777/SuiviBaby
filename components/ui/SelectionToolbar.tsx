import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface SelectionToolbarProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onDelete: () => void;
}

export function SelectionToolbar({
  selectedCount,
  totalCount,
  onSelectAll,
  onClearSelection,
  onDelete,
}: SelectionToolbarProps) {
  const colorScheme = useColorScheme() ?? "light";
  const allSelected = selectedCount > 0 && selectedCount === totalCount;

  return (
    <View style={[styles.container, { backgroundColor: Colors[colorScheme].background, borderBottomColor: "rgba(0,0,0,0.08)" }]}>
      <Pressable
        style={styles.selectButton}
        onPress={allSelected ? onClearSelection : onSelectAll}
        accessibilityRole="button"
        accessibilityLabel={allSelected ? "Annuler la sélection" : "Tout sélectionner"}
      >
        <Ionicons
          name={allSelected ? "checkbox" : "checkbox-outline"}
          size={18}
          color={Colors[colorScheme].tint}
        />
        <Text style={[styles.selectButtonText, { color: Colors[colorScheme].tint }]}>
          {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
        </Text>
      </Pressable>

      <Pressable
        style={[styles.deleteButton, selectedCount === 0 && styles.deleteButtonDisabled]}
        onPress={onDelete}
        disabled={selectedCount === 0}
        accessibilityRole="button"
        accessibilityLabel={`Supprimer ${selectedCount} élément${selectedCount > 1 ? "s" : ""}`}
      >
        <Ionicons name="trash-outline" size={16} color="#fff" />
        <Text style={styles.deleteButtonText}>
          Supprimer{selectedCount > 0 ? ` (${selectedCount})` : ""}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  selectButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
  },
  selectButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#ef4444",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteButtonDisabled: {
    opacity: 0.4,
  },
  deleteButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
});
