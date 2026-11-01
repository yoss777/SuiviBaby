# Migration des photos vers un bucket Storage dans l'UE

> Plan rédigé le 2026-11-01. Étapes 1, 2, 4 et 5 faites le 2026-11-01 ; reste le build de l'app (3) puis la transition.

> Échéances et contrôles : [SUIVI_ACTIONS.md](SUIVI_ACTIONS.md), section 1.

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

Choix de transition (2026-11-01) : **miroir côté serveur** plutôt qu'une lecture
de secours dans l'app (une photo absente aurait déclenché une erreur puis un
second chargement à chaque affichage).

1. ✅ **Bucket créé** : `samaye-53723-photos-eu`, `europe-west1`, rattaché à
   Firebase. Règles : `firebase.json` → `storage` en deux cibles (`legacy`,
   `photos-eu`) sur le même `storage.rules`, cibles dans `.firebaserc`.
   ✅ Règles déployées sur les deux buckets le 2026-11-01.
2. ✅ **Cloud Functions** (code prêt) : les suppressions (modération, suppression
   d'un enfant, purge planifiée) agissent sur les deux buckets
   (`deletePhotoEverywhere`, `deleteChildPhotosEverywhere`). Miroir :
   `mirrorLegacyPhotoUpload` / `mirrorLegacyPhotoDelete` (déclencheurs sur le
   bucket US, région `us-central1` imposée) recopient chaque ajout et chaque
   suppression du bucket US vers le bucket UE.
   ✅ Déployé le 2026-11-01 (7 fonctions). Miroir vérifié avec un fichier témoin :
   copie puis suppression répercutées en UE en quelques secondes.
3. ✅ **App** (code prêt) : lecture et écriture dans le bucket UE
   (`config/firebase.ts`, `utils/photoStorage.ts`) ; les anciennes URL complètes
   sont converties en chemins à l'affichage (`normalizePhotoRef`) ; suppression
   dans les deux buckets (`photoCleanup.ts`). Tests : `__tests__/photoStorage.test.ts`.
   ⏳ Build EAS et publication, **après** les étapes 4 et 5.
4. ✅ **Objets copiés** le 2026-11-01 : 52/52 dans le bucket UE
   (`node scripts/migratePhotosToEu.mjs --apply`).
5. ✅ **28 URL réécrites en chemins** le 2026-11-01 (même script). Compatible
   avec les anciennes versions de l'app, qui savent lire les chemins.
6. **Transition** : le miroir couvre les anciennes versions (elles écrivent et
   suppriment encore aux États-Unis). Fin quand la version minimale imposée
   (`AppUpdateManager`) est celle de l'étape 3.
7. **Bascule finale** : relancer le script (vérification), retirer
   `LEGACY_STORAGE_BUCKET` des suppressions côté app et fonctions, supprimer les
   deux fonctions miroir.
8. **Textes** : politiques de confidentialité du site et de l'app, « photos
   stockées dans l'UE (europe-west1) » ; retirer le transfert US pour les photos.
9. **Supprimer l'ancien bucket** après 30 jours sans accès, en purgeant les
   objets orphelins.

## Retour arrière

Jusqu'à l'étape 7, l'ancien bucket reste complet (le miroir ne copie que vers
l'UE) : il suffit de remettre l'ancienne constante de bucket dans l'app. Après l'étape 9,
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
