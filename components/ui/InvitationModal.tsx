import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Svg, { Circle } from "react-native-svg";

interface InvitationModalProps {
  visible: boolean;
  childName: string;
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  onAccept: () => void;
  onReject: () => void;
  onTimeout: () => void;
  durationMs?: number;
}

export function InvitationModal({
  visible,
  childName,
  backgroundColor,
  textColor,
  accentColor,
  onAccept,
  onReject,
  onTimeout,
  durationMs = 6000,
}: InvitationModalProps) {
  const [progress, setProgress] = useState(1);
  const progressAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const id = progressAnim.addListener(({ value }) => {
      setProgress(Math.max(value, 0));
    });
    return () => {
      progressAnim.removeListener(id);
    };
  }, [progressAnim]);

  useEffect(() => {
    if (!visible) {
      progressAnim.stopAnimation();
      progressAnim.setValue(1);
      setProgress(1);
      return;
    }

    progressAnim.stopAnimation();
    progressAnim.setValue(1);
    setProgress(1);

    const animation = Animated.timing(progressAnim, {
      toValue: 0,
      duration: durationMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished) {
        onTimeout();
      }
    });

    return () => {
      progressAnim.stopAnimation();
    };
  }, [durationMs, onTimeout, progressAnim, visible]);

  const radius = 14;
  const stroke = 3;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = -circumference * (1 - progress);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}}
    >
      <Pressable style={styles.overlay}>
        <Pressable
          style={[styles.card, { backgroundColor }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.headerRow}>
            <View style={styles.textBlock}>
              <Text style={[styles.title, { color: textColor }]}>
                Nouvelle invitation
              </Text>
              <Text style={[styles.message, { color: textColor }]}>
                Voulez-vous ajouter <Text style={styles.bold}>{childName}</Text>{" "}
                ?
              </Text>
            </View>
            <View style={styles.progressWrap}>
              <Svg width={36} height={36}>
                <Circle
                  cx={18}
                  cy={18}
                  r={radius}
                  stroke={textColor + "30"}
                  strokeWidth={stroke}
                  fill="none"
                />
                <Circle
                  cx={18}
                  cy={18}
                  r={radius}
                  stroke={accentColor}
                  strokeWidth={stroke}
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="none"
                  rotation={-90}
                  origin="18,18"
                />
              </Svg>
            </View>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.rejectButton]}
              onPress={onReject}
              activeOpacity={0.8}
            >
              <Text style={styles.rejectText}>Refuser</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: accentColor }]}
              onPress={onAccept}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.acceptText,
                  { color: accentColor === "#fff" ? "#1b1b1b" : "#fff" },
                ]}
              >
                Accepter
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    padding: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 6,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
  bold: {
    fontWeight: "700",
  },
  progressWrap: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  rejectButton: {
    backgroundColor: "#dc3545",
  },
  rejectText: {
    color: "#fff",
    fontWeight: "600",
  },
  acceptText: {
    fontWeight: "600",
  },
});
