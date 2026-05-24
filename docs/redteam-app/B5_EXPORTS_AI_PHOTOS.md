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

## Plan d'action

_À remplir post-recon._

## Tests à ajouter

_À définir post-recon._

## Métriques

_À définir._

## Livraison

_À définir._
