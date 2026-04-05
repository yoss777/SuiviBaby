# Plan détaillé — Suppression d'un enfant

## Contexte

Un owner doit pouvoir supprimer un enfant depuis `edit-child.tsx`. La suppression doit :
- Respecter le RGPD (rétention des données avant purge)
- Gérer le cas multi-owners (approbation unanime requise)
- Proposer l'export des données avant suppression
- Nettoyer toutes les références Firestore

---

## 1. Nouveau modèle de données

### 1.1 Collection `childDeletionRequests`

```typescript
interface ChildDeletionRequest {
  id: string;                    // auto-generated
  childId: string;
  childName: string;             // snapshot au moment de la demande
  requestedBy: string;           // userId du owner initiateur
  requestedByEmail: string;
  requestedAt: Timestamp;
  status: 'pending' | 'approved' | 'refused';
  // Tracking des votes de chaque owner
  ownerVotes: {
    [userId: string]: {
      vote: 'pending' | 'approved' | 'refused';
      votedAt?: Timestamp;
    }
  };
  // Qui a refusé (pour le message de notification)
  refusedBy?: string;            // userId
  refusedByEmail?: string;
  refusedAt?: Timestamp;
  // Quand tous ont approuvé
  approvedAt?: Timestamp;
  // Tracking notifications : userIds qui ont vu/dismissé la popup de status
  seenByUserIds: string[];
  // Soft-delete tracking
  deletedAt?: Timestamp;         // quand le soft-delete a été exécuté
  retentionDays: number;         // durée de rétention RGPD (ex: 30)
  purgeAt?: Timestamp;           // deletedAt + retentionDays
}
```

### 1.2 Modification du document `children/{childId}`

Ajout de champs optionnels :
```typescript
{
  // ... champs existants (name, birthDate, gender, ownerId, parentIds, etc.)
  deletedAt?: Timestamp;         // présent = soft-deleted
  deletedBy?: string;            // userId
  deletionRequestId?: string;    // référence vers childDeletionRequests
}
```

---

## 2. Workflow détaillé

### 2.1 Cas 1 — Owner unique

```
Owner clique "Supprimer"
  → Modale de confirmation avec avertissement
  → Proposition d'export (même logique que export.tsx)
  → Si export fait ou refusé :
    → Création d'une `childDeletionRequest` avec status 'approved' directement
    → Exécution du soft-delete (CF callable `softDeleteChild`)
```

### 2.2 Cas 2 — Plusieurs owners

```
Owner A clique "Supprimer"
  → Modale de confirmation + export
  → Création d'une `childDeletionRequest` avec status 'pending'
  → ownerVotes: { ownerA: 'approved', ownerB: 'pending', ownerC: 'pending' }
  → L'initiateur est automatiquement compté comme 'approved'

Owner B ouvre l'app
  → Screen/popup "Demandes de suppression en attente"
  → Voit la demande de Owner A pour l'enfant X
  → Peut Approuver ou Refuser

Si Owner B refuse :
  → request.status = 'refused'
  → request.refusedBy = ownerB
  → Plus de vote possible pour les autres owners (vote terminé)
  → Notification popup pour TOUS les owners au prochain lancement
    (affiche le status de chaque vote : ✅ approved, ❌ refused, ⏳ pending annulé)
  → Owner A devra refaire une nouvelle demande s'il veut retenter

Si Owner B approuve :
  → ownerVotes.ownerB = 'approved'
  → Si tous les owners ont voté 'approved' :
    → request.status = 'approved'
    → Exécution automatique du soft-delete (CF trigger ou callable)
  → Sinon : demande reste 'pending', en attente des autres owners
```

### 2.3 Cas 3 — Owner veut se retirer mais garder l'enfant pour les autres

```
Owner clique "Se retirer" (option séparée de "Supprimer")
  → Modale : "Choisissez le nouveau owner parmi les parents"
  → Liste des parents (admin, contributor) de l'enfant
  → Sélection du nouveau owner
  → CF callable `transferAndLeave` :
    1. Met à jour le role du nouveau owner dans children/{childId}/access
    2. Met à jour ownerId sur le doc children/{childId}
    3. Supprime l'accès du former owner (access subcollection + user_child_access)
    4. Nettoie hiddenChildrenIds dans user_preferences du former owner
    5. Nettoie le doc children si parentIds/parentEmails y figurent
```

---

## 3. Soft-delete : ce qui se passe à l'approbation

### 3.1 Cloud Function callable `softDeleteChild`

Déclenchée quand la request passe en 'approved'.

**Actions immédiates (l'enfant disparaît pour tous) :**

```
1. Marquer children/{childId}.deletedAt = now()
2. Marquer children/{childId}.deletedBy = requestedBy
3. Marquer children/{childId}.deletionRequestId = requestId
4. Supprimer TOUS les docs children/{childId}/access/*
5. Supprimer TOUS les docs user_child_access où childId == childId
6. Pour chaque userId impacté :
   - user_preferences/{userId}.hiddenChildrenIds → arrayRemove(childId)
   - user_preferences/{userId}.lastActiveChildId → null si == childId
7. Supprimer shareCodes où childId == childId
8. Supprimer shareInvitations où childId == childId
9. Supprimer babyAttachmentRequests où childId == childId
```

**Données conservées (rétention RGPD) :**
```
- children/{childId} (avec deletedAt, inaccessible via rules)
- events où childId == childId
- eventLikes où childId == childId
- eventComments où childId == childId
- Legacy collections (tetees, pompages, etc.)
- Storage files children/{childId}/*
```

### 3.2 Firestore Rules update

Ajouter une règle pour rendre les enfants soft-deleted inaccessibles :

```javascript
// children/{childId} — bloquer lecture si deletedAt existe
allow read: if resource.data.deletedAt == null && (isOwner(childId) || hasAccess(childId));
```

### 3.3 Cloud Function scheduled `purgeDeletedChildren`

Tourne quotidiennement (comme `cleanupExpiredShareCodes`).

```
Pour chaque doc dans children où deletedAt != null ET purgeAt <= now() :
  1. deleteChildDataBatched(db, childId)  // fonction existante
  2. Supprimer Storage children/{childId}/*
  3. Supprimer le doc children/{childId} lui-même
  4. Supprimer la childDeletionRequest associée
```

---

## 4. Implémentation UI

### 4.1 Modification de `edit-child.tsx`

Pour chaque enfant owner, ajouter deux actions :
- **"Supprimer"** (icône trash, rouge) — lance le flow de suppression
- **"Se retirer"** (icône exit, orange) — uniquement si d'autres parents existent

Au tap sur "Supprimer" :
1. Charger les owners de l'enfant via `children/{childId}/access` (filtrer role === 'owner')
2. Si owner unique → flow direct (confirmation + export + soft-delete)
3. Si multi-owners → créer `childDeletionRequest` en pending

### 4.2 Nouveau screen `app/settings/deletion-requests.tsx`

Affiche les demandes de suppression (pending, refused, approved) pour lesquelles le user est owner.
Style inspiré des invitations (même pattern que la popup d'ajout d'enfant avec countdown).

**Pour chaque demande :**

```
┌─────────────────────────────────────────┐
│  🗑️ Suppression de {childName}          │
│                                         │
│  Demandée le {date} par {requesterName} │
│                                         │
│  Votes des propriétaires :              │
│  ✅ Marie (a approuvé)                  │
│  ❌ Pierre (a refusé)                   │
│  ⏳ Jean (en attente)                   │
│                                         │
│  Status : pending / refused / approved  │
│                                         │
│  [Annuler]              [Approuver]     │  ← si user n'a pas encore voté
│                                         │
└─────────────────────────────────────────┘
```

**Icônes de vote :**
- `approved` : icône checkmark vert (validation)
- `refused` : icône X rouge (refus)
- `pending` : icône sablier gris (pas encore manifesté)

**Comportement quand un owner refuse :**
- Le vote s'arrête immédiatement pour tous les autres owners
- La demande passe en `refused`
- Plus aucun bouton de vote n'est affiché
- Tous les owners voient la notification avec le status final et qui a refusé

Accessible depuis :
- Un badge/indicateur dans settings si des demandes sont pending
- Notification popup au lancement de l'app (comme AddChildModal)

### 4.3 Modale de confirmation avant suppression

```
┌─────────────────────────────────────┐
│         Supprimer {childName} ?     │
│                                     │
│  Toutes les données seront          │
│  supprimées après {X} jours.        │
│                                     │
│  Voulez-vous d'abord exporter       │
│  les données ?                      │
│                                     │
│  [Exporter d'abord]  [Supprimer]    │
│           [Annuler]                 │
└─────────────────────────────────────┘
```

"Exporter d'abord" → navigue vers export.tsx avec `childId` en param, puis revient.

### 4.4 Notification popup pour tous les owners

Au lancement de l'app, si le user est concerné par une demande de suppression (pending ou refused), afficher une popup :

**Cas pending (le user doit voter) :**
```
┌─────────────────────────────────────────┐
│      Demande de suppression             │
│                                         │
│  {requesterName} souhaite supprimer     │
│  {childName}.                           │
│                                         │
│  Votes :                                │
│  ✅ {requesterName}                     │
│  ⏳ Vous                                │
│  ⏳ {otherOwnerName}                    │
│                                         │
│  [Refuser]                [Approuver]   │
└─────────────────────────────────────────┘
```

**Cas refused (notification pour l'initiateur et tous les owners) :**
```
┌─────────────────────────────────────────┐
│      Demande de suppression             │
│             refusée                     │
│                                         │
│  {refusedByName} a refusé la            │
│  suppression de {childName}.            │
│                                         │
│  ✅ {ownerA}                            │
│  ❌ {refusedByName}                     │
│  ⏳ {ownerC} (vote annulé)              │
│                                         │
│              [OK]                       │
└─────────────────────────────────────────┘
```

### 4.5 Modale de transfert (Se retirer)

```
┌─────────────────────────────────────┐
│    Se retirer de {childName}        │
│                                     │
│  Choisissez le nouveau              │
│  propriétaire :                     │
│                                     │
│  ○ Marie (admin)                    │
│  ○ Pierre (contributor)            │
│                                     │
│  [Annuler]              [Confirmer] │
└─────────────────────────────────────┘
```

> Note : bouton d'action principal (Confirmer) toujours à droite pour la cohérence cognitive de l'app.

---

## 5. Cloud Functions à créer/modifier

### 5.1 `createDeletionRequest` (callable)

```
Input: { childId }
Validation:
  - User est owner de l'enfant
  - Pas de demande pending existante pour cet enfant
Logic:
  - Lister tous les owners via children/{childId}/access (role === 'owner')
  - Créer le doc childDeletionRequests
  - Si owner unique → status 'approved' + appeler softDeleteChild
  - Si multi-owners → status 'pending', vote de l'initiateur = 'approved'
```

### 5.2 `voteDeletionRequest` (callable)

```
Input: { requestId, vote: 'approved' | 'refused' }
Validation:
  - User est owner de l'enfant
  - Request est en status 'pending'
  - User n'a pas encore voté
Logic:
  - Mettre à jour ownerVotes[userId]
  - Si vote === 'refused' :
    - status = 'refused', refusedBy, refusedAt
  - Si vote === 'approved' :
    - Vérifier si tous les owners ont voté 'approved'
    - Si oui : status = 'approved', approvedAt, appeler softDeleteChild
```

### 5.3 `softDeleteChild` (interne, pas callable directement)

Voir section 3.1. Appelée par `createDeletionRequest` (owner unique) ou `voteDeletionRequest` (tous approuvés).

### 5.4 `transferAndLeave` (callable)

```
Input: { childId, newOwnerId }
Validation:
  - User est owner actuel
  - newOwnerId a un accès existant à l'enfant
  - newOwnerId !== user
Logic:
  - Voir section 2.3
```

### 5.5 `purgeDeletedChildren` (scheduled)

```
Schedule: every 24 hours
Logic:
  - Query children où deletedAt != null ET purgeAt <= now()
  - Pour chaque : deleteChildDataBatched() + delete doc + delete storage
```

---

## 6. Firestore Rules à modifier

```javascript
// children/{childId} — bloquer si soft-deleted
match /children/{childId} {
  allow read: if resource.data.deletedAt == null && ...existing rules...;
  // Autoriser l'update pour le soft-delete (par CF admin uniquement)
}

// childDeletionRequests
match /childDeletionRequests/{requestId} {
  allow read: if isSignedIn() &&
    request.auth.uid in resource.data.ownerVotes;
  allow create: if false; // CF only
  allow update: if false; // CF only
  allow delete: if false; // CF only
}
```

---

## 7. Fichiers à créer/modifier

### Nouveaux fichiers
| Fichier | Description |
|---|---|
| `app/settings/deletion-requests.tsx` | Screen des demandes pending |
| `services/childDeletionService.ts` | Service client (appels CF) |

### Fichiers à modifier
| Fichier | Modification |
|---|---|
| `app/settings/edit-child.tsx` | Boutons Supprimer / Se retirer |
| `app/(drawer)/settings.tsx` | Entrée "Demandes de suppression" avec badge |
| `functions/index.js` | 4 nouvelles CF + modifier rules |
| `firestore.rules` | Règles pour soft-delete + deletionRequests |
| `firestore.indexes.json` | Index sur childDeletionRequests |
| `contexts/BabyContext.tsx` | Ignorer les enfants avec deletedAt |

---

## 8. Ordre d'implémentation

### Phase A — Fondations (backend)
1. **A1** : Collection `childDeletionRequests` + Firestore rules + indexes
2. **A2** : CF `softDeleteChild` (interne) — le cœur du soft-delete
3. **A3** : CF `createDeletionRequest` (callable)
4. **A4** : CF `voteDeletionRequest` (callable)
5. **A5** : CF `transferAndLeave` (callable)
6. **A6** : CF `purgeDeletedChildren` (scheduled)
7. **A7** : Modifier `firestore.rules` pour bloquer read sur enfants soft-deleted

### Phase B — Service client
8. **B1** : `services/childDeletionService.ts` — wrapper httpsCallable
9. **B2** : Modifier `BabyContext.tsx` — filtrer les enfants avec `deletedAt`

### Phase C — UI
10. **C1** : Modifier `edit-child.tsx` — boutons Supprimer / Se retirer + modales
11. **C2** : `deletion-requests.tsx` — screen des demandes pending
12. **C3** : Modifier `settings.tsx` — entrée + badge demandes pending
13. **C4** : Notification popup refus au lancement

### Phase D — Export pré-suppression
14. **D1** : Modifier `export.tsx` pour accepter un `childId` unique en param
15. **D2** : Intégrer le flow export dans la modale de suppression

---

## 9. Durée de rétention RGPD

Valeur recommandée : **30 jours** (aligné sur la suppression de compte).

Configurable via une constante :
```typescript
export const CHILD_DELETION_RETENTION_DAYS = 30;
```

---

## 10. Risques identifiés

| Risque | Mitigation |
|---|---|
| Race condition : deux owners suppriment en même temps | CF vérifie qu'il n'existe pas de request pending avant d'en créer |
| Offline queue : events créés après soft-delete | Firestore rules bloquent l'écriture si `deletedAt` existe |
| Owner unique se trompe et veut annuler | Pendant la période de rétention, prévoir un flow "annuler la suppression" (optionnel, phase future) |
| CF `purgeDeletedChildren` échoue à mi-parcours | `deleteChildDataBatched` est idempotente, re-run safe |
| Un owner ne répond jamais à la demande | Expiration auto après X jours → demande passe en 'expired' (à implémenter) |
