import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { getNeutralColors } from "@/constants/dashboardColors";
import { radius, space } from "@/constants/tokens";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { DESTRUCTIVE_COLOR } from "./ConfirmModal";
import { pressedOpacity, usePressRipple } from "./pressFeedback";

export type ChoiceButtonStyle = "default" | "cancel" | "destructive";

export type ChoiceButton = {
  text: string;
  style?: ChoiceButtonStyle;
  onPress: () => void;
};

interface ChoiceModalProps {
  visible: boolean;
  title: string;
  message?: React.ReactNode;
  /** Dans l'ordre d'affichage voulu ; le bouton « cancel » est toujours placé en dernier. */
  buttons: ChoiceButton[];
  tintColor: string;
  onTintColor: string;
  /** Bouton retour Android / geste de fermeture : annulation. */
  onCancel: () => void;
  dismissOnBack?: boolean;
}

const NOOP = () => {};

/**
 * Dialogue à plusieurs choix, même habillage que ConfirmModal (surface,
 * arrondis, bouton principal en teinte de l'app, secondaires neutres) mais
 * boutons empilés : trois libellés d'action ne tiennent pas sur une ligne.
 */
export function ChoiceModal({
  visible,
  title,
  message,
  buttons,
  tintColor,
  onTintColor,
  onCancel,
  dismissOnBack = true,
}: ChoiceModalProps) {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const ripple = usePressRipple();
  const ordered = [
    ...buttons.filter((b) => b.style !== "cancel"),
    ...buttons.filter((b) => b.style === "cancel"),
  ];
  const firstDefault = ordered.find((b) => (b.style ?? "default") === "default");

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={dismissOnBack ? onCancel : NOOP}
    >
      <View style={styles.overlay}>
        <View
          style={[styles.content, { backgroundColor: nc.backgroundCard }]}
          accessibilityViewIsModal={true}
        >
          <Text
            style={[styles.title, { color: nc.textStrong }]}
            accessibilityRole="header"
          >
            {title}
          </Text>
          {typeof message === "string" ? (
            message ? (
              <Text style={[styles.message, { color: nc.textStrong }]}>{message}</Text>
            ) : null
          ) : message ? (
            <View style={styles.messageContainer}>{message}</View>
          ) : null}

          <View style={styles.buttons}>
            {ordered.map((button, index) => {
              const isPrimary = button === firstDefault;
              const isDestructive = button.style === "destructive";
              const bg = isDestructive
                ? DESTRUCTIVE_COLOR
                : isPrimary
                  ? tintColor
                  : nc.backgroundPressed;
              const ink = isDestructive ? "#fff" : isPrimary ? onTintColor : nc.textStrong;
              return (
                <Pressable
                  key={`${index}-${button.text}`}
                  style={({ pressed }) => [
                    styles.button,
                    { backgroundColor: bg },
                    pressedOpacity(pressed),
                  ]}
                  android_ripple={ripple}
                  onPress={button.onPress}
                  accessibilityRole="button"
                  accessibilityLabel={button.text}
                  testID={`choice-modal-button-${index}`}
                >
                  <Text
                    style={[
                      isPrimary || isDestructive ? styles.strongText : styles.normalText,
                      { color: ink },
                    ]}
                  >
                    {button.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: space.lg,
  },
  content: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: space.xs,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: space.md,
    textAlign: "center",
  },
  messageContainer: {
    marginBottom: space.md,
  },
  buttons: {
    flexDirection: "column",
    gap: space.sm,
  },
  button: {
    minHeight: 44,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  strongText: {
    fontWeight: "700",
    textAlign: "center",
  },
  normalText: {
    fontWeight: "600",
    textAlign: "center",
  },
});
