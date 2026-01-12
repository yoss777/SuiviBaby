# FormBottomSheet

Composant Bottom Sheet réutilisable pour les formulaires d'ajout/édition dans l'application SuiviBaby.

## Caractéristiques

- ✅ **Animation fluide** depuis le bas de l'écran
- ✅ **Swipe-to-dismiss** pour fermer
- ✅ **Backdrop semi-transparent**
- ✅ **Boutons icon-only** : Delete, Cancel, Validate
- ✅ **Support du mode édition** (affiche le bouton supprimer)
- ✅ **Couleur d'accent personnalisable**
- ✅ **ScrollView intégré** pour contenu long
- ✅ **Loading states** pour les soumissions

## Installation

Le composant est déjà configuré avec les dépendances suivantes :
- `@gorhom/bottom-sheet`
- `react-native-gesture-handler`
- `react-native-reanimated`

## Utilisation

### Exemple basique

```tsx
import { FormBottomSheet } from "@/components/ui/FormBottomSheet";
import { useRef } from "react";
import BottomSheet from "@gorhom/bottom-sheet";

function MyScreen() {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <>
      <Button onPress={() => bottomSheetRef.current?.expand()}>
        Ouvrir le formulaire
      </Button>

      <FormBottomSheet
        ref={bottomSheetRef}
        title="Nouveau repas"
        icon="utensils"
        accentColor="#28a745"
        isSubmitting={isSubmitting}
        onSubmit={handleSubmit}
        onCancel={() => bottomSheetRef.current?.close()}
      >
        {/* Votre formulaire ici */}
        <Text>Champs du formulaire...</Text>
      </FormBottomSheet>
    </>
  );
}
```

### Exemple avec mode édition

```tsx
<FormBottomSheet
  ref={bottomSheetRef}
  title="Modifier le repas"
  icon="edit"
  accentColor="#4A90E2"
  isEditing={true}
  isSubmitting={isSubmitting}
  onSubmit={handleUpdate}
  onDelete={handleDelete}
  onCancel={() => bottomSheetRef.current?.close()}
  onClose={() => {
    setEditingItem(null);
    setIsSubmitting(false);
  }}
>
  {/* Formulaire d'édition */}
</FormBottomSheet>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `string` | **Required** | Titre affiché dans le header |
| `icon` | `string` | `"edit"` | Icône FontAwesome6 |
| `accentColor` | `string` | `"#4A90E2"` | Couleur du bouton valider |
| `isEditing` | `boolean` | `false` | Active le mode édition (affiche bouton supprimer) |
| `isSubmitting` | `boolean` | `false` | Affiche le loading dans le bouton valider |
| `children` | `ReactNode` | **Required** | Contenu du formulaire |
| `onSubmit` | `() => void \| Promise<void>` | **Required** | Callback de soumission |
| `onDelete` | `() => void \| Promise<void>` | `undefined` | Callback de suppression (mode édition) |
| `onCancel` | `() => void` | **Required** | Callback d'annulation |
| `onClose` | `() => void` | `undefined` | Callback de fermeture (swipe ou backdrop) |
| `snapPoints` | `string[]` | `["75%", "90%"]` | Points d'accroche du Bottom Sheet |

## Couleurs d'accent recommandées

Utilisez les couleurs d'accent de chaque écran pour cohérence :

```tsx
const SCREEN_COLORS = {
  repas: "#28a745",      // Vert
  pompages: "#28a745",   // Vert
  mictions: "#4A90E2",   // Bleu
  selles: "#dc3545",     // Rouge
  vitamines: "#FF9800",  // Orange
  vaccins: "#9C27B0",    // Violet
};
```

## Boutons d'action

Le composant affiche automatiquement 2 ou 3 boutons selon le mode :

### Mode Ajout (2 boutons)
- **Annuler** (noir) - Ferme le Bottom Sheet
- **Valider** (couleur accent) - Soumet le formulaire

### Mode Édition (3 boutons)
- **Supprimer** (rouge) - Supprime l'élément
- **Annuler** (noir) - Ferme le Bottom Sheet
- **Valider** (couleur accent) - Met à jour l'élément

## Gestion de la ref

Pour contrôler le Bottom Sheet programmatiquement :

```tsx
const bottomSheetRef = useRef<BottomSheet>(null);

// Ouvrir
bottomSheetRef.current?.expand();

// Fermer
bottomSheetRef.current?.close();

// Aller au snap point spécifique
bottomSheetRef.current?.snapToIndex(0); // Premier snap point
bottomSheetRef.current?.snapToIndex(1); // Deuxième snap point
```

## Migration depuis Modal natif

### Avant (Modal natif)
```tsx
<Modal
  animationType="slide"
  transparent={true}
  visible={showModal}
  onRequestClose={closeModal}
>
  <View style={styles.modalOverlay}>
    <View style={styles.modalContent}>
      {/* Contenu */}
    </View>
  </View>
</Modal>
```

### Après (FormBottomSheet)
```tsx
<FormBottomSheet
  ref={bottomSheetRef}
  title="Mon titre"
  onSubmit={handleSubmit}
  onCancel={() => bottomSheetRef.current?.close()}
>
  {/* Contenu */}
</FormBottomSheet>
```

## Notes importantes

1. **GestureHandlerRootView** : Assurez-vous que votre app est wrappée avec `<GestureHandlerRootView>` dans `app/_layout.tsx`

2. **Reanimated** : Le plugin `react-native-reanimated/plugin` doit être dans `babel.config.js`

3. **Performance** : Utilisez `useMemo` pour les snap points si vous les calculez dynamiquement

4. **Accessibilité** : Le Bottom Sheet gère automatiquement le focus et le swipe

## Exemples de formulaires

### Formulaire simple (Date/Heure)
```tsx
<FormBottomSheet {...props}>
  <Text style={styles.label}>Date & Heure</Text>
  <DateTimePicker value={date} onChange={setDate} />
</FormBottomSheet>
```

### Formulaire avec quantité
```tsx
<FormBottomSheet {...props}>
  <Text style={styles.label}>Quantité</Text>
  <View style={styles.quantityRow}>
    <Button onPress={() => setQty(q => q - 5)}>-</Button>
    <Text>{qty} ml</Text>
    <Button onPress={() => setQty(q => q + 5)}>+</Button>
  </View>
</FormBottomSheet>
```

### Formulaire avec sélection
```tsx
<FormBottomSheet {...props}>
  <Text style={styles.label}>Type</Text>
  <View style={styles.typeRow}>
    <TouchableOpacity onPress={() => setType('A')}>
      <Text>Option A</Text>
    </TouchableOpacity>
    <TouchableOpacity onPress={() => setType('B')}>
      <Text>Option B</Text>
    </TouchableOpacity>
  </View>
</FormBottomSheet>
```
