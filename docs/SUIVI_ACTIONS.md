# Suivi des actions — échéances et contrôles

> Créé le 2026-11-01. **À relire chaque lundi.** Mettre à jour le statut et la
> date dès qu'une action avance ; ajouter toute nouvelle échéance ici.
>
> Statuts : ⏳ à faire · 🔄 en cours · ✅ fait · ⛔ bloqué

## 1. Migration des photos vers l'UE

Détail technique : [MIGRATION_PHOTOS_EU.md](MIGRATION_PHOTOS_EU.md).

| # | Action | Échéance | Qui | Prérequis | Contrôle | Statut |
|---|---|---|---|---|---|---|
| 1.1 | Bucket `samaye-53723-photos-eu` (europe-west1), règles, 7 fonctions, copie de 52 photos, 28 URL réécrites | 2026-11-01 | Claude | — | `node scripts/migratePhotosToEu.mjs` → « 0 à copier », « 0 URL à réécrire » | ✅ |
| 1.2 | Fusionner `feat/voice-bar-refonte` sur `main` | 2026-11-04 | Yoss | Tests de la barre vocale validés sur téléphone | CI verte sur `main` (lint, tsc, tests) | ✅ 2026-11-01 |
| 1.3 | Version **1.0.6** (`app.json` : version 1.0.6, iOS `buildNumber` 27, Android `versionCode` 8) + `eas build --profile production` | 2026-11-08 | Claude (feu vert Yoss) | 1.2 | Build EAS « finished » sur iOS et Android | ⏳ |
| 1.4 | Publier la 1.0.6 sur l'App Store et Google Play | 2026-11-15 | Yoss | 1.3 | Version 1.0.6 « disponible » dans les deux consoles | ⏳ |
| 1.5 | Contrôle hebdomadaire de la synchronisation US → UE | chaque lundi jusqu'à 1.9 | Claude ou Yoss | 1.1 | `node scripts/migratePhotosToEu.mjs` doit afficher « 0 à copier » ; sinon relancer avec `--apply` et vérifier les journaux de `mirrorLegacyPhotoUpload` | 🔄 |
| 1.6 | Imposer la mise à jour : `app_config` → `minVersion: "1.0.6"` | 2026-12-15 | Yoss | 1.4 + ≥ 90 % des utilisateurs actifs en 1.0.6 (consoles des stores) | Une app en 1.0.5 affiche l'écran « mise à jour obligatoire » | ⏳ |
| 1.7 | Politique de confidentialité site + app : « photos stockées dans l'UE (europe-west1) », retirer le transfert US pour les photos | 2026-12-15 | Claude | 1.6 | `public/privacy.html` et `app/settings/privacy.tsx` ne mentionnent plus us-central1 | ⏳ |
| 1.8 | Bascule finale : retirer `LEGACY_STORAGE_BUCKET` (app + fonctions), supprimer `mirrorLegacyPhotoUpload` / `mirrorLegacyPhotoDelete` | 2027-01-15 | Claude | 1.6 depuis 30 jours ; 1.5 à « 0 à copier » | Plus aucun accès au bucket US dans les journaux depuis 30 jours | ⏳ |
| 1.9 | Supprimer le bucket `samaye-53723.firebasestorage.app` (purger les ~12 orphelins avant) | 2027-01-31 | Yoss (action irréversible) | 1.8 | Bucket absent de la console ; photos visibles dans l'app | ⏳ |

## 2. Site web et mentions légales

| # | Action | Échéance | Qui | Prérequis | Contrôle | Statut |
|---|---|---|---|---|---|---|
| 2.1 | Téléphone de TESFA dans les mentions légales | 2026-11-08 | Yoss (fournir) / Claude (intégrer) | — | Plus de `[À COMPLÉTER]` téléphone dans `public/mentions-legales.html` | ⏳ |
| 2.2 | **Adhérer à un médiateur de la consommation** (obligatoire pour vendre des abonnements) puis l'indiquer dans CGU + mentions | 2026-11-30 | Yoss | — | Nom, adresse, site du médiateur dans `public/terms.html` et `public/mentions-legales.html` | ⏳ |
| 2.3 | Compléter : DPO (ou « non désigné »), durée des sauvegardes, région Sentry, non-entraînement AssemblyAI / Anthropic | 2026-11-30 | Yoss (infos) / Claude | — | `grep -c 'class="todo"' public/*.html` → 0 | ⏳ |
| 2.4 | Déployer le site : `firebase deploy --only hosting` | 2026-11-30 | Claude | 2.1 à 2.3 | https://suivibaby.com affiche la nouvelle version ; pages légales sans surlignage jaune | ⏳ |

## 3. Abonnements et RevenueCat

| # | Action | Échéance | Qui | Prérequis | Contrôle | Statut |
|---|---|---|---|---|---|---|
| 3.1 | Accès Premium promotionnel à vie pour `PTKG0fc5f6dhSEw8FAn0Bqiq6SJ3` dans RevenueCat (Firestore déjà Premium) | 2026-11-08 | Yoss | Client visible dans RevenueCat (ouvrir l'app connecté, ou accorder par App User ID) | L'écran Premium de ce compte affiche l'abonnement | ⏳ |
| 3.2 | Trancher l'offre **Famille** (limiter le partage Premium et réserver 5 comptes à Famille, ou fusionner Famille dans Premium) | 2026-11-30 | Yoss | — | Décision notée dans `docs/PREMIUM_OFFRE_CIBLE.md` | ⏳ |
| 3.3 | Courbes OMS et statistiques avancées : les réserver à Premium, ou les retirer des avantages Premium | 2026-11-30 | Yoss (décision) / Claude | 3.2 | Paywall, site et code cohérents | ⏳ |
| 3.4 | Vérifier la configuration de l'achat « à vie » (RevenueCat + stores) et de l'essai gratuit | 2026-11-30 | Yoss | — | Produits présents et actifs dans les deux stores | ⏳ |
| 3.5 | Tester « Restaurer mes achats » depuis un autre compte (achat sandbox) → message « abonnement lié à un autre compte » | à la 1.0.6 (test interne) | Yoss | 1.3 | Message affiché, abonnement resté sur le compte d'origine | ⏳ |

## 4. Données et conformité

| # | Action | Échéance | Qui | Prérequis | Contrôle | Statut |
|---|---|---|---|---|---|---|
| 4.1 | Vérifier que la suppression d'un **compte** efface les photos de ses enfants dans Storage (les deux buckets pendant la migration) | 2026-11-15 | Claude | — | Test sur un compte de test : plus aucun objet sous `children/{id}/` | ⏳ |
| 4.2 | Enfants refusés par les règles (`Qd3RJtmHuafDAiUKgqQA`, `obhMXGzb8ooEcXdCbKID`) : vérifier s'il s'agit de suppressions en cours ou d'accès orphelins à nettoyer | 2026-11-15 | Claude | — | Plus d'avertissement « permission denied » au démarrage | ⏳ |
| 4.3 | Désinstaller la version de développement `com.yoss7.samaye` du Samsung une fois les tests finis | fin des tests | Yoss | — | Seule l'app du Store reste installée | ⏳ |
| 4.4 | Vérifier le workflow « Deploy Cloud Functions » réparé : lancement manuel (`gh workflow run deploy-functions.yml`) — redéploie les 35 fonctions à l'identique | 2026-11-04 | Claude (feu vert Yoss) | — | Exécution verte dans GitHub Actions | ⏳ |

## Historique

| Date | Action |
|---|---|
| 2026-11-01 | Bucket UE créé ; règles Storage et 7 fonctions déployées ; 52 photos copiées ; 28 URL réécrites ; miroir testé |
| 2026-11-01 | Comptes `PcpPyt8mWHRxAQDt8Xgmfux65bB2` (RevenueCat + Firestore) et `PTKG0fc5f6dhSEw8FAn0Bqiq6SJ3` (Firestore) passés Premium |
| 2026-11-01 | RevenueCat : comportement de restauration réglé sur « Keep with original App User ID » |
| 2026-11-01 | Branche `feat/voice-bar-refonte` fusionnée sur `main` (CI verte) ; workflow de déploiement des fonctions réparé (en échec depuis mai 2026) |
