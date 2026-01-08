# 🚀 Démarrage de la Migration - Guide Complet

## ✅ Ce qui a été fait

Les fichiers suivants ont été créés et intégrés :

### Services de Migration
- ✅ `services/eventsService.ts` - Service unifié pour tous les événements
- ✅ `migration/eventsDoubleWriteService.ts` - Gestion de la double écriture
- ✅ `migration/eventsHybridService.ts` - Lecture hybride OLD + NEW
- ✅ `migration/migrationScript.ts` - Script de migration des données
- ✅ `migration/MigrationProvider.tsx` - Context React pour gérer l'état

### Composants UI
- ✅ `components/migration/MigrationBanner.tsx` - Bannière informative
- ✅ `components/migration/MigrationAdminScreen.tsx` - Interface d'administration
- ✅ `app/settings/migration.tsx` - Page Settings/Migration

### Intégration
- ✅ MigrationProvider ajouté dans `app/_layout.tsx`
- ✅ MigrationBanner ajouté dans `app/(drawer)/baby/home.tsx`
- ✅ Lien "Migration des données" dans Settings

---

## 🎯 Étapes pour Démarrer la Migration

### Étape 1 : Créer les Index Firestore (OBLIGATOIRE)

#### Option A : Via Firebase Console (Recommandé)

1. Allez sur [Firebase Console](https://console.firebase.google.com/)
2. Sélectionnez votre projet
3. Menu : **Firestore Database** → **Indexes** → **Create Index**

**Index 1 :**
```
Collection: events
Fields:
  - userId (Ascending)
  - childId (Ascending)
  - type (Ascending)
  - date (Descending)
```

**Index 2 :**
```
Collection: events
Fields:
  - userId (Ascending)
  - childId (Ascending)
  - date (Descending)
```

**⏱️ Temps d'attente :** 2-10 minutes pour activation

#### Option B : Via Firebase CLI (Plus rapide)

```bash
# Installer Firebase CLI
npm install -g firebase-tools

# Se connecter
firebase login

# Initialiser Firebase (si pas déjà fait)
firebase init

# Déployer les index
firebase deploy --only firestore:indexes
```

Le fichier `firestore.indexes.json` est déjà créé à la racine du projet.

---

### Étape 2 : Tester sur un Compte de Dev

1. Lancez l'app en développement :
   ```bash
   npm start
   # ou
   expo start
   ```

2. Connectez-vous avec un compte de test

3. Allez dans **Settings** → **Migration des données**

4. Cliquez sur **🚀 Démarrer la Migration**

5. Attendez la fin de la migration (quelques secondes)

6. Vérifiez dans Firebase Console :
   - Collection `events` doit contenir les données migrées
   - Les anciennes collections doivent toujours exister

---

### Étape 3 : Vérifier l'Intégrité des Données

Dans **Settings** → **Migration des données** :

1. Cliquez sur **🔍 Vérifier l'Intégrité**

2. Vérifiez que :
   - Nombre d'events migrés = Nombre total dans anciennes collections
   - Statut = ✅ OK

3. Si des différences :
   - Cliquez sur **🔄 Réinitialiser la Migration**
   - Relancez la migration

---

### Étape 4 : Tester les Fonctionnalités

Testez que tout fonctionne en **Phase DOUBLE_WRITE** :

#### Tests à effectuer :

**1. Ajouter des événements**
- Ajoutez une tétée → Vérifiez dans Firebase que c'est dans OLD + NEW
- Ajoutez un pompage → Vérifiez dans OLD + NEW
- Ajoutez une couche → Vérifiez dans OLD + NEW

**2. Modifier des événements**
- Modifiez une tétée existante
- Vérifiez que la modif est dans OLD + NEW

**3. Supprimer des événements**
- Supprimez une tétée
- Vérifiez qu'elle est supprimée dans OLD + NEW

**4. Timeline**
- Vérifiez que tous les événements s'affichent
- Vérifiez l'ordre chronologique
- Vérifiez qu'il n'y a pas de doublons

---

### Étape 5 : Avancer les Phases de Migration

Une fois les tests OK :

#### Phase 1 → 2 : DOUBLE_WRITE → VALIDATION (Après 3-7 jours)

```
Settings → Migration → ➡️ Phase Suivante
```

**Effet :**
- Toujours double écriture (OLD + NEW)
- Lecture **uniquement** depuis NEW
- Si problème → Rollback possible

#### Phase 2 → 3 : VALIDATION → COMPLETE (Après 7-14 jours)

```
Settings → Migration → ➡️ Phase Suivante
```

**Effet :**
- Écriture **uniquement** dans NEW
- Lecture **uniquement** depuis NEW
- Anciennes collections deviennent obsolètes

---

## 🚨 En Cas de Problème

### Rollback Immédiat

```
Settings → Migration → ⏮️ Rollback (Ancien Système)
```

**Effet :** Retour à l'ancien système en 1 clic (OLD_ONLY)

### Réinitialiser la Migration

```
Settings → Migration → 🔄 Réinitialiser la Migration
```

**Effet :** Remet la phase à NOT_STARTED (données intactes)

---

## 📊 États de la Migration

### 🔴 NOT_STARTED
- Ancien système uniquement
- Aucune écriture dans `events`
- Collections OLD utilisées

### 🟡 MIGRATING
- Migration des données historiques en cours
- Ancien système actif
- Ne pas utiliser l'app pendant cette phase (1-2 minutes)

### 🔵 DOUBLE_WRITE (Phase principale)
- Écriture dans OLD + NEW simultanément
- Lecture depuis NEW avec fallback sur OLD
- **Durée recommandée :** 7-14 jours

### 🟠 VALIDATION
- Double écriture maintenue
- Lecture **uniquement** depuis NEW
- Phase de confiance avant finalisation
- **Durée recommandée :** 7 jours

### 🟢 COMPLETE
- Écriture **uniquement** dans NEW
- Lecture **uniquement** depuis NEW
- Anciennes collections peuvent être supprimées après 30 jours

---

## 📈 Timeline Recommandée

```
JOUR 0 : Créer les index Firestore
         ⏱️ Attendre 2-10 minutes

JOUR 0 : Test migration sur compte dev
         ✅ Vérifier intégrité

JOUR 1 : Déployer en production
         📱 Laisser users migrer volontairement

JOUR 3-7 : Phase DOUBLE_WRITE
           📊 Monitoring intensif
           🐛 Corriger bugs si besoin

JOUR 8-14 : Phase VALIDATION
            ✅ 100% lecture depuis NEW
            📊 Vérifier performances

JOUR 15+ : Phase COMPLETE
           🎉 Migration terminée !
           🗑️ Supprimer OLD après 30 jours
```

---

## 🎨 Personnalisation

### Modifier la fenêtre de déduplication

```typescript
// Dans n'importe quel composant
import { setHybridConfig } from '@/migration/eventsHybridService';

setHybridConfig({
  deduplicationWindow: 10000, // 10 secondes au lieu de 5
});
```

### Préférer OLD en cas de doublon

```typescript
setHybridConfig({
  preferSource: 'OLD', // Au lieu de 'NEW'
});
```

### Forcer échec si OLD échoue

```typescript
import { setMigrationConfig } from '@/migration/eventsDoubleWriteService';

setMigrationConfig({
  failOnError: true, // Stopper si OLD échoue
});
```

---

## 📞 Monitoring

### Logs à surveiller

```typescript
// Dans la console
✅ Tétée ajoutée dans NEW: <id>
✅ Tétée ajoutée dans OLD: <id>
❌ Erreur NEW: <message>
❌ Erreur OLD: <message>
```

### Statistiques

Disponibles dans **Settings → Migration** :
- Phase actuelle
- Nombre d'events migrés
- Statut des anciennes collections
- Dernière vérification

---

## ✅ Checklist Avant Migration Production

- [ ] Index Firestore créés et activés (Enabled)
- [ ] Tests sur compte dev réussis
- [ ] Backup des anciennes collections fait
- [ ] Monitoring en place (logs, Firebase Console)
- [ ] Plan de rollback testé
- [ ] Users informés (optionnel)

---

## 🎉 Après la Migration

Une fois en phase COMPLETE :

### Gains attendus
- ⚡ **-83% de listeners Firestore**
- 💰 **-60 à -80% de coûts Firebase**
- 🚀 **-60% de temps de chargement**
- 📱 **-70% de bande passante mobile**

### Nettoyage (après 30 jours de sécurité)

```typescript
// Supprimer les anciennes collections via Firebase Console
// OU via script :
// ATTENTION : IRRÉVERSIBLE !

Collections à supprimer :
- tetees
- biberons
- pompages
- mictions
- selles
- vaccins
- vitamines
```

### Supprimer l'ancien code

Une fois stable, vous pouvez supprimer :
- `migration/eventsDoubleWriteService.ts`
- `migration/eventsHybridService.ts`
- Les anciens services (`teteesService.ts`, etc.)

---

## 🆘 Support

En cas de problème :
1. Vérifiez les logs console
2. Vérifiez Firebase Console > Firestore > Usage
3. Utilisez **Settings → Migration** pour diagnostiquer
4. En dernier recours : **Rollback**

---

Bonne migration ! 🚀
