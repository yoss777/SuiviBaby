# B5 — Red team exports, AI insights, photos : plan d'action

**Statut :** ⚪ recon à faire
**Effort estimé :** 4 h

## Périmètre

- `services/exportService.ts` (PDF, CSV ?)
- `services/aiInsightsService.ts` + `services/insightEngine.ts`
- `services/babyAttachmentService.ts` (photos)
- `services/hiddenPhotosService.ts`
- Firebase Storage rules (`storage.rules`)
- CF qui génère les PDF (recherche `puppeteer` / `react-pdf` / `pdfkit` côté backend)
- Quotas `pdfExportCount` (déjà visible dans `validateEventData`)

## Surfaces d'attaque à investiguer

1. **Exfiltration cross-user** — export PDF d'un childId qui n'est pas le mien ?
2. **Photos cross-user via Storage** — Storage rules vraiment basées sur access doc ? Path traversal possible ?
3. **AI insights leak** — prompt LLM contient-il des données d'autres enfants (cache pollué) ?
4. **Prompt injection** — `note` de l'utilisateur → prompt LLM → comportement modifié ? Coût gonflé ?
5. **PDF coûteux / DoS** — un user peut-il déclencher 100 exports avant que le quota se mette à jour ?
6. **Image processing** — `expo-image-manipulator` côté client ; côté serveur, des malicious images peuvent-elles crash la CF ?
7. **Lien partagé d'export** — si export → URL Storage signée, durée de validité ? Révocable ?
8. **`hiddenPhotos`** — qui peut hide/unhide ? Hidden visible dans export ?

## Recon à lancer

Prompt :
> Audit des exports, AI insights et photos dans /Users/yoss/Projets/SuiviBaby. Trace : (1) export PDF — qui peut générer, depuis quel input, où va le fichier (Storage path), URL signée TTL, qui peut télécharger. (2) AI insights — quel prompt construit côté serveur, données injectées, modèle utilisé, cache (cross-user ?). (3) photos — upload path, validation MIME/taille, accès cross-user via Storage rules. Liste les paths à risque d'exfiltration. Sous 600 mots.

## Surfaces identifiées (recon mai 2026)

| # | Surface | Sévérité | File:line | Gap |
|---|---------|----------|-----------|-----|
| S1 | Export quota non scopé par childId | ÉLEVÉ | [exportService.ts:115-209](../../services/exportService.ts), [functions/index.js:900-926](../../functions/index.js) | `consumeExportQuota` valide uid mais pas childId → bulk export multi-enfants, gonfle quota d'une victime via brute-force childId |
| S2 | Prompt injection LLM via `note` | MOYEN-ÉLEVÉ | [functions/index.js:2518-2532](../../functions/index.js), [dataAnonymizationService.ts:54-69](../../services/dataAnonymizationService.ts) | `anonymizeEvent` retire `note` (OK), mais si refactor le réintroduit, prompt user-supplied dans `${events.slice(0,30)}` directement → cost amplification (max_tokens dilué) |
| S3 | Photos cachées visibles dans export CSV | MOYEN | [hiddenPhotosService.ts](../../services/hiddenPhotosService.ts), [exportService.ts:167](../../services/exportService.ts), [firestore.rules:268-270](../../firestore.rules) | `exportAllEventsCSV()` n'applique pas `getHiddenEventIds()`. Photos cachées re-apparaissent. Scope `user_hidden_photos` non-segmenté par childId (multi-enfant) |
| S4 | Storage path validation faible (jalons cross-child) | FAIBLE-MOYEN | [storage.rules:40-49](../../storage.rules), [firestore.rules:165-184](../../firestore.rules) | `hasAccess(childId)` validé sur path, mais si event Firestore référence un path `children/childB/jalons/...` (leak/bug), user voit photos de childB sans accès |
| S5 | AI insights quota contournable multi-enfant | FAIBLE | [functions/index.js:2472-2498](../../functions/index.js) | Quota scopé `(uid)` → user avec 5 enfants = 5 insights/jour. Coût marginal (~4¢/jour). |
| S6 | Cumulative note length / batch AI cost | FAIBLE | [functions/index.js:1607-1621](../../functions/index.js) | events.slice(0,30) × note 1000 chars chacun = 30KB contexte si refactor réintroduit notes. Coût mineur (~3¢/jour spam). |

## Plan d'action

### Priorité ÉLEVÉ
- **S1 → scoper quota par `(uid, childId)`** + appel `checkChildAccess` dans `consumeExportQuota`. **Effort: 2h.**
- **S2 → garde-fou anti-injection** : whitelist des champs injectés dans le prompt (date, type, quantité — JAMAIS note ni rawText). Ajouter `max_tokens` strict 300 + `temperature: 0`. **Effort: 1h.**

### Priorité MOYEN
- **S3 → filter `hiddenEventIds` dans `exportAllEventsCSV`** + segmenter `user_hidden_photos` par childId (migration nécessaire). **Effort: 3h (avec migration).**
- **S4 → cross-validation Firestore↔Storage** : avant de servir une photo, vérifier que le `event.photoPath` lu dans Firestore (par childId scopé) correspond bien au path demandé. **Effort: 2h.**

### Priorité FAIBLE
- **S5 → scoper quota AI à `(uid, childId)`** ou laisser tel quel (coût négligeable). **Décision produit.**
- **S6 → réduire `events.slice(0, 30) → 20`** + cumulative `note.length` cap. **Effort: 30min.**

## Tests à ajouter

_À définir post-recon._

## Métriques

_À définir._

## Livraison

_À définir._
