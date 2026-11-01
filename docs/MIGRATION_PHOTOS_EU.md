# Migration des photos vers un bucket Storage dans l'UE

> Plan rédigé le 2026-11-01. Rien n'est encore exécuté.

## Pourquoi

Firestore est en **eur3** (UE), les fonctions en **europe-west1** (Belgique), mais
le bucket Storage `samaye-53723.firebasestorage.app` est en **US-CENTRAL1**. Les
photos d'enfants sont donc les seules données hébergées aux États-Unis : transfert
hors UE à déclarer (fait dans les politiques de confidentialité) et argument
« hébergé en Europe » impossible.

La région d'un bucket est **définitive** : il faut créer un nouveau bucket et
migrer.

## État mesuré le 2026-11-01

| Élément | Valeur |
|---|---|
| Objets dans le bucket | **52** (17,3 Mo), tous sous `children/{childId}/…` |
| Références photo en base | 40 jalons (`events`, type `jalon`, champ `photos`) |
| … stockées en **chemin** (`children/…`) | 12 : indépendantes du bucket, rien à migrer |
| … stockées en **URL complète** (`https://firebasestorage.googleapis.com/v0/b/samaye-53723.firebasestorage.app/o/…`) | **28** : ancien format, contient le nom du bucket US, **à réécrire** |
| Objets sans référence | ~12 (52 objets pour 40 références) : orphelins probables, à vérifier |
| Autres champs photo | `content_reports.photoPath` (chemin, signalements) ; `babyService.photoUrl` à vérifier (non utilisé pour l'instant) |

## Code qui dépend du bucket

| Fichier | Usage |
|---|---|
| `config/firebase.ts:17` | `storageBucket` du SDK client |
| `utils/photoStorage.ts:3` | `FIREBASE_STORAGE_BUCKET` : URL de lecture authentifiée |
| `components/forms/MilestonesForm.tsx:176` | URL d'upload REST |
| `services/events/photoCleanup.ts:36` | URL de suppression REST |
| `functions/index.js` (`admin.storage().bucket()`, 3 appels) | modération (l.1734), suppression immédiate d'un enfant (l.4400), purge planifiée (l.4872) |
| `firebase.json` → `storage.rules` | règles du bucket par défaut uniquement |

`utils/photoStorage.ts` sait déjà convertir une URL complète en chemin
(`extractStoragePath`), mais `getAuthenticatedPhotoSource` affiche une URL
complète **telle quelle** : les 28 photos anciennes resteraient lues depuis le
bucket US tant qu'elles ne sont pas réécrites.

## Cible

- **Nouveau bucket** : `samaye-53723-photos-eu`, région **`europe-west1`** (Belgique,
  comme les fonctions ; durabilité 11 neuf, coût le plus bas). Alternative :
  multi-région `EU` (redondance géographique, environ 2× le prix du stockage).
- Créé **depuis la console Firebase** (Storage → « Ajouter un bucket ») pour qu'il
  soit lié au projet Firebase (SDK client, règles).
- Mêmes règles `storage.rules`. Les règles lisent Firestore (`firestore.get`) :
  accepter la demande d'autorisation « cross-service » de la console pour ce
  bucket.
- Toutes les références photo stockées en **chemin** (`children/…`), jamais en URL.

## Étapes

Chaque étape est réversible jusqu'à l'étape 8.

1. **Créer le bucket** `samaye-53723-photos-eu` (console Firebase, `europe-west1`,
   accès uniforme), puis déployer les règles sur les deux buckets :
   `firebase.json` → `"storage": [{ "target": "main", "rules": "storage.rules" },
   { "target": "eu", "rules": "storage.rules" }]` et
   `firebase target:apply storage eu samaye-53723-photos-eu`.
2. **Cloud Functions compatibles avec les deux buckets** : remplacer les trois
   `admin.storage().bucket()` par une boucle sur `[PHOTOS_BUCKET, LEGACY_BUCKET]`
   pour la suppression (un enfant supprimé doit être effacé partout). Déployer.
3. **App : lecture tolérante** (`utils/photoStorage.ts`) : normaliser toute URL
   complète en chemin, lire depuis le nouveau bucket, et si l'objet n'y est pas
   encore (404), relire depuis l'ancien. L'upload et la suppression passent par
   la constante du nouveau bucket. Build EAS et publication.
4. **Copier les objets** : `gcloud storage rsync -r
   gs://samaye-53723.firebasestorage.app gs://samaye-53723-photos-eu`, puis
   comparer le nombre et la taille des objets.
5. **Réécrire les 28 URL en chemins** : script Admin SDK
   (`scripts/migratePhotoRefs.mjs`) avec `--dry-run` par défaut, idempotent
   (n'agit que sur les valeurs qui commencent par `https://firebasestorage…`),
   journalise chaque document modifié.
6. **Période de transition** : tant que d'anciennes versions de l'app tournent,
   elles écrivent encore dans le bucket US. Relancer le `rsync` (étape 4) chaque
   jour, ou ajouter une fonction déclenchée à l'upload qui recopie l'objet. Fin
   de transition : quand la version minimale imposée (`AppUpdateManager`) est la
   version de l'étape 3.
7. **Bascule finale** : dernier `rsync`, puis retirer la lecture de secours vers
   l'ancien bucket (nouveau build).
8. **Mettre à jour les textes** : politique de confidentialité du site
   (`public/privacy.html`) et de l'app (`app/settings/privacy.tsx`) : « photos
   stockées dans l'UE (europe-west1) » ; supprimer la mention du transfert vers
   les États-Unis pour les photos.
9. **Supprimer l'ancien bucket** après 30 jours sans lecture (vérifier les
   journaux d'accès), en profitant pour purger les objets orphelins.

## Retour arrière

Jusqu'à l'étape 7, l'ancien bucket reste complet et la lecture de secours le
couvre : il suffit de remettre l'ancienne constante de bucket. Après l'étape 9,
plus de retour possible : ne supprimer qu'après vérification.

## Coût

17 Mo aujourd'hui : quelques centimes par mois. Le quota gratuit de Firebase
Storage ne couvre que les buckets US ; en `europe-west1`, le stockage et la
bande passante sont facturés dès le premier octet (environ 0,02 $/Go/mois de
stockage).

## À vérifier avant de lancer

- Que la suppression d'un **compte** efface bien les photos de ses enfants dans
  Storage (point relevé lors de l'audit du site, à revérifier).
- Le format d'upload REST de `MilestonesForm` avec le nouveau bucket (même API,
  seul le nom du bucket change).
- La version minimale imposée par `AppUpdateManager`, pour dater la fin de la
  transition.
