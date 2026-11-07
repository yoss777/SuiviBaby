# ADR 0003 — expo-updates (mises à jour OTA et retour arrière)

- Statut : proposé. Recommandation : **ne pas installer maintenant** ; réévaluation
  fixée à une date (voir « Réévaluation »). Décision à prendre par Yoss.
- Date : 2026-11-07
- Sprint : S13.6 (audit 2026-11, S8 et S2)

## Contexte

- Expo SDK 53 (`expo ~53.0.27`), React Native 0.79.6. `expo-updates` n'est pas
  installé ; le guide de monitoring le dit (`docs/FIREBASE_MONITORING.md`, « Crash
  rate élevé » : pas de retour arrière à distance).
- Les dossiers `android/` et `ios/` sont **versionnés**. Une modification native ne
  passe donc que par un nouveau build.
- Builds : iOS sur EAS cloud, profil `production`, envoi automatique à App Store
  Connect. Android : `.aab` construit en local, puis envoi manuel dans la piste
  Tests fermés (Alpha) de Play Console. Numéros de build distants depuis S12.2
  (`appVersionSource: remote`).
- Un correctif aujourd'hui = un build, une revue Apple ou Google, puis une mise à
  jour que l'utilisateur doit accepter. La mise à jour forcée existe déjà
  (`app_config/latest_version`, `minVersion`, `services/appUpdateService.ts`).
- Les textes de santé sont de deux natures :
  - les messages d'alerte (température, `utils/temperatureAlert.ts`, insights de
    `services/insightEngine.ts` et `services/correlationService.ts`) sont **dans le
    bundle JS** ;
  - les fiches (`tips`) sont lues depuis Firestore (`services/smartContentService.ts`) :
    leur contenu se change sans release (sous réserve de la comparaison avec le seed,
    S5.5).
- La version du texte de consentement (v2.2, S3/S4) est enregistrée côté serveur avec
  l'acceptation.
- Les Cloud Functions ne sont pas concernées par `expo-updates` : leur retour arrière
  reste un redéploiement (CI `deploy-functions.yml` depuis `main`).

## Options

1. **Statu quo** : pas d'OTA. Correctif = build + revue ; retour arrière = nouveau
   build corrigé, mise à jour forcée si nécessaire, et dans les consoles le
   déploiement progressif (Play) et la diffusion progressive (App Store), qui se
   suspendent. Fonctions de console à confirmer avant usage.
2. **expo-updates avec canal `production` seulement** : correctifs JS et textes
   publiés en quelques minutes ; retour arrière par republication.
3. **expo-updates sur tous les canaux** (`preview`, `staging` compris) : même chose,
   plus de surface.

## Pour et contre (option 2)

**Pour**
- Un correctif JS (plantage, logique, texte d'alerte) atteint les utilisateurs qui
  relancent l'app sans attendre la revue des stores.
- Retour arrière possible sans build : `eas update:rollback` (commande vérifiée dans
  l'aide de eas-cli 27.5.0) ou republication d'un groupe précédent
  (`eas update:republish --group <id>`, présente dans l'aide de eas-cli 27.5.0 ;
  à tester sur un canal de test avant tout usage).
- Réduit le besoin de contournements (ex. « Relancer » qui remonte tout l'arbre React,
  noté en S8 faute d'OTA).

**Contre**
- **Données de santé et textes médicaux.** Un message d'alerte modifié par OTA prend
  effet sans passer par la revue du pédiatre (Q3) ni par la note de version. Il faudrait
  une règle écrite : aucun texte de santé, aucun consentement, aucun changement de
  schéma ne part en OTA.
- **Cohérence consentement.** Un texte de consentement changé en JS sans nouvelle
  acceptation serait en désaccord avec la version enregistrée côté serveur.
- **Natif.** Un bug natif (SDK, module, permission) ne se corrige pas en OTA. Chaque
  montée de SDK (S13.5) reste un build complet.
- **Politiques des stores.** Les mises à jour de JS sont courantes, mais elles doivent
  rester dans l'objet de l'app (Apple, règle 2.5.2) et respecter la politique Google
  Play sur le code téléchargé. Vérifier les textes actuels avant décision.
- **Coût et quotas EAS Update.** Grille et quotas à reconfirmer sur la page tarifaire
  d'EAS ; non vérifiés pour cet ADR.
- **Complexité.** Politique de `runtimeVersion` (`fingerprint` recommandé, sinon un
  correctif OTA peut tourner sur un binaire incompatible), canaux par profil (S12),
  clés de signature du code (à conserver hors dépôt, comme les autres secrets),
  sourcemaps Sentry par mise à jour, job CI de publication, procédure de retour arrière
  dans le runbook.
- **Traçabilité.** « Quelle version tourne chez cet utilisateur ? » devient un
  couple version native + identifiant de mise à jour ; les tickets de support et les
  événements Sentry doivent porter les deux.

## Recommandation

**Ne pas installer `expo-updates` maintenant.** Raisons :

1. Le risque principal est natif (SDK, permissions, modules) et ne se corrige pas en
   OTA. Les montées de SDK prévues en S13.5 demandent de toute façon des builds.
2. Les textes de santé doivent passer par la relecture pédiatre (Q3) et la décision
   MDR (Q4) avant toute version. Le gain de vitesse d'OTA est donc limité pour ce
   contenu, et le risque de contournement de la revue est réel.
3. Les garde-fous existants couvrent une partie du besoin : mise à jour forcée
   (`minVersion`), déploiement progressif et suspension dans les consoles, retour
   arrière des Cloud Functions par redéploiement.
4. Le coût de mise en place (signature, canaux, Sentry, CI, runbook) est élevé pour une
   équipe réduite, sans incident « JS seul » observé à ce jour.

**Ce qui est à faire à la place** : noter dans le runbook que le retour arrière d'un
build passe par le déploiement progressif (Play : suspension ; App Store : pause de la
diffusion progressive), et que `eas update --rollback` (commande citée dans
`docs/FIREBASE_MONITORING.md` §2.4) n'existe pas.

## Réévaluation

Reprendre la décision quand **une** des conditions suivantes est vraie :

- la montée de SDK (S13.5) est faite et stable ;
- un incident « JS seul » a coûté plus d'une journée faute d'un chemin de correctif
  plus rapide ;
- les textes de santé sont validés par le pédiatre et ne bougent plus à chaque
  version.

Date de revue proposée : 2027-01-15, ou au plus tôt à la fin de S13.5.

Si la décision devient « oui », cadre minimal :
- `runtimeVersion: { policy: "fingerprint" }` ;
- canal `production` uniquement au début, avec la même revue que les builds ;
- hors OTA : textes de santé non validés, consentement, schéma Firestore, dépendances
  natives ;
- signature du code activée, clé hors dépôt ;
- sourcemaps Sentry par mise à jour, et `deviceInfo` enrichi du numéro de mise à jour ;
- procédure `eas update:rollback` testée sur un canal de test avant la production.

## Conséquences

- Aucun changement de dépendance dans ce sprint.
- Corriger `docs/FIREBASE_MONITORING.md` §2.4 (`eas update --rollback` inexistant) lors
  du prochain passage sur le guide de monitoring, et y mentionner le déploiement
  progressif.
- Le runbook (`docs/RUNBOOK.md`) reprend le retour arrière mobile sans OTA.

## Actions

- [ ] Yoss : valider « pas d'OTA pour l'instant » et la date de réévaluation.
- [ ] Vérifier dans Play Console et App Store Connect les fonctions exactes de
  suspension et de pause des diffusions progressives.
- [ ] Vérifier la grille tarifaire EAS Update si la décision change.
