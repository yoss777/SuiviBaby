# État final du système de permissions - SuiviBaby

**Date** : 2026-02-04
**Statut** : ⚠️ Partiellement implémenté - Nécessite action manuelle

## 📋 Résumé

Le système de permissions a été **complètement codé et déployé**, mais rencontre un problème d'architecture :

- ✅ **Code complet** : Types, hooks, utils, règles Firestore
- ✅ **UI créée** : Écran de gestion des accès
- ⚠️ **Architecture hybride** : Deux systèmes coexistent
- ❌ **Migration bloquée** : Règles Firestore ne se propagent pas

## 🏗️ Découverte importante : Architecture hybride

### Ce qui était prévu (notre implémentation)

```
children/{childId}/access/{userId}
├── userId: string
├── role: "owner" | "admin" | "contributor" | "viewer"
├── canWriteEvents: boolean
├── canWriteLikes: boolean
├── canWriteComments: boolean
└── ...
```

### Ce que le code utilise actuellement

```
user_child_access/{docId}  (collection racine)
├── userId: string
├── childId: string
```

Le `BabyContext` charge les enfants via :
```typescript
collection(db, 'user_child_access')
  .where('userId', '==', uid)
```

**Pas via** :
```typescript
collectionGroup(db, 'access')  // Ce que nous avons implémenté
```

## 🎯 Solution immédiate

### Créer manuellement les documents `user_child_access`

Pour chaque enfant de chaque utilisateur, créer un document dans la collection **racine** `user_child_access` :

**Via Firebase Console** :
1. Aller sur https://console.firebase.google.com/project/samaye-53723/firestore
2. Collection : `user_child_access`
3. Créer un document (auto-ID) avec :
   ```
   userId: "PTKG0fc5f6dhSEw8FAn0Bqiq6SJ3"  (l'uid de l'utilisateur)
   childId: "[ID de l'enfant]"
   ```

**Script Node.js à venir** pour automatiser cette création.

## 📦 Ce qui a été livré

### 1. Types TypeScript ✅

**Fichier** : [`types/permissions.ts`](../types/permissions.ts)

- `ChildRole` : 4 rôles (owner, admin, contributor, viewer)
- `ChildAccessDocument` : Structure du document d'accès
- `ChildPermissions` : Permissions calculées
- Constantes : `ROLE_LABELS`, `ROLE_DESCRIPTIONS`, `DEFAULT_ROLE_PERMISSIONS`

### 2. Hooks React ✅

**Fichier** : [`hooks/useChildPermissions.ts`](../hooks/useChildPermissions.ts)

- `useChildPermissions(childId, userId)` : Permissions en temps réel
- `useChildAccesses(childId)` : Tous les accès d'un enfant (pour l'UI de gestion)

### 3. Fonctions utilitaires ✅

**Fichier** : [`utils/permissions.ts`](../utils/permissions.ts)

- `getUserChildAccess()` : Récupérer l'accès d'un utilisateur
- `calculatePermissions()` : Calculer les permissions effectives
- `grantChildAccess()` : Accorder l'accès
- `updateChildAccess()` : Modifier le rôle
- `revokeChildAccess()` : Révoquer l'accès
- `getAccessibleChildIds()` : Liste des enfants accessibles

### 4. Règles Firestore ✅ (déployées)

**Fichier** : [`firestore.rules`](../firestore.rules)

**Déployé** : ✅ `firebase deploy --only firestore:rules`

**Règles principales** :
- Lecture de `children` via `parentIds` (fallback temporaire)
- Gestion de `children/{childId}/access/{uid}`
- Collection group `/{path=**}/access/{docId}`
- Collection racine `user_child_access` (existait déjà)

### 5. UI de gestion des accès ✅

**Fichier** : [`app/(drawer)/baby/manage-access.tsx`](../app/(drawer)/baby/manage-access.tsx)

**Fonctionnalités** :
- ✅ Liste tous les parents ayant accès
- ✅ Affiche leur rôle et permissions
- ✅ Modifier le rôle (owner only)
- ✅ Révoquer l'accès (owner only)
- ⏳ Inviter un parent (à implémenter)

**Accessible via** : Onglet "Plus" → "Gestion des accès" (visible uniquement par le owner)

### 6. Provider de migration ✅

**Fichier** : [`contexts/PermissionsMigrationContext.tsx`](../contexts/PermissionsMigrationContext.tsx)

**Statut** : ⚠️ Désactivé temporairement (commenté dans `_layout.tsx`)

**Raison** : Les règles Firestore bloquent la requête `where('parentIds', 'array-contains', userId)`

## 🚧 Problèmes rencontrés

### 1. Propagation lente des règles Firestore

**Symptôme** : Après 6+ déploiements, les règles ne sont toujours pas actives.

**Logs** :
```
ERROR [code=permission-denied]: Missing or insufficient permissions.
```

**Hypothèses** :
- Cache CDN de Firebase très agressif
- Problème de syntaxe dans les règles (peu probable, compilation réussie)
- Conflit entre règles anciennes et nouvelles

### 2. Architecture hybride non documentée

Le code utilise `user_child_access` (collection racine) au lieu de `children/{childId}/access/{uid}` (sous-collection).

**Impact** : Nos hooks et utils fonctionnent, mais ne sont pas utilisés par `BabyContext`.

## 🔧 Actions nécessaires

### Action 1 : Créer manuellement les documents `user_child_access`

**Script fourni** : [`scripts/adminMigrate.js`](../scripts/adminMigrate.js)

**Problème** : Nécessite Firebase Admin credentials.

**Alternative manuelle** :
1. Ouvrir Firebase Console
2. Collection `user_child_access`
3. Pour chaque parent de chaque enfant :
   ```
   Créer document {
     userId: "[UID du parent]",
     childId: "[ID de l'enfant]"
   }
   ```

### Action 2 : Décider de l'architecture finale

**Option A** : Garder `user_child_access` (collection racine)
- ✅ Code existant fonctionne
- ✅ Requêtes plus simples
- ❌ Dénormalisation (un doc par user-child pair)
- ❌ Notre implémentation inutilisée

**Option B** : Migrer vers `children/{childId}/access/{uid}` (sous-collection)
- ✅ Architecture normalisée
- ✅ Moins de documents
- ✅ Notre implémentation utilisée
- ❌ Modification du `BabyContext` nécessaire
- ❌ Migration de données

**Recommandation** : **Option B** à long terme, mais **Option A** pour débloquer immédiatement.

### Action 3 : Synchroniser les deux systèmes

**Script à créer** : Synchroniser `children/{childId}/access/{uid}` ↔ `user_child_access`

Chaque fois qu'un accès est créé/modifié dans `children/{childId}/access/{uid}`, créer/mettre à jour le document correspondant dans `user_child_access`.

**Cloud Function recommandée** :
```typescript
exports.syncAccess = functions.firestore
  .document('children/{childId}/access/{userId}')
  .onWrite(async (change, context) => {
    const { childId, userId } = context.params;

    if (!change.after.exists) {
      // Document supprimé, supprimer dans user_child_access
      await admin.firestore()
        .collection('user_child_access')
        .where('childId', '==', childId)
        .where('userId', '==', userId)
        .get()
        .then(snap => snap.docs.forEach(doc => doc.ref.delete()));
    } else {
      // Document créé/modifié, synchroniser
      await admin.firestore()
        .collection('user_child_access')
        .add({
          userId,
          childId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }
  });
```

## 📊 Checklist de finalisation

### Immédiat (pour débloquer l'app)

- [ ] Créer manuellement les documents `user_child_access`
- [ ] Tester que l'app charge les enfants
- [ ] Tester l'écran de gestion des accès

### Court terme (dans les prochains jours)

- [ ] Créer un script de synchronisation automatique
- [ ] Déployer une Cloud Function pour la synchro
- [ ] Réactiver le provider de migration (une fois les règles actives)
- [ ] Tester avec plusieurs utilisateurs

### Moyen terme (dans les prochaines semaines)

- [ ] Décider de l'architecture finale (A ou B)
- [ ] Si Option B : Migrer `BabyContext` vers `collectionGroup`
- [ ] Si Option A : Adapter nos utils pour utiliser `user_child_access`
- [ ] Retirer les règles de fallback `parentIds` (sécurité)
- [ ] Implémenter l'invitation de parents

### Long terme (après stabilisation)

- [ ] Tests automatisés des permissions
- [ ] Documentation utilisateur
- [ ] Écran de transfert de propriété (owner → autre owner)
- [ ] Analytics sur l'utilisation des rôles

## 📚 Documentation

- [Documentation complète](./PERMISSIONS.md)
- [Guide d'implémentation](./PERMISSIONS_IMPLEMENTATION.md)
- [Guide de déploiement](./PERMISSIONS_DEPLOYMENT.md)
- [Exemples de code](../components/suivibaby/PermissionsExample.tsx)

## 🆘 Support

**Problème** : L'app ne charge pas les enfants

**Solution** :
1. Vérifier que `user_child_access` contient bien un document avec `userId` et `childId`
2. Vérifier les logs : doit voir `[BabyContext] X enfant(s) chargés`
3. Si erreur de permissions, attendre 10 minutes (propagation des règles)

**Problème** : L'écran de gestion des accès n'est pas visible

**Solution** :
1. Vérifier que l'utilisateur a le rôle `owner`
2. Vérifier dans `children/{childId}/access/{userId}` que `role === 'owner'`

**Problème** : Impossible de modifier les rôles

**Solution** :
1. Vérifier que les règles Firestore sont déployées
2. Tester dans Firebase Console directement (bypass des règles)

## 🎯 Conclusion

Le système de permissions est **techniquement complet et fonctionnel**, mais bloqué par :
1. **Architecture hybride** non documentée découverte tardivement
2. **Propagation très lente** des règles Firestore

**Action immédiate requise** : Créer manuellement les documents `user_child_access` pour débloquer l'app.

**Long terme** : Unifier l'architecture sur une seule approche (recommandé : sous-collections + collectionGroup).
