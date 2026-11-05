# Audit complet SuiviBaby — 2026-11-05

> 9 agents ECC en lecture seule, un par domaine : sécurité (`security-reviewer`),
> données de santé et RGPD (`healthcare-reviewer`), performance
> (`performance-optimizer`), qualité React (`react-reviewer`), accessibilité
> (`a11y-architect`), erreurs silencieuses (`silent-failure-hunter`),
> architecture (`architect`), tests (`pr-test-analyzer`), site et SEO
> (`seo-specialist`). Synthèse et vérifications : Claude.
>
> Les points marqués **✔ vérifié** ont été relus dans le code par Claude après
> les rapports. Les autres sont des constats d'agents, à confirmer au moment de
> les traiter. Les actions déjà dans [SUIVI_ACTIONS.md](SUIVI_ACTIONS.md) sont
> citées par leur numéro et ne sont pas redécrites.

## En bref

L'app est saine sur ce qui a déjà été audité (règles Firestore, partage,
pipeline voix/LLM : S1 à S13 bien en place). Les risques se concentrent
ailleurs :

1. **Argent** : un paiement d'abonnement peut être perdu, et le parrainage
   donne du Premium gratuit à vie.
2. **RGPD** : les comptes Apple/Google n'ont ni consentement santé ni moyen de
   supprimer leur compte ; la suppression programmée laisse des données et
   peut confirmer une suppression qui n'a pas eu lieu.
3. **Sécurité des bébés** : le message de fièvre ne tient pas compte de l'âge,
   et deux conseils peuvent valoriser des couchages à risque.
4. **On ne voit rien** : Sentry ne reçoit rien en production, aucune alerte
   serveur, aucune sauvegarde Firestore.

## P0 — à traiter maintenant

| # | Constat | Où | Impact | Correctif | Domaine |
|---|---|---|---|---|---|
| A1 | **Paiement perdu** : le marqueur anti-doublon du webhook RevenueCat est écrit avant le traitement ; si la transaction échoue, RevenueCat réessaie, le retry est pris pour un doublon (200) et l'abonnement n'est jamais mis à jour. ✔ vérifié | `functions/index.js:2805-2828` puis `:2935` | Client payé resté « free » côté serveur (ou l'inverse à l'expiration) | Écrire le marqueur dans la même transaction que `subscriptions/{uid}` (ou le supprimer avant de répondre 5xx) ; `webhook_logs.add` non bloquant | sécurité, erreurs |
| A2 | **Premium gratuit à vie via le parrainage** : chacun peut réécrire son `user_promos` (dont `referredBy`), seule protection contre un 2ᵉ usage ; chaque appel à `validateReferralCode` redonne 1 mois. ✔ vérifié | `firestore.rules:499-503`, `functions/index.js:3466-3560`, `services/promoService.ts:198` | Perte de revenu, exploitable avec un client Firestore | Champs de parrainage non modifiables par le client ; usage tracé dans `referrals/{filleulUid}` créé en transaction ; code généré côté serveur (`crypto.randomBytes`) ; plafond par parrain | sécurité |
| A3 | **Suppression de compte programmée** (le seul parcours utilisateur) : un échec de suppression Firebase Auth est avalé alors que `users/{uid}` est déjà effacé (plus jamais retraité) et l'e-mail « supprimé définitivement » part ✔ vérifié ; 9 collections oubliées (`subscriptions`, `user_promos`, `referrals`, `user_content`, `webhook_logs`, `user_hidden_photos`, `voice_transcribe_cache`, `pending_assemblyai_deletes`, `childDeletionRequests`) ; si le nettoyage des photos échoue, les événements qui les référencent sont quand même supprimés (photos orphelines) | `functions/index.js:3874-3935` vs `deleteUserAccount` `:2600-2726` | RGPD art. 17, confirmation mensongère | Une seule fonction `purgeUserData(uid)` pour les deux parcours ; ne marquer « terminé » et n'envoyer l'e-mail qu'après succès d'Auth ; photos d'abord, événements ensuite ; test qui compare les collections purgées | RGPD, erreurs, sécurité |
| A4 | **Comptes Apple/Google** : pas de case de consentement santé (art. 9) ✔ vérifié, et suppression de compte impossible (mot de passe e-mail exigé) ✔ vérifié ; pas de révocation du jeton Sign in with Apple | `app/(auth)/login.tsx:358` (e-mail seulement), `services/accountDeletionService.ts:61` | Traitement sans base légale ; RGPD art. 17 ; règle App Store 5.1.1(v) | Écran de consentement bloquant après connexion sociale (et pour les comptes existants) ; ré-authentification selon le fournisseur ; révocation Apple côté serveur | RGPD |
| A5 | **Message de fièvre identique quel que soit l'âge** (« consultez si la fièvre persiste ») ✔ vérifié ; avant 3 mois, ≥ 38 °C = consultation en urgence. Il est masquable, calculé sur 7 jours, rien à la saisie. Aussi : « fièvre et appétit… C'est normal » ; « {prénom} dort le mieux en voiture / poussette / cododo » ; fiche cododo (partage du lit dès 0 mois) contraire aux recommandations françaises | `services/insightEngine.ts:349-376`, `:298-341`, `services/correlationService.ts:348`, `data/tips_seed.json:191-211` | Sécurité des bébés | Alerte à la saisie selon l'âge, non masquable (< 3 mois : « consultez en urgence / 15 ») ; retirer « C'est normal » ; conseil « meilleur endroit » limité au lit ; réécrire la fiche cododo ; **relecture par un pédiatre** | santé |
| A6 | **Sentry ne reçoit rien en production** : le DSN vient de `EXPO_PUBLIC_SENTRY_DSN`, absent des variables EAS de production et de tout `.env` ✔ vérifié ; source maps désactivées en production ; pas de `release`/`dist` ; aucun filtrage des données de santé (`beforeSend`/`beforeBreadcrumb`) | `app/_layout.tsx:34-47`, `eas.json` | Aucun crash ni erreur vu ; tous les `captureServiceError` sont inertes | Filtre des breadcrumbs `console` et corps HTTP **avant** d'activer ; DSN en variable EAS production (et build Android local) ; source maps ; `release`/`dist` ; vérifier qu'un événement de test arrive. Lié à D3 (région) | architecture, RGPD |
| A7 | **Aucune sauvegarde Firestore** (déjà suivi D1), **aucune alerte serveur** (fonctions planifiées, webhook 5xx, budget) | `docs/FIREBASE_MONITORING.md` §7 | Perte de données irréversible ; incidents invisibles | Sauvegarde quotidienne (7 j) + hebdo (30 j), protection contre la suppression, restauration testée ; alertes Cloud Monitoring et budget | architecture |

## P1 — dans les prochaines semaines

### Données et RGPD
- **Export JSON payant après un seul export** (art. 20 : la portabilité doit être gratuite) — `app/settings/export.tsx:765`, `functions/index.js:33`. Rendre le JSON gratuit et illimité (limite de débit seulement).
- **Transfert de propriété vers un lecteur** : `owner` absent de `rolePriority`, un grand-parent « viewer » peut hériter du dossier à la place de l'autre parent — `functions/index.js:484-514`.
- **Récap hebdomadaire** : adresse lue dans `users.email` (modifiable → spam depuis `noreply@suivibaby.com`), envoyé aussi aux lecteurs et contributeurs, chiffres de santé dans l'e-mail, continue pendant la suppression programmée — `functions/index.js:4326-4417`.
- **Données personnelles dans les journaux** : e-mails et prénoms dans Cloud Logging (`functions/index.js:4395-4433`), transcriptions vocales dans des `console.log` (à vérifier dans le bundle).
- **Politique de confidentialité inexacte** sur la voix : le prénom part bien chez Anthropic dans la transcription, le cache « 5 minutes » dure jusqu'à 24 h (TTL), l'audio reste sur le téléphone (`services/voice/recorder.ts`, aucun `deleteAsync`).
- **Données sur l'appareil** : exports JSON jamais supprimés, file hors ligne conservée après déconnexion, `android:allowBackup="true"` (jeton et caches dans la sauvegarde Google).
- `recap_history` et `notification_history` jamais purgés ; suppression d'un parent qui efface ses saisies dans le dossier partagé ; preuve de consentement écrite par le client, version figée.

### Sécurité
- E-mail opérateur des signalements : HTML non échappé (`functions/index.js:1439-1451`).
- `photoPath` / `photos` non bornés au dossier de l'enfant → suppression de fichiers d'un autre enfant possible (`functions/index.js:1623`, `:1817`).
- `createShareInvitation` : pas de limite de débit, `childName` libre, réponse qui révèle si un e-mail a un compte.
- `setAdminClaim` : bootstrap sans `email_verified`.
- Reset de mot de passe Android par schéma personnalisé sans App Links vérifiés (`assetlinks.json` absent).
- `npm audit` : 22 vulnérabilités dans `functions/` (non exploitables ici, à mettre à jour), 50 à la racine (surtout outillage de build).
- Déjà suivis : S4 (App Check), S5 (`email_verified`), S14 (TRANSFER).

### Fiabilité (erreurs silencieuses)
- **File hors ligne** : un `create` rejoué peut créer un doublon (pas d'`idempotencyKey` hors chemin optimiste, dédoublonnage serveur non transactionnel) ; un `update` refusé (`aborted`) bloque toute la file pour toujours ; les échecs définitifs disparaissent sans message ni Sentry (`services/offlineQueueService.ts`).
- Toasts « ajouté avec succès » avant la confirmation serveur (voix, jalons, humeur) ; recherche vocale qui transforme une erreur réseau en « introuvable ».
- Upload de photo de jalon sans délai maximal, progression simulée, fichiers orphelins.
- E-mail de demande de suppression non vérifié (fire-and-forget) ; « Restaurer mes achats » avec message trompeur.

### Performance (même cause que l'écran Statistiques)
- **Relecture serveur au retour de l'arrière-plan** sur les 14 écrans montés (écouteurs déjà actifs) : plusieurs milliers de lectures et un gel à chaque retour — `hooks/useForegroundServerRefresh.ts`. Le plus gros gain pour le moins d'effort.
- **Likes et commentaires** écoutés 3 fois (contexte global, Moments, Galerie), jusqu'à 1 100 lectures à chaque lancement.
- **Galerie** : photos jamais redimensionnées à l'upload, vignettes en pleine résolution, tout l'historique des jalons.
- **Démarrage** : délai artificiel de 0,5 à 1,5 s, jour courant lu 3 fois.
- Journal (chrono) et accueil redessinés chaque minute ; écoutes sur 14 jours relues entièrement à chaque « Voir plus ».
- Démarrage à froid des fonctions d'écriture d'événements (pas de `minInstances`, SDK lourds chargés au démarrage).

### Qualité React
- `ModalContext`, `ToastContext`, `SheetContext` : valeurs et fonctions recréées à chaque rendu → toute l'app se redessine à chaque toast ou modale ; boucle possible avec `AuthContext` (à confirmer sur appareil).
- Rafraîchissement au retour de l'arrière-plan pouvant écrire les données d'un enfant dans un autre (`useForegroundServerRefresh` sans garde d'enfant).
- Bouton « Relancer l'application » de l'`ErrorBoundary` inefficace ; aucune `SafeBoundary` hors Statistiques (un crash de formulaire fait tomber l'app).
- Suppression avec annulation (3 s) perdue si l'app passe en arrière-plan.

### Accessibilité
- **Contraste** : `textMuted` (#9ca3af, ≈ 2,5:1) utilisé environ 380 fois comme texte, erreurs en #ef4444 (≈ 3,6:1) — un changement de palette corrige l'essentiel (`constants/dashboardColors.ts:85,136`).
- Graphiques inaccessibles aux lecteurs d'écran (pas d'alternative textuelle).
- `useReduceMotion` existe mais n'est utilisé nulle part.
- Menu du FAB fermé encore lu par VoiceOver/TalkBack ; valeurs des sélecteurs de date non annoncées ; cibles tactiles < 44 pt (cases, œil, navigation de semaine).

### Pipeline et architecture
- `release.yml` (déclenché par tag `v*`) est cassé et dangereux : build Android cloud qui échoue, envoi du build précédent, `app_config` mis à jour avant la revue des stores, double déploiement des fonctions. À désactiver.
- Un seul environnement : la build de dev écrit en production, chaque push sur `main` touchant les fonctions déploie en production.
- Rappels et récap hebdomadaire : lectures séquentielles imbriquées, ne tiendront pas quelques centaines d'utilisateurs.
- Release Android dépendante d'un seul Mac et d'un navigateur (pas de compte de service Play).

### Tests
- Couverture réelle probablement < 40 % (66 % affichés car seuls les fichiers importés par un test comptent) — ajouter `collectCoverageFrom`.
- Aucun test : votes, annulation et purge de suppression d'enfant, suppression de compte côté utilisateur, rappels, récap hebdomadaire, écrans d'authentification.
- Les 10 parcours Maestro ne tournent dans aucun CI.

### Site
- Promesses Premium non tenues par le code (courbes OMS, statistiques avancées, « partage illimité » vs « 5 comptes ») : déjà suivi 3.2/3.3, **à trancher avant le déploiement du site** (2.4).
- Badge « jusqu'à −46 % » ambigu (−37 % pour Premium, −46 % pour Famille).
- `cleanUrls`, favicon, logo de 36 px servi depuis l'icône 1024 px, og-image en PNG.
- Cases « À compléter » des pages légales : déjà suivi 2.3.

## P2 — dette à planifier

- **Neuf écrans de liste** (repas, pompages, routines, soins, activités, couches, croissance, jalons, vaccins) de 1 800 à 2 400 lignes, copiés les uns des autres ; `toDate` redéfini 17 fois. Un écran générique piloté par configuration.
- `functions/index.js` : 5 084 lignes, 35 fonctions → découpage par domaine ; supprimer `migrateUsersPublicRemoveEmail` et `generateAiInsight` (plus appelée par l'app).
- Expo SDK 53 / RN 0.79 bientôt hors support ; Skia en pré-version (`2.0.0-next.4`) encore utilisé par 5 fichiers.
- Couche d'accès aux données : Firestore appelé directement depuis l'UI (export, moments, réglages…).
- Code mort : 5 services par type (anciennes collections), `app/backups/*.txt`.
- Documentation : ≈ 70 fichiers dans `docs/` + 13 `todo_*` à la racine → un index, un runbook, des ADR.
- Site : pages de contenu (allaitement, sommeil, courbes OMS), JSON-LD enrichi.

## Corrections apportées aux rapports

- « Les tests des règles ne tournent pas dans le CI » (tests) : **faux**, le job « Security rules tests (emulator) » est passé sur la PR #9.
- « Le lien Google Play n'est pas public » (SEO) : **faux**, la 1.0.6 est en production sur Google Play depuis le 2026-11-02.
- « `@react-native-firebase/app` n'est jamais importé » (performance) : **faux**, plugin dans `app.config.js` et import dynamique pour App Check (`config/appCheck.ts`).

## Feuille de route proposée

| Semaine | Contenu |
|---|---|
| S+1 | A1 webhook, A2 parrainage, A3 purge unique (avec tests), A6 Sentry (filtrage puis DSN), désactiver `release.yml` |
| S+2 | A4 comptes Apple/Google, A7 sauvegardes et alertes, export JSON gratuit, transfert de propriété, récap hebdomadaire |
| S+3 | A5 messages de santé après relecture pédiatre ; file hors ligne (doublons, blocage, échecs visibles) ; relecture au retour de l'arrière-plan |
| S+4 | Contraste et animations réduites ; contextes mémoïsés ; galerie (miniatures) ; démarrage |
| Mois 2 | Environnement de staging, release Android automatisée, tests des suppressions et des rappels, découpage de `functions/index.js` |
| Mois 3 | Montée de SDK Expo, écran de liste générique, couche d'accès aux données |
