# 🧹 Nettoyage et Redémarrage de la Migration

## Problème Identifié

Vous avez des données migrées AVANT le fix des IDs synchronisés, ce qui cause des doublons car :
- Anciennes données : IDs différents entre OLD et NEW
- Nouvelles données : IDs synchronisés
- Le listener hybride voit les deux → doublons/multiplication

## ✅ Solution : Clean Start

### Étape 1 : Supprimer la Collection Events

Dans **Firebase Console** :
1. Aller sur Firestore Database
2. Trouver la collection `events`
3. **SUPPRIMER** tous les documents de `events`
   - ⚠️ NE PAS supprimer les anciennes collections (tetees, vaccins, etc.)
   - ✅ Supprimer UNIQUEMENT `events`

**Pourquoi ?**
- Les anciennes collections (OLD) contiennent vos vraies données
- La collection `events` (NEW) contient des données migrées avec mauvais IDs
- On va recréer `events` proprement

### Étape 2 : Réinitialiser la Migration dans l'App

Dans l'app :
1. Aller dans **Settings → Migration**
2. Cliquer sur **🔄 Réinitialiser la Migration**
3. Confirmer

Cela va :
- Réinitialiser l'état de migration (phase → NOT_STARTED)
- Effacer les logs
- Réinitialiser les compteurs

### Étape 3 : Relancer la Migration

1. Toujours dans **Settings → Migration**
2. Cliquer sur **🚀 Démarrer la Migration**
3. Attendre que la migration se termine

**Cette fois** :
- Les IDs seront synchronisés grâce au fix `setDoc`
- Pas de doublons
- Données propres

### Étape 4 : Vérifier

1. Vérifier dans Firebase Console :
   - Collection `events` doit avoir les mêmes IDs que les collections OLD
   - Exemple : `vaccins/abc123` → `events/abc123` (même ID)

2. Vérifier dans l'app :
   - Timeline : pas de doublons
   - Vaccins : bon nombre d'événements
   - Tous les screens : affichage correct

---

## 🔧 Alternative : Script de Nettoyage Automatique

Si vous préférez un script pour nettoyer, voici le code :

```typescript
// migration/cleanEventsCollection.ts
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/config/firebase';

export async function cleanEventsCollection() {
  console.log('🧹 Nettoyage de la collection events...');

  try {
    const eventsRef = collection(db, 'events');
    const snapshot = await getDocs(eventsRef);

    console.log(`📊 ${snapshot.size} documents à supprimer...`);

    let deleted = 0;
    const batchSize = 500;

    for (let i = 0; i < snapshot.docs.length; i += batchSize) {
      const batch = snapshot.docs.slice(i, i + batchSize);

      await Promise.all(
        batch.map(docSnap => deleteDoc(doc(db, 'events', docSnap.id)))
      );

      deleted += batch.length;
      console.log(`✅ ${deleted}/${snapshot.size} supprimés`);
    }

    console.log('🎉 Nettoyage terminé !');
    return true;
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error);
    throw error;
  }
}
```

**Usage dans la console** :
```typescript
import { cleanEventsCollection } from '@/migration/cleanEventsCollection';
await cleanEventsCollection();
```

---

## ⚠️ Important

### À SUPPRIMER
- ✅ Collection `events` (NEW - données avec mauvais IDs)

### À GARDER
- ✅ Collections `tetees`, `biberons`, `mictions`, `selles`, `pompages`, `vaccins`, `vitamines` (OLD - vraies données)
- ✅ Toutes les données utilisateur
- ✅ Tout le reste de Firestore

---

## 🎯 Après le Nettoyage

### Configuration Actuelle (Déjà Correcte)

```typescript
// eventsDoubleWriteService.ts
let config: MigrationConfig = {
  phase: "DOUBLE_WRITE",  // ✅ Correct
  readFrom: "NEW",         // ✅ Correct
  failOnError: false,      // ✅ Correct
};
```

**Aucun changement de config nécessaire** - le fix des IDs synchronisés est déjà en place !

### Résultat Attendu

Après la migration :
```
Collection vaccins/abc123:
  type: "vaccin"
  nom: "DTCaP"
  ...

Collection events/abc123:  ← MÊME ID !
  type: "vaccin"
  nom: "DTCaP"
  ...
```

**Déduplication fonctionnera** car les IDs sont identiques.

---

## 📋 Checklist de Clean Start

- [ ] **Backup** : S'assurer que les anciennes collections sont intactes
- [ ] **Supprimer** collection `events` dans Firebase Console
- [ ] **Réinitialiser** migration dans l'app (Settings → Migration)
- [ ] **Relancer** migration (Settings → Migration → Démarrer)
- [ ] **Vérifier** dans Firebase : mêmes IDs dans OLD et NEW
- [ ] **Tester** l'app : pas de doublons
- [ ] **Exécuter** les tests fonctionnels

---

## ❓ FAQ

**Q: Vais-je perdre mes données ?**
R: Non ! Les anciennes collections restent intactes. On supprime seulement la collection `events` qui sera recréée proprement.

**Q: Combien de temps prend la migration ?**
R: Quelques secondes à quelques minutes selon le nombre d'événements (vous avez ~2934 événements d'après les logs précédents).

**Q: Faut-il changer le code ?**
R: Non ! Le fix des IDs synchronisés est déjà en place dans le code. Il suffit de nettoyer et relancer.

**Q: Et si j'ai ajouté des événements récents ?**
R: Si vous avez ajouté des événements APRÈS le fix des IDs (aujourd'hui), ils ont déjà les bons IDs. Mais il vaut mieux tout nettoyer pour être sûr.

---

## 🚀 Résumé

1. **Supprimer** `events` dans Firebase Console
2. **Réinitialiser** dans l'app
3. **Relancer** la migration
4. **Vérifier** les IDs
5. **Tester** l'app
6. **Continuer** avec les tests fonctionnels

**Temps total** : 5-10 minutes

---

**Date** : 2026-01-08
**Raison** : IDs non synchronisés dans données migrées avant le fix
**Solution** : Clean start avec IDs synchronisés
