# Scripts de gestion des permissions

Ce dossier contient les scripts pour gérer le système de permissions de SuiviBaby.

## Scripts disponibles

### 1. Migration des permissions (`migratePermissions.ts`)

Crée les documents d'accès pour les enfants existants.

**⚠️ IMPORTANT** : À exécuter UNE SEULE FOIS après le déploiement des nouvelles règles Firestore.

```bash
# 1. Mettre à jour la config Firebase dans le script
# 2. Tester d'abord sur un environnement de développement
npx ts-node scripts/migratePermissions.ts
```

**Ce que fait le script** :
- Récupère tous les enfants existants
- Identifie l'owner (champ `ownerId` ou premier `parentId`)
- Crée le document d'accès `owner` pour l'owner
- Crée les documents d'accès `admin` pour les autres parents dans `parentIds`

**Résultat attendu** :
```
🚀 Début de la migration des permissions...

📊 5 enfants trouvés

👶 Traitement de l'enfant: abc123
  ✅ ownerId défini: user1
  ✅ Accès owner créé pour user1
  ✅ Accès admin créé pour user2

...

📈 Résumé de la migration:
  ✅ Succès: 5
  ❌ Erreurs: 0
  📊 Total: 5

🎉 Migration terminée avec succès !
```

### 2. Tests des permissions (`testPermissions.ts`)

Teste que les permissions fonctionnent correctement.

```bash
# Exécuter les tests
npx ts-node scripts/testPermissions.ts

# Créer des données de test
npx ts-node scripts/testPermissions.ts setup

# Nettoyer les données de test
npx ts-node scripts/testPermissions.ts cleanup
```

**Tests effectués** :
1. ✅ Owner peut gérer les accès
2. ✅ Admin peut écrire mais pas gérer les accès
3. ✅ Contributor peut liker/commenter mais pas écrire
4. ✅ Viewer peut uniquement lire
5. ✅ Utilisateur sans accès est correctement bloqué

## Configuration

Avant d'exécuter les scripts, mettez à jour la configuration Firebase :

```typescript
const firebaseConfig = {
  apiKey: "votre-api-key",
  authDomain: "votre-auth-domain",
  projectId: "votre-project-id",
  // ... autres configs
};
```

## Ordre d'exécution recommandé

1. **Déployer les règles Firestore** en dev
   ```bash
   firebase use dev
   firebase deploy --only firestore:rules
   ```

2. **Exécuter la migration** en dev
   ```bash
   npx ts-node scripts/migratePermissions.ts
   ```

3. **Tester les permissions** en dev
   ```bash
   npx ts-node scripts/testPermissions.ts
   ```

4. **Déployer en production** seulement si les tests passent
   ```bash
   firebase use production
   firebase deploy --only firestore:rules
   npx ts-node scripts/migratePermissions.ts
   ```

## Dépannage

### Erreur "Cannot find module '@/utils/permissions'"

**Solution** : Assurez-vous que votre `tsconfig.json` contient les alias de chemins :

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

Ou utilisez `ts-node` avec le flag `--require tsconfig-paths/register` :

```bash
npx ts-node -r tsconfig-paths/register scripts/migratePermissions.ts
```

### Erreur "Missing or insufficient permissions"

**Cause** : L'utilisateur exécutant le script n'a pas les permissions Firebase Admin.

**Solution** :
1. Utilisez un compte Firebase Admin
2. Ou configurez les credentials :
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="path/to/serviceAccountKey.json"
   ```

### Le script ne trouve aucun enfant

**Cause** : La config Firebase pointe vers le mauvais projet.

**Solution** : Vérifiez votre `projectId` dans `firebaseConfig`.

## Ressources

- [Documentation complète des permissions](../docs/PERMISSIONS.md)
- [Guide d'implémentation](../docs/PERMISSIONS_IMPLEMENTATION.md)
- Exemples de code (`PermissionsExample.tsx`, supprimé en S13)
