# Déploiement du système de permissions - Résumé

## ✅ Ce qui a été fait

### 1. Firestore Rules (déployées en production)

**Règles principales :**
- ✅ Système de sous-collection `children/{childId}/access/{uid}`
- ✅ Support des collection group queries (`collectionGroup('access')`)
- ✅ Règles de fallback `parentIds` pour la migration
- ✅ Auto-migration : les utilisateurs peuvent créer leur propre document d'accès

**Déploiement :**
```bash
firebase deploy --only firestore:rules
```

### 2. Code TypeScript

**Fichiers créés :**
- [`types/permissions.ts`](../types/permissions.ts) - Types et constantes
- [`hooks/useChildPermissions.ts`](../hooks/useChildPermissions.ts) - Hooks React
- [`utils/permissions.ts`](../utils/permissions.ts) - Fonctions utilitaires
- [`contexts/PermissionsMigrationContext.tsx`](../contexts/PermissionsMigrationContext.tsx) - Migration automatique

**Intégré dans :**
- [`app/_layout.tsx`](../app/_layout.tsx) - Provider de migration ajouté

### 3. Migration automatique

**Comment ça fonctionne :**
1. L'utilisateur se connecte
2. `PermissionsMigrationProvider` vérifie si déjà migré (via AsyncStorage)
3. Si non migré :
   - Cherche tous les enfants où `parentIds` contient l'uid
   - Pour chaque enfant, crée `children/{childId}/access/{uid}`
   - Détermine le rôle : `owner` si premier dans `parentIds` ou `ownerId`, sinon `admin`
4. Marque comme migré dans AsyncStorage
5. `BabyContext` charge les enfants via `collectionGroup('access')`

## 🎯 Statut actuel

### Règles déployées ✅
```
=== Deploying to 'samaye-53723'...
✔  firestore: released rules firestore.rules to cloud.firestore
✔  Deploy complete!
```

### Tests à faire

1. **Attendre 1-2 minutes** que les règles se propagent
2. **Relancer l'app**
3. **Vérifier les logs** :

**Logs attendus :**
```
[AuthContext] User data loaded, uid: PTKG...
🔄 Vérification des permissions pour X enfants...
✅ Permissions migrées pour l'enfant abc123 (owner)
🎉 X enfants migrés avec succès
[BabyContext] Chargement des enfants (access) pour user.uid: PTKG...
[BabyContext] X enfants chargés
```

**Logs d'erreur (à ne plus voir) :**
```
❌ Missing or insufficient permissions
```

## 🔒 Sécurité

### Règles de fallback temporaires

Les règles incluent actuellement un fallback `parentIds` pour permettre la migration :

```javascript
// Lecture via parentIds (TEMPORAIRE pour migration)
allow read: if hasAccess(childId) ||
  (isSignedIn() &&
   get(/databases/$(database)/documents/children/$(childId)).data.parentIds.hasAny([request.auth.uid]));
```

**⚠️ IMPORTANT** : Une fois que tous les utilisateurs ont migré (quelques semaines), **supprime le fallback** :

```javascript
// Version finale (plus sécurisée)
allow read: if hasAccess(childId);
allow update, delete: if isOwner(childId);
```

### Règles d'auto-migration

Les utilisateurs peuvent créer leur propre document d'accès s'ils sont dans `parentIds` :

```javascript
// Auto-migration (si dans parentIds, peut créer son propre accès)
(uid == request.auth.uid &&
 exists(/databases/$(database)/documents/children/$(childId)) &&
 get(/databases/$(database)/documents/children/$(childId)).data.parentIds.hasAny([request.auth.uid]) &&
 request.resource.data.grantedBy is string)
```

**⚠️ IMPORTANT** : Cette règle peut aussi être retirée après migration complète.

## 📋 Checklist de déploiement

- [x] Créer les types TypeScript
- [x] Créer les hooks et utils
- [x] Créer le provider de migration
- [x] Intégrer dans `_layout.tsx`
- [x] Créer les règles Firestore
- [x] Déployer les règles en production
- [ ] Attendre 1-2 minutes
- [ ] Tester l'app (migration automatique)
- [ ] Vérifier les logs
- [ ] Confirmer que tous les enfants sont accessibles

## 🚀 Prochaines étapes (après migration)

### 1. Mettre à jour le code de création d'enfants

Quand un utilisateur crée un nouvel enfant, créer immédiatement le document d'accès :

```typescript
import { createOwnerAccess } from '@/utils/permissions';

// Après avoir créé l'enfant
await createOwnerAccess(childId, currentUser.uid);
```

### 2. Ajouter `createdBy` aux events

Lors de la création d'événements :

```typescript
await addDoc(collection(db, 'events'), {
  childId,
  type: 'feeding',
  createdBy: currentUser.uid, // IMPORTANT
  timestamp: Timestamp.now(),
  // ... autres données
});
```

### 3. Utiliser les permissions dans les composants

```tsx
import { useChildPermissions } from '@/hooks/useChildPermissions';

function MyComponent({ childId, currentUserId }) {
  const permissions = useChildPermissions(childId, currentUserId);

  if (!permissions.hasAccess) return <NoAccess />;

  return (
    <View>
      {permissions.canWriteEvents && <AddEventButton />}
      {permissions.canWriteLikes && <LikeButton />}
      {permissions.canManageAccess && <ManageAccessButton />}
    </View>
  );
}
```

### 4. Créer l'UI de gestion des permissions

- Écran pour voir tous les parents ayant accès
- Inviter de nouveaux parents avec choix de rôle
- Modifier le rôle des parents existants
- Révoquer l'accès

**Référence** : [`components/suivibaby/PermissionsExample.tsx`](../components/suivibaby/PermissionsExample.tsx)

### 5. Supprimer les fallbacks (dans quelques semaines)

Une fois que tous les utilisateurs actifs ont migré :

```bash
# Éditer firestore.rules pour retirer les fallbacks parentIds
firebase deploy --only firestore:rules
```

## 📚 Documentation

- [Documentation complète](./PERMISSIONS.md)
- [Guide d'implémentation](./PERMISSIONS_IMPLEMENTATION.md)
- [Exemples de code](../components/suivibaby/PermissionsExample.tsx)

## 🐛 Troubleshooting

### "Missing or insufficient permissions" après déploiement

**Cause** : Les règles mettent 1-2 minutes à se propager.

**Solution** : Attendre quelques minutes et relancer l'app.

### La migration échoue

**Cause** : Les règles n'autorisent pas encore la création de documents d'accès.

**Solution** : Vérifier que les règles ont bien été déployées avec la condition d'auto-migration.

### Les enfants n'apparaissent pas

**Cause 1** : La migration n'a pas encore eu lieu.

**Solution** : Vérifier les logs pour voir si la migration s'est exécutée.

**Cause 2** : Le document d'accès n'a pas été créé.

**Solution** : Vérifier manuellement dans Firestore Console si `children/{childId}/access/{userId}` existe.

### AsyncStorage migration flag bloqué

Si tu veux forcer une nouvelle migration :

```typescript
import AsyncStorage from '@react-native-async-storage/async-storage';
await AsyncStorage.removeItem('@permissions_migrated_v1');
```

Puis relancer l'app.

## 📞 Statut final

✅ **Système de permissions prêt pour la production**
✅ **Migration automatique déployée**
✅ **Règles Firestore sécurisées**
⏳ **En attente de tests utilisateur**

**Date de déploiement** : 2026-02-04
**Version** : v1.0
