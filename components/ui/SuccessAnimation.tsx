// components/ui/SuccessAnimation.tsx
import { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import FontAwesome6 from '@expo/vector-icons/FontAwesome6';
import * as Haptics from 'expo-haptics';

interface SuccessAnimationProps {
  visible: boolean;
  onComplete?: () => void;
  icon?: string;
  color?: string;
  message?: string;
}

export function SuccessAnimation({
  visible,
  onComplete,
  icon = 'check',
  color = '#22c55e',
  message,
}: SuccessAnimationProps) {
  const scale = useSharedValue(0);
  const opacity = useSharedValue(0);
  const checkScale = useSharedValue(0);
  const checkRotation = useSharedValue(-45);
  const blurOpacity = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      // Reset state before starting
      scale.value = 0;
      opacity.value = 0;
      checkScale.value = 0;
      checkRotation.value = -45;
      blurOpacity.value = 0;

      // Feedback haptique immédiat
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Animation du blur
      blurOpacity.value = withTiming(1, { duration: 200 });

      // Animation simple du cercle - scale direct
      scale.value = withTiming(1, { duration: 300 });
      opacity.value = withTiming(1, { duration: 300 });

      // Animation simple de l'icône - scale direct
      checkRotation.value = 0;
      checkScale.value = withTiming(1, { duration: 300 });

      // Auto-dismiss après 1.5s avec fade out
      const dismissTimer = setTimeout(() => {
        blurOpacity.value = withTiming(0, { duration: 300 });
        scale.value = withTiming(0, { duration: 250 });
        checkScale.value = withTiming(0, { duration: 200 });
        opacity.value = withTiming(0, { duration: 250 }, (finished) => {
          if (finished && onComplete) {
            runOnJS(onComplete)();
          }
        });
      }, 1500);

      return () => clearTimeout(dismissTimer);
    }
  }, [visible]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: checkScale.value },
      { rotate: `${checkRotation.value}deg` },
    ],
  }));

  const blurStyle = useAnimatedStyle(() => ({
    opacity: blurOpacity.value,
  }));

  const messageBackground = hexToRgba(color, 0.32);
  const messageBorder = hexToRgba(color, 0.5);

  if (!visible) return null;

  return (
    <>
      {/* Blur background */}
      <Animated.View style={[styles.blurContainer, blurStyle]} pointerEvents="none">
        {Platform.OS === 'ios' ? (
          <BlurView intensity={80} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.androidOverlay} />
        )}
      </Animated.View>

      {/* Animation content */}
      <View style={styles.overlay} pointerEvents="none">
        <Animated.View style={[styles.container, containerStyle]}>
          <View style={[styles.circle, { backgroundColor: color }]}>
            <Animated.View style={iconStyle}>
              <FontAwesome6 name={icon as any} size={48} color="#fff" solid />
            </Animated.View>
          </View>
          {message && (
            <View
              style={[
                styles.messageContainer,
                { backgroundColor: messageBackground, borderColor: messageBorder },
              ]}
            >
              {Platform.OS === 'ios' && (
                <BlurView intensity={20} style={styles.messageBlur} />
              )}
              <Text style={styles.messageText}>{message}</Text>
            </View>
          )}
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  blurContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  androidOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    elevation: 10000,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: 120,
    height: 120,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  messageContainer: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    maxWidth: 280,
    overflow: 'hidden',
  },
  messageText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  messageBlur: {
    ...StyleSheet.absoluteFillObject,
  },
});

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
