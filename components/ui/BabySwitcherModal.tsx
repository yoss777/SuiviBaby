import FontAwesome from "@expo/vector-icons/FontAwesome5";
import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import type { Child } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";

interface BabySwitcherModalProps {
  visible: boolean;
  childOptions: Child[];
  activeChild: Child | null;
  onSelect: (child: Child) => void;
  onClose: () => void;
}

function calculateAge(birthDate: string): string {
  const [day, month, year] = birthDate.split("/").map(Number);
  const birth = new Date(year, month - 1, day);
  const today = new Date();
  let totalMonths =
    (today.getFullYear() - birth.getFullYear()) * 12 +
    (today.getMonth() - birth.getMonth());
  if (today.getDate() < birth.getDate()) {
    totalMonths -= 1;
  }
  if (totalMonths < 0) totalMonths = 0;

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;

  if (years === 0) {
    return `${totalMonths} mois`;
  } else if (months === 0) {
    return years === 1 ? `${years} an` : `${years} ans`;
  } else {
    const yearText = years === 1 ? "an" : "ans";
    return `${years} ${yearText} ${months} mois`;
  }
}

export function BabySwitcherModal({
  visible,
  childOptions,
  activeChild,
  onSelect,
  onClose,
}: BabySwitcherModalProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { width } = useWindowDimensions();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.content,
            {
              backgroundColor: Colors[colorScheme].background,
              width: Math.min(width * 0.8, 320),
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text style={[styles.title, { color: nc.textStrong }]}>
            Changer d&apos;enfant
          </Text>

          {childOptions.map((child) => {
            const isActive = child.id === activeChild?.id;
            const ageText = calculateAge(child.birthDate);

            return (
              <TouchableOpacity
                key={child.id}
                style={[
                  styles.childRow,
                  {
                    backgroundColor: isActive
                      ? Colors[colorScheme].tint + "15"
                      : "transparent",
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => onSelect(child)}
                accessibilityRole="button"
                accessibilityLabel={`Sélectionner ${child.name}`}
                accessibilityState={{ selected: isActive }}
              >
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: nc.backgroundPressed },
                  ]}
                >
                  <Text style={styles.avatarEmoji}>
                    {child.gender === "male" ? "\uD83D\uDC76" : "\uD83D\uDC67"}
                  </Text>
                </View>
                <View style={styles.info}>
                  <Text
                    style={[
                      styles.name,
                      {
                        color: isActive
                          ? Colors[colorScheme].tint
                          : nc.textStrong,
                      },
                    ]}
                  >
                    {child.name}
                  </Text>
                  <Text style={[styles.age, { color: nc.textLight }]}>
                    {ageText}
                  </Text>
                </View>
                {isActive && (
                  <FontAwesome
                    name="check"
                    size={14}
                    color={Colors[colorScheme].tint}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  childRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 12,
    marginVertical: 2,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarEmoji: {
    fontSize: 18,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
  },
  age: {
    fontSize: 12,
    marginTop: 1,
  },
});
