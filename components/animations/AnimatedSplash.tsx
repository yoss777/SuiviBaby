import React, { useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import LogoAnimation from './LogoAnimation';

const { width, height } = Dimensions.get('window');

interface AnimatedSplashProps {
  onComplete?: () => void;
  children?: React.ReactNode;
}

export default function AnimatedSplash({ onComplete, children }: AnimatedSplashProps) {
  const [animationComplete, setAnimationComplete] = useState(false);
  const splashOpacity = useSharedValue(1);

  const handleAnimationComplete = () => {
    // Fade out splash after logo animation completes
    splashOpacity.value = withDelay(
      300,
      withTiming(0, { duration: 500 }, (finished) => {
        if (finished && onComplete) {
          runOnJS(onComplete)();
        }
        runOnJS(setAnimationComplete)(true);
      })
    );
  };

  const splashAnimatedStyle = useAnimatedStyle(() => ({
    opacity: splashOpacity.value,
    pointerEvents: splashOpacity.value === 0 ? 'none' : 'auto',
  }));

  if (animationComplete) {
    return <>{children}</>;
  }

  return (
    <View style={styles.container}>
      {children}
      <Animated.View style={[styles.splash, splashAnimatedStyle]}>
        <LinearGradient
          colors={['#C5D89A', '#8BC6A0', '#7DBBA0']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          <LogoAnimation
            size={Math.min(width * 0.6, 280)}
            onAnimationComplete={handleAnimationComplete}
          />
        </LinearGradient>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  splash: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
