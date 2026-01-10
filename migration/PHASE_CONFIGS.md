# 🔧 Configuration des Phases de Migration

## Vue d'Ensemble

La migration utilise **deux systèmes de configuration** :

1. **MigrationConfig** : Contrôle les **écritures** (où on écrit les données)
2. **HybridConfig** : Contrôle les **lectures** (d'où on lit les données)

---

## 📊 Configuration par Phase

### Phase 1 : NOT_STARTED
**État** : Utilise l'ancien système uniquement

```typescript
MigrationConfig {
  phase: "OLD_ONLY",
  readFrom: "OLD",
  failOnError: true,
}

HybridConfig {
  mode: "OLD_ONLY",
  preferSource: "OLD",
  deduplicationWindow: 5000,
}
```

**Comportement** :
- ✍️ Écriture : Uniquement dans OLD (tetees, biberons, etc.)
- 👁️ Lecture : Uniquement depuis OLD
- 🎯 Utilisation : App normale avant migration

---

### Phase 2 : MIGRATING
**État** : Migration des données historiques en cours

```typescript
MigrationConfig {
  phase: "OLD_ONLY",
  readFrom: "OLD",
  failOnError: true,
}

HybridConfig {
  mode: "OLD_ONLY",
  preferSource: "OLD",
  deduplicationWindow: 5000,
}
```

**Comportement** :
- ✍️ Écriture : Uniquement dans OLD (continue normalement)
- 👁️ Lecture : Uniquement depuis OLD
- 🔄 En arrière-plan : Script de migration copie OLD → NEW (events)
- 🎯 Utilisation : App continue de fonctionner normalement pendant la migration

---

### Phase 3 : DOUBLE_WRITE ⭐
**État** : Écriture dans les deux systèmes, lecture hybride

```typescript
MigrationConfig {
  phase: "DOUBLE_WRITE",
  readFrom: "NEW",
  failOnError: false,
}

HybridConfig {
  mode: "HYBRID",
  preferSource: "NEW",
  deduplicationWindow: 5000,
}
```

**Comportement** :
- ✍️ **Écriture** : Dans OLD **ET** NEW simultanément
  - OLD génère l'ID
  - NEW utilise le même ID (via `setDoc`)
- 👁️ **Lecture** : Depuis OLD **ET** NEW (mode hybride)
  - Lit des deux sources
  - Déduplication automatique (préfère NEW si doublon)
- ❌ **Erreurs** : Continue même si OLD échoue
- 🎯 **Utilisation** : Phase de transition, toutes les données visibles

**Pourquoi HYBRID ?**
- Les données migrées sont dans OLD et NEW (avec même ID)
- Les nouvelles données créées sont dans OLD et NEW (double-write)
- Déduplication évite les doublons
- Garantit qu'on voit TOUT

---

### Phase 4 : VALIDATION ⭐ (Corrigée)
**État** : Continue le double-write, lecture hybride

```typescript
MigrationConfig {
  phase: "DOUBLE_WRITE",
  readFrom: "NEW",
  failOnError: false,
}

HybridConfig {
  mode: "HYBRID",        // ← CORRIGÉ : Était NEW_ONLY
  preferSource: "NEW",
  deduplicationWindow: 5000,
}
```

**Comportement** :
- ✍️ **Écriture** : Toujours dans OLD **ET** NEW
- 👁️ **Lecture** : Depuis OLD **ET** NEW (mode hybride)
- 🎯 **Utilisation** : Valider que tout fonctionne pendant 7-14 jours

**Pourquoi HYBRID et pas NEW_ONLY ?**
- Les données **migrées** sont copiées dans NEW mais avec `migratedAt`
- Les données **créées en double-write** sont dans OLD et NEW
- Si on lit seulement NEW, on voit les nouvelles données créées APRÈS la migration
- Mais les **anciennes données migrées** ont parfois des champs manquants
- → **HYBRID** garantit qu'on voit TOUT (ancien + nouveau)

**Différence avec DOUBLE_WRITE** :
- Techniquement identique
- Sémantique : "On valide que ça marche"
- Monitoring plus poussé attendu

---

### Phase 5 : COMPLETE (NEW_ONLY)
**État** : Nouveau système uniquement

```typescript
MigrationConfig {
  phase: "NEW_ONLY",
  readFrom: "NEW",
  failOnError: true,
}

HybridConfig {
  mode: "NEW_ONLY",
  preferSource: "NEW",
  deduplicationWindow: 5000,
}
```

**Comportement** :
- ✍️ **Écriture** : Uniquement dans NEW (events)
- 👁️ **Lecture** : Uniquement depuis NEW (events)
- ❌ **Erreurs** : Critiques (failOnError: true)
- 🗑️ **OLD** : Peut être supprimé (après backup)
- 🎯 **Utilisation** : Nouveau système en production

---

## 🔄 Flux de Données par Phase

### NOT_STARTED
```
User Action → OLD Collections (tetees, etc.)
                    ↓
                 OLD Data
                    ↓
              Display to User
```

### DOUBLE_WRITE
```
User Action → eventsDoubleWriteService
                    ↓
         ┌──────────┴──────────┐
         ↓                     ↓
    OLD (tetees)          NEW (events)
    avec ID X             avec ID X (même ID !)
         ↓                     ↓
         └──────────┬──────────┘
                    ↓
          eventsHybridService
          (merge + déduplication)
                    ↓
              Display to User
```

### NEW_ONLY
```
User Action → eventsService
                    ↓
              NEW (events)
                    ↓
              Display to User
```

---

## 🎯 Tableau Récapitulatif

| Phase | Write | Read | OLD Used? | NEW Used? | Dedupe? |
|-------|-------|------|-----------|-----------|---------|
| **NOT_STARTED** | OLD only | OLD only | ✅ | ❌ | N/A |
| **MIGRATING** | OLD only | OLD only | ✅ | ❌ (bg script) | N/A |
| **DOUBLE_WRITE** | OLD + NEW | HYBRID (OLD+NEW) | ✅ | ✅ | ✅ |
| **VALIDATION** | OLD + NEW | HYBRID (OLD+NEW) | ✅ | ✅ | ✅ |
| **COMPLETE** | NEW only | NEW only | ❌ | ✅ | N/A |

---

## 🐛 Problème Identifié et Résolu

### Avant la Correction
```typescript
case 'VALIDATION':
  setHybridConfig({
    mode: 'NEW_ONLY',  // ❌ PROBLÈME !
    ...
  });
```

**Symptôme** :
- Les tétées et biberons migrés n'apparaissaient pas
- Seules les nouvelles données créées en phase VALIDATION s'affichaient

**Cause** :
- Mode `NEW_ONLY` ne lit que depuis `events`
- Les données migrées y sont, mais le listener `ecouterTeteesHybrid` avec mode `NEW_ONLY` ignorait OLD
- Les anciennes données restaient invisibles

### Après la Correction
```typescript
case 'VALIDATION':
  setHybridConfig({
    mode: 'HYBRID',  // ✅ CORRIGÉ !
    preferSource: 'NEW',
    ...
  });
```

**Résultat** :
- ✅ Lit depuis OLD (données migrées + nouvelles en double-write)
- ✅ Lit depuis NEW (données migrées + nouvelles en double-write)
- ✅ Déduplication automatique
- ✅ Toutes les données visibles

---

## 📝 Best Practices

### Quand Utiliser HYBRID
- ✅ Phase DOUBLE_WRITE : Toujours
- ✅ Phase VALIDATION : Toujours
- ✅ Pendant la transition OLD → NEW

### Quand Utiliser NEW_ONLY
- ✅ Phase COMPLETE : Quand OLD est abandonné
- ✅ Après validation complète (plusieurs semaines)
- ✅ Quand toutes les données sont dans NEW

### Quand Utiliser OLD_ONLY
- ✅ Phase NOT_STARTED : Avant migration
- ✅ Rollback : Si problème critique

---

## 🔧 Pour Changer Manuellement la Config

### Via le Code
```typescript
import { setMigrationConfig } from '@/migration/eventsDoubleWriteService';
import { setHybridConfig } from '@/migration/eventsHybridService';

// Forcer mode HYBRID
setHybridConfig({
  mode: 'HYBRID',
  preferSource: 'NEW',
  deduplicationWindow: 5000,
});
```

### Via le Provider
```typescript
// La config est automatique selon la phase
// Mais vous pouvez forcer via advanceToNextPhase() ou rollback()
```

---

## ⚠️ Important

### Ne PAS Utiliser NEW_ONLY Trop Tôt
Si vous passez en NEW_ONLY avant que toutes les données soient dans NEW :
- ❌ Données manquantes
- ❌ Utilisateurs confus
- ❌ Perte apparente de données

### Toujours Valider HYBRID d'Abord
Avant NEW_ONLY :
1. ✅ Valider en HYBRID pendant 7-14 jours minimum
2. ✅ S'assurer que toutes les données sont visibles
3. ✅ Vérifier qu'il n'y a pas de doublons
4. ✅ Confirmer que les IDs sont synchronisés

---

**Date** : 2026-01-08
**Version** : 2.0 (Corrigée)
**Status** : ✅ VALIDATION fixée en mode HYBRID
