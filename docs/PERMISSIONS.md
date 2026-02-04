# Système de Permissions SuiviBaby

## Vue d'ensemble

SuiviBaby utilise un système de permissions basé sur des rôles pour contrôler l'accès aux données des enfants. Chaque parent peut avoir un rôle différent avec des permissions spécifiques.

## Architecture

### Structure Firestore

```
children/{childId}
├── ownerId: string
├── parentIds: string[]
└── access/{userId}
    ├── role: "owner" | "admin" | "contributor" | "viewer"
    ├── canWriteEvents: boolean
    ├── canWriteLikes: boolean
    ├── canWriteComments: boolean
    ├── grantedBy: string
    ├── grantedAt: Timestamp
    └── invitationId?: string
```

## Rôles

### 👑 Owner (Propriétaire)
- **Permissions** : Contrôle total
- **Peut** :
  - ✅ Lire toutes les données
  - ✅ Créer/modifier/supprimer les events
  - ✅ Liker et commenter
  - ✅ Gérer les permissions des autres utilisateurs
  - ✅ Supprimer l'enfant
- **Cas d'usage** : Le parent principal qui a créé le profil de l'enfant

### 🔧 Admin (Administrateur)
- **Permissions** : Lecture/écriture complète, sauf gestion des permissions
- **Peut** :
  - ✅ Lire toutes les données
  - ✅ Créer/modifier/supprimer les events
  - ✅ Liker et commenter
  - ❌ Gérer les permissions
- **Cas d'usage** : Le deuxième parent, co-responsable du suivi

### ✍️ Contributor (Contributeur)
- **Permissions** : Lecture complète, écriture limitée aux interactions sociales
- **Peut** :
  - ✅ Lire toutes les données
  - ✅ Liker et commenter
  - ❌ Créer/modifier les events
  - ❌ Gérer les permissions
- **Cas d'usage** : Grands-parents, nounous, amis proches qui suivent l'enfant

### 👁️ Viewer (Observateur)
- **Permissions** : Lecture seule
- **Peut** :
  - ✅ Lire toutes les données
  - ❌ Liker ou commenter
  - ❌ Créer/modifier les events
  - ❌ Gérer les permissions
- **Cas d'usage** : Famille éloignée, amis qui veulent juste suivre

## Utilisation dans le code

### 1. Vérifier les permissions avec le hook

```tsx
import { useChildPermissions } from '@/hooks/useChildPermissions';

function EventScreen({ childId }: { childId: string }) {
  const permissions = useChildPermissions(childId, currentUser?.uid);

  if (permissions.loading) {
    return <LoadingSpinner />;
  }

  if (!permissions.hasAccess) {
    return <NoAccessScreen />;
  }

  return (
    <View>
      <EventsList childId={childId} />

      {/* Afficher le bouton uniquement si l'utilisateur peut créer des events */}
      {permissions.canWriteEvents && (
        <AddEventButton childId={childId} />
      )}

      {/* Afficher les likes uniquement si l'utilisateur peut liker */}
      {permissions.canWriteLikes && (
        <LikeButton eventId={eventId} />
      )}
    </View>
  );
}
```

### 2. Accorder l'accès à un nouvel utilisateur

```tsx
import { grantChildAccess } from '@/utils/permissions';

async function inviteParent(childId: string, invitedUserId: string) {
  await grantChildAccess(
    childId,
    invitedUserId,
    'admin', // Rôle à attribuer
    currentUser.uid // Qui donne l'accès
  );
}
```

### 3. Gérer les permissions (écran de gestion)

```tsx
import { useChildAccesses } from '@/hooks/useChildPermissions';
import { updateChildAccess, revokeChildAccess } from '@/utils/permissions';

function ManageAccessScreen({ childId }: { childId: string }) {
  const { accesses, loading } = useChildAccesses(childId);
  const myPermissions = useChildPermissions(childId, currentUser?.uid);

  if (!myPermissions.canManageAccess) {
    return <Text>Vous n'avez pas la permission de gérer les accès</Text>;
  }

  const handleChangeRole = async (userId: string, newRole: ChildRole) => {
    await updateChildAccess(childId, userId, { role: newRole });
  };

  const handleRevoke = async (userId: string) => {
    await revokeChildAccess(childId, userId);
  };

  return (
    <FlatList
      data={Object.entries(accesses)}
      renderItem={({ item: [userId, access] }) => (
        <UserAccessItem
          userId={userId}
          access={access}
          onChangeRole={(role) => handleChangeRole(userId, role)}
          onRevoke={() => handleRevoke(userId)}
        />
      )}
    />
  );
}
```

### 4. Créer un enfant avec le bon accès

```tsx
import { createOwnerAccess } from '@/utils/permissions';
import { doc, setDoc } from 'firebase/firestore';

async function createChild(childData: any, ownerId: string) {
  const childRef = doc(collection(db, 'children'));

  // 1. Créer le document enfant
  await setDoc(childRef, {
    ...childData,
    ownerId,
    parentIds: [ownerId],
  });

  // 2. Créer l'accès owner
  await createOwnerAccess(childRef.id, ownerId);
}
```

## Migration des données existantes

Un script de migration est fourni pour créer les documents d'accès pour les enfants existants :

```bash
# IMPORTANT: Tester d'abord sur un environnement de dev !
npx ts-node scripts/migratePermissions.ts
```

Le script :
1. Récupère tous les enfants existants
2. Identifie l'owner (champ `ownerId` ou premier `parentId`)
3. Crée le document d'accès `owner` pour l'owner
4. Crée les documents d'accès `admin` pour les autres parents dans `parentIds`

## Règles de sécurité Firestore

Les règles Firestore sont configurées dans [`firestore.rules`](/firestore.rules) pour :
- Vérifier les permissions côté serveur
- Empêcher les modifications non autorisées
- Valider les champs `createdBy`, `userId` pour éviter l'usurpation d'identité

## Bonnes pratiques

### ✅ À faire
- Toujours vérifier `permissions.hasAccess` avant d'afficher des données
- Utiliser les permissions pour afficher/masquer les boutons d'action
- Vérifier `canManageAccess` avant d'afficher l'écran de gestion
- Gérer l'état `loading` pour une meilleure UX

### ❌ À éviter
- Ne jamais bypasser les vérifications de permissions côté client
- Ne pas faire confiance uniquement au client (les règles Firestore sont la source de vérité)
- Ne pas oublier de vérifier `permissions.error` en cas de problème réseau

## Tests

Pour tester les permissions :

```bash
# Tester les règles Firestore
npm run test:firestore-rules

# Tester les hooks
npm run test:hooks
```

## FAQ

**Q: Que se passe-t-il si je supprime le document d'accès d'un owner ?**
R: Les règles Firestore empêchent cette action. Un owner ne peut pas supprimer son propre accès.

**Q: Peut-on avoir plusieurs owners ?**
R: Non, par design il n'y a qu'un seul owner par enfant. Les autres parents sont admin.

**Q: Comment transférer la propriété ?**
R: Il faut que l'owner actuel change son rôle en `admin` et le nouveau owner en `owner`.

**Q: Les permissions sont-elles mises à jour en temps réel ?**
R: Oui, le hook `useChildPermissions` utilise `onSnapshot` pour des mises à jour en temps réel.
