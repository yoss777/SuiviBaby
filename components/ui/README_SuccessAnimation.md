# Success Animation

Animation de succès élégante pour confirmer les actions utilisateur dans SuiviBaby.

## Caractéristiques

- ✅ **Cercle coloré avec icône** - Bounce effect naturel
- 🎊 **Confetti animés** (optionnel) - Particules qui tombent avec gravité
- 🎯 **Personnalisable par action** - Couleurs et icônes spécifiques
- 📳 **Feedback haptique** - Vibration de succès
- ⚡ **Auto-dismiss** - Disparaît après 1.5s
- 🎨 **Animations fluides** - Utilise Reanimated 3 et Skia

## Utilisation

### 1. Import du hook

```typescript
import { useSuccessAnimation } from '@/hooks/useSuccessAnimation';
import { SuccessAnimation } from '@/components/ui/SuccessAnimation';
```

### 2. Dans votre composant

```typescript
function MyComponent() {
  const { animation, showSuccess, hideSuccess, config } = useSuccessAnimation();

  const handleAction = () => {
    // Votre logique métier
    saveData();

    // Afficher l'animation de succès
    showSuccess('meal'); // Types: 'meal', 'diaper', 'sleep', 'milestone', 'voice', 'default'
  };

  return (
    <>
      {/* Votre UI */}
      <Button onPress={handleAction} title="Ajouter repas" />

      {/* Animation de succès */}
      <SuccessAnimation
        visible={animation.visible}
        icon={config.icon}
        color={config.color}
        onComplete={hideSuccess}
        showConfetti={true} // false pour désactiver les confetti
      />
    </>
  );
}
```

### 3. Sans le hook (utilisation directe)

```typescript
const [showAnimation, setShowAnimation] = useState(false);

<SuccessAnimation
  visible={showAnimation}
  icon="check"
  color="#22c55e"
  onComplete={() => setShowAnimation(false)}
  showConfetti={true}
/>
```

## Props

### `SuccessAnimation`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `visible` | `boolean` | required | Contrôle la visibilité de l'animation |
| `icon` | `string` | `'check'` | Nom de l'icône FontAwesome6 |
| `color` | `string` | `'#22c55e'` | Couleur du cercle et de l'icône |
| `onComplete` | `() => void` | - | Callback appelé à la fin de l'animation |
| `showConfetti` | `boolean` | `true` | Afficher les confetti |

## Types d'animation prédéfinis

Dans `constants/successAnimations.ts` :

```typescript
const SUCCESS_ANIMATIONS = {
  meal: { icon: 'utensils', color: '#E8785A' },      // Repas
  diaper: { icon: 'check', color: '#17a2b8' },       // Couche
  sleep: { icon: 'moon', color: '#7C6BA4' },         // Sommeil
  milestone: { icon: 'star', color: '#4A90E2' },     // Moment
  voice: { icon: 'microphone', color: '#10b981' },   // Vocal
  default: { icon: 'check', color: '#22c55e' },      // Par défaut
};
```

## Exemples d'intégration

### Dans GlobalFAB

L'animation est déjà intégrée dans `GlobalFAB.tsx`. Quand l'utilisateur clique sur une action :
1. L'animation de succès apparaît immédiatement
2. Le bottom sheet s'ouvre après 400ms
3. L'animation se termine automatiquement après 1.5s

### Dans VoiceCommandButton

Pour intégrer après une commande vocale confirmée :

```typescript
// Dans useVoiceCommand ou le composant
const { showSuccess } = useSuccessAnimation();

const handleConfirmCommand = async () => {
  await executeCommand();

  // Afficher l'animation selon le type de commande
  if (command.type === 'biberon' || command.type === 'tetee') {
    showSuccess('meal');
  } else if (command.type === 'couche') {
    showSuccess('diaper');
  } else if (command.type === 'sommeil') {
    showSuccess('sleep');
  } else {
    showSuccess('default');
  }
};
```

## Performance

- **Reanimated 3** : Animations sur le thread UI (60fps)
- **Skia** : Rendu des confetti optimisé
- **Minimal re-renders** : Utilise des shared values
- **Auto-cleanup** : Pas de memory leaks

## Customisation

### Désactiver les confetti

```typescript
<SuccessAnimation
  visible={true}
  icon="check"
  color="#22c55e"
  showConfetti={false} // Pas de confetti
/>
```

### Changer la durée

Modifiez dans `SuccessAnimation.tsx` :

```typescript
// Ligne ~88 : Durée de l'animation du confetti
withTiming(1, { duration: 1500 })

// Ligne ~96 : Durée avant auto-dismiss
setTimeout(() => { ... }, 1500);
```

### Ajouter plus de confetti

```typescript
// Ligne ~21 : Nombre de particules
generateConfetti(20, color) // Augmentez à 30, 40, etc.
```

## Tester

Utilisez le composant démo :

```typescript
import { SuccessAnimationDemo } from '@/components/ui/SuccessAnimationDemo';

// Dans votre écran de test
<SuccessAnimationDemo />
```

## Troubleshooting

**L'animation ne s'affiche pas** : Vérifiez que `visible={true}` et que le z-index est suffisant (10000).

**Les confetti sont trop nombreux** : Réduisez le nombre dans `generateConfetti()`.

**L'animation est saccadée** : Vérifiez que Reanimated et Skia sont bien configurés.

## Dépendances

- `react-native-reanimated` : ^3.x
- `@shopify/react-native-skia` : ^1.x
- `@expo/vector-icons` : FontAwesome6
- `expo-haptics` : Pour le feedback haptique
