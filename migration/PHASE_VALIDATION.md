# 🔍 Phase 2 : VALIDATION

## Date de Début : 2026-01-08

---

## 🎯 Objectif de la Phase VALIDATION

La phase VALIDATION consiste à :
1. **Vérifier** que le double-write fonctionne correctement
2. **Comparer** les données entre OLD et NEW collections
3. **Monitorer** les erreurs et anomalies
4. **Confirmer** que la synchronisation des IDs fonctionne
5. **Valider** que l'app est stable avec le système hybride

**Durée recommandée** : 1-2 semaines minimum en production

---

## ✅ Prérequis - Ce qui DOIT être fait avant

### 1. Configuration Actuelle Vérifiée

Dans [eventsDoubleWriteService.ts](../migration/eventsDoubleWriteService.ts) :

```typescript
let config: MigrationConfig = {
  phase: "DOUBLE_WRITE",  // ✅ Correct
  readFrom: "NEW",         // ✅ On lit depuis NEW
  failOnError: false,      // ✅ Continue même si OLD échoue
};
```

**Status actuel** : ✅ Configuration correcte pour VALIDATION

### 2. Tous les Screens Migrés

✅ **10/10 screens** utilisent les services de migration :
- [x] tetees.tsx
- [x] pompages.tsx
- [x] excretions.tsx
- [x] immunos.tsx
- [x] home.tsx
- [x] stats.tsx
- [x] mictions.tsx (composant)
- [x] selles.tsx (composant)
- [x] vaccins.tsx (composant)
- [x] vitamines.tsx (composant)

### 3. Toutes les Fonctions CRUD Complètes

✅ **28/28 fonctions** implémentées (7 types × 4 opérations)

### 4. Tests Fonctionnels de Base

**À FAIRE MAINTENANT** avant de considérer la phase validée :

#### Test 1 : Ajout avec Double-Write
```
1. Ajouter un événement de chaque type
2. Vérifier les logs :
   ✅ XXX ajouté dans OLD: <id>
   ✅ XXX ajouté avec ID spécifique : <id>
   ✅ XXX ajouté dans NEW avec ID: <id>
3. Vérifier dans Firebase Console :
   - Ancien collection (tetees/biberons/etc.) : Document avec <id>
   - Nouvelle collection (events) : Document avec même <id>
```

#### Test 2 : IDs Synchronisés
```
1. Ajouter un événement
2. Noter l'ID retourné (ex: "abc123")
3. Aller dans Firebase Console
4. Vérifier :
   - Collection OLD (ex: tetees/abc123) ✅ Existe
   - Collection NEW (events/abc123) ✅ Existe
```

#### Test 3 : Modification
```
1. Modifier un événement existant
2. Vérifier les logs :
   ✅ XXX modifié dans NEW
   ✅ XXX modifié dans OLD
3. Vérifier dans Firebase que les 2 docs sont modifiés
```

#### Test 4 : Suppression
```
1. Supprimer un événement
2. Vérifier les logs :
   ✅ XXX supprimé dans NEW
   ✅ XXX supprimé dans OLD
3. Vérifier dans Firebase que les 2 docs sont supprimés
```

#### Test 5 : Timeline/Affichage
```
1. Aller sur home.tsx (timeline)
2. Vérifier qu'il n'y a PAS de doublons
3. Vérifier que tous les événements s'affichent
4. Vérifier l'ordre chronologique
```

---

## 📊 Ce qui DOIT être monitoré pendant la phase

### 1. Logs de Double-Write

**Chaque ajout doit montrer** :
```
LOG  ✅ [TYPE] ajouté dans OLD: <id>
LOG  ✅ [TYPE] ajouté avec ID spécifique : <id>
LOG  ✅ [TYPE] ajouté dans NEW avec ID: <id>
```

**Alertes à surveiller** :
```
❌ Erreur OLD: ...     → Note : Acceptable si failOnError: false
❌ Erreur NEW: ...     → CRITIQUE : Doit être investigué immédiatement
```

### 2. Synchronisation des IDs

**Script de vérification à créer** :

```typescript
// migration/verifySync.ts
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/config/firebase";

export async function verifySyncForChild(childId: string) {
  const results = {
    tetees: { oldOnly: [], newOnly: [], both: [] },
    // ... autres types
  };

  // Récupérer tous les IDs de OLD
  const teteesOldSnapshot = await getDocs(
    collection(db, "tetees").where("childId", "==", childId)
  );
  const oldIds = new Set(teteesOldSnapshot.docs.map(d => d.id));

  // Récupérer tous les IDs de NEW (events avec type tetee)
  const eventsSnapshot = await getDocs(
    collection(db, "events")
      .where("childId", "==", childId)
      .where("type", "==", "tetee")
  );
  const newIds = new Set(eventsSnapshot.docs.map(d => d.id));

  // Comparer
  for (const id of oldIds) {
    if (newIds.has(id)) {
      results.tetees.both.push(id);
    } else {
      results.tetees.oldOnly.push(id);
    }
  }

  for (const id of newIds) {
    if (!oldIds.has(id)) {
      results.tetees.newOnly.push(id);
    }
  }

  return results;
}
```

**Résultat attendu** :
```
{
  tetees: {
    both: [<tous les nouveaux IDs>],      // ✅ Créés en phase DOUBLE_WRITE
    oldOnly: [<anciens IDs>],              // ✅ Données d'avant la migration
    newOnly: []                            // ⚠️ Ne devrait PAS avoir (sauf si OLD échoue)
  }
}
```

### 3. Erreurs de Synchronisation

**Surveiller dans les logs** :
- Erreurs "Accès refusé" → Ne devrait plus apparaître
- Erreurs "Document not found" lors de modify/delete → Indique ID désynchronisé
- Erreurs Firestore lors d'écriture → Problème de permissions ou de données

### 4. Performance

**Comparer les temps de réponse** :
- Temps d'ajout (double-write vs OLD seul)
- Temps de chargement timeline
- Latence ressentie par l'utilisateur

---

## 🔍 Outils de Monitoring à Créer

### 1. Script de Comparaison de Données

```typescript
// migration/compareCollections.ts
export async function compareData(childId: string, eventId: string) {
  // Récupérer depuis OLD
  const oldDoc = await getDoc(doc(db, "tetees", eventId));
  const oldData = oldDoc.data();

  // Récupérer depuis NEW
  const newDoc = await getDoc(doc(db, "events", eventId));
  const newData = newDoc.data();

  // Comparer les champs importants
  const diffs = [];

  if (oldData.date !== newData.date) {
    diffs.push({ field: "date", old: oldData.date, new: newData.date });
  }

  // ... comparer autres champs

  return {
    identical: diffs.length === 0,
    differences: diffs
  };
}
```

### 2. Dashboard de Monitoring (optionnel)

Ajouter dans [app/settings/migration.tsx](../app/settings/migration.tsx) :

```typescript
// Section "Statistiques de Synchronisation"
- Événements en double-write : XXX
- Événements OLD seulement : XXX (données avant migration)
- Événements NEW seulement : XXX (⚠️ devrait être 0)
- Taux de réussite double-write : XX%
- Erreurs dernières 24h : XX
```

### 3. Logs Structurés

Améliorer les logs dans eventsDoubleWriteService.ts :

```typescript
// Au lieu de console.log simple
const logDoubleWrite = (type: string, operation: string, id: string, status: "success" | "error", source: "OLD" | "NEW") => {
  const timestamp = new Date().toISOString();
  const log = {
    timestamp,
    type,
    operation,
    id,
    status,
    source,
  };

  console.log(JSON.stringify(log));

  // Optionnel : Envoyer à un service de monitoring (Sentry, etc.)
};
```

---

## 📅 Checklist Jour par Jour

### Jour 1-2 : Tests Initiaux
- [ ] Exécuter les 5 tests fonctionnels de base
- [ ] Vérifier qu'il n'y a pas d'erreurs critiques
- [ ] Comparer manuellement 5-10 événements entre OLD et NEW
- [ ] Vérifier les IDs synchronisés pour tous les types

### Jour 3-7 : Monitoring Quotidien
- [ ] Vérifier les logs quotidiens
- [ ] Compter les erreurs (si < 1% → OK)
- [ ] Vérifier qu'aucun doublon dans la timeline
- [ ] Tester ajout/modification/suppression chaque type

### Jour 8-14 : Validation Finale
- [ ] Créer et exécuter le script de comparaison de données
- [ ] Vérifier la synchronisation sur TOUS les événements
- [ ] S'assurer que `newOnly` est vide (ou uniquement des cas d'échec OLD connus)
- [ ] Valider les performances

### Fin de Phase
- [ ] Toutes les checklist complétées sans erreur critique
- [ ] Taux de réussite double-write > 99%
- [ ] Aucune régression fonctionnelle
- [ ] Utilisateurs satisfaits de la stabilité

---

## 🚨 Critères de Blocage

**NE PAS passer à NEW_ONLY si** :
- ❌ Des événements créés en DOUBLE_WRITE ne sont pas synchronisés
- ❌ Plus de 1% d'échecs de double-write
- ❌ Des doublons apparaissent dans la timeline
- ❌ Des erreurs "Accès refusé" persistent
- ❌ Des différences de données entre OLD et NEW (pour les mêmes IDs)

---

## ✅ Critères de Succès

**Passer à NEW_ONLY quand** :
- ✅ 100% des nouveaux événements ont des IDs synchronisés
- ✅ Taux de réussite double-write > 99%
- ✅ Aucun doublon dans la timeline
- ✅ Aucune erreur critique pendant 7 jours
- ✅ Tous les tests manuels passent
- ✅ Performance acceptable
- ✅ Script de comparaison confirme la cohérence

---

## 📝 Configuration Actuelle (Phase VALIDATION)

### eventsDoubleWriteService.ts

```typescript
let config: MigrationConfig = {
  phase: "DOUBLE_WRITE",  // ✅ Continue de faire double-write
  readFrom: "NEW",         // ✅ On lit depuis NEW pour valider
  failOnError: false,      // ✅ Permet de continuer même si OLD échoue
};
```

### eventsHybridService.ts

```typescript
let config: HybridReadConfig = {
  mode: "HYBRID",              // ✅ Lit des 2 sources
  preferSource: "NEW",          // ✅ Préfère NEW en cas de doublon
  deduplicationWindow: 5000,    // ✅ Fenêtre de déduplication
};
```

**⚠️ Aucun changement de config nécessaire pour l'instant**

---

## 🎯 Actions Immédiates

### 1. Tests Fonctionnels (À FAIRE MAINTENANT)

**Exécuter les 5 tests de base** listés ci-dessus et noter les résultats :

```
Test 1 - Ajout avec Double-Write
  [ ] Tétée : ✅ / ❌
  [ ] Biberon : ✅ / ❌
  [ ] Miction : ✅ / ❌
  [ ] Selle : ✅ / ❌
  [ ] Pompage : ✅ / ❌
  [ ] Vaccin : ✅ / ❌
  [ ] Vitamine : ✅ / ❌

Test 2 - IDs Synchronisés
  [ ] Vérification manuelle Firebase : ✅ / ❌

Test 3 - Modification
  [ ] Modification réussie : ✅ / ❌
  [ ] Logs corrects : ✅ / ❌

Test 4 - Suppression
  [ ] Suppression réussie : ✅ / ❌
  [ ] Logs corrects : ✅ / ❌

Test 5 - Timeline
  [ ] Pas de doublons : ✅ / ❌
  [ ] Tous les événements affichés : ✅ / ❌
```

### 2. Créer le Script de Vérification (Optionnel mais Recommandé)

Créer `migration/verifySync.ts` avec la fonction de vérification des IDs.

### 3. Monitoring des 7 Prochains Jours

- Noter chaque jour s'il y a des erreurs
- Vérifier quotidiennement Firebase Console
- Tester régulièrement ajout/modification/suppression

---

## 🔜 Prochaine Phase : NEW_ONLY

**Quand la validation est réussie**, nous passerons à :

```typescript
let config: MigrationConfig = {
  phase: "NEW_ONLY",     // 🎯 Écrit UNIQUEMENT dans NEW
  readFrom: "NEW",        // 🎯 Lit UNIQUEMENT depuis NEW
  failOnError: true,      // 🎯 Les erreurs sont critiques
};
```

Mais **PAS AVANT** d'avoir validé pendant 7-14 jours minimum !

---

## 📊 Résumé

| Élément | Status | Action |
|---------|--------|--------|
| Config DOUBLE_WRITE | ✅ Active | Aucune |
| 28 fonctions CRUD | ✅ Complètes | Aucune |
| 10 screens migrés | ✅ Complets | Aucune |
| Tests fonctionnels | ⏳ À faire | **Exécuter maintenant** |
| Monitoring 7j | ⏳ À faire | **Démarrer aujourd'hui** |
| Script de vérification | ⏳ Optionnel | Créer si nécessaire |
| Validation finale | ⏳ En attente | Après 7-14 jours |

---

**Phase Actuelle** : ✅ DOUBLE_WRITE (VALIDATION en cours)

**Prochaine Étape** : Exécuter les 5 tests fonctionnels de base

**Timeline** : 7-14 jours de monitoring avant NEW_ONLY

---

**Date de Création** : 2026-01-08
**Status** : 📝 Documentation complète
**Prochaine Action** : Tests fonctionnels
