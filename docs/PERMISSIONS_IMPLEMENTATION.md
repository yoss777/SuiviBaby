# Guide d'implémentation du système de permissions

## ✅ Ce qui est fait

### 1. Firestore Rules
- ✅ Règles complètes dans [`firestore.rules`](/firestore.rules)
- ✅ Système de sous-collection `children/{childId}/access/{uid}`
- ✅ 4 rôles : owner, admin, contributor, viewer
- ✅ Validation côté serveur des permissions

### 2. Code TypeScript
- ✅ Types dans [`types/permissions.ts`](/types/permissions.ts)
- ✅ Hook `useChildPermissions` dans [`hooks/useChildPermissions.ts`](/hooks/useChildPermissions.ts)
- ✅ Fonctions utilitaires dans [`utils/permissions.ts`](/utils/permissions.ts)
- ✅ Exemples d'utilisation dans [`components/suivibaby/PermissionsExample.tsx`](/components/suivibaby/PermissionsExample.tsx)

### 3. Documentation
- ✅ Documentation complète dans [`docs/PERMISSIONS.md`](/docs/PERMISSIONS.md)
- ✅ Script de migration dans [`scripts/migratePermissions.ts`](/scripts/migratePermissions.ts)

## 🚀 Prochaines étapes

### Étape 1: Déployer les nouvelles règles Firestore

```bash
# IMPORTANT: Testez d'abord sur un projet de développement !
firebase deploy --only firestore:rules
```

**⚠️ ATTENTION** : Les anciennes règles utilisaient `isParent()` qui vérifie `parentIds`. Les nouvelles règles utilisent la sous-collection `access`. Tant que vous n'avez pas migré les données, **les utilisateurs perdront l'accès** !

### Étape 2: Migrer les données existantes

1. **Mettre à jour le script de migration** avec votre config Firebase :

```typescript
// Dans scripts/migratePermissions.ts
const firebaseConfig = {
  apiKey: "AIzaSyBJUP-b3NPExx-4RfWFLvrbAM5pEfHvAOg",
  authDomain: "samaye-53723.firebaseapp.com",
  // ... votre config complète
};
```

2. **Exécuter la migration** :

```bash
npx ts-node scripts/migratePermissions.ts
```

Le script va :
- Récupérer tous les enfants existants
- Identifier l'owner (champ `ownerId` ou premier `parentId`)
- Créer le document d'accès `owner` pour l'owner
- Créer les documents d'accès `admin` pour les autres parents

### Étape 3: Mettre à jour le code existant

#### 3.1. Modifier la création d'enfants

**Avant** :
```typescript
await setDoc(doc(db, 'children', childId), {
  name: babyName,
  parentIds: [currentUser.uid],
  // ...
});
```

**Après** :
```typescript
import { createOwnerAccess } from '@/utils/permissions';

await setDoc(doc(db, 'children', childId), {
  name: babyName,
  ownerId: currentUser.uid,
  parentIds: [currentUser.uid],
  // ...
});

// Créer l'accès owner
await createOwnerAccess(childId, currentUser.uid);
```

#### 3.2. Utiliser les permissions dans les composants

**Exemple: Écran d'événements**

```typescript
import { useChildPermissions } from '@/hooks/useChildPermissions';

function EventsScreen({ childId }) {
  const permissions = useChildPermissions(childId, currentUser?.uid);

  if (permissions.loading) return <LoadingSpinner />;
  if (!permissions.hasAccess) return <NoAccessScreen />;

  return (
    <View>
      <EventsList childId={childId} />
      {permissions.canWriteEvents && <AddEventButton />}
    </View>
  );
}
```

#### 3.3. Ajouter `createdBy` aux events

Lors de la création d'un event :

```typescript
await addDoc(collection(db, 'events'), {
  childId,
  type: 'feeding',
  createdBy: currentUser.uid, // IMPORTANT
  timestamp: Timestamp.now(),
  // ... autres données
});
```

#### 3.4. Ajouter `userId` aux likes/comments

```typescript
// Like
await addDoc(collection(db, 'eventLikes'), {
  eventId,
  childId,
  userId: currentUser.uid, // IMPORTANT
  timestamp: Timestamp.now(),
});

// Comment
await addDoc(collection(db, 'eventComments'), {
  eventId,
  childId,
  userId: currentUser.uid, // IMPORTANT
  text: commentText,
  timestamp: Timestamp.now(),
});
```

### Étape 4: Créer l'UI de gestion des permissions

Créer un écran qui permet aux owners de :
- Voir la liste des parents ayant accès
- Inviter de nouveaux parents
- Modifier le rôle des parents existants
- Révoquer l'accès

**Référence** : Voir [`components/suivibaby/PermissionsExample.tsx`](/components/suivibaby/PermissionsExample.tsx)

### Étape 5: Mettre à jour le système d'invitations

Modifier le flux d'invitation pour :
1. Créer l'invitation dans `shareInvitations`
2. Quand l'invité accepte, appeler `grantChildAccess()` avec le rôle choisi
3. Ajouter l'`invitationId` dans le document d'accès

**Exemple** :

```typescript
// Lorsque l'invité accepte
await grantChildAccess(
  childId,
  invitedUserId,
  selectedRole, // 'admin', 'contributor', etc.
  currentUser.uid,
  { invitationId: invitation.id }
);
```

## 🧪 Tests recommandés

### Tests manuels

1. **Test Owner** :
   - ✅ Peut tout faire
   - ✅ Peut gérer les permissions

2. **Test Admin** :
   - ✅ Peut créer/modifier des events
   - ✅ Peut liker/commenter
   - ❌ Ne peut pas gérer les permissions

3. **Test Contributor** :
   - ❌ Ne peut pas créer des events
   - ✅ Peut liker/commenter
   - ❌ Ne peut pas gérer les permissions

4. **Test Viewer** :
   - ✅ Peut voir les données
   - ❌ Ne peut pas liker/commenter
   - ❌ Ne peut pas créer des events

### Tests de sécurité Firestore

Utiliser l'émulateur Firebase pour tester les règles :

```bash
firebase emulators:start
```

## 📊 Checklist de déploiement

- [ ] Tester les règles sur un projet de développement
- [ ] Exécuter le script de migration sur dev
- [ ] Vérifier que tous les accès sont créés
- [ ] Tester manuellement les 4 rôles
- [ ] Mettre à jour le code de création d'enfants
- [ ] Ajouter `createdBy` aux events existants (optionnel)
- [ ] Ajouter `userId` aux likes/comments existants (optionnel)
- [ ] Déployer les règles en production
- [ ] Exécuter la migration en production
- [ ] Créer l'UI de gestion des permissions
- [ ] Mettre à jour la documentation utilisateur

## 🆘 En cas de problème

### Les utilisateurs n'ont plus accès après le déploiement

**Solution** : Les données n'ont pas été migrées. Exécuter le script de migration immédiatement.

### Erreur "Missing or insufficient permissions"

**Cause** : Le document d'accès n'existe pas pour cet utilisateur.

**Solution** : Vérifier que le document `children/{childId}/access/{uid}` existe.

### Le owner ne peut pas gérer les permissions

**Cause** : Le rôle n'est pas `'owner'` mais peut-être `'admin'`.

**Solution** : Vérifier le document d'accès et mettre à jour si nécessaire :

```typescript
await updateChildAccess(childId, ownerId, { role: 'owner' });
```

## 📞 Besoin d'aide ?

- Documentation complète : [`docs/PERMISSIONS.md`](/docs/PERMISSIONS.md)
- Exemples de code : [`components/suivibaby/PermissionsExample.tsx`](/components/suivibaby/PermissionsExample.tsx)
- Règles Firestore : [`firestore.rules`](/firestore.rules)
