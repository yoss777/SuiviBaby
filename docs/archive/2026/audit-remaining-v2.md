# Audit Remaining v2

Date: 2026-03-24

Note prealable: je n'ai pas trouve `audit-remaining.md` dans ce depot. Ce document est donc une suite logique fondee sur l'etat actuel du code.

Mise a jour App Check: 2026-03-25

- Le depot prepare maintenant un vrai chemin App Check cote client:
  `firebase/app-check` est initialise via `CustomProvider` sur mobile, alimente par `@react-native-firebase/app-check`, et via `ReCaptchaV3Provider` sur web si une cle est fournie.
- Les Cloud Functions sensibles supportent maintenant `enforceAppCheck: true`, mais l'enforcement est volontairement pilote par `APPCHECK_ENFORCE=true` au deploiement.
- Le point n'est donc pas "ferme" operationalement tant que les fichiers natifs Firebase (`google-services.json`, `GoogleService-Info.plist`) et les cles App Check n'ont pas ete ajoutes, puis qu'une version de l'app compatible n'a pas ete deployee.

## TL;DR

Le projet est ambitieux, deja tres riche fonctionnellement, et nettement au-dessus d'un simple prototype Expo. Il y a de vraies briques produit et plateforme: auth Firebase, multi-enfant, partage, permissions fines, queue offline SQLite, cloud functions, rappels push, recap email, export, biometrie, analytics visuelles, voice/transcription.

Mon avis global: la vision produit est bonne, plusieurs choix techniques sont pertinents, mais le projet a depasse le seuil ou "ca marche" suffit. Il faut maintenant durcir les invariants, reduire la dispersion et remettre l'outillage de qualite au niveau de la surface fonctionnelle. Aujourd'hui, la dette principale n'est pas un manque d'idees. C'est un manque d'alignement entre les couches et un manque de garde-fous systematiques.

## Ce que le projet fait bien

- La couverture fonctionnelle est impressionnante pour une app mobile RN/Expo.
- Le modele d'acces enfant/partage est pense serieusement, avec des regles Firestore assez riches dans `firestore.rules`.
- Les Cloud Functions ajoutent une vraie validation serveur pour les evenements au lieu de faire confiance au client.
- Il y a deja des efforts de robustesse utiles: Sentry, suppression de compte RGPD, rappels planifies, recap hebdo, queue offline, cache "today", optimistic UI.
- Le `typecheck` passe actuellement.
- Les tests existants passent si on desactive Watchman: `npx jest --runInBand --watchman=false` -> 25 tests verts.

## Etat reel du depot

- Taille approximative: 238 fichiers `ts/tsx`, environ 90 743 lignes sur `app/components/services/contexts/hooks/utils/functions`.
- Tests: 7 fichiers de test seulement, dont 1 setup.
- Qualite statique: `npm run lint` echoue avec 67 erreurs et 157 warnings.
- Documentation principale non maintenue: [README.md](/Users/yoss/Projets/SuiviBaby/README.md#L1) est encore celle du scaffold Expo.
- Hygiene outillage confuse: `package-lock.json` et `pnpm-lock.yaml` coexistent.
- La CI ne lance pas le lint, seulement typecheck et tests dans [.github/workflows/ci.yml](/Users/yoss/Projets/SuiviBaby/.github/workflows/ci.yml#L1).

## Verification P0 apres mise a jour

Statut global: amelioration reelle, mais pas "tout vert".

- P0 queue offline par utilisateur: corrige cote code.
  Le stockage, la lecture et le comptage sont maintenant strictement scopes par `uid` dans [services/offlineQueueService.ts](/Users/yoss/Projets/SuiviBaby/services/offlineQueueService.ts#L72), [services/offlineQueueService.ts](/Users/yoss/Projets/SuiviBaby/services/offlineQueueService.ts#L103) et [services/offlineQueueService.ts](/Users/yoss/Projets/SuiviBaby/services/offlineQueueService.ts#L117). Les lignes legacy sans `uid` sont nettoyees explicitement dans [services/offlineQueueService.ts](/Users/yoss/Projets/SuiviBaby/services/offlineQueueService.ts#L215), le `signOut` declenche ce nettoyage dans [contexts/AuthContext.tsx](/Users/yoss/Projets/SuiviBaby/contexts/AuthContext.tsx#L235), et l'auto-sync est relance apres login dans [contexts/AuthContext.tsx](/Users/yoss/Projets/SuiviBaby/contexts/AuthContext.tsx#L218).

- P0 alignement permissions rules/functions: corrige cote code et mieux teste.
  Le fallback `canWriteEvents` est pris en compte dans [functions/index.js](/Users/yoss/Projets/SuiviBaby/functions/index.js#L508), ce qui aligne la logique serveur avec [firestore.rules](/Users/yoss/Projets/SuiviBaby/firestore.rules#L72). La logique d'acces a aussi ete extraite dans un helper testable, couvre par [accessControl.test.ts](/Users/yoss/Projets/SuiviBaby/__tests__/accessControl.test.ts#L1). Ce n'est pas encore un test d'integration de la Cloud Function complete, mais ce n'est plus juste un copier-coller local de la logique.

- P0 `deleteEventCascade` et limite Firestore 500 ops: corrige.
  La suppression passe maintenant par `deleteDocsByFieldBatched(...)` avant suppression du document principal dans [functions/index.js](/Users/yoss/Projets/SuiviBaby/functions/index.js#L748). C'est un vrai correctif, pas cosmetique.

- P0 App Check enforcement: non corrige.
  Le code est toujours en mode monitoring seulement dans [functions/index.js](/Users/yoss/Projets/SuiviBaby/functions/index.js#L48). Je ne vois toujours pas `enforceAppCheck: true` sur les functions sensibles.

- P0 privacy `users_public`: corrige cote code, migration a confirmer.
  Cote regles, `list` est maintenant interdit sur [firestore.rules](/Users/yoss/Projets/SuiviBaby/firestore.rules#L339) et `email` n'est plus ecrit dans [services/userService.ts](/Users/yoss/Projets/SuiviBaby/services/userService.ts#L59). C'est un bon mouvement.
  La recherche par email ne depend plus de `users_public`: la CF [functions/index.js](/Users/yoss/Projets/SuiviBaby/functions/index.js#L426) interroge maintenant `users`, et une migration de nettoyage de `users_public.email` existe dans [functions/index.js](/Users/yoss/Projets/SuiviBaby/functions/index.js#L469). Le point restant n'est pas dans le code: il faut confirmer que cette migration a bien ete executee en base.

Conclusion P0 apres update:

- 3 P0 sont corriges cote code: `deleteEventCascade`, permissions rules/functions, queue offline.
- 1 P0 est corrige cote code mais reste a confirmer en base: privacy `users_public`.
- 1 P0 n'est pas corrige: App Check enforcement.

## Constats prioritaires

### P0 - Risques de correction / securite / donnees

1. La queue offline n'est pas scopee par utilisateur.
   Reference: [services/offlineQueueService.ts](/Users/yoss/Projets/SuiviBaby/services/offlineQueueService.ts#L32), [services/offlineQueueService.ts](/Users/yoss/Projets/SuiviBaby/services/offlineQueueService.ts#L111), [services/eventsService.ts](/Users/yoss/Projets/SuiviBaby/services/eventsService.ts#L255).
   Le payload est stocke localement sans UID/session, puis rejoue plus tard via les Cloud Functions avec l'utilisateur actuellement authentifie. Si A cree offline, se deconnecte, puis B se connecte avant la resynchro, les actions peuvent partir sous le mauvais compte. Pour une app familiale multi-comptes, c'est un vrai bug d'integrite.

2. Le modele de permissions n'est pas aligne entre regles Firestore et Cloud Functions.
   Reference: [firestore.rules](/Users/yoss/Projets/SuiviBaby/firestore.rules#L72), [firestore.rules](/Users/yoss/Projets/SuiviBaby/firestore.rules#L171), [functions/index.js](/Users/yoss/Projets/SuiviBaby/functions/index.js#L584), [functions/index.js](/Users/yoss/Projets/SuiviBaby/functions/index.js#L629), [functions/index.js](/Users/yoss/Projets/SuiviBaby/functions/index.js#L691).
   Les regles autorisent `canWriteEvents`, mais les Functions exigent `owner/admin`. Resultat probable: certaines permissions "contributor avec droit d'ecriture" sont vraies dans les regles mais fausses dans la couche metier. C'est typiquement le genre d'ecart qui produit des bugs difficiles a comprendre, surtout en offline ou en parcours partage.

3. `deleteEventCascade` ne scale pas correctement et peut depasser la limite Firestore de 500 operations par batch.
   Reference: [functions/index.js](/Users/yoss/Projets/SuiviBaby/functions/index.js#L706).
   Le code charge jusqu'a 500 likes et 500 commentaires puis tente de tout supprimer dans un seul batch avec l'evenement. Dans le pire cas, on depasse 1000 writes. Le commentaire "max 500 operations" est juste, l'implementation ne le respecte pas.

4. App Check est seulement observe, pas enforce, sur les fonctions sensibles.
   Reference: [functions/index.js](/Users/yoss/Projets/SuiviBaby/functions/index.js#L48).
   Le code loggue `VERIFIED/UNVERIFIED` mais n'active pas `enforceAppCheck: true`. Pour `transcribeAudio`, `validateAndCreateEvent`, `validateAndUpdateEvent`, `deleteEventCascade`, `deleteUserAccount`, cela laisse une surface d'abus plus large que necessaire.

5. `users_public` expose les emails a tout utilisateur connecte.
   Reference: [services/userService.ts](/Users/yoss/Projets/SuiviBaby/services/userService.ts#L59), [firestore.rules](/Users/yoss/Projets/SuiviBaby/firestore.rules#L339).
   Le document public contient `email`, et la regle `allow read: if isSignedIn()` ouvre cette donnee a n'importe quel compte authentifie. Pour une app familiale, c'est une dette privacy a corriger rapidement.

### P1 - Risques de maintenabilite et de regressions

1. Le niveau de dette lint n'est plus "cosmetique".
   Exemples: [app/(drawer)/baby/manage-access.tsx](/Users/yoss/Projets/SuiviBaby/app/(drawer)/baby/manage-access.tsx#L280), [components/suivibaby/PompagesChartSkia.tsx](/Users/yoss/Projets/SuiviBaby/components/suivibaby/PompagesChartSkia.tsx#L164), [components/suivibaby/TeteesChartSkia.tsx](/Users/yoss/Projets/SuiviBaby/components/suivibaby/TeteesChartSkia.tsx#L238).
   Il y a de vraies violations des Rules of Hooks, pas seulement des warnings de style. Tant que ce passif reste en place, les futures features coutent plus cher et les regressions React deviennent normales.

2. Les tests sont trop faibles par rapport a la taille et au risque du produit.
   Signal: environ 90k lignes pour 25 tests utiles. La suite couvre surtout quelques services mockes. Il manque des tests d'integration sur auth, partage enfant, regles d'acces, queue offline, boot/navigation, rappels, et Cloud Functions.

3. Des effets globaux sont executes au chargement du module racine.
   Reference: [app/_layout.tsx](/Users/yoss/Projets/SuiviBaby/app/_layout.tsx#L32).
   `Sentry.init()`, `setupNotificationHandler()` et `startAutoSync()` sont lances au niveau module. C'est pratique, mais fragile pour Fast Refresh, tests, web, imports multiples ou futurs modes d'initialisation.

4. La couche de partage est fonctionnelle mais pas terminee produit.
   Reference: [services/childSharingService.ts](/Users/yoss/Projets/SuiviBaby/services/childSharingService.ts#L292).
   L'invitation email cree le document, mais l'envoi d'email n'est toujours pas implemente. Le workflow est donc partiellement "techniquement present" mais pas totalement realisable ou fiable cote utilisateur.

5. La doc et la config donnent des signaux de bricolage.
   Reference: [README.md](/Users/yoss/Projets/SuiviBaby/README.md#L1), [tsconfig.json](/Users/yoss/Projets/SuiviBaby/tsconfig.json#L12).
   `README.md` est quasi vide du point de vue produit. Le `tsconfig` contient une entree `include` ajoutee a la main de facon suspecte. Ce ne sont pas des bugs runtime, mais c'est typiquement le genre de detail qui annonce une dette de maintenance plus profonde.

6. La CI ne protege pas contre l'etat reel du repo.
   Reference: [.github/workflows/ci.yml](/Users/yoss/Projets/SuiviBaby/.github/workflows/ci.yml#L1).
   Elle ne lance pas `npm run lint`, donc les 67 erreurs actuelles n'empechent pas une merge sur `main`.

### P2 - Dette de lisibilite / hygiene / coherence

1. Le projet garde beaucoup de logs debug et de traces temporaires.
   Exemples: [app/boot.tsx](/Users/yoss/Projets/SuiviBaby/app/boot.tsx#L97), [services/childSharingService.ts](/Users/yoss/Projets/SuiviBaby/services/childSharingService.ts#L209), [contexts/BabyContext.tsx](/Users/yoss/Projets/SuiviBaby/contexts/BabyContext.tsx#L144).
   Babel retire une partie des `console.log` en prod cote app, mais pas partout, et pas cote Functions. Aujourd'hui le bruit de debug masque les vrais signaux.

2. Les conventions de routing ne sont pas totalement homogenes.
   Exemples: [app/(drawer)/index.tsx](/Users/yoss/Projets/SuiviBaby/app/(drawer)/index.tsx#L4), [services/localNotificationService.ts](/Users/yoss/Projets/SuiviBaby/services/localNotificationService.ts#L126).
   On voit coexister `/(drawer)/baby/home` et `/baby/home`. Expo Router peut le tolerer selon le contexte, mais ce n'est pas une base saine pour les deep links et notifications.

3. Le depot contient encore des artefacts de travail qui ne devraient probablement pas etre versionnes.
   Exemples visibles dans l'arborescence: `.DS_Store`, fichiers `backups`, logs debug, multiples `todo_*.md`.
   Ce n'est pas grave seul, mais ca augmente le bruit cognitif.

## Mon jugement d'ensemble

Le projet a de la valeur. Il n'a pas l'air "amateur" au sens produit: il y a une vraie ambition, de vraies briques metier, et des choix techniques souvent coherents.

En revanche, il est entre deux etats:

- trop gros pour continuer en mode opportuniste;
- pas encore assez strict pour etre vraiment robuste a long terme.

Autrement dit: la prochaine marge de progression ne se joue pas sur une nouvelle feature. Elle se joue sur la reduction des ecarts entre client, regles, functions, CI et tests.

## Pistes d'amelioration concretes

### 1. Stabiliser les invariants critiques

- Scoper la queue offline par `uid` et purger/segmenter les jobs au `signOut`.
- Aligner une seule source de verite pour les permissions d'ecriture evenements.
- Corriger `deleteEventCascade` avec suppression paginee ou sous-batches.
- Activer App Check enforcement sur les fonctions les plus sensibles.
- Retirer `email` de `users_public` ou restreindre fortement sa lecture.

### 2. Remettre l'outillage au niveau du produit

- Faire passer le lint a un niveau acceptable avant d'ajouter des features majeures.
- Ajouter `npm run lint` a la CI.
- Standardiser un seul gestionnaire de paquets.
- Refaire un vrai `README` projet: architecture, prerequis, commandes, env, Firebase, build/deploy.

### 3. Augmenter la confiance de livraison

- Ajouter des tests d'integration sur `AuthContext`, `BabyContext`, partage enfant, queue offline et navigation de boot.
- Couvrir au moins une Cloud Function critique par tests serveur.
- Ajouter un test de non-regression sur les permissions `contributor/canWriteEvents`.
- Formaliser un petit set de smoke tests E2E sur les flows: login, ajout evenement, offline -> resync, partage, suppression compte.

### 4. Reduire la dispersion fonctionnelle

- Sortir les composants demo, backup et migration temporaire des zones runtime principales.
- Isoler les domaines lourds dans des modules plus nets: `sharing`, `events`, `notifications`, `analytics`, `voice`.
- Definir explicitement ce qui est "shipping" vs "experimental".

## Proposition de priorisation

Ordre que je recommanderais:

1. Corriger la queue offline et l'alignement permissions rules/functions.
2. Corriger les violations Hooks qui peuvent casser l'UI de facon non deterministe.
3. Fermer les trous privacy/security (`users_public`, App Check).
4. Integrer le lint a la CI et reduire le bruit structurel.
5. Ensuite seulement reprendre les chantiers UX et les nouvelles features.

## Conclusion

Je pense que le projet est prometteur et deja substantiel, mais il est arrive au point ou la qualite systemique doit devenir une fonctionnalite a part entiere.

Si l'objectif est de le faire grandir serieusement, la bonne strategie n'est pas "refactor total". C'est un durcissement cible des points qui cassent la confiance: permissions, offline, suppression, privacy, lint, CI et tests d'integration.
