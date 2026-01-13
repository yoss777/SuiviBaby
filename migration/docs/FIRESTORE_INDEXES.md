# 🔥 Configuration des Index Firestore

## ⚠️ IMPORTANT - À FAIRE AVANT LA MIGRATION

Les index Firestore sont **OBLIGATOIRES** pour que la collection `events` fonctionne correctement.
Sans ces index, les queries échoueront avec l'erreur : `FAILED_PRECONDITION: The query requires an index`

---

## 📝 Méthode 1 : Via Firebase Console (Recommandé)

### Étape 1 : Accéder à Firebase Console

1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionnez votre projet **SuiviBaby**
3. Dans le menu de gauche : **Firestore Database** → **Indexes**

### Étape 2 : Créer l'Index Composite 1

Cliquez sur **Create Index** et remplissez :

```
Collection ID: events

Fields indexed:
  - userId        (Ascending)
  - childId       (Ascending)
  - type          (Ascending)
  - date          (Descending)

Query scope: Collection
```

Cliquez sur **Create Index** et attendez que le statut passe à "Enabled" (peut prendre 2-5 minutes).

### Étape 3 : Créer l'Index Composite 2

Cliquez à nouveau sur **Create Index** :

```
Collection ID: events

Fields indexed:
  - userId        (Ascending)
  - childId       (Ascending)
  - date          (Descending)

Query scope: Collection
```

Cliquez sur **Create Index** et attendez l'activation.

---

## 📝 Méthode 2 : Via firestore.indexes.json (Plus rapide)

### Étape 1 : Créer le fichier

Créez un fichier `firestore.indexes.json` à la racine de votre projet :

```json
{
  "indexes": [
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "userId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "childId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "type",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "date",
          "order": "DESCENDING"
        }
      ]
    },
    {
      "collectionGroup": "events",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "userId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "childId",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "date",
          "order": "DESCENDING"
        }
      ]
    }
  ],
  "fieldOverrides": []
}
```

### Étape 2 : Déployer les index

```bash
# Installer Firebase CLI si pas déjà fait
npm install -g firebase-tools

# Se connecter
firebase login

# Déployer les index
firebase deploy --only firestore:indexes
```

**⏱️ Temps d'attente :** Les index prennent 2-10 minutes pour être créés selon la taille de votre base.

---

## ✅ Vérification

### Option 1 : Via Firebase Console

1. Allez dans **Firestore Database** → **Indexes**
2. Vérifiez que les 2 index ont le statut **Enabled** (vert)

### Option 2 : Via l'App

1. Lancez l'app en dev
2. Allez dans **Settings** → **Migration des données**
3. Cliquez sur **🔍 Vérifier l'Intégrité**
4. Si pas d'erreur → Les index fonctionnent !

---

## 🚨 Que faire en cas d'erreur ?

### Erreur : "The query requires an index"

**Cause :** Les index ne sont pas créés ou pas encore activés.

**Solution :**
1. Vérifiez dans Firebase Console que les index sont bien **Enabled**
2. Attendez 2-5 minutes supplémentaires
3. Redémarrez l'app

### Erreur : "Index already exists"

**Cause :** L'index existe déjà.

**Solution :** Parfait ! Vous pouvez passer à la migration.

---

## 📊 Index Créés (Résumé)

### Index 1 : Queries avec filtrage par type
**Utilisation :** `obtenirEvenements(childId, { type: "tetee" })`
```
events
  ├─ userId ↑
  ├─ childId ↑
  ├─ type ↑
  └─ date ↓
```

### Index 2 : Queries sans filtrage (tous les events)
**Utilisation :** `obtenirEvenements(childId)` (timeline complète)
```
events
  ├─ userId ↑
  ├─ childId ↑
  └─ date ↓
```

---

## 💡 Pourquoi ces index ?

Firestore exige des index composites quand on fait :
- Plusieurs `where()` + `orderBy()`
- `where()` avec égalité + `orderBy()` sur un champ différent

Notre cas :
```typescript
query(
  collection(db, "events"),
  where("userId", "==", userId),      // ← Égalité
  where("childId", "==", childId),    // ← Égalité
  where("type", "==", "tetee"),       // ← Égalité (optionnel)
  orderBy("date", "desc")             // ← Tri
)
```

Sans index composite, Firestore ne peut pas optimiser cette query.

---

## 🎯 Prochaines Étapes

Une fois les index créés et activés :

1. ✅ Index visibles dans Firebase Console
2. 🚀 Lancez l'app et testez la migration
3. 📱 Allez dans **Settings** → **Migration des données**
4. 🎯 Cliquez sur **Démarrer la Migration**

---

## 📞 Besoin d'aide ?

- [Documentation Firebase sur les index](https://firebase.google.com/docs/firestore/query-data/indexing)
- Vérifiez les logs de la console : `firebase deploy --only firestore:indexes --debug`
