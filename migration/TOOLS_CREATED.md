# 🛠️ Outils de Monitoring Créés

## Date : 2026-01-08

---

## 📦 Fichiers Créés

### 1. Script de Vérification des IDs
**Fichier** : [migration/verifySync.ts](verifySync.ts)

**Fonctions principales** :
- `verifyFullSync(childId)` : Vérifie la synchronisation pour tous les types
- `compareEventData(eventId, oldCollection, newType)` : Compare les données d'un événement
- `generateReport(report)` : Génère un rapport lisible

**Usage** :
```typescript
import { verifyFullSync, generateReport } from '@/migration/verifySync';

// Vérifier la synchronisation
const report = await verifyFullSync(childId);
const reportText = generateReport(report);
console.log(reportText);

// Résultat
// {
//   tetees: { both: [...], oldOnly: [...], newOnly: [], syncRate: 100 },
//   summary: { totalBoth: 150, totalOldOnly: 50, totalNewOnly: 0 }
// }
```

### 2. Logger Amélioré
**Fichier** : [migration/monitoringLogger.ts](monitoringLogger.ts)

**Classe** : `MigrationLogger`

**Méthodes principales** :
- `logSuccess()` : Enregistre une opération réussie
- `logError()` : Enregistre une erreur
- `logPartial()` : Enregistre une opération partielle (1 source OK, 1 échec)
- `getStats(hours?)` : Récupère les statistiques
- `generateReport(hours?)` : Génère un rapport de logs

**Usage** :
```typescript
import { MigrationLogger } from '@/migration/monitoringLogger';

// Initialisation (automatique)
await MigrationLogger.initialize();

// Logger une opération
MigrationLogger.logSuccess('tetee', 'create', eventId, 'BOTH');
MigrationLogger.logError('biberon', 'update', eventId, 'OLD', error);
MigrationLogger.logPartial('miction', 'delete', eventId, 'NEW', 'OLD', error);

// Récupérer les stats
const stats = await MigrationLogger.getStats(24); // 24 dernières heures
console.log(`Taux de réussite: ${stats.successRate}%`);

// Générer un rapport
const report = await MigrationLogger.generateReport(24);
console.log(report);
```

### 3. Dashboard de Monitoring
**Fichier** : [components/migration/MigrationMonitoringPanel.tsx](../components/migration/MigrationMonitoringPanel.tsx)

**Composant** : `MigrationMonitoringPanel`

**Fonctionnalités** :
- Onglets 24h / 7 jours / Total
- Stats des opérations de double-write
- Vérification de synchronisation des IDs
- Génération de rapports
- Affichage des erreurs récentes
- Clear des logs

**Intégration** :
Déjà intégré dans `MigrationAdminScreen` - S'affiche automatiquement en phase DOUBLE_WRITE et VALIDATION.

**Accès** :
Settings → Migration → Section "📊 Monitoring VALIDATION"

### 4. Guide de Tests Fonctionnels
**Fichier** : [migration/TESTS_FONCTIONNELS.md](TESTS_FONCTIONNELS.md)

**Contenu** :
- 6 tests détaillés (Ajout, IDs, Modification, Suppression, Timeline, Erreurs)
- Checklist pour chaque type d'événement
- Critères de validation
- Formulaire de rapport de test

### 5. Guide Phase VALIDATION
**Fichier** : [migration/PHASE_VALIDATION.md](PHASE_VALIDATION.md)

**Contenu** :
- Prérequis avant de passer en phase VALIDATION
- Checklist jour par jour (14 jours)
- Critères de succès/échec
- Configuration actuelle
- Actions immédiates

---

## 🎯 Comment Utiliser Ces Outils

### Phase 1 : Tests Initiaux (Maintenant)

1. **Exécuter les tests fonctionnels** :
   - Ouvrir [TESTS_FONCTIONNELS.md](TESTS_FONCTIONNELS.md)
   - Suivre les 6 tests étape par étape
   - Noter les résultats

2. **Vérifier la synchronisation** :
   - Aller dans l'app : Settings → Migration
   - Cliquer "🔍 Vérifier Synchronisation IDs"
   - Vérifier que Taux > 99% et NEW seul = 0

3. **Vérifier les stats** :
   - Dans le même écran, section "📊 Monitoring"
   - Onglet "24h"
   - Vérifier Taux de réussite > 99%

### Phase 2 : Monitoring Quotidien (7-14 jours)

**Chaque jour** :

1. **Ouvrir l'app** → Settings → Migration

2. **Vérifier les stats 24h** :
   - Taux de réussite : devrait être > 99%
   - Erreurs : devrait être < 1%
   - NEW seul : DOIT rester à 0

3. **Si des erreurs** :
   - Consulter la section "Dernière Erreur"
   - Analyser le type et l'opération
   - Vérifier si c'est récurrent

4. **1 fois par semaine** :
   - Cliquer "🔍 Vérifier Synchronisation IDs"
   - S'assurer que le taux reste > 99%

### Phase 3 : Validation Finale (Après 7-14 jours)

1. **Générer les rapports finaux** :
   ```typescript
   // Dans la console
   const report = await MigrationLogger.generateReport(168); // 7 jours
   console.log(report);

   const syncReport = await verifyFullSync(childId);
   console.log(generateReport(syncReport));
   ```

2. **Vérifier les critères** :
   - [ ] Taux de réussite > 99%
   - [ ] Taux de sync > 99%
   - [ ] NEW seul = 0
   - [ ] Pas de doublons dans la timeline
   - [ ] Aucune régression fonctionnelle

3. **Si tous les critères sont OK** :
   - ✅ Validation réussie
   - 🔜 Prêt pour passer en NEW_ONLY

---

## 📊 Interprétation des Résultats

### Statistiques des Logs

**Taux de réussite** :
- **> 99%** : ✅ Excellent - Phase VALIDATION peut continuer
- **95-99%** : ⚠️ Acceptable - Surveiller les erreurs
- **< 95%** : ❌ Problème - Investiguer immédiatement

**Erreurs partielles** :
- **< 1%** : ✅ Normal (problèmes réseau temporaires)
- **1-5%** : ⚠️ Attention - Vérifier la cause
- **> 5%** : ❌ Problème système - Investiguer

### Synchronisation des IDs

**NEW seul** :
- **0** : ✅ Parfait - Tous les IDs sont synchronisés
- **1-5** : ⚠️ Vérifier - Possibles erreurs OLD isolées
- **> 5** : ❌ Problème - Double-write ne fonctionne pas correctement

**OLD seul** :
- **N'importe quel nombre** : ✅ Normal
- Ce sont les données d'avant la migration
- Pas de souci, elles resteront en OLD

**Taux de sync** :
- **> 99%** : ✅ Excellent
- **95-99%** : ⚠️ Acceptable mais vérifier les NEW seul
- **< 95%** : ❌ Problème majeur

### Types d'Erreurs Communes

**"Accès refusé"** :
- ⚠️ Ne devrait PLUS arriver avec les IDs synchronisés
- Si ça arrive, vérifier les Firestore Rules

**"Document not found"** :
- ⚠️ Peut indiquer un problème de synchronisation
- Vérifier que les IDs sont bien synchronisés

**"Unsupported field value: undefined"** :
- ⚠️ Problème dans les données
- Vérifier la fonction `removeUndefined()`

**Erreurs réseau/timeout** :
- ✅ Normal occasionnellement
- Si fréquent : problème de connexion

---

## 🔧 Intégration dans le Code Métier

### Option 1 : Logs Automatiques (Recommandé)

Modifier `eventsDoubleWriteService.ts` pour logger automatiquement :

```typescript
import { MigrationLogger } from './monitoringLogger';

export async function ajouterTetee(childId: string, data: any) {
  const errors: Error[] = [];
  let sharedId: string | null = null;

  // ... code existant ...

  // Phase 1: OLD
  if (config.phase === "DOUBLE_WRITE" || config.phase === "OLD_ONLY") {
    try {
      oldRef = await teteesService.ajouterTetee(childId, data);
      sharedId = oldRef.id;
      console.log("✅ Tétée ajoutée dans OLD:", sharedId);

      // ➕ Logger le succès OLD
      MigrationLogger.logSuccess('tetee', 'create', sharedId, 'OLD');
    } catch (error) {
      console.error("❌ Erreur OLD:", error);
      errors.push(error as Error);

      // ➕ Logger l'erreur OLD
      MigrationLogger.logError('tetee', 'create', sharedId || 'unknown', 'OLD', error as Error);

      if (config.failOnError) throw error;
    }
  }

  // Phase 2: NEW
  if (config.phase === "DOUBLE_WRITE" || config.phase === "NEW_ONLY") {
    try {
      if (sharedId) {
        await ajouterEvenementAvecId(childId, sharedId, newEventData as any);
        console.log("✅ Tétée ajoutée dans NEW avec ID:", sharedId);

        // ➕ Logger le succès BOTH (OLD + NEW)
        MigrationLogger.logSuccess('tetee', 'create', sharedId, 'BOTH');
      } else {
        sharedId = await ajouterEventNouveau(childId, newEventData as any);
        console.log("✅ Tétée ajoutée dans NEW:", sharedId);

        // ➕ Logger le succès NEW seul
        MigrationLogger.logSuccess('tetee', 'create', sharedId, 'NEW');
      }
    } catch (error) {
      console.error("❌ Erreur NEW:", error);
      errors.push(error as Error);

      // ➕ Logger l'erreur ou partial
      if (sharedId) {
        // OLD a réussi, NEW a échoué
        MigrationLogger.logPartial('tetee', 'create', sharedId, 'OLD', 'NEW', error as Error);
      } else {
        // NEW seul a échoué
        MigrationLogger.logError('tetee', 'create', 'unknown', 'NEW', error as Error);
      }

      if (config.failOnError) throw error;
    }
  }

  return sharedId;
}
```

**Avantage** : Logs automatiques pour toutes les opérations
**Inconvénient** : Nécessite modification du code de double-write

### Option 2 : Logs Manuels

Utiliser le logger uniquement quand nécessaire, via la console :

```typescript
// Dans la console de l'app ou via un script
import { MigrationLogger } from '@/migration/monitoringLogger';

// Récupérer les stats
const stats = await MigrationLogger.getStats();
console.log(stats);
```

**Avantage** : Pas de modification du code
**Inconvénient** : Pas de suivi automatique

---

## 📝 Récapitulatif

| Outil | Fichier | Usage | Statut |
|-------|---------|-------|--------|
| Script Vérification IDs | verifySync.ts | Vérifier synchronisation OLD/NEW | ✅ Prêt |
| Logger Amélioré | monitoringLogger.ts | Tracer toutes les opérations | ✅ Prêt |
| Dashboard Monitoring | MigrationMonitoringPanel.tsx | Interface visuelle dans l'app | ✅ Intégré |
| Tests Fonctionnels | TESTS_FONCTIONNELS.md | Guide de tests pas-à-pas | ✅ Prêt |
| Guide VALIDATION | PHASE_VALIDATION.md | Documentation de la phase | ✅ Prêt |

---

## 🚀 Prochaines Actions

1. **Maintenant** :
   - [ ] Exécuter les tests fonctionnels (30-45 min)
   - [ ] Vérifier que tous les tests passent
   - [ ] Noter les résultats

2. **Aujourd'hui** :
   - [ ] Utiliser l'app normalement
   - [ ] Vérifier les stats en fin de journée
   - [ ] S'assurer qu'il n'y a pas d'erreurs critiques

3. **Demain** :
   - [ ] Vérifier les stats 24h
   - [ ] Tester ajout/modification/suppression à nouveau
   - [ ] Vérifier la synchronisation

4. **Cette semaine** :
   - [ ] Monitoring quotidien des stats
   - [ ] Vérification hebdomadaire de la synchronisation
   - [ ] Noter toute anomalie

5. **Semaine prochaine** (Jour 7) :
   - [ ] Vérification complète de synchronisation
   - [ ] Génération des rapports finaux
   - [ ] Décision : continuer ou passer à NEW_ONLY

---

**Date de Création** : 2026-01-08
**Version** : 1.0
**Status** : ✅ Tous les outils prêts
