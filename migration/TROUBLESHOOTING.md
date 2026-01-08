# 🔧 Troubleshooting - Migration SuiviBaby

## Problème : "Utilisateur non connecté" lors du clic sur Migrer

### Symptômes
- Bannière de migration visible
- Clic sur "Migrer"
- Alert : "Erreur - Utilisateur non connecté"

### Diagnostic

#### Étape 1 : Vérifier les logs console

Cherchez ces logs dans la console :
```
✅ MigrationProvider - userId mis à jour: <user-id>
```

**Si vous voyez ce log** : Le userId est bien récupéré, le problème est ailleurs.

**Si vous voyez** :
```
⚠️ MigrationProvider - Pas d'utilisateur connecté
```
→ Le problème vient de l'AuthContext

#### Étape 2 : Vérifier l'ordre des Providers

Dans [app/_layout.tsx](../app/_layout.tsx), l'ordre DOIT être :
```tsx
<AuthProvider>          {/* 1. Auth en premier */}
  <BabyProvider>        {/* 2. Baby après */}
    <MigrationProvider> {/* 3. Migration après */}
      {/* App */}
    </MigrationProvider>
  </BabyProvider>
</AuthProvider>
```

#### Étape 3 : Vérifier que vous êtes bien connecté

Dans l'app :
1. Allez dans Settings
2. Vérifiez que votre email est affiché
3. Si pas d'email → Reconnectez-vous

### Solutions

#### Solution 1 : Attendre que l'utilisateur soit chargé

Le problème peut venir d'un timing : le `MigrationProvider` se charge avant que l'`AuthContext` ait récupéré l'utilisateur.

**Ajoutez un loading dans MigrationBanner** :

```tsx
// Dans MigrationBanner.tsx
const { firebaseUser } = useAuth();

if (!firebaseUser) {
  // User pas encore chargé, ne rien afficher
  return null;
}
```

#### Solution 2 : Désactiver le bouton si pas de userId

```tsx
// Dans MigrationBanner.tsx
<Pressable
  style={styles.button}
  onPress={handleStartMigration}
  disabled={isStarting || !userId}  // ← Ajouter !userId
>
```

#### Solution 3 : Forcer le rechargement

Si le problème persiste :
1. Fermez complètement l'app
2. Effacez le cache : `expo start -c`
3. Relancez l'app
4. Reconnectez-vous

---

## Problème : Index Firestore manquants

### Symptômes
- Migration démarre
- Erreur : "FAILED_PRECONDITION: The query requires an index"

### Solution

1. Créez les index via Firebase CLI :
```bash
firebase deploy --only firestore:indexes
```

2. Ou manuellement dans Firebase Console :
   - Firestore Database → Indexes
   - Voir [FIRESTORE_INDEXES.md](./FIRESTORE_INDEXES.md)

3. Attendez 2-10 minutes pour activation

---

## Problème : Migration échoue silencieusement

### Symptômes
- Clic sur "Migrer"
- Alert de confirmation
- Puis rien, pas d'alert de succès/erreur

### Diagnostic

Vérifiez la console pour les erreurs :
```
❌ Erreur lors de l'ajout : <message>
❌ Erreur migration <collection>: <message>
```

### Solutions possibles

#### 1. Règles Firestore trop restrictives

Vérifiez dans Firebase Console → Firestore → Rules :

```javascript
// Les règles doivent autoriser l'écriture dans "events"
match /events/{eventId} {
  allow read, write: if request.auth != null
    && request.auth.uid == resource.data.userId;
}
```

#### 2. Permissions manquantes

L'utilisateur doit être propriétaire des données à migrer.

#### 3. Collections vides

Si aucune donnée à migrer, c'est normal que ça ne fasse rien.

Testez d'abord avec des données existantes.

---

## Problème : Doublons dans la timeline

### Symptômes
- Après migration, chaque event apparaît 2 fois

### Cause
La déduplication ne fonctionne pas correctement.

### Solution

Augmentez la fenêtre de déduplication :

```typescript
// Dans n'importe quel fichier
import { setHybridConfig } from '@/migration/eventsHybridService';

setHybridConfig({
  deduplicationWindow: 10000, // 10 secondes au lieu de 5
});
```

Ou passez directement à la phase VALIDATION :
```
Settings → Migration → ➡️ Phase Suivante
```

---

## Problème : App freeze pendant la migration

### Symptômes
- Migration démarre
- App se fige
- Plus de réponse

### Cause
Migration trop longue (beaucoup de données).

### Solution

La migration fonctionne par batch de 500. Si vous avez >5000 events :

1. Augmentez le timeout dans [migrationScript.ts](./migrationScript.ts)
2. Ou migrez par collection une par une

---

## Problème : Coûts Firebase explosent

### Symptômes
- Après migration, coûts Firebase x2 ou x3

### Cause
Phase DOUBLE_WRITE : écriture dans OLD + NEW = 2x les écritures.

### Solution

**C'est NORMAL pendant 7-14 jours.**

Une fois en phase COMPLETE, les coûts vont diminuer de 60-80%.

Si ça dure trop :
```
Settings → Migration → ➡️ Phase Suivante
```

---

## Problème : Erreur "Collection not found"

### Symptômes
```
Error: Collection 'tetees' not found
```

### Cause
Vous êtes en phase NEW_ONLY mais les anciennes collections ont été supprimées.

### Solution

**Rollback immédiat** :
```
Settings → Migration → ⏮️ Rollback
```

Puis restaurez les anciennes collections depuis un backup.

---

## Problème : Migration bloquée sur "Migration en cours..."

### Symptômes
- Bannière affiche "Migration en cours..."
- Plus rien ne se passe
- Ça dure depuis >5 minutes

### Solution

1. Tuez l'app complètement
2. Relancez
3. Si toujours bloqué :
```
Settings → Migration → 🔄 Réinitialiser la Migration
```

---

## Problème : Modification d'un event ne se reflète pas

### Symptômes
- Vous modifiez une tétée
- La modification n'apparaît pas

### Diagnostic

Vérifiez dans quelle phase vous êtes :
```
Settings → Migration
```

### Solution selon la phase

**DOUBLE_WRITE** :
- Modification devrait être dans OLD + NEW
- Vérifiez les logs console

**VALIDATION ou COMPLETE** :
- Vérifiez Firebase Console → collection `events`
- La modif doit être là

Si pas de modif visible → Bug, utilisez Rollback.

---

## Problème : TypeScript erreurs après migration

### Symptômes
```
Type 'Event' is not assignable to type 'Tetee'
```

### Cause
Les anciens types (`Tetee`, `Miction`, etc.) ne matchent plus.

### Solution

Mettez à jour vos imports :

**Avant** :
```typescript
import { Tetee } from '@/services/teteesService';
```

**Après** :
```typescript
import type { TeteeEvent } from '@/services/eventsService';
```

---

## Problème : Firebase Console ne montre pas la collection "events"

### Symptômes
- Migration "réussie"
- Mais pas de collection `events` dans Firebase Console

### Diagnostic

1. Vérifiez les logs console pour des erreurs
2. Vérifiez que vous regardez le bon projet Firebase
3. Vérifiez les règles Firestore

### Solution

Relancez la migration :
```
Settings → Migration → 🔄 Réinitialiser
Settings → Migration → 🚀 Démarrer la Migration
```

---

## Logs Utiles pour Debug

### Dans la console, cherchez :

#### Succès :
```
✅ MigrationProvider - userId mis à jour: abc123
✅ Tétée ajoutée dans NEW: def456
✅ Tétée ajoutée dans OLD: ghi789
📦 15 documents trouvés dans tetees
✅ Migration terminée: { success: 150, errors: 0 }
```

#### Erreurs :
```
⚠️ MigrationProvider - Pas d'utilisateur connecté
❌ Erreur lors de l'ajout : <message>
❌ Erreur NEW: <message>
❌ Erreur OLD: <message>
FAILED_PRECONDITION: The query requires an index
```

---

## Checklist de Debug

Si vous avez un problème :

- [ ] Vérifiez les logs console (90% des infos sont là)
- [ ] Vérifiez Firebase Console → Firestore → Data
- [ ] Vérifiez Firebase Console → Firestore → Indexes (doivent être verts)
- [ ] Vérifiez Firebase Console → Firestore → Rules
- [ ] Vérifiez que vous êtes connecté (Settings → email visible)
- [ ] Vérifiez l'ordre des Providers dans _layout.tsx
- [ ] Essayez de relancer l'app (`expo start -c`)
- [ ] En dernier recours : Rollback

---

## Contacter le Support

Si après tout ça, ça ne fonctionne toujours pas :

1. **Récupérez les logs** :
   - Toute la console depuis le lancement
   - Screenshot de Firebase Console (Indexes + Rules)

2. **Décrivez le problème** :
   - Étapes pour reproduire
   - Phase de migration actuelle
   - Ce que vous attendiez vs ce qui se passe

3. **État du système** :
   - Version de l'app
   - iOS ou Android
   - Nombre d'events dans les anciennes collections

---

**La plupart des problèmes se résolvent en vérifiant les logs console ! 🔍**
