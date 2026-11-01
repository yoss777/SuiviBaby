// components/suivibaby/VoiceBar.tsx
// Hold-to-talk voice pill rendered by VoiceDock, left of the quick-add "+".
// The whole pill is the touch target; a short tap starts a hands-free
// recording stopped by a second tap; releasing the finger outside the pill
// cancels the recording.
import { getNeutralColors } from "@/constants/dashboardColors";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useNightMode } from "@/hooks/useNightMode";
import {
  formatRecordingDuration,
  type VoiceInput,
  type VoiceInputStatus,
} from "@/hooks/useVoiceInput";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  type GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export const VOICE_BAR_HEIGHT = 56;
/** How far the finger may drift outside the pill before releasing cancels. */
const CANCEL_TOLERANCE = 24;

const ANNOUNCEMENTS: Partial<Record<VoiceInputStatus, string>> = {
  recording: "Enregistrement en cours",
  processing: "Analyse de la commande",
};

export function getVoiceBarCopy(
  status: VoiceInputStatus,
  elapsedSeconds: number,
  isHandsFree: boolean,
  willCancel = false,
): { title: string; subtitle: string } {
  switch (status) {
    case "recording":
      return {
        title: `Je vous écoute… ${formatRecordingDuration(elapsedSeconds)}`,
        subtitle: willCancel
          ? "Relâchez pour annuler"
          : isHandsFree
          ? "Touchez pour envoyer"
          : "Relâchez pour envoyer",
      };
    case "processing":
      return { title: "Je réfléchis…", subtitle: "Transcription et analyse" };
    case "confirming":
      return { title: "Vérifiez la proposition", subtitle: "Rien n'est enregistré sans votre accord" };
    default:
      return { title: "Maintenez pour parler", subtitle: "« Biberon de 150 ml à 6 h 40 »" };
  }
}

type Bounds = { x: number; y: number; width: number; height: number };

export function isOutsideBounds(
  bounds: Bounds | null,
  pageX: number,
  pageY: number,
  tolerance = CANCEL_TOLERANCE,
): boolean {
  if (!bounds) return false;
  return (
    pageX < bounds.x - tolerance ||
    pageX > bounds.x + bounds.width + tolerance ||
    pageY < bounds.y - tolerance ||
    pageY > bounds.y + bounds.height + tolerance
  );
}

interface VoiceBarProps {
  input: VoiceInput;
  bottom: number;
  right: number;
  /** The quick-add menu is open: the pill fades and ignores touches. */
  dimmed?: boolean;
}

export function VoiceBar({ input, bottom, right, dimmed = false }: VoiceBarProps) {
  const { status, elapsedSeconds, isHandsFree, onPressIn, onPressOut, onPress } = input;
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { isNightMode, fontSize, animations } = useNightMode();

  const isRecording = status === "recording";
  const isBusy = status === "processing";
  const [willCancel, setWillCancel] = useState(false);
  const { title, subtitle } = getVoiceBarCopy(status, elapsedSeconds, isHandsFree, willCancel);

  const boundsRef = useRef<Bounds | null>(null);
  const pillRef = useRef<View>(null);
  const measure = () => {
    pillRef.current?.measureInWindow((x, y, width, height) => {
      boundsRef.current = { x, y, width, height };
    });
  };

  useEffect(() => {
    if (!isRecording) setWillCancel(false);
  }, [isRecording]);

  // Night-friendly dark pill in light mode, raised card in dark mode.
  const barBackground = colorScheme === "dark" ? nc.backgroundCard : "#1c2230";
  const micBackground = isRecording ? nc.error : "#0a7ea4";
  const borderColor = isRecording
    ? nc.error
    : colorScheme === "dark"
    ? nc.border
    : "transparent";

  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!isRecording || !animations.decorative) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isRecording, animations.decorative, pulse]);

  const lastAnnounced = useRef<VoiceInputStatus>("idle");
  useEffect(() => {
    if (status === lastAnnounced.current) return;
    lastAnnounced.current = status;
    const message = ANNOUNCEMENTS[status];
    if (message) AccessibilityInfo.announceForAccessibility(message);
  }, [status]);

  const handlePressIn = () => {
    measure();
    setWillCancel(false);
    onPressIn();
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    setWillCancel(false);
    onPressOut(isOutsideBounds(boundsRef.current, pageX, pageY));
  };

  const handleTouchMove = (event: GestureResponderEvent) => {
    if (!isRecording || isHandsFree) return;
    const { pageX, pageY } = event.nativeEvent;
    const outside = isOutsideBounds(boundsRef.current, pageX, pageY);
    if (outside !== willCancel) setWillCancel(outside);
  };

  // On night mode the example sentence goes away: manual "+" is the quieter path.
  const showSubtitle = !(isNightMode && status === "idle");

  return (
    <Pressable
      ref={pillRef}
      testID="voice-bar"
      onLayout={measure}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      onTouchMove={handleTouchMove}
      pressRetentionOffset={{
        top: CANCEL_TOLERANCE,
        bottom: CANCEL_TOLERANCE,
        left: CANCEL_TOLERANCE,
        right: CANCEL_TOLERANCE,
      }}
      disabled={isBusy || dimmed}
      accessibilityRole="button"
      accessibilityLabel={`${title}, commande vocale`}
      accessibilityHint="Touchez deux fois pour démarrer l'enregistrement, puis à nouveau pour l'envoyer."
      accessibilityState={{ busy: isBusy, disabled: isBusy || dimmed }}
      accessibilityValue={isRecording ? { text: formatRecordingDuration(elapsedSeconds) } : undefined}
      style={({ pressed }) => [
        styles.bar,
        {
          bottom,
          right,
          backgroundColor: barBackground,
          borderColor,
          borderWidth: isRecording ? 2 : 1,
          opacity: dimmed ? 0.4 : isNightMode && status === "idle" ? 0.85 : 1,
          // On Android elevation also sets the z-order: drop it under the menu backdrop.
          elevation: dimmed ? 0 : 6,
          transform: [{ scale: pressed && !isRecording ? 0.98 : 1 }],
        },
      ]}
    >
      <Animated.View
        style={[styles.mic, { backgroundColor: micBackground, transform: [{ scale: pulse }] }]}
      >
        {isBusy ? (
          <ActivityIndicator size="small" color="#ffffff" />
        ) : (
          <FontAwesome
            name={willCancel ? "times" : isRecording ? "stop" : "microphone"}
            size={16}
            color="#ffffff"
            solid
          />
        )}
      </Animated.View>
      <View style={styles.texts}>
        <Text
          style={[styles.title, { fontSize: fontSize.normal }, isRecording && styles.tabular]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {showSubtitle && (
          <Text
            style={[
              styles.subtitle,
              { fontSize: fontSize.small },
              isNightMode && styles.subtitleNight,
              willCancel && { color: nc.errorText },
            ]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 16,
    height: VOICE_BAR_HEIGHT,
    borderRadius: VOICE_BAR_HEIGHT / 2,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 6,
    paddingRight: 16,
    gap: 10,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  mic: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  texts: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: "#ffffff",
    fontWeight: "700",
  },
  tabular: {
    fontVariant: ["tabular-nums"],
  },
  subtitle: {
    color: "rgba(255,255,255,0.72)",
    marginTop: 1,
  },
  subtitleNight: {
    color: "rgba(255,255,255,0.85)",
  },
});
