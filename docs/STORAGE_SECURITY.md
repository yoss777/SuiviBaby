# Storage security — photos & médias enfants

> Décision Sprint 1 / Tâche 7 — 2026-04-28

## TL;DR

Les photos uploadées vers Firebase Storage sont protégées par **Storage rules + Firebase ID token bearer** sur chaque requête. Cela offre la même garantie qu'un système de signed URLs (TTL court + chemin opaque), sans la complexité d'une CF intermédiaire.

L'audit du 2026-04-27 avait classé cette zone "MOYENNE" en supposant que les URLs étaient publiques (`?alt=media` sans signature). Après vérification, les URLs **ne sont pas publiques** : Storage rules requièrent `request.auth != null` + access doc Firestore correspondant. Aucune CF de signed URLs n'a été ajoutée.

## Architecture actuelle

### Côté client

`utils/photoStorage.ts:80-103` — `getAuthenticatedPhotoSource()` :

- Récupère le Firebase ID token courant (`auth.currentUser.getIdToken()`)
- Construit l'URL Storage standard `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<path>?alt=media`
- Retourne l'URL **avec un header** `Authorization: Bearer <id-token>`

Le composant `PhotoImage` passe cet objet `{ uri, headers }` à `expo-image`, qui inclut le header sur le HTTP GET.

Le token est mis en cache 50 min côté client (`TOKEN_CACHE_TTL_MS`) — légèrement inférieur à la durée de vie réelle du token Firebase (1 h) pour éviter les expirations en course.

### Côté serveur

`storage.rules` :

```
match /children/{childId}/jalons/{fileName} {
  allow read: if hasAccess(childId);
  allow create: if canWriteChildMedia(childId) && isImageUpload() && isWithinSizeLimit();
  allow update: if false;
  allow delete: if canWriteChildMedia(childId);
}

match /{allPaths=**} {
  allow read, write: if false;
}
```

`hasAccess(childId)` lit le document Firestore `children/{childId}/access/{request.auth.uid}` et exige son existence. Sans token valide → `request.auth == null` → 403. Sans access doc → 403.

## Comparaison signed URL vs auth header

| Critère | Signed URL (TTL 1h) | Auth header + rules |
|---------|---------------------|---------------------|
| Empêche enum d'IDs | ✅ (URL imprévisible) | ✅ (rules bloquent sans bearer) |
| Empêche partage URL hors app | ✅ (URL expire) | ✅ (token expire 1h, rotation auto) |
| Révocation immédiate sur perte d'accès | ❌ (signed URL valide jusqu'à exp) | ✅ (access doc supprimé → rules bloquent à la requête suivante) |
| Coût Firebase | Lectures Storage uniquement | +1 read Firestore par image (rules) |
| Latence ajoutée | 0 (URL pré-signée) | 0 (token déjà en cache client) |

L'auth-header approach est **strictement plus sécurisée** sur le critère "révocation" : si on retire l'accès d'un coparent, ses requêtes échouent dès la prochaine image, sans attendre l'expiration d'un signed URL.

Le coût Firestore additionnel (1 read par image) est marginal vu le volume de photos par utilisateur (galerie typique < 100 images).

## Quand re-évaluer ?

Cette décision peut être revue si :
- Coût Firestore explose (galeries > 1000 photos par enfant)
- Besoin d'URLs partageables hors-app (export PDF, partage email) — dans ce cas, signed URLs deviennent nécessaires pour ces cas spécifiques
- Migration vers un CDN externe

## Fichiers liés

- `utils/photoStorage.ts` — résolution URL + cache token
- `components/PhotoImage.tsx` — wrapper expo-image
- `storage.rules` — règles d'accès
- `components/forms/MilestonesForm.tsx:185-187` — chemin d'upload (`children/{childId}/jalons/...`)
