# ✅ Tests Fonctionnels - Phase VALIDATION

## Date : 2026-01-08

---

## 🎯 Objectif

Valider que le système de double-write fonctionne correctement pour tous les types d'événements.

**Durée estimée** : 30-45 minutes

---

## 📋 Test 1 : Ajout avec Double-Write

### Pour CHAQUE type d'événement

#### 1.1 Tétée
- [ ] Aller sur l'écran "Tétées"
- [ ] Ajouter une nouvelle tétée
  - Côté gauche : 10 min
  - Côté droit : 8 min
  - Date : Maintenant
- [ ] **Vérifier les logs dans la console** :
  ```
  ✅ Tétée ajoutée dans OLD: <id>
  ✅ tetee ajouté avec ID spécifique : <id>
  ✅ Tétée ajoutée dans NEW avec ID: <id>
  ```
- [ ] **Noter l'ID** : _______________
- [ ] **Vérifier dans Firebase Console** :
  - [ ] Collection `tetees` → Document avec cet ID existe
  - [ ] Collection `events` → Document avec le MÊME ID existe
  - [ ] Les deux documents ont les mêmes données

**Résultat** : ✅ Succès / ❌ Échec
**Notes** : _________________________________

#### 1.2 Biberon
- [ ] Aller sur l'écran "Tétées" (section biberon)
- [ ] Ajouter un nouveau biberon
  - Quantité : 120 ml
  - Date : Maintenant
- [ ] **Vérifier les logs** :
  ```
  ✅ Biberon ajouté dans OLD: <id>
  ✅ biberon ajouté avec ID spécifique : <id>
  ✅ Biberon ajouté dans NEW avec ID: <id>
  ```
- [ ] **Noter l'ID** : _______________
- [ ] **Vérifier dans Firebase Console** :
  - [ ] Collection `biberons` → Document avec cet ID existe
  - [ ] Collection `events` → Document avec le MÊME ID existe

**Résultat** : ✅ Succès / ❌ Échec

#### 1.3 Miction
- [ ] Aller sur l'écran "Excretions" (onglet Mictions)
- [ ] Ajouter une nouvelle miction
  - Date : Maintenant
- [ ] **Vérifier les logs** :
  ```
  ✅ Miction ajoutée dans OLD: <id>
  ✅ miction ajouté avec ID spécifique : <id>
  ✅ Miction ajoutée dans NEW avec ID: <id>
  ```
- [ ] **Noter l'ID** : _______________
- [ ] **Vérifier la synchronisation Firebase**

**Résultat** : ✅ Succès / ❌ Échec

#### 1.4 Selle
- [ ] Aller sur l'écran "Excretions" (onglet Selles)
- [ ] Ajouter une nouvelle selle
  - Couleur : Jaune
  - Consistance : Normale
  - Date : Maintenant
- [ ] **Vérifier les logs** et **Firebase**
- [ ] **Noter l'ID** : _______________

**Résultat** : ✅ Succès / ❌ Échec

#### 1.5 Pompage
- [ ] Aller sur l'écran "Pompages"
- [ ] Ajouter un nouveau pompage
  - Gauche : 80 ml
  - Droite : 75 ml
  - Date : Maintenant
- [ ] **Vérifier les logs** et **Firebase**
- [ ] **Noter l'ID** : _______________

**Résultat** : ✅ Succès / ❌ Échec

#### 1.6 Vaccin
- [ ] Aller sur l'écran "Immunos" (onglet Vaccins)
- [ ] Ajouter un nouveau vaccin
  - Nom : DTCaP
  - Dose : 1ère injection
  - Date : Maintenant
- [ ] **Vérifier les logs** et **Firebase**
- [ ] **Noter l'ID** : _______________

**Résultat** : ✅ Succès / ❌ Échec

#### 1.7 Vitamine
- [ ] Aller sur l'écran "Immunos" (onglet Vitamines)
- [ ] Ajouter une nouvelle vitamine
  - Nom : Vitamine D
  - Dose : 5 gouttes
  - Date : Maintenant
- [ ] **Vérifier les logs** :
  ```
  ✅ Vitamine ajoutée dans OLD: <id>
  ✅ vitamine ajouté avec ID spécifique : <id>
  ✅ Vitamine ajoutée dans NEW avec ID: <id>
  ```
- [ ] **Noter l'ID** : _______________
- [ ] **Vérifier Firebase**

**Résultat** : ✅ Succès / ❌ Échec

### ✅ Résumé Test 1
- [ ] Tous les 7 types ont été testés
- [ ] Tous affichent les logs de double-write corrects
- [ ] Tous les IDs sont synchronisés dans Firebase
- [ ] Aucune erreur critique

---

## 📋 Test 2 : Vérification des IDs Synchronisés

### Via l'App

- [ ] Aller dans **Settings → Migration**
- [ ] Cliquer sur **"🔍 Vérifier Synchronisation IDs"**
- [ ] **Vérifier le résultat** :
  ```
  Taux de synchronisation: > 99%
  Synchronisés: XXX
  OLD seul: XXX (normal - données avant migration)
  NEW seul: 0 (doit être 0 !)
  ```

### Résultats Attendus
- **Taux de sync** : > 99% (idéalement 100% pour les nouvelles données)
- **NEW seul** : DOIT être 0
- **OLD seul** : Normal (ce sont les données d'avant la migration)

**Résultat** : ✅ Succès / ❌ Échec
**Taux mesuré** : ______%

---

## 📋 Test 3 : Modification

### 3.1 Modifier une Tétée
- [ ] Aller sur l'écran "Tétées"
- [ ] Sélectionner la tétée créée dans Test 1.1
- [ ] Modifier les durées :
  - Gauche : 12 min (au lieu de 10)
  - Droite : 10 min (au lieu de 8)
- [ ] **Vérifier les logs** :
  ```
  ✅ Tétée modifiée dans NEW
  ✅ Tétée modifiée dans OLD
  ```
- [ ] **Vérifier dans Firebase** :
  - [ ] Collection `tetees/<id>` → Durées mises à jour
  - [ ] Collection `events/<id>` → Durées mises à jour
  - [ ] Les données sont identiques

**Résultat** : ✅ Succès / ❌ Échec

### 3.2 Modifier un Biberon
- [ ] Modifier le biberon créé dans Test 1.2
- [ ] Changer la quantité à 150 ml
- [ ] **Vérifier les logs** et **Firebase**

**Résultat** : ✅ Succès / ❌ Échec

### 3.3 Modifier une Vitamine
- [ ] Modifier la vitamine créée dans Test 1.7
- [ ] Changer la dose à 6 gouttes
- [ ] **Vérifier les logs** et **Firebase**

**Résultat** : ✅ Succès / ❌ Échec

---

## 📋 Test 4 : Suppression

### 4.1 Supprimer une Miction
- [ ] Aller sur l'écran "Excretions"
- [ ] Supprimer la miction créée dans Test 1.3
- [ ] **Vérifier les logs** :
  ```
  ✅ Miction supprimée dans NEW
  ✅ Miction supprimée dans OLD
  ```
- [ ] **Vérifier dans Firebase** :
  - [ ] Document supprimé de `mictions/<id>`
  - [ ] Document supprimé de `events/<id>`

**Résultat** : ✅ Succès / ❌ Échec

### 4.2 Supprimer un Pompage
- [ ] Supprimer le pompage créé dans Test 1.5
- [ ] **Vérifier logs** et **Firebase**

**Résultat** : ✅ Succès / ❌ Échec

---

## 📋 Test 5 : Timeline et Affichage

### 5.1 Timeline (Home)
- [ ] Aller sur l'écran "Home" (timeline)
- [ ] **Vérifier** :
  - [ ] Tous les événements créés sont affichés
  - [ ] **Aucun doublon** (très important !)
  - [ ] Ordre chronologique correct
  - [ ] Les modifications sont reflétées
  - [ ] Les suppressions sont reflétées

**Résultat** : ✅ Succès / ❌ Échec

### 5.2 Screens Spécifiques
- [ ] **Tétées** : Affichage correct, pas de doublons
- [ ] **Pompages** : Affichage correct, pas de doublons
- [ ] **Excretions** : Les 2 onglets affichent correctement
- [ ] **Immunos** : Les 2 onglets affichent correctement
- [ ] **Stats** : Les graphiques affichent les bonnes données

**Résultat** : ✅ Succès / ❌ Échec

---

## 📋 Test 6 : Gestion d'Erreurs (Optionnel)

### 6.1 Simuler une Erreur OLD
Pour tester que l'app continue de fonctionner même si OLD échoue :

1. **Temporairement**, dans Firebase Console → Rules :
   - Bloquer l'écriture dans une ancienne collection (ex: tetees)
2. Ajouter une tétée dans l'app
3. **Vérifier** :
   - [ ] Log d'erreur pour OLD : `❌ Erreur OLD: ...`
   - [ ] Log de succès pour NEW : `✅ Tétée ajoutée dans NEW`
   - [ ] L'app **n'a PAS crashé**
   - [ ] L'événement est visible dans la timeline
4. **Rétablir** les rules Firebase

**Résultat** : ✅ Succès / ❌ Échec / ⏭️ Skipped

---

## 📊 Statistiques de Monitoring

### Via l'App
- [ ] Aller dans **Settings → Migration**
- [ ] Section **"📊 Monitoring VALIDATION"**
- [ ] **Vérifier les stats 24h** :
  - Total d'opérations : _______
  - Succès : _______
  - Erreurs : _______
  - Taux de réussite : _______%

### Résultats Attendus
- **Taux de réussite** : > 99%
- **Erreurs** : < 1% des opérations
- **Erreurs partielles** : Acceptable si faibles

---

## ✅ Checklist Finale

- [ ] **Test 1** : Ajout - Tous les 7 types fonctionnent
- [ ] **Test 2** : IDs synchronisés - Taux > 99%, NEW seul = 0
- [ ] **Test 3** : Modification - Fonctionne sans erreur
- [ ] **Test 4** : Suppression - Fonctionne sans erreur
- [ ] **Test 5** : Timeline - Pas de doublons, affichage correct
- [ ] **Test 6** : Gestion d'erreurs - App résiliente (optionnel)
- [ ] **Stats** : Taux de réussite > 99%

---

## 🎯 Critères de Validation

### ✅ Tests RÉUSSIS si :
- Tous les tests 1-5 passent sans erreur majeure
- Taux de synchronisation > 99%
- NEW seul = 0 (pas d'événements orphelins)
- Aucun doublon dans la timeline
- Taux de réussite des opérations > 99%

### ❌ Tests ÉCHOUÉS si :
- Des événements ne sont pas synchronisés
- NEW seul > 0
- Des doublons apparaissent
- Taux de réussite < 95%
- Erreurs critiques fréquentes

---

## 📝 Rapport de Test

**Date** : _______________
**Testeur** : _______________
**Environnement** : Production / Test

### Résumé
- Tests passés : _____ / 6
- Taux de synchronisation : _____%
- Taux de réussite opérations : _____%
- Doublons détectés : Oui / Non

### Conclusion
- [ ] ✅ Validation réussie - Peut continuer en phase VALIDATION
- [ ] ⚠️ Problèmes mineurs - Correction nécessaire
- [ ] ❌ Échec - Retour en phase de développement

### Notes et Observations
_______________________________________
_______________________________________
_______________________________________

---

## 🔜 Prochaines Étapes

Si tous les tests passent :
1. **Continuer en phase DOUBLE_WRITE** pendant 7-14 jours
2. **Monitorer quotidiennement** les stats
3. **Après validation** : Passer en phase NEW_ONLY

Si des tests échouent :
1. **Analyser les logs d'erreurs**
2. **Corriger les problèmes**
3. **Réexécuter les tests**

---

**Date de Création** : 2026-01-08
**Version** : 1.0
