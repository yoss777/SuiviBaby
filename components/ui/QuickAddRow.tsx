import { space } from "@/constants/tokens";
import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import React, { memo, ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

export interface QuickAddItem {
  key: string;
  /** Libellé court visible (ex. « Sieste »). */
  label: string;
  /** Libellé lu par le lecteur d'écran (ex. « Ajouter une sieste »). */
  accessibilityLabel: string;
  icon: ReactNode;
  onPress: () => void;
}

interface QuickAddRowProps {
  items: QuickAddItem[];
  testID?: string;
}

/**
 * Rangée d'ajouts rapides affichée SOUS les filtres (Aujourd'hui / Historique),
 * pour que les filtres restent toujours entièrement visibles, même sur 360 dp.
 * Boutons compacts (à la taille de leur contenu), alignés à droite, avec un
 * petit espace entre eux ; ils passent à la ligne plutôt que de déborder.
 * Chaque bouton garde une cible tactile de 44 pt.
 */
export const QuickAddRow = memo(function QuickAddRow({
  items,
  testID = "quick-add-row",
}: QuickAddRowProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);

  return (
    <View style={styles.row} testID={testID}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          testID={`quick-add-${item.key}`}
          onPress={item.onPress}
          accessibilityRole="button"
          accessibilityLabel={item.accessibilityLabel}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: pressed ? nc.border : nc.backgroundPressed },
          ]}
        >
          {item.icon}
          <Text
            style={[styles.label, { color: nc.textNormal }]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    paddingHorizontal: space.md,
    paddingBottom: space.xs,
  },
  button: {
    // Pastille à la taille de son contenu (pas d'étirement sur la largeur)
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
  },
});
