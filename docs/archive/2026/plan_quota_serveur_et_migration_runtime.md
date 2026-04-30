# Plan Quota Serveur Et Migration Runtime

## Etat actuel

Le chantier quota premium a ete migre cote serveur et est deploye.

### Commit principal

- `ec88748 feat: move premium usage quotas to server`

### Cloud Functions deployees

- `getUsageQuotaStatus` (`europe-west1`)
- `consumeUsageQuota` (`europe-west1`)
- `createShareInvitation` (`europe-west1`)

### Flux maintenant branches sur le serveur

- Commande vocale
  - precheck quota via `getUsageQuotaStatus("voice")`
  - consommation/reservation imposee directement dans `transcribeAudio` avant l'appel AssemblyAI
  - `consumeUsageQuota("voice")` reste disponible mais n'est plus appele par le bouton vocal pour eviter une double consommation
- Export
  - precheck quota via `getUsageQuotaStatus("export")`
  - consommation via `consumeUsageQuota("export")` uniquement apres succes d'export
- Partage
  - creation d'invitation via `createShareInvitation`
  - limite free imposee cote serveur

### Fichiers cles

- [`functions/index.js`](/Users/yoss/Projets/SuiviBaby/functions/index.js)
- [`services/premiumUsageService.ts`](/Users/yoss/Projets/SuiviBaby/services/premiumUsageService.ts)
- [`components/suivibaby/VoiceCommandButton.tsx`](/Users/yoss/Projets/SuiviBaby/components/suivibaby/VoiceCommandButton.tsx)
- [`app/settings/export.tsx`](/Users/yoss/Projets/SuiviBaby/app/settings/export.tsx)
- [`services/childSharingService.ts`](/Users/yoss/Projets/SuiviBaby/services/childSharingService.ts)
- [`app/(drawer)/share-child.tsx`](/Users/yoss/Projets/SuiviBaby/app/(drawer)/share-child.tsx)
- [`services/premiumGatingService.ts`](/Users/yoss/Projets/SuiviBaby/services/premiumGatingService.ts)

### Validation deja faite

- lint cible: OK
- tests client cibles: OK
- tests Cloud Functions: OK
- `git diff --check`: OK

## Suivi durcissement voice command

- [x] Auditer le flux existant: cle AssemblyAI cote Cloud Function, precheck quota cote client, consommation historique apres confirmation.
- [x] Ajouter une reservation quota transactionnelle cote serveur (`reserveVoiceQuota`).
- [x] Appeler la reservation dans `transcribeAudio` avant tout appel AssemblyAI.
- [x] Retirer la consommation client apres confirmation pour eviter le double comptage.
- [x] Ajouter des tests Cloud Functions: quota epuise bloque avant provider, transcription reserve le quota.
- [ ] Redeployer les Cloud Functions apres validation locale.

### Reserve connue

Le `typecheck` global reste pollue par des erreurs historiques dans:

- [`__tests__/voiceModules.test.ts`](/Users/yoss/Projets/SuiviBaby/__tests__/voiceModules.test.ts)

Ces erreurs ne viennent pas du chantier quota serveur.

## Pourquoi cette migration etait necessaire

L'ancien modele utilisait `AsyncStorage` pour compter:

- commandes vocales
- exports PDF

Ce modele etait insuffisant:

- reset apres reinstallation
- reset en changeant de device
- incoherent multi-device
- bypassable cote client

Le partage n'etait meme pas strictement impose cote serveur. L'UI affichait une promesse produit, mais le vrai verrou etait absent.

Le nouveau modele place la source de verite business cote serveur.

## Architecture actuelle

### 1. Quotas statiques UI

[`services/premiumGatingService.ts`](/Users/yoss/Projets/SuiviBaby/services/premiumGatingService.ts) ne gere plus de compteur runtime.

Il contient maintenant uniquement:

- `FREE_LIMITS`
- `getHistoryCutoffDate`
- `PAYWALL_MESSAGES`

Donc:

- limites affichees/UI = ici
- compteurs runtime business = serveur

### 2. Quotas runtime serveur

[`functions/index.js`](/Users/yoss/Projets/SuiviBaby/functions/index.js) centralise:

- lecture du tier et statut d'abonnement
- calcul des quotas `voice/export/sharing`
- consommation atomique `voice/export`
- validation partage + quota partage

Le document Firestore utilise est principalement:

- `usage_limits/{uid}`

Le statut d'abonnement est lu depuis:

- `subscriptions/{uid}`

### 3. Couche client fine

[`services/premiumUsageService.ts`](/Users/yoss/Projets/SuiviBaby/services/premiumUsageService.ts) est une facade typée sur les callables:

- `getUsageQuotaStatus`
- `consumeUsageQuota`
- `createShareInvitation`

Il n'y a pas de logique metier sensible cote client.

## Hypotheses et limites du modele actuel

### Ce qui est bien gere

- multi-device
- reinstallation
- quotas free reels
- sharing vraiment impose
- consommation apres succes pour voix et export

### Limite residuelle connue

Pour `voice` et `export`, on fait:

1. precheck
2. action metier
3. consommation

Donc, en cas de concurrence multi-device extreme, deux actions peuvent encore passer si elles reussissent exactement en parallele avant consommation.

Ce compromis a ete accepte pour respecter la contrainte produit:

- ne compter qu'apres succes reel

Si on veut une exactitude absolue, il faudra passer a un modele:

- `reserve quota`
- `commit quota`
- `release quota si echec`

Ce n'est pas implemente aujourd'hui.

## Warnings infra encore ouverts

### 1. Runtime Node 20

Warning recu au deploy:

- Node.js 20 deprecated le 30 avril 2026

Conclusion:

- migration vers Node 22 a planifier

### 2. SDK `firebase-functions`

Warning recu au deploy:

- `firebase-functions` `4.9.0`
- cible recommandee `5.1.0+`

Conclusion:

- upgrade SDK avant ou pendant la migration runtime

## Recommandation d'ordre d'execution

### Etape 1 - Upgrade `firebase-functions`

Objectif:

- reduire le risque avant le changement de runtime

Actions:

1. ouvrir [`functions/package.json`](/Users/yoss/Projets/SuiviBaby/functions/package.json)
2. upgrader `firebase-functions` vers `5.1.0+`
3. verifier compatibilite avec:
   - `firebase-admin`
   - `onCall`
   - `onRequest`
   - `onSchedule`
4. lancer:
   - tests unitaires functions
   - lint functions
5. deploy functions

Validation manuelle minimale:

- `getUsageQuotaStatus`
- `consumeUsageQuota`
- `createShareInvitation`
- `validateAndCreateEvent`
- `validateAndUpdateEvent`
- `deleteEventCascade`

### Etape 2 - Migration Node 20 -> 22

Objectif:

- se remettre sur un runtime supporte

Actions:

1. ouvrir [`functions/package.json`](/Users/yoss/Projets/SuiviBaby/functions/package.json)
2. mettre a jour le runtime Node vers `22`
3. verifier qu'aucune dependance serveur ne casse:
   - `firebase-admin`
   - `firebase-functions`
   - `resend`
   - `expo-server-sdk`
4. relancer:
   - tests functions
   - lint functions
5. redeployer

Validation manuelle minimale:

- transcription voix
- quota voix
- export
- partage
- webhook RevenueCat si environnement disponible

### Etape 3 - Validation produit post-migration

Scenario free a retester:

1. voix avec quota restant
2. voix quota epuise
3. premier export
4. second export refuse
5. partage jusqu'a la limite
6. partage refuse apres limite

Scenario premium/family a retester:

1. voix illimitee
2. export illimite
3. partage au-dela de 2 co-parents

## Pistes d'amelioration ensuite

### A. Reservation/commit quota

Si besoin d'un verrou strict:

- `reserveUsageQuota`
- action metier
- `commitUsageQuota`
- ou rollback timeout

Plus robuste, mais plus complexe.

### B. Surface UI du quota restant

Actuellement le client precheck juste l'autorisation.

Ameliorations possibles:

- afficher `remaining` dans l'UI
- message plus explicite avant blocage
- refresh du quota apres consommation

### C. Historique 90 jours

Ce n'est pas un compteur, mais une regle d'acces.

Si on veut un modele completement coherent, il faut verifier que cette limite reste imposee la ou les requetes critiques sont formulees, et pas seulement dans l'UI.

## Fichiers a surveiller si reprise du chantier

### Cote app

- [`services/premiumUsageService.ts`](/Users/yoss/Projets/SuiviBaby/services/premiumUsageService.ts)
- [`services/premiumGatingService.ts`](/Users/yoss/Projets/SuiviBaby/services/premiumGatingService.ts)
- [`components/suivibaby/VoiceCommandButton.tsx`](/Users/yoss/Projets/SuiviBaby/components/suivibaby/VoiceCommandButton.tsx)
- [`app/settings/export.tsx`](/Users/yoss/Projets/SuiviBaby/app/settings/export.tsx)
- [`services/childSharingService.ts`](/Users/yoss/Projets/SuiviBaby/services/childSharingService.ts)
- [`app/(drawer)/share-child.tsx`](/Users/yoss/Projets/SuiviBaby/app/(drawer)/share-child.tsx)

### Cote functions

- [`functions/index.js`](/Users/yoss/Projets/SuiviBaby/functions/index.js)
- [`functions/__tests__/cloudFunctions.test.js`](/Users/yoss/Projets/SuiviBaby/functions/__tests__/cloudFunctions.test.js)
- [`functions/__tests__/setup.js`](/Users/yoss/Projets/SuiviBaby/functions/__tests__/setup.js)
- [`functions/package.json`](/Users/yoss/Projets/SuiviBaby/functions/package.json)

## Resume executable

Si on reprend ce chantier plus tard, l'ordre recommande est:

1. upgrader `firebase-functions`
2. tester + deploy
3. migrer Node 22
4. tester + deploy
5. valider manuellement les 3 flux quota:
   - voix
   - export
   - partage
6. envisager ensuite une reservation/commit quota si on veut une exactitude stricte multi-device
