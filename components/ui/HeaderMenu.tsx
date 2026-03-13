import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export interface HeaderMenuItem {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  destructive?: boolean;
}

interface HeaderMenuProps {
  items: HeaderMenuItem[];
}

export function HeaderMenu({ items }: HeaderMenuProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const [visible, setVisible] = useState(false);
  const anchorRef = useRef<View>(null);
  const [anchorPos, setAnchorPos] = useState({ x: 0, y: 0 });

  const measure = useCallback(() => {
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchorPos({ x: x + width, y: y + height + 4 });
    });
  }, []);

  const open = useCallback(() => {
    measure();
    setVisible(true);
  }, [measure]);

  const close = useCallback(() => {
    setVisible(false);
  }, []);

  const handleItem = useCallback(
    (onPress: () => void) => {
      close();
      // Small delay to let the modal close animation finish
      setTimeout(onPress, 150);
    },
    [close],
  );

  return (
    <>
      <View ref={anchorRef} collapsable={false}>
        <Pressable
          onPress={open}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.trigger}
          accessibilityRole="button"
          accessibilityLabel="Menu"
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={22}
            color={Colors[colorScheme].tint}
          />
        </Pressable>
      </View>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={close}
      >
        <Pressable style={styles.backdrop} onPress={close}>
          <View
            style={[
              styles.menu,
              {
                top: anchorPos.y,
                right: 16,
                backgroundColor: nc.backgroundCard,
                shadowColor: nc.shadow,
              },
            ]}
          >
            {items.map((item, index) => (
              <Pressable
                key={item.label}
                style={({ pressed }) => [
                  styles.menuItem,
                  pressed && {
                    backgroundColor: nc.pressedLight,
                  },
                  index < items.length - 1 && [
                    styles.menuItemBorder,
                    {
                      borderBottomColor: nc.borderLightAlpha,
                    },
                  ],
                ]}
                onPress={() => handleItem(item.onPress)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <Ionicons
                  name={item.icon}
                  size={18}
                  color={
                    item.destructive
                      ? nc.error
                      : nc.textStrong
                  }
                />
                <Text
                  style={[
                    styles.menuItemText,
                    {
                      color: item.destructive
                        ? nc.error
                        : nc.textStrong,
                    },
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  backdrop: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    minWidth: 180,
    borderRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: "500",
  },
});
