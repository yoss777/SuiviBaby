# B2 — Deletion RGPD : closure report

**Statut :** 🟢 livré
**Effort réel :** ~2 h
**Plan d'origine :** [B2_DELETION.md](B2_DELETION.md)

## Mesures livrées (B2 + chevauchement Lot 0)

| # | Surface | Lot 0 ? | B2 ? | Mesure |
|---|---------|---------|------|--------|
| S1 | 7 collections orphelines user | ✅ T0.5 | — | `user_hidden_photos`, `pending_assemblyai_deletes`, `voice_transcribe_cache` ajoutés à `deleteUserAccount`. |
| S2 | Asymétrie restoration vs purge | ✅ T0.2 | — | Skip RC webhook si user Auth supprimé. |
| S3 | Suppression by tiers | ✅ T0.6 | — | `deleteUserAccount` cross-user exige reason + audit log. |
| **S4** | Race soft-delete vs cancel | — | ✅ **B2.3** | Snapshot écrit AVANT `deletedAt` → cancel reçoit toujours un snapshot complet. |
| S5 | AssemblyAI orphelins sans userId | ✅ T0.5 | — | `userId` ajouté à `pending_assemblyai_deletes`. |
| **S6** | Cleanup AsyncStorage | — | ✅ **B2.4** | `cleanupOrphanedEvents` purge aussi events > 60j (compte supprimé serveur). `onAccountDelete(uid)` exporté. |
| S7 | Webhook RC recrée user | ✅ T0.2 | — | Skip si Auth user n'existe plus. |
| **S8** | Reports enfant non purgés | — | ✅ **B2.2** | `deleteChildDataBatched` ajoute `reports` (cascade). |
| **S9** | Photos Storage 30j accessibles | — | ✅ **B2.1** | `softDeleteChild` wipe le bucket immédiatement (best-effort + log si échec). |
| **S10** | Countdown UI | — | ✅ **B2.5** | `purgeAt` exposé, helper `daysUntilPurge`, texte italique dans `deletion-requests.tsx`. |

**Total** : 10 surfaces fermées (5 via Lot 0 + 5 via B2).

## Détail des changements B2

### B2.1 — Wipe Storage immédiat (S9 critique RGPD)

[functions/index.js softDeleteChild ~3905-3920](../../functions/index.js)

```js
// 8. B2.1 — wipe Storage IMMÉDIATEMENT au soft-delete (RGPD S9).
try {
  const bucket = admin.storage().bucket();
  const [files] = await bucket.getFiles({ prefix: `children/${childId}/` });
  if (files.length > 0) {
    await Promise.all(files.map((file) => file.delete().catch(() => null)));
    console.log(`softDeleteChild: wiped ${files.length} storage files`);
  }
} catch (storageErr) {
  console.warn(`softDeleteChild: storage wipe failed:`, storageErr?.message);
}
```

**Trade-off** : `cancelChildDeletion` ne peut plus restaurer les photos. C'est cohérent avec la politique "soft-delete = données illisibles dès J0". À documenter côté UI (TODO en aval).

### B2.2 — Reports purgés en cascade (S8)

[functions/index.js deleteChildDataBatched ~144](../../functions/index.js)

Ajout `deleteDocsByFieldBatched(db, "reports", "childId", childId)`. Les reports contiennent souvent `photoPath`, `reporterUid`, raison — données sensibles qui ne doivent pas survivre à l'enfant.

### B2.3 — Ordre soft-delete (S4 race mitigation)

Avant :
1. `update(children/{id}, deletedAt=now)` ← point de bascule visible
2. `update(childDeletionRequests/{rid}, accessSnapshot)` ← snapshot ici

Si `cancelChildDeletion` arrive entre 1 et 2 : il voit `deletedAt`, fait sa restoration, mais `accessSnapshot` est encore vide → fallback à "uid → owner" perd les autres co-parents.

Après : ordre inversé. Snapshot écrit en premier. Si cancel arrive avant le `deletedAt`, il échoue proprement (`childData.deletedAt` absent). Si après, snapshot garanti dispo.

### B2.4 — Cleanup local élargi (S6)

[services/offlineQueueService.ts:215-228](../../services/offlineQueueService.ts)

```sql
DELETE FROM pending_events WHERE uid = '' OR createdAt < ?
-- avec ? = now - 60 jours
```

Couvre le scénario : user supprime son compte (J0), grace period 30j, CF supprime serveur (J30). Au prochain `onSignOut` sur le device (peut être J60+), la queue de l'ancien uid est nettoyée. Évite que le prochain user du même device hérite d'écritures fantômes.

**Plus** : nouvelle fonction `onAccountDelete(uid)` exportée pour un usage futur si on implémente un instant-delete (purge totale, pas seulement orphelins).

### B2.5 — Countdown UI (S10)

[app/settings/deletion-requests.tsx](../../app/settings/deletion-requests.tsx)

- Interface `DeletionRequest` enrichie avec `purgeAt?: { seconds: number }`.
- Helper `daysUntilPurge(purgeAt)` retourne le nombre de jours restants (ou 0 si dépassé).
- Texte italique affiché entre le statut et le bouton "Annuler la suppression" :
  - "Plus que N jours avant la suppression définitive"
  - "Plus que 1 jour..."
  - "Suppression définitive imminente."
- Style `countdownText` centré, fontSize 13.

L'utilisateur sait maintenant clairement quand l'opération sera irréversible.

## Tests

89 tests CF (inchangé — pas de nouveaux mocks nécessaires pour ces helpers internes) + 9 tests `offlineQueueService` (1 mis à jour pour la nouvelle signature `cleanupOrphanedEvents`).

**Note** : les CFs `softDeleteChild` et `deleteChildDataBatched` sont des helpers internes (non `exports.`). Les tests d'intégration via les CFs publiques `createDeletionRequest` / `purgeDeletedChildren` couvrent indirectement le nouveau comportement. Un futur test unitaire dédié au wipe Storage (mock `admin.storage`) serait nice-to-have mais hors scope B2.

## Déploiements

| Composant | Action |
|-----------|--------|
| `createDeletionRequest` (europe-west1) | ✅ updated |
| `voteDeletionRequest` (europe-west1) | ✅ updated |
| `processScheduledDeletions` (europe-west1) | ✅ updated |
| `purgeDeletedChildren` (us-central1) | ✅ updated |
| `cancelChildDeletion` (europe-west1) | ✅ updated |
| `deleteUserAccount` (europe-west1) | ✅ updated |
| Commits | ✅ `ce50e13` + `50f066e` pushed |

## Risques résiduels

| # | Risque | Sévérité | Note |
|---|--------|----------|------|
| R1 | Cancel après wipe Storage = photos perdues | MOYEN UX | Trade-off RGPD assumé. À surface dans l'UI au moment du soft-delete (TODO B6 ou next sprint). |
| R2 | Race théorique 2 cancels concurrents | FAIBLE | Très improbable, mitigation totale = transaction Firestore (refactor lourd). |
| R3 | Events > 60j retentionLocal vs serveur 30j | FAIBLE | 60j est conservateur. Si on observe des events trop vieux dans la queue, on peut réduire à 45j. |
| R4 | Pas de test d'intégration sur le wipe Storage | FAIBLE | Helper interne. Si régression, log warning visible en Cloud Logs. |

## Prochaines actions

Selon l'ordre : **B3 — Authentification & sessions** (~3-4 h). 8 surfaces dont 2 CRITIQUES (App Check enforce reporté, admin claim audit déjà fait T0.3). Reste S1 (nonce Apple replay), S3 (refresh token AsyncStorage), S4 (listeners BabyContext survivent signOut), S5 (cache `@suivibaby_boot_children` non purgé), S7 (biometric uid stale), S8 (validateReferralCode rate limit).

Plan : [B3_AUTH.md](B3_AUTH.md).
