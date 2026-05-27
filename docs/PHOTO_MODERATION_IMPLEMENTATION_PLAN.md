# Plan Detaillé d'Actions: Photos Sensibles d'Enfants dans SuiviBaby

## Objectif

Adapter SuiviBaby pour gérer correctement les photos potentiellement sensibles d'enfants, par exemple:

- couche ouverte
- selles visibles
- fesses visibles
- zones intimes visibles

Le plan doit coller au produit réel aujourd'hui:

- SuiviBaby est un journal parental privé
- les photos sont liées aux événements, surtout aux `jalon`
- le partage se fait entre adultes autorisés sur un enfant
- il n'existe pas aujourd'hui de réseau social public dans le produit

Le bon objectif n'est donc pas de construire immédiatement une plateforme de modération lourde type réseau social, mais:

1. fermer les failles de stockage et d'accès
2. documenter une politique de contenu claire
3. ajouter des garde-fous produit minimaux exigibles
4. préparer une modération serveur plus avancée seulement si le périmètre s'élargit

## Résumé Exécutif

### Décision recommandée pour SuiviBaby

Phase 1:

- pas de modération automatique IA en V1
- priorité absolue aux `storage.rules`
- suppression du modèle d'URLs Firebase Storage à token persistant
- politique de contenu explicite
- mécanisme de signalement minimal
- décision produit documentée: partage strictement privé seulement

Phase 2:

- si le produit introduit un partage plus large, un feed, des invitations élargies, des commentaires photo, des liens externes, ou une croissance forte du volume
- alors ajout d'une modération serveur photo

## Statut au 19 avril 2026

### ✅ Réalisé — Infra & Storage (Phase 1)

- ✅ `storage.rules` ajoutées et versionnées dans le repo
- ✅ `firebase.json` mis à jour pour référencer `storage.rules` + émulateur Storage
- ✅ règles Storage : deny-all par défaut, `children/{childId}/jalons/{fileName}` seul path autorisé
- ✅ lecture limitée aux adultes ayant accès à l'enfant (`hasAccess(childId)`)
- ✅ écriture limitée à `owner`, `admin` ou `canWriteEvents`
- ✅ validation MIME image uniquement + taille max 5 MB + fichiers immuables (no update)
- ✅ tests de règles Storage : 7 tests dans `__tests__/storage.rules.test.ts`
- ✅ `config/firebase.ts` : connexion émulateur Storage
- ✅ `storage.rules` déployées en production le 18 avril 2026

### ✅ Réalisé — Suppression des URLs à token (Phase 2)

- ✅ le flux photo jalon ne génère plus de `downloadURL` persistante en base
- ✅ les nouveaux uploads stockent le chemin Storage dans `events.photos[]`
- ✅ `utils/photoStorage.ts` : accès authentifié via `Authorization: Bearer` header (pas de token dans l'URL)
- ✅ `components/ui/PhotoImage.tsx` : composant d'image sécurisé
- ✅ tous les composants photo migrés (chrono, milestones, gallery, PolaroidGallery, SwipeGallery, RecentEventsList)
- ✅ compatibilité legacy conservée pour les anciens événements avec URL Firebase

### ✅ Réalisé — Politique de contenu (Phase 3)

- ✅ notice photo dans `MilestonesForm.tsx` : "Gardez les photos dans un cadre privé..."
- ✅ CGU (article 8 "Photos et contenu sensible") mises à jour dans l'app et sur le web
- ✅ Privacy Policy (article 7 "Signalements et contenu sensible") mises à jour
- ✅ pages légales déployées sur Firebase Hosting le 18 avril 2026

### ✅ Réalisé — Signalement de base (Phase 4.0)

- ✅ `services/contentReportService.ts` : service client de soumission de signalement
- ✅ collection Firestore `reports/{reportId}` avec rules strictes
- ✅ `components/moments/ReportModal.tsx` : modale avec 4 motifs + message optionnel
- ✅ signalement centralisé dans `SwipeGallery.tsx`
- ✅ `onReportCreated` CF déployée : notification email à `contact@suivibaby.com`
- ✅ tests Firebase Rules : 118 tests passent

### ✅ Réalisé — Workflow complet de signalement (Phase 4.1)

Objectif atteint : workflow de bout en bout avec actions séparées "Masquer pour moi" vs "Signaler", masquage conditionnel, notification auteur, résolution opérateur.

- ✅ `intimate_child_nudity` ajouté comme 4ème motif de signalement
- ✅ Bouton drapeau transformé en Action Sheet (Masquer / Signaler / Annuler) dans SwipeGallery
- ✅ Mécanisme "Masquer pour moi" : collection `user_hidden_photos/{userId}`, service client, listener temps réel
- ✅ Photos masquées filtrées dans gallery.tsx + useMomentsData.ts (hook `useHiddenPhotos`)
- ✅ Photos avec `reported: true` filtrées côté client
- ✅ Écran settings `hidden-photos.tsx` avec listener temps réel, thumbnail, bouton unhide, a11y complète
- ✅ Settings : item "Photos masquées" désactivé quand count = 0 (pattern cohérent avec "Enfants masqués")
- ✅ CF `onReportCreated` mise à jour : hide reporter + auto-hide global pour `intimate_child_nudity` + push auteur
- ✅ CF `resolveReport` créée (admin-only) : dismiss / remove_photo / remove_event + email reporter
- ✅ Scripts CLI : `listOpenReports.mjs` + `resolveReport.mjs`
- ✅ Firestore rules : `user_hidden_photos/{userId}` + `intimate_child_nudity` dans les raisons valides
- ✅ CFs déployées en production (onReportCreated Gen 1 + resolveReport Gen 2)
- ✅ Firestore rules déployées en production

### ✅ Réalisé — Performance photos (Phase 4.2)

- ✅ Migration `Image` RN → `expo-image` (SDWebImage/Glide, cache memory-disk)
- ✅ Cache mémoire des sources résolues (50min TTL aligné avec token auth)
- ✅ `cacheKey` stable basé sur le Storage path (indépendant du token auth changeant)
- ✅ SwipeGallery : fix repositionnement intelligent après edit/cancel (requestAnimationFrame)
- ✅ SwipeGallery : edit via InteractionManager pour éviter les conflits Modal empilées

### ✅ Réalisé — Settings réorganisation (Phase 4.3)

- ✅ Sections réorganisées : Compte, Famille, Préférences, Informations, Zone dangereuse
- ✅ Biométrie déplacée dans Compte (sécurité du compte, pas paramètre app)
- ✅ "À propos" fusionné dans le footer avec version dynamique (`Constants.expoConfig?.version`)
- ✅ Couleur accent migrée vers `nc.todayAccent` (design system)
- ✅ Header thémé pour dark mode
- ✅ A11y : roles sur les sections, labels sur le bandeau suppression
- ✅ Typos françaises corrigées (accents manquants)

## Workflow cible — Signalement complet

### Principe fondamental

Dans une app familiale privée, **report et hide-for-everyone ne doivent pas être confondus**. Un co-parent en conflit ne doit pas pouvoir faire disparaître instantanément du contenu légitime.

### Bouton drapeau → Action Sheet

```
Tap drapeau dans SwipeGallery
       │
       ▼
Action Sheet s'ouvre :
  ┌─────────────────────────────────┐
  │ Masquer cette photo pour moi    │  → hide local immédiat, pas de report serveur
  │ Signaler un contenu sensible    │  → ouvre ReportModal (motif + message)
  │ Annuler                         │
  └─────────────────────────────────┘
```

### Option 1 — "Masquer cette photo pour moi"

- Photo cachée **uniquement** pour le reporter
- Stocké dans `user_hidden_photos/{userId}` (Firestore, par enfant)
- Aucun impact sur les autres parents
- Aucun report serveur, aucune notification
- **Réversible** : écran `app/settings/hidden-photos.tsx` pour gérer les photos masquées

### Option 2 — "Signaler un contenu sensible"

1. `ReportModal` s'ouvre avec 4 motifs :
   - `intimate_child_nudity` — "Nudité intime d'un enfant" (gravité élevée)
   - `sensitive_child_photo` — "Photo sensible d'un enfant"
   - `privacy` — "Problème de confidentialité"
   - `other` — "Autre"
2. Photo masquée pour le reporter (même mécanisme que "Masquer pour moi")
3. Document `reports/{reportId}` créé avec `status: "pending_review"`
4. CF `onReportCreated` :
   - Envoie email opérateur à `contact@suivibaby.com`
   - Envoie notification push à l'auteur de la photo : "Votre photo a été signalée et est en cours d'examen"
   - **Si motif = `intimate_child_nudity`** : masquage global automatique (`reported: true` sur l'event) — seul cas où un signalement masque globalement au premier report

### Masquage global conditionnel

| Motif | Masquage pour reporter | Masquage global | Notification auteur |
|-------|----------------------|-----------------|-------------------|
| `intimate_child_nudity` | ✅ immédiat | ✅ automatique | ✅ push |
| `sensitive_child_photo` | ✅ immédiat | ❌ seulement après validation opérateur | ✅ push |
| `privacy` | ✅ immédiat | ❌ seulement après validation opérateur | ✅ push |
| `other` | ✅ immédiat | ❌ seulement après validation opérateur | ✅ push |

### Côté client — Photo signalée globalement

Les events avec `reported: true` affichent un placeholder :
```
┌─────────────────────────┐
│                         │
│   🔒 En cours de        │
│   vérification          │
│                         │
└─────────────────────────┘
```

### Actions opérateur — CF `resolveReport`

| Action | Effet |
|--------|-------|
| `dismiss` | Faux positif. `reported: false` sur l'event, photo restaurée, notification au reporter "contenu conforme" |
| `remove_photo` | Photo supprimée de Storage, retirée de `events.photos[]`, notification au reporter "contenu retiré" |
| `remove_event` | Event entier supprimé via `deleteEventCascade`, notification au reporter "contenu retiré" |

### Outils opérateur — Scripts CLI

- `scripts/listOpenReports.mjs` : liste les signalements `status: "pending_review"` avec détails
- `scripts/resolveReport.mjs --id=xxx --action=dismiss|remove_photo|remove_event --note="..."` : résout un signalement

### Écran settings — Photos masquées

Nouvel écran `app/settings/hidden-photos.tsx` :
- Liste toutes les photos masquées par l'utilisateur (hide-for-me + signalées)
- Bouton "Afficher à nouveau" pour chaque photo masquée
- Permet de revenir sur un masquage volontaire

### Workflow complet

```
User voit une photo
       │
       ├── Tape drapeau
       │         │
       │         ▼
       │    Action Sheet
       │    ┌──────────────────────────┐
       │    │ Masquer pour moi         │──→ hide local → user_hidden_photos/{uid}
       │    │ Signaler contenu sensible│──→ ReportModal → choix motif + message
       │    │ Annuler                  │
       │    └──────────────────────────┘
       │                                          │
       │                                          ▼
       │                                   submitContentReport()
       │                                          │
       │                                          ▼
       │                                   reports/{reportId} créé
       │                                          │
       │                                          ▼
       │                                   CF onReportCreated
       │                                   ├── email opérateur
       │                                   ├── push auteur "photo signalée"
       │                                   ├── hide pour reporter
       │                                   └── si intimate_child_nudity → reported:true sur event
       │                                          │
       │                                          ▼
       │                                   Opérateur reçoit email
       │                                          │
       │                                          ▼
       │                                   scripts/resolveReport.mjs
       │                                   ├── dismiss → reported:false, notif reporter
       │                                   ├── remove_photo → delete Storage, notif reporter
       │                                   └── remove_event → deleteEventCascade, notif reporter
       │
       ▼
  Photo affichée normalement (sauf si reported:true ou hidden par le user)

## Pourquoi ce plan est le bon pour SuiviBaby

### Ce que SuiviBaby n'est pas

SuiviBaby n'est pas aujourd'hui:

- un réseau social public
- une galerie publique
- une plateforme de découverte de contenu
- une app UGC ouverte au grand public

### Ce que SuiviBaby est

SuiviBaby est aujourd'hui:

- une app parentale privée
- un journal de suivi enfant
- un produit avec partage restreint entre adultes autorisés
- un produit manipulant potentiellement des données de santé et des photos sensibles

Conclusion:

Le vrai risque immédiat n'est pas "un store va rejeter l'app parce qu'un parent a une photo médicale privée", mais:

- une fuite d'accès aux photos
- des URLs téléchargeables persistantes
- l'absence de règles Storage strictes vérifiées
- l'absence de politique produit explicite

## État Actuel du Repo

## Flux actuel

Statut:

- partiellement corrigé le 18 avril 2026
- le repo ne construit plus de `downloadURL` persistante pour les nouveaux jalons photo
- les anciens événements peuvent encore contenir des URLs legacy tant qu'ils n'ont pas été réédités

Dans `components/forms/MilestonesForm.tsx`:

1. l'utilisateur choisit une photo via `expo-image-picker`
2. la photo est compressée localement
3. la photo est uploadée directement vers Firebase Storage
4. un chemin Storage est retourné
5. ce chemin est stocké dans `events.photos[]`

Fichier concerné:

- [components/forms/MilestonesForm.tsx](/Users/yoss/Projets/SuiviBaby/components/forms/MilestonesForm.tsx:149)

## Constats importants

Statut après phase 1 + début phase 2:

- `firebase.json` déclare maintenant `storage.rules`
- le repo versionne maintenant une vraie politique Storage
- le flux des nouveaux uploads ne génère plus d'URL à token persistant en base
- les lectures se font désormais soit sur URL legacy, soit via accès authentifié à partir d'un chemin Storage
- le risque résiduel porte surtout sur les anciennes données déjà stockées en URL

Fichiers concernés:

- [firebase.json](/Users/yoss/Projets/SuiviBaby/firebase.json:1)
- [components/forms/MilestonesForm.tsx](/Users/yoss/Projets/SuiviBaby/components/forms/MilestonesForm.tsx:177)

## Politique Produit Cible

### Règle principale

SuiviBaby n'autorise pas le partage de photos montrant les parties intimes d'un enfant ou un contenu corporel sensible lorsque cela dépasse un usage strictement privé entre adultes autorisés.

### Position V1 recommandée

Dans la V1 du durcissement:

- les photos restent possibles dans un contexte strictement privé SuiviBaby
- aucun partage public ou lien externe anonyme ne doit exister
- pas d'ouverture du périmètre avant sécurisation technique

### Contenu explicitement sensible

Inclure dans la politique:

- nudité intime
- couche ouverte avec parties intimes visibles
- exposition nette des fesses dans un contexte photo centré sur cela
- contenu corporel graphique particulièrement sensible

### Ce que la politique doit dire

Le produit doit expliquer:

- que les photos sont réservées à un usage privé dans le suivi de l'enfant
- que certains contenus sensibles ne doivent pas être partagés au-delà des adultes autorisés
- que SuiviBaby peut retirer un contenu signalé ou jugé inadapté

## Décision V1 sur la Modération

## Ce que nous faisons en V1

- pas de modération automatique par IA
- pas d'envoi de photos d'enfants à un service tiers de classification
- pas de review humaine systématique

## Ce que nous faisons à la place

- sécurisation forte de l'accès aux fichiers
- suppression des URLs persistantes partageables
- politique de contenu
- signalement
- suppression rapide en cas de besoin
- décision documentée et réévaluable

## Pourquoi cette décision est défendable

Parce que:

- contexte privé et familial
- volume limité
- pas de diffusion publique
- meilleure maîtrise des risques vie privée

Mais cette décision n'est acceptable que si:

- les accès Storage sont strictement verrouillés
- les photos ne sont pas partageables par token persistant
- la politique de contenu existe
- un signalement est possible

## Priorités d'Implémentation

## Priorité 1: Vérifier et Déployer des `storage.rules`

Statut:

- implémenté dans le repo
- validation locale faite et verte
- déployé sur Firebase en production le 18 avril 2026

### Objectif

S'assurer que seules les personnes authentifiées et autorisées sur l'enfant peuvent lire et écrire les photos.

### Actions

1. vérifier s'il existe des règles Storage non versionnées dans la console Firebase
2. `fait` créer un fichier `storage.rules` dans le repo
3. `fait` brancher `storage.rules` dans `firebase.json`
4. déployer les règles
5. tester les cas:
   - parent autorisé
   - utilisateur authentifié sans accès à l'enfant
   - utilisateur non authentifié

Statut d'exécution:

- `fait` tests emulator Firestore + Storage verts
- `fait` déploiement réel des rules

### Règles minimales attendues

- lecture: réservée aux adultes ayant accès à l'enfant
- écriture: réservée aux adultes ayant accès à l'enfant
- suppression: réservée aux adultes ayant accès à l'enfant
- validation de chemin par `childId`
- validation de type MIME image
- validation de taille max

### Fichiers à modifier

- `storage.rules` nouveau
- `firebase.json`
- éventuellement `firestore.rules` si les règles Storage consultent les accès enfant via Firestore

### Tests à écrire

- tests Firebase Rules pour Storage si vous les ajoutez
- sinon au minimum checklist manuelle documentée

## Priorité 2: Supprimer les URLs Firebase Storage à Token Persistant

Statut:

- en grande partie réalisé pour les nouveaux uploads
- compatibilité legacy conservée pour les événements déjà existants

### Problème

Le flux actuel fabrique des URLs:

```txt
https://firebasestorage.googleapis.com/v0/b/.../o/...?...&token=...
```

Ces URLs sont dangereuses pour ce cas d'usage:

- elles sont faciles à copier
- elles contournent l'idée mentale "photo privée"
- si elles fuient, l'accès est possible par possession du token

### Objectif

Ne plus stocker dans `events.photos[]` des URLs de téléchargement à token persistant.

### Options techniques

#### Option recommandée V1

Stocker le `storagePath` ou un identifiant média, puis lire les images via le SDK Firebase Storage avec auth et rules.

Exemple de structure:

```ts
interface EventPhotoRef {
  path: string;
}
```

ou:

```ts
photoPaths?: string[];
```

#### Option alternative

Passer par une Cloud Function authentifiée qui stream l'image après contrôle d'accès.

À utiliser si:

- le SDK direct devient trop limité
- ou si vous voulez masquer complètement les chemins Storage au client

### Ce qu'il faut changer

- `fait partiellement` conserver `photos: string[]` mais y stocker désormais des chemins Storage pour les nouveaux uploads
- `fait` refactor des écrans qui affichent les images pour accepter URL legacy + chemin Storage
- `fait` lecture authentifiée côté client pour les chemins Storage
- `reste éventuel` renommer plus tard le champ vers `photoPaths` si vous voulez un schéma plus explicite

### Fichiers impactés

- `components/forms/MilestonesForm.tsx`
- `app/(drawer)/baby/(tabs)/chrono.tsx`
- `app/(drawer)/baby/(tabs)/home.tsx`
- `app/(drawer)/baby/gallery.tsx`
- `app/(drawer)/baby/(tabs)/milestones.tsx`
- `services/eventsService.ts`

## Priorité 3: Politique de Contenu Explicite

Statut:

- implémenté le 18 avril 2026
- publié dans l'app et sur le site web Firebase Hosting

### Objectif

Pouvoir démontrer qu'une politique existe, qu'elle est publiée, et qu'elle couvre les cas de contenu sensible.

### Où la mettre

- CGU / conditions d'utilisation
- éventuellement politique de contenu ou section dédiée dans les CGU
- texte court dans l'app lors du premier ajout photo

### Contenu minimal

- ce qui est autorisé
- ce qui est interdit
- le caractère privé du partage
- le droit de retirer un contenu signalé

### Texte in-app recommandé

Exemple:

> Vos photos sont privées et visibles uniquement par les adultes autorisés sur cet enfant. N'ajoutez pas de photos destinées à être diffusées hors de ce cadre privé.

### Fichiers probables

- page légale / HTML hébergé
- éventuellement `public/privacy.html` ou équivalent
- éventuellement un composant de notice dans le formulaire photo

### Réalisation dans SuiviBaby

- `fait` texte de rappel ajouté dans `components/forms/MilestonesForm.tsx`
- `fait` section dédiée ajoutée dans `public/terms.html`
- `fait` section dédiée ajoutée dans `public/privacy.html`
- `fait` contenu synchronisé dans `app/settings/terms.tsx`
- `fait` contenu synchronisé dans `app/settings/privacy.tsx`
- `fait` déploiement Hosting live sur `https://samaye-53723.web.app`

## Priorité 4: Mécanisme de Signalement

Statut:

- implémenté en V1 le 18 avril 2026
- validé par tests rules
- déployé côté règles Firestore en production

### Objectif

Ajouter un garde-fou simple exigible dans une app avec photos partagées entre plusieurs utilisateurs autorisés.

### V1 pragmatique

Pas besoin d'un backoffice complet.

Mettre:

- un bouton `Signaler`
- un formulaire minimal ou une action qui envoie:
  - `eventId`
  - `childId`
  - `photo path/id`
  - `userId`
  - `reason`

### Implémentation possible

#### Option simple

Créer une collection Firestore:

```ts
reports/{reportId}
```

avec:

```ts
interface ContentReport {
  id: string;
  reporterUserId: string;
  childId: string;
  eventId?: string;
  photoPath?: string;
  reason: "sensitive_child_photo" | "privacy" | "other";
  message?: string;
  status: "open" | "resolved";
  createdAt: Timestamp;
}
```

#### Option encore plus simple

Cloud Function qui envoie un email interne.

### Fichiers potentiels

- nouveau service `services/contentReportService.ts`
- bouton dans galerie / photo viewer / écran milestone

### Réalisation dans SuiviBaby

- `fait` collection Firestore `reports/{reportId}`
- `fait` service client `services/contentReportService.ts`
- `fait` `ReportModal.tsx` : modale avec choix de motif (3 options) + champ message optionnel
- `fait` signalement intégré directement dans `SwipeGallery.tsx` (logique centralisée)
- `fait` code dupliqué supprimé de `gallery.tsx` et `useMomentsActions.ts`
- `fait` prop `onReport` remplacé par gestion interne dans SwipeGallery
- `fait` règles Firestore : lecture auteur seulement, création users avec accès enfant, update/delete interdit
- `fait` tests ajoutés dans `__tests__/firestore.rules.test.ts`
- `fait` CF `onReportCreated` : Firestore trigger qui envoie un email de notification à `contact@suivibaby.com` via Resend avec motif, reporter, childId, eventId, photoPath, message

### Workflow de signalement complet (état actuel)

```
User voit une photo problématique
       │
       ▼
Tape l'icône drapeau dans SwipeGallery
       │
       ▼
ReportModal s'ouvre :
  - Choix du motif (photo sensible / confidentialité / autre)
  - Champ message optionnel
  - Bouton "Envoyer"
       │
       ▼
submitContentReport() → Firestore reports/{reportId}
       │
       ▼
CF onReportCreated (trigger Firestore)
       │
       ▼
Email envoyé à contact@suivibaby.com via Resend
  - Subject: "[Signalement] Photo sensible d'un enfant — SuiviBaby"
  - Contenu: reportId, motif, reporter email, childId, eventId, photoPath, message
       │
       ▼
Opérateur lit l'email → consulte Firebase Console → décide de l'action
```

### Limites assumées de la V1

- pas de backoffice admin (consultation/traitement via Firebase Console)
- pas de modération IA
- pas de masquage automatique de la photo après signalement
- l'opérateur doit manuellement supprimer la photo dans Firebase Storage et/ou l'event dans Firestore si nécessaire

## Priorité 5: Documenter la Décision "Pas de Modération IA en V1"

### Objectif

Éviter une dette implicite.

### Document interne à créer

Par exemple:

`docs/PHOTO_MODERATION_DECISION_RECORD.md`

### Contenu

- contexte produit actuel
- pourquoi pas d'IA en V1
- quels risques restent
- quelles mitigations existent
- quels signaux déclenchent une réévaluation

### Déclencheurs de réévaluation

- ajout d'un partage élargi
- ajout de commentaires ou feed
- ajout de liens externes partageables
- hausse du volume photo
- incident sécurité ou signalement sérieux
- exigence store explicite pendant review

## Architecture Cible V1 Réaliste

## Modèle recommandé

Pas besoin en V1 de construire toute une collection `mediaAssets` si l'objectif immédiat est de sécuriser le privé.

### Option simple recommandée

Faire évoluer `events` de:

```ts
photos?: string[]; // URLs tokenisées
```

vers:

```ts
photoPaths?: string[]; // chemins Storage
```

### Pourquoi cette option

- plus faible coût d'implémentation
- réduit le risque de fuite via URL
- compatible avec le produit actuel
- plus simple à déployer vite

## Architecture Cible V2 si le produit évolue

Si SuiviBaby élargit le périmètre de partage, alors introduire:

- collection `mediaAssets`
- statuts de modération
- pipeline serveur
- éventuelle modération IA

À ce moment-là seulement, une architecture dédiée `mediaAssets/{mediaId}` devient rentable.

## Plan d'Implémentation par Phases

## Phase 0: Audit et cadrage

### Actions

- vérifier l'état réel des règles Storage dans Firebase
- confirmer le comportement actuel des accès photo
- recenser tous les points d'entrée et de lecture des photos
- valider la politique produit

### Livrables

- état des lieux Storage
- inventaire des écrans photo
- décision V1 validée

## Phase 1: Sécurisation infra

Statut:

- faite dans le repo
- validée en local via émulateurs
- validée en déploiement réel

### Actions

- créer `storage.rules`
- référencer `storage.rules` dans `firebase.json`
- verrouiller les accès lecture/écriture
- documenter la checklist de test

### Livrables

- règles Storage déployées
- accès privés vérifiés

## Phase 2: Suppression des URLs à token

Statut:

- faite pour les nouveaux jalons photo
- migration des anciennes données non faite

### Actions

- refactor `MilestonesForm` pour stocker des chemins et non des URLs
- refactor lecture photo côté galerie/chrono/home/milestones
- lecture des fichiers via SDK auth + rules

### Livrables

- plus d'URL `alt=media&token=...` stockée dans les nouveaux événements
- affichage compatible ancien format et nouveau format

## Phase 3: Politique de contenu et UX d'information

### Actions

- ajouter texte légal
- ajouter texte court in-app
- vérifier cohérence privacy policy / store declarations

### Livrables

- politique publiée
- notice visible dans l'app

## Phase 4: Signalement et retrait

### Actions

- ajouter bouton `Signaler`
- enregistrer un report
- définir procédure de traitement

### Livrables

- flux minimal de signalement opérationnel

## Phase 5: Décision record et roadmap V2

### Actions

- créer un document de décision interne
- définir les conditions de passage à modération serveur

### Livrables

- `decision record`
- critères de réévaluation clairs

## Option V2: Modération Serveur Photo

Cette phase ne doit être lancée que si SuiviBaby devient plus exposé.

### Déclencheurs

- partage plus large que les adultes explicitement autorisés
- croissance forte de volume
- incident
- exigence store explicite

### Ce que la V2 ajouterait

- collection `mediaAssets`
- upload en quarantaine
- validation serveur avant rattachement à l'événement
- statuts `approved`, `blocked`, `review_required`
- éventuellement provider IA

### Important

Ne pas partir là-dessus avant d'avoir sécurisé la V1.

## Fichiers à Modifier en V1

### Infra

- `firebase.json`
- `storage.rules` nouveau

### Client

- `components/forms/MilestonesForm.tsx`
- `app/(drawer)/baby/gallery.tsx`
- `app/(drawer)/baby/(tabs)/milestones.tsx`
- `app/(drawer)/baby/(tabs)/chrono.tsx`
- `app/(drawer)/baby/(tabs)/home.tsx`

### Services

- `services/eventsService.ts`
- éventuellement nouveau `services/storagePhotoService.ts`
- éventuellement nouveau `services/contentReportService.ts`

### Docs

- privacy policy / legal content
- `docs/PHOTO_MODERATION_DECISION_RECORD.md` nouveau

## Tests à Ajouter

## Sécurité

- parent autorisé peut lire
- parent autorisé peut écrire
- utilisateur authentifié non autorisé ne peut pas lire
- utilisateur authentifié non autorisé ne peut pas écrire
- utilisateur non authentifié ne peut pas lire

## Fonctionnel

- création d'un jalon photo
- affichage de la photo en galerie
- suppression de la photo
- signalement d'une photo

## Non-régression

- anciens événements avec `photos[]` continuent à s'afficher pendant la transition
- nouveaux événements utilisent le nouveau flux

## Migration

### Court terme

Supporter les deux formats:

- legacy: `photos[]`
- nouveau: `photoPaths[]`

### Moyen terme

Script de migration possible:

- transformer les anciennes URLs en chemins si possible
- ou marquer les anciennes photos comme legacy et les laisser vivre jusqu'à suppression manuelle

### Recommandation

Ne pas tenter une migration lourde avant d'avoir stabilisé le nouveau flux.

## Questions à Trancher

1. Voulez-vous permettre les photos de selles sans nudité visible dans le cadre privé?
2. Voulez-vous afficher une notice au premier upload photo seulement, ou à chaque ajout?
3. Voulez-vous un signalement discret ou visible dans tous les viewers?
4. Voulez-vous garder une compatibilité longue avec `photos[]`, ou planifier une migration rapide?
5. Souhaitez-vous préparer dès maintenant la structure `mediaAssets`, même sans l'utiliser en V1?

## Décision Recommandée Finale

Pour SuiviBaby aujourd'hui, la meilleure trajectoire est:

- sécuriser immédiatement Storage ✅ fait
- arrêter de stocker des URLs à token persistant ✅ fait
- formaliser une politique de contenu ✅ fait
- ajouter un signalement avec choix de motif + notification email ✅ fait
- documenter pourquoi la modération automatique n'est pas lancée en V1 ✅ fait (ce document)
- repousser la modération serveur avancée à une V2 conditionnelle ✅ documenté ci-dessous

C'est l'option la plus réaliste, la plus cohérente avec le produit actuel, et la plus défendable techniquement.

## Plan d'Implémentation — Workflow complet Phase 4.1 (TERMINÉ)

### ✅ Étape 1 — Ajouter `intimate_child_nudity` comme 4ème motif

- ✅ `ContentReportReason` dans `contentReportService.ts`
- ✅ `ReportModal.tsx` avec le 4ème motif
- ✅ `firestore.rules` valide la nouvelle valeur
- ✅ `onReportCreated` CF avec le label

### ✅ Étape 2 — Transformer le bouton drapeau en Action Sheet

- ✅ `SwipeGallery.tsx` : modale custom cross-platform (Masquer / Signaler / Annuler)
- ✅ Icône changée de drapeau → ellipsis-vertical (⋮)

### ✅ Étape 3 — Mécanisme "Masquer pour moi"

- ✅ Collection `user_hidden_photos/{userId}` avec `hiddenEventIds: string[]`
- ✅ Firestore rules : read/write propre user uniquement
- ✅ `services/hiddenPhotosService.ts` : `hidePhoto`, `unhidePhoto`, `getHiddenEventIds`, `onHiddenPhotosChange`
- ✅ `hooks/useHiddenPhotos.ts` : listener temps réel retournant un `Set<string>`
- ✅ Filtrage dans `gallery.tsx` (allPhotoMilestones) et `useMomentsData.ts`

### ✅ Étape 4 — Écran settings "Photos masquées"

- ✅ `app/settings/hidden-photos.tsx` avec listener temps réel (pas de pull-to-refresh nécessaire)
- ✅ Thumbnail photo, nom enfant, date, bouton unhide avec haptic
- ✅ A11y complète (roles, labels, hints, states)
- ✅ Item settings désactivé quand count = 0

### ✅ Étape 5 — Mise à jour `onReportCreated` CF

- ✅ Notification push auteur via Expo push (`device_tokens`)
- ✅ Masquage global automatique (`reported: true`) pour `intimate_child_nudity`
- ✅ Hide pour reporter via `user_hidden_photos/{reporterUserId}`
- ✅ Déployée en production (Gen 1, europe-west1)

### ✅ Étape 6 — Filtrage côté client pour photos `reported: true`

- ✅ `gallery.tsx` : `if ((event as any).reported === true) return;`
- ✅ `useMomentsData.ts` : même filtrage dans le useMemo photos

### ✅ Étape 7 — CF `resolveReport` + scripts CLI

- ✅ CF callable admin-only (Gen 2, europe-west1)
- ✅ Actions : `dismiss`, `remove_photo`, `remove_event`
- ✅ Mise à jour report : `status: "resolved"`, `resolvedAt`, `resolvedBy`, `action`, `adminNote`
- ✅ Email reporter via Resend après résolution
- ✅ `scripts/listOpenReports.mjs`
- ✅ `scripts/resolveReport.mjs`
- ✅ Déployée en production

### ✅ Étape 8 — Firestore rules mises à jour

- ✅ `user_hidden_photos/{userId}` : read/write propre user uniquement
- ✅ `reports` : `intimate_child_nudity` dans les raisons valides
- ✅ Déployées en production

### Phase future : V2 Modération serveur (conditionnelle)

**Ne lancer que si** :
- partage élargi au-delà des adultes explicitement autorisés
- croissance forte du volume photo (> 1000 photos/jour)
- incident sécurité ou signalement grave
- exigence store explicite lors d'un app review

#### Ce que V2 ajouterait

1. **Collection `mediaAssets/{mediaId}`** : entité dédiée pour chaque fichier uploadé, avec statut de modération
2. **Upload en quarantaine** : la photo est uploadée mais pas visible tant qu'elle n'est pas validée
3. **Statuts** : `pending_review` → `approved` | `blocked` | `review_required`
4. **Pipeline serveur** : CF trigger sur upload → classification → décision automatique ou escalade
5. **Provider IA optionnel** : Google Cloud Vision SafeSearch ou équivalent, avec cadre contractuel clair pour les photos d'enfants

#### Architecture V2

```
Upload photo
    │
    ▼
Firebase Storage (stockage immédiat)
    │
    ▼
CF trigger onUpload
    │
    ├─ Crée mediaAssets/{id} avec status: "pending_review"
    │
    ├─ [Optionnel] Appel IA SafeSearch
    │     │
    │     ├─ Score OK → status: "approved" → photo visible
    │     └─ Score suspect → status: "review_required" → alerte opérateur
    │
    └─ [Sans IA] status: "approved" (confiance au contexte privé)
         │
         ▼
    Photo visible dans l'app
```

#### Conditions de non-lancement V2

Si SuiviBaby reste une app parentale privée sans feed public, sans partage anonyme, sans commentaires ouverts — la V2 n'est pas nécessaire. La V1 avec signalement + notification email + traitement manuel est suffisante et défendable.

## Récapitulatif des fichiers impliqués

### Infra

- `storage.rules` — règles d'accès Firebase Storage ✅
- `firebase.json` — config storage + emulateur ✅
- `firestore.rules` — collections `reports` + `user_hidden_photos` ✅

### Client

- `components/moments/ReportModal.tsx` — modale de signalement (4 motifs) ✅
- `components/moments/SwipeGallery.tsx` — action sheet + signalement + hide-for-me ✅
- `components/ui/PhotoImage.tsx` — composant image sécurisé (expo-image, cache memory-disk) ✅
- `utils/photoStorage.ts` — accès authentifié aux photos + cacheKey ✅
- `services/contentReportService.ts` — service de soumission ✅
- `services/hiddenPhotosService.ts` — service hide/unhide/listen ✅
- `hooks/useHiddenPhotos.ts` — hook temps réel ✅
- `app/(drawer)/baby/gallery.tsx` — filtrage hidden + reported ✅
- `hooks/useMomentsData.ts` — filtrage hidden + reported ✅
- `app/settings/hidden-photos.tsx` — écran gestion photos masquées ✅
- `app/(drawer)/settings.tsx` — item photos masquées + réorganisation sections ✅
- `components/forms/MilestonesForm.tsx` — notice photo + upload sécurisé ✅

### Serveur

- `functions/index.js` — CFs `onReportCreated` + `resolveReport` ✅

### Scripts CLI

- `scripts/listOpenReports.mjs` — lister signalements ouverts ✅
- `scripts/resolveReport.mjs` — résoudre un signalement ✅

### Pages légales

- `app/settings/terms.tsx` — articles 8 et 9 ✅
- `app/settings/privacy.tsx` — article 7 ✅
- `public/terms.html` — version web ✅
- `public/privacy.html` — version web ✅

### Tests

- `__tests__/storage.rules.test.ts` — 7 tests Storage rules ✅
- `__tests__/firestore.rules.test.ts` — tests collections `reports` + `user_hidden_photos` ✅
- Total : 118 tests rules passent ✅

### Documentation

- `docs/PHOTO_MODERATION_IMPLEMENTATION_PLAN.md` — ce document ✅
