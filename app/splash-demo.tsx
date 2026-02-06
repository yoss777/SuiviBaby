import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { LogoAnimation } from '@/components/animations';

const { width } = Dimensions.get('window');

export default function SplashDemo() {
  const [key, setKey] = useState(0);
  const [isAnimating, setIsAnimating] = useState(true);

  const restartAnimation = () => {
    setIsAnimating(false);
    setTimeout(() => {
      setKey(prev => prev + 1);
      setIsAnimating(true);
    }, 100);
  };

  return (
    <LinearGradient
      colors={['#C5D89A', '#8BC6A0', '#7DBBA0']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.container}
    >
      <View style={styles.content}>
        {isAnimating && (
          <LogoAnimation
            key={key}
            size={Math.min(width * 0.7, 300)}
            loop={true}
            onAnimationComplete={() => console.log('Animation complete!')}
          />
        )}
      </View>

      <TouchableOpacity style={styles.button} onPress={restartAnimation}>
        <Text style={styles.buttonText}>Rejouer l'animation</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  button: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 25,
    marginBottom: 60,
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonText: {
    color: '#2E7D6B',
    fontSize: 16,
    fontWeight: '600',
  },
});
