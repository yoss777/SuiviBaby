// components/ui/SuccessAnimationDemo.tsx
// Composant de démonstration pour tester l'animation de succès
// Utilisez ce fichier comme référence pour intégrer l'animation dans vos composants

import { SuccessAnimation } from '@/components/ui/SuccessAnimation';
import { useSuccessAnimation } from '@/hooks/useSuccessAnimation';
import { SuccessAnimationType } from '@/constants/successAnimations';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function SuccessAnimationDemo() {
  const { animation, showSuccess, hideSuccess, config } = useSuccessAnimation();

  const testActions: Array<{ label: string; type: SuccessAnimationType }> = [
    { label: 'Repas', type: 'meal' },
    { label: 'Couche', type: 'diaper' },
    { label: 'Sommeil', type: 'sleep' },
    { label: 'Moment', type: 'milestone' },
    { label: 'Vocal', type: 'voice' },
    { label: 'Défaut', type: 'default' },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Test Animation de Succès</Text>

      <View style={styles.buttonGrid}>
        {testActions.map(({ label, type }) => (
          <Pressable
            key={type}
            style={styles.button}
            onPress={() => showSuccess(type)}
          >
            <Text style={styles.buttonText}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <SuccessAnimation
        visible={animation.visible}
        icon={config.icon}
        color={config.color}
        onComplete={hideSuccess}
        showConfetti={true}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  buttonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'center',
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: '#4A90E2',
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});
