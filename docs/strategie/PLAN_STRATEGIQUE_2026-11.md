# SuiviBaby — Carte fonctionnelle complète · Business plan

**Verdict: Not yet**

- ✓ Each payeur-mois earns $1.53 before fixed costs (70% contribution).
- ✗ Year 1 operating LOSS: $812.
- ✗ 1 of 8 simulated buyers buy (12%, the bar is 25%).

| key number | |
| --- | ---: |
| Price | $2.19 a payeur-mois |
| Profit margin at plan | 13% per payeur-mois |
| Break-even | 118 payeur-moiss a day |
| Year 1 operating profit | $-812 |
| Startup spend | $150 |
| Cash needed before it pays for itself | $1,025 |
| Startup money earned back | not in year 1 |
| Buyer panel | 1 buy · 7 pass |

## The idea

> Établie le 2026-11-12 sur la branche `fix/premium-offer-compliance` (commit `eeed711`), en lecture seule.
> Sources : `graphify-out/GRAPH_REPORT.md` (3 119 nœuds, 123 communautés), lecture des routes `app/`, des services/contexts/hooks, de `functions/index.js` et `functions/src/**`, de `firestore.rules`, et de `docs/PREMIUM_OFFRE_CIBLE.md`.
> Les chemins sont relatifs à `/Users/yoss/Projects/Samaye`. `fichier:ligne` pointe vers le point d'entrée (composant ou export).
> **Limite importante** : il n'y a aucune donnée d'usage réelle dans le repo. `services/onboardingAnalytics.ts` n'écrit que dans AsyncStorage, en local, et rien ne remonte. Les classements « valeur » et « coût » ci-dessous s'appuient donc sur le code (centralité, fréquence d'appel, déclencheurs), pas sur la télémétrie.

---

### 0. Architecture en une minute

| Couche | Techno | Rôle |
|---|---|---|
| App | Expo Router (React Native), TypeScript | Les routes `app/(auth)`, `app/(drawer)`, `app/(drawer)/baby/(tabs)` et `app/settings/*`. |
| État | Contexts (`AuthContext`, `BabyContext`, `PremiumContext`, `SheetContext`, `ModalContext`, `MomentsNotificationContext`, `SocialInteractionsContext`, `ToastContext`, `ThemeContext`) | Les god nodes sont `useBaby()` (82 liens), `useAuth()` (76) et `HomeDashboard()` (51). |
| Données | Firestore (eur3), Storage (bucket EU + ancien bucket US en miroir), SQLite local (file hors ligne) | — |
| Serveur | Cloud Functions v2, Node 22, `europe-west1` par défaut (`functions/index.js:7`) | 46 exports (dont 45 fonctions et 1 helper, `photoRefToPath`) : callables, 9 tâches planifiées, 1 trigger Firestore, 4 triggers Storage, 2 HTTP. |
| Tiers | AssemblyAI (transcription), Anthropic Claude `claude-haiku-5-5` (analyse vocale), Resend (e-mails), Expo Push, RevenueCat (abonnements), Sentry | — |

**Écriture d'un événement** : l'app appelle la callable `validateAndCreateEvent` (`services/eventsService.ts:177`, `functions/src/events/callables.js:15`). Hors ligne, l'événement part dans la file SQLite (`services/offlineQueueService.ts:282`) puis est rejoué. Les règles interdisent la suppression côté client : elle passe par `deleteEventCascade`.

**Modèle de rôles** (`functions/lib/roles.js`, `utils/permissions.ts:27`) :

| Rôle | Libellé UI | Droits |
|---|---|---|
| `owner` | Propriétaire | Tout, plus la gestion des accès (`canManageAccess`). |
| `admin` | « Parent » | Écrit les événements, les likes et les commentaires. |
| `contributor` | « Proche » | Lecture seule sur les événements, plus likes et commentaires. Voit l'onglet Stats au lieu de Plus, et n'a pas le VoiceDock (`app/(drawer)/baby/(tabs)/_layout.tsx:72-73`). |

Un code de partage ou une invitation donne toujours le rôle « Proche ». Seul le propriétaire peut ensuite passer quelqu'un en Parent, via `setMemberRole`.

---

### 1. Inventaire des fonctionnalités par domaine

Légende maturité : **solide** = complet et durci (tests, idempotence, règles) · **partiel** = marche mais incomplet ou incohérent · **stub** = UI factice ou backend absent · **mort** = non atteignable ou jamais appelé.

#### 1.1 Compte, authentification, onboarding

| Fonctionnalité | Ce que l'utilisateur peut faire | Point d'entrée | Données | Fonctions serveur | Gating | Maturité | Coûts | Écarts / bugs |
|---|---|---|---|---|---|---|---|---|
| Connexion / inscription | E-mail + mot de passe, Google, Apple | `app/(auth)/login.tsx:83`, `services/socialAuthService.ts:134,146` | `users`, `users_public` | — (Firebase Auth) | Gratuit | solide | Auth gratuite | — |
| Vérification e-mail | Bloque le partage tant que l'e-mail n'est pas vérifié | `app/(auth)/verify-email.tsx:26` | — | `assertVerifiedEmail` côté sharing | Gratuit | solide | — | — |
| Mot de passe oublié / réinitialisation | Lien par e-mail, page web `public/reset-password.html` | `app/(auth)/forgot-password.tsx:28`, `reset-password.tsx:47` | — | — | Gratuit | solide | — | — |
| Onboarding (5 slides) | Présentation (saisie en 3 s, famille, sécurité, insights) | `app/(auth)/onboarding.tsx:90` | AsyncStorage | — | Gratuit | solide | — | Le funnel n'est mesuré qu'en local (`services/onboardingAnalytics.ts`) : aucune mesure d'activation n'est exploitable. |
| Consentement données de santé (RGPD art. 9) | Consentement explicite, obligatoire pour accéder à l'app ; retrait possible depuis Réglages | `app/(auth)/health-consent.tsx:32`, `app/(drawer)/settings.tsx:530` | `consent_records` (serveur, conservé 5 ans), `user_preferences.healthDataConsent` | `recordHealthConsent`, `withdrawHealthConsent` (`functions/src/deletion/consent.js:22,78`) | Gratuit | solide | négligeable | — |
| Biométrie | Face ID / empreinte au lancement | `app/(drawer)/settings.tsx:363`, `services/biometricAuthService.ts` | local | — | Gratuit | solide | — | — |
| Profil, mot de passe | Modifier le nom ou le mot de passe | `app/settings/profile.tsx:23`, `password.tsx:28` | `users`, `users_public` | — | Gratuit | solide | — | — |
| Thème | Clair / sombre / auto, plus un mode nuit automatique (`hooks/useNightMode.ts`) | `app/settings/theme.tsx:26` | `user_preferences.theme` | — | Gratuit (annoncé dans le paywall) | solide | — | — |
| Langue | Choix de la langue | `app/settings/language.tsx:34` | `user_preferences.language` | — | — | **mort** | — | Écran orphelin : aucun lien n'y mène et l'app n'existe qu'en français. |
| Aide & support | FAQ, contact `support@suivibaby.com` | `app/settings/help.tsx:30` | — | — | Gratuit | solide | — | — |
| CGU / confidentialité | Pages légales dans l'app et sur le site `public/*.html` | `app/settings/terms.tsx`, `privacy.tsx`, `app/(auth)/terms.tsx` | — | — | Gratuit | solide | — | — |
| Suppression du compte | Demande avec 30 jours de grâce, annulation possible, e-mail de confirmation ; révocation du token Apple | `app/(drawer)/settings.tsx:564`, `hooks/useAccountDeletionFlow.tsx`, `app/(auth)/pending-deletion.tsx:24` | `users.pendingDeletion`, purge complète (`functions/src/deletion/purgeUser.js`) | `requestAccountDeletion`, `cancelAccountDeletion`, `processScheduledDeletions` (quotidien), `sendDeletionRequestEmail`, `registerAppleRevocation`, `deleteUserAccount` (réservé aux admins) (`functions/src/deletion/account.js:185,247,315,272,29`) | Gratuit (obligation légale) | solide | Resend : 2 e-mails par suppression | — |

#### 1.2 Enfants et sélection

| Fonctionnalité | Ce que l'utilisateur peut faire | Point d'entrée | Données | Serveur | Gating | Maturité | Écarts |
|---|---|---|---|---|---|---|---|
| Ajouter un enfant | Nom, date de naissance, sexe | `app/(drawer)/add-baby.tsx:29` | `children`, `children/{id}/access/{uid}`, `user_child_access` | — | Gratuit, enfants illimités (décision 2026-11-11) | solide | — |
| Choisir l'enfant actif | Sélecteur au boot et dans le drawer | `app/child-picker.tsx:39`, `app/boot.tsx:572`, `components/drawer/CustomDrawerContent.tsx` | `BabyContext` | — | Gratuit | solide | — |
| Modifier un enfant | Profil et allergies (`components/forms/AllergiesEditor.tsx`) | `app/settings/edit-child.tsx:62` | `children` | — | Gratuit | solide | — |
| Masquer des enfants | Retirer un enfant de sa liste sans le supprimer | `app/settings/hidden-children.tsx:35` | `users` (liste masquée) | — | Gratuit | solide | — |
| Supprimer un enfant | Demande de suppression avec **vote** si plusieurs propriétaires, transfert de propriété avant de partir | `app/settings/deletion-requests.tsx:73`, `components/suivibaby/DeletionRequestNotifier.tsx`, `components/ui/OwnershipTransferModal.tsx` | `childDeletionRequests`, soft-delete puis purge | `createDeletionRequest`, `voteDeletionRequest`, `cancelChildDeletion`, `transferAndLeave`, `getOwnershipBlockers`, `purgeDeletedChildren` (quotidien) (`functions/src/deletion/child.js:15-456`) | Gratuit | solide | — |
| Rattachement de « bébé simulé » | Approuver des demandes d'attachement | `app/suivibaby/pending-requests.tsx:26`, `services/babyAttachmentService.ts` | `babies`, `babyAttachmentRequests` | — | — | **mort** | Écran orphelin, e-mail codé en dur `parent@example.com` (l.30). Ces collections ne figurent pas dans `firestore.rules` : la règle par défaut refuse tout (l.693). |

#### 1.3 Boucle de suivi quotidien (le cœur du produit)

18 types d'événements (`services/events/types.ts:12`) : biberon, tétée, solide, pompage, couche (ancien format), miction, selle, sommeil, bain, température, médicament, symptôme, croissance, vaccin, vitamine, activité, jalon, nettoyage de nez.

| Fonctionnalité | Ce que l'utilisateur peut faire | Point d'entrée | Données | Serveur | Gating | Maturité | Coûts | Écarts |
|---|---|---|---|---|---|---|---|---|
| Accueil / tableau de bord | Résumé du jour (repas, couches, sommeil), saisie rapide, widgets Sommeil et Promenade en cours, derniers événements, guide de première saisie | `app/(drawer)/baby/(tabs)/home.tsx:178` (StatsGroup l.1755, SleepWidget l.1796, PromenadeWidget l.1820, RecentEventsList l.1912, FirstTrackGuide l.1699) | `events` | `validateAndCreateEvent` | Gratuit | solide | Listener temps réel sur les événements du jour (`ecouterEvenementsDuJour`, l.1261) et cache hebdo (`useWeeklyInsightEvents`, l.578) | Fichier de 1 982 lignes : risque de re-rendus. |
| Bouton + / feuilles de saisie | FAB global, feuilles par type (`components/forms/*Form.tsx`) | `components/suivibaby/GlobalFAB.tsx`, `components/ui/GlobalSheetManager.tsx`, `contexts/SheetContext.tsx` | `events` | `validateAndCreateEvent`, `validateAndUpdateEvent` | Gratuit | solide | 1 invocation de callable par écriture | — |
| Repas | Biberons, tétées, solides (diversification, nouvel aliment, réaction) | `app/(drawer)/baby/(tabs)/meals.tsx:5` → `components/eventList/EventListScreen.tsx`, `configs/mealsConfig.tsx` | `events` | idem | Gratuit | solide | — | — |
| Couches | Mictions et selles | `diapers.tsx:5` → `configs/diapersConfig.tsx` | `events` | idem | Gratuit | solide | — | — |
| Tire-lait | Sessions et totaux | `pumping.tsx:5` → `configs/pumpingConfig.tsx` | `events` | idem | Gratuit | solide | — | — |
| Routines | Sommeil (minuteur en cours, siestes), bain, nettoyage de nez | `routines.tsx:262` | `events` | idem | Gratuit | solide | — | — |
| Activités | Tummy time, jeux, lecture ; promenade chronométrée et synchronisée entre aidants | `activities.tsx:283`, `components/suivibaby/dashboard/PromenadeWidget.tsx` | `events` | idem | Gratuit | solide | — | — |
| Santé (Soins) | Température avec **alerte fièvre selon l'âge**, symptômes, médicaments, vaccins, vitamines | `soins.tsx:279`, `utils/temperatureAlert.ts`, `utils/temperatureAlertDialog.ts` | `events` | idem | Gratuit | solide | — | Les textes d'alerte doivent encore être relus par un pédiatre (seuil < 36 °C non sourcé, `utils/temperatureAlert.ts` en-tête). |
| Vaccinations (écran dédié) | Historique vaccinal | `immunizations.tsx:195` | `events` (vaccin) | — | — | **mort** (2 409 lignes) | — | Onglet caché (`_layout.tsx:189`) vers lequel aucun lien ne mène. Les vaccins se saisissent via Soins. |
| Croissance (saisie) | Poids, taille, tour de tête, sélection multiple | `growth.tsx:217` | `events` | idem | Gratuit | solide | — | — |
| Croissance (courbes OMS) | Courbes de percentiles OMS par sexe, alerte hors plage | `croissance.tsx:816`, `utils/omsCurve.ts`, `constants/omsPercentiles` | `events` | — | Gratuit (`FREE_FEATURES`, décision Q7) | solide | — | — |
| Journal (chrono) | Fil chronologique filtrable, minuteurs en cours, suppression avec annulation | `chrono.tsx:1622` (StickyHeaderSectionList l.2485) | `events` | `deleteEventCascade` | Gratuit | solide | Fenêtres paginées | 2 737 lignes. |
| Statistiques | Graphiques tétées/biberons, tire-lait, sommeil ; export PDF | `stats.tsx:146`, `components/suivibaby/RepasChart.tsx`, `PompagesChart.tsx`, `SommeilChart.tsx` | `events` (plages lues côté serveur, l.398) | `getUsageQuotaStatus`, `consumeUsageQuota` | Graphiques gratuits ; **PDF : 1 essai gratuit, puis Premium** (l.938) | solide (PDF partiel) | Relectures de plages | Voir §4 : le quota PDF est consommé côté client. |
| Saisie vocale | Dicter une ou plusieurs commandes (« biberon de 120 ml à 14 h et une selle »), mode mains libres, 60 s maximum | `components/suivibaby/VoiceDock.tsx`, `VoiceBar.tsx`, `hooks/useVoiceInput.ts:46`, `hooks/useVoiceCommand.ts`, `services/voice/*`, `services/voiceEventCreator.ts` | `usage_limits/{uid}`, cache d'idempotence, `events` | `transcribeAudio` (AssemblyAI, `speech_model: best`, fr, `minInstances: 1`), `parseVoiceCommand` (Claude Haiku, prompt système en cache, 200 appels/jour max), `retryAssemblyAIDeletes` (toutes les heures) | **Gratuit : 3/jour · Premium : 50/jour** (`functions/src/billing/quotas.js:5-9`) | solide (durci, red-teamé) | **Premier poste de coût variable** | `parseVoiceCommand` a son propre plafond de 200/jour, indépendant du quota voix : un client modifié pourrait l'appeler 200 fois par jour sans passer par la transcription (voir §4). |

#### 1.4 Souvenirs : moments, jalons, galerie

| Fonctionnalité | Ce que l'utilisateur peut faire | Point d'entrée | Données | Serveur | Gating | Maturité | Coûts | Écarts |
|---|---|---|---|---|---|---|---|---|
| Moments (onglet) | Humeur du jour (1 à 5), vue semaine, timeline, galerie Polaroid, likes et commentaires, badge « nouveaux moments » | `moments.tsx:51`, `components/moments/*`, `hooks/useMomentsData.ts`, `contexts/MomentsNotificationContext.tsx` | `events` (jalon `humeur`/`photo`), `eventLikes`, `eventComments` | — | Gratuit | solide | Listeners likes et commentaires (500 docs chacun par enfant, `services/socialService.ts:607-655`) et jalons (100) | Animations lourdes (confettis, particules). |
| Jalons | Dents, premiers pas, sourires, mots, photo | `milestones.tsx:281`, `components/forms/MilestonesForm.tsx`, `services/events/milestonePhoto.ts` | `events`, Storage `children/{id}/…` | `generatePhotoThumbnail` (400 px) | Gratuit | solide | Storage (photos 1 600 px JPEG et miniatures) | — |
| Galerie | Grille de photos, plein écran, likes et commentaires, signalement | `gallery.tsx:410`, `components/moments/SwipeGallery.tsx` | idem | `submitContentReportCF` | Gratuit | solide | Egress Storage | — |
| Photos masquées | Masquer une photo pour soi | `app/settings/hidden-photos.tsx:35` | `user_hidden_photos` | — | Gratuit | solide | — | — |
| Modération | Signaler une photo ou un commentaire ; masquage automatique si signalé par le propriétaire ou par 2 personnes ; e-mail à l'admin ; push à l'auteur | `components/moments/ReportModal.tsx`, `services/contentReportService.ts` | `reports` | `submitContentReportCF`, `onReportCreated`, `handleReportCreated`, `resolveReport` (admin) (`functions/src/moderation/reports.js`) | Gratuit | solide | Resend et push | La résolution passe par des scripts (`scripts/resolveReport.mjs`, `listOpenReports.mjs`) : pas de console admin. |
| Célébration de jalons d'usage | Modale « 1 mois de suivi », « 100e repas », « nuit de 6 h » ; **séries de jours consécutifs réservées à Premium** | `components/suivibaby/home/HomeMilestoneCelebration.tsx:44` (`checkFeatureAccess("milestones_capsule")`), `services/milestoneCelebrationService.ts:193` | AsyncStorage / `user_content` | — | Mixte : séries = Premium | solide | — | Restriction Premium **non annoncée** dans le paywall (`app/settings/premium.tsx:73-95`). Pas illégal (c'est un bonus), mais incohérent avec la règle « ne lister que ce qui est réservé ». |

#### 1.5 Fonctions « intelligentes » (dérivées)

Tout le contenu intelligent tourne **en local et de façon déterministe**, sans aucun LLM : coût serveur quasi nul.

| Fonctionnalité | Ce qu'elle fait | Point d'entrée | Données | Gating | Maturité | Écarts |
|---|---|---|---|---|---|---|
| Insights | Règles sur l'alimentation, le sommeil, la santé et le développement, plus des alertes santé non masquables (fièvre) | `services/insightEngine.ts:441,586` → `hooks/useSmartContent.ts` → `components/suivibaby/home/HomeSmartContent.tsx` (home l.1891) | Lit `events` ; dismissals dans `user_content` | Gratuit (désactivable dans Notifications) | solide | — |
| Corrélations | Repas avant dodo, bain avant dodo, activité et sommeil, fièvre et appétit | `services/correlationService.ts:389` | idem | Gratuit | solide | Le volume de données requis n'est pas affiché à l'utilisateur. |
| Conseils (tips) par âge et lecteur d'articles | Carrousel de conseils, article plein écran, favoris et feedback | home l.1721 `TipsCarousel`, `components/suivibaby/ArticleReader.tsx`, `services/smartContentService.ts:42` | `tips` (contenu publié via `scripts/publishTips.mjs`), `user_content` | Gratuit | solide | — |
| Jalons à venir (référentiel) | Carte « prochains jalons » selon l'âge | `MilestoneTimelineCard`, `smartContentService.ts:158` | `milestones_ref` | Gratuit | solide | — |
| Alertes de dépassement de seuil | Toast quand le délai de repas, change ou pompage est dépassé | `components/suivibaby/dashboard/ReminderWarningWatcher.tsx` (home l.1656) | prefs | Gratuit | solide | — |
| Rappels | Notifications locales (`hooks/useReminderScheduler.ts`, home l.534) **et** push serveur toutes les 30 min | `services/localNotificationService.ts:106,198`, `functions/src/notifications/reminders.js:32` | `user_preferences.notifications.reminders`, `device_tokens`, `notification_history`, `children.lastEventAt` | Gratuit (désactivé par défaut) | partiel | **Double canal** : le même seuil est planifié en local ET envoyé en push par le serveur, sans coordination visible. Risque de double notification, à vérifier sur appareil. |
| Récap hebdomadaire par e-mail | Lundi 8 h (heure de Paris) : synthèse de la semaine par enfant, désinscription en un clic | `functions/src/notifications/recap.js:58,282` | `recap_history`, `user_preferences.notifications.email` (**désactivé par défaut**) | Gratuit | solide | Opt-in caché dans Réglages > Notifications, donc probablement peu d'inscrits. |
| Insights IA (Claude) | Prédictions, résumé quotidien | `services/aiInsightsService.ts` (+ `dataAnonymizationService.ts`) | — | Prévu Premium | **mort** | Appelle la CF `generateAiInsight`, qui n'existe pas (absente de `functions/index.js`). Jamais importé par un écran. Retiré du paywall le 2026-11-09. |

#### 1.6 Partage et co-parentalité

| Fonctionnalité | Ce que l'utilisateur peut faire | Point d'entrée | Données | Serveur | Gating | Maturité | Écarts |
|---|---|---|---|---|---|---|---|
| Partager un enfant (code) | Générer un code à usage unique valable 7 jours | `app/(drawer)/share-child.tsx:37`, `services/childSharingService.ts:61` | `shareCodes` | `createShareCode`, `redeemShareCodeCF`, `cleanupExpiredShareCodes` (quotidien) | **Gratuit et illimité** (décision 2026-11-11) | solide | — |
| Invitation par e-mail | Invitation in-app, acceptée via `InvitationListener` | `share-child.tsx`, `components/ui/InvitationListener.tsx`, `InvitationModal.tsx` | `shareInvitations` | `createShareInvitation`, `acceptInvitationCF` (`functions/src/sharing/invitations.js:10,129`) | Gratuit | solide | Pas d'e-mail réel : l'invité doit déjà avoir l'app. La page `public/invite.html` existe. |
| Rejoindre un enfant | Saisir un code | `app/settings/join-child.tsx:64` | — | `redeemShareCodeCF` | Gratuit | solide | — |
| Gérer les accès | Lister les membres, changer le rôle Parent/Proche, retirer quelqu'un | `manage-access.tsx:200` | `children/{id}/access` | `setMemberRole` | Gratuit (propriétaire seulement) | solide | — |
| Index d'accès | Réconciliation nocturne de `user_child_access` | — | — | `reconcileAccessIndexNightly` (3 h 15) | — | solide | — |

#### 1.7 Hors ligne et synchronisation

| Fonctionnalité | Détail | Point d'entrée | Maturité |
|---|---|---|---|
| File hors ligne | SQLite `pending_events`, 3 essais, backoff jusqu'à 5 min, 8 échecs transitoires tolérés, créations de plus de 25 jours abandonnées, idempotence | `services/offlineQueueService.ts:46-63,282,416`, `hooks/useFailedWrites.ts`, `utils/queuedWriteLabel.ts` | solide |
| Affichage optimiste | Store optimiste et fusion avec le serveur | `services/optimisticEventsStore.ts`, `hooks/useMergedOptimisticEvents.ts` | solide |
| Rafraîchissement au premier plan | Relecture serveur au retour dans l'app | `hooks/useForegroundServerRefresh.ts` | solide (mais coûte des lectures) |
| Bannière hors ligne | `components/ui/OfflineBanner.tsx` | — | **mort** (jamais importée) |
| Avertissement export | Bloque ou avertit si des écritures sont en attente | `services/exportCollector.ts:28` | solide |

#### 1.8 Exports

| Format | Où | Contenu | Gating | Maturité | Écarts |
|---|---|---|---|---|---|
| CSV (tous les événements d'un enfant) | Plus > Exporter (`app/(drawer)/baby/(tabs)/plus.tsx:190`, `services/exportService.ts:125`) | Tous les types | Gratuit | solide | — |
| JSON (sauvegarde complète, portabilité RGPD art. 20) | `app/settings/export.tsx:270` | Enfants sélectionnés, filtrés selon le rôle (`exportCollector.ts:72`) | Gratuit (doit le rester) | solide | — |
| PDF « rapport » | Stats (`stats.tsx:938`), généré dans l'app (expo-print) | Tétées, pompages, sommeil, allergies | 1 gratuit, puis Premium | partiel | Ce n'est pas le « rapport pédiatre » promis (pas de courbes OMS, de santé ni de vaccins, cf. `docs/PREMIUM_OFFRE_CIBLE.md` §3). Quota consommé côté client après succès. |
| Fichiers temporaires | Nettoyés au bout d'1 h (`services/tempShareService.ts:12`) | — | — | solide | — |
| Sauvegarde / restauration | `app/settings/backup.tsx:15` | — | — | **stub** | UI entièrement factice : date « 26 décembre 2025 » et taille « 45.2 MB » codées en dur, alertes de succès simulées. Orpheline. Ne surtout pas la relier en l'état. |

#### 1.9 Notifications

| Canal | Déclencheur | Fichiers | Défaut |
|---|---|---|---|
| Push rappels (serveur) | Toutes les 30 min | `functions/src/notifications/reminders.js:32` | Rappels désactivés par défaut |
| Notifications locales (rappels) | À chaque nouvel événement ou changement de préférence | `hooks/useReminderScheduler.ts`, `services/localNotificationService.ts` | idem |
| Push modération | Photo signalée → auteur | `functions/src/moderation/reports.js:~201` | — |
| E-mail récap | Lundi 8 h | `recap.js:58` | **off** |
| E-mails transactionnels | Suppression de compte, modération | `deletion/account.js`, `moderation/reports.js` | — |
| Jetons push | Enregistrement et désactivation, nettoyage DeviceNotRegistered | `services/pushTokenService.ts`, `device_tokens` | push = on |
| Réglages | push, e-mail, insights, corrélations, conseils, heures calmes (22 h–7 h par défaut), seuils | `app/settings/notifications.tsx:46` | — |
| Notifications croisées (« Papa a donné le biberon ») | — | — | **absent** (cible Famille dans `docs/PREMIUM_OFFRE_CIBLE.md` §5) |

#### 1.10 Monétisation

| Fonctionnalité | Point d'entrée | Serveur | Maturité | Écarts |
|---|---|---|---|---|
| Paywall et achat (mensuel 3,99 €, annuel 29,99 €, à vie 79,99 € ; essai lu depuis le store) | `app/settings/premium.tsx:116`, `utils/premiumOffer.ts:22`, `services/revenueCatService.ts` | `revenueCatWebhook` (HTTP), `cleanupExpiredSubscriptions` (quotidien) (`functions/src/billing/revenuecat.js:236,24`) | solide (conforme aux stores depuis `70ddab0`/`eeed711`) | — |
| État d'abonnement côté client | `contexts/PremiumContext.tsx` (RevenueCat d'abord, Firestore en secours, cache 7 jours) | `subscriptions/{uid}` | partiel | Quand RevenueCat répond, le `tier` Firestore est ignoré (l.201-222) : un Premium accordé côté serveur seulement (parrainage) est invisible dans l'app. En secours Firestore, `isPremium` ne regarde que `tier`, pas `status` (l.287) : il dépend du job quotidien d'expiration. |
| Quotas serveur | `services/premiumUsageService.ts` | `getUsageQuotaStatus`, `consumeUsageQuota` (`functions/src/billing/usage.js:9,46`), `quotas.js` | solide | — |
| Parrainage | Drawer > `ReferralCard` (`components/suivibaby/dashboard/ReferralCard.tsx:42,102`), visible seulement si l'option marketing est activée | `ensureReferralCode`, `validateReferralCode` (1 mois Premium au filleul, et au parrain dans la limite de 10) (`functions/src/billing/referral.js:31,77`) | **partiel / cassé** | **`validateReferralCode` n'est appelé nulle part dans l'app** : on peut partager son code, mais personne ne peut le saisir. Pourtant la carte promet « 1 mois Premium offert ». C'est une promesse non tenue, donc un risque de conformité. |
| Promotions | Drawer > `PromoBanner`, `services/promoService.ts` | `promotions`, `user_promos` (impressions, clics) | partiel | Désactivé tant que l'option marketing n'est pas cochée (off par défaut). |
| Grandfathering | `PremiumContext.tsx:296` | `subscriptions.grandfathered` | solide | — |

#### 1.11 Admin et ops

| Élément | Détail | Fichier |
|---|---|---|
| Claim admin | Attribution par e-mail initial (secret) | `functions/src/admin/claims.js:38` |
| Tâches planifiées (9) | `checkAndSendReminders` (30 min), `retryAssemblyAIDeletes` (60 min), `sendWeeklyRecap` (lundi 8 h), `reconcileAccessIndexNightly` (3 h 15), `processScheduledDeletions`, `purgeDeletedChildren`, `cleanupExpiredShareCodes`, `cleanupExpiredSubscriptions` (toutes les 24 h) | voir §5 |
| Miroir de l'ancien bucket US | `mirrorLegacyPhotoUpload` / `mirrorLegacyPhotoDelete` (us-central1) copient les photos des anciennes versions vers l'UE | `functions/src/media/photos.js:17,31` |
| Miniatures | `generatePhotoThumbnail` / `deletePhotoThumbnail` (512 MiB) | `functions/thumbnails.js:80,85` |
| Mise à jour de l'app | Version minimale et changelog via `app_config` | `components/ui/AppUpdateManager.tsx`, `services/appUpdateService.ts`, `data/changelog.ts` |
| Sauvegardes | Sauvegarde Firestore quotidienne gérée par gcloud, rétention 7 jours, PITR non activé | `docs/RUNBOOK.md:128-145` |
| Scripts | Migrations, backfills, publication des tips, modération | `scripts/*` |
| TTL | Cache voix, audit admin, webhook RevenueCat | `functions/scripts/enable-*-ttl.js` |
| Observabilité | Sentry (`utils/errorReporting.ts`, `captureServiceError`, 107 liens), logs JSON des jobs | — |

---

### 2. Gating Free / Premium aujourd'hui (état réel du code)

| Fonctionnalité | Gratuit | Premium | Où c'est appliqué |
|---|---|---|---|
| Commandes vocales | 3/jour (minuit, heure de Paris) | 50/jour | **Serveur** : `functions/src/billing/quotas.js:5-9,91` (réservation transactionnelle, remboursement en cas d'échec). Client : `hooks/useVoiceInput.ts`. |
| Export PDF | 1 au total | Illimité | Client `stats.tsx:944` + `premiumGatingService.ts:67` ; compteur serveur `usage_limits.pdfExportCount`. |
| Célébration des séries de jours consécutifs | non | oui | Client `HomeMilestoneCelebration.tsx:47` |
| Enfants, partage, stats, courbes OMS, insights, export CSV/JSON, rappels, récap | illimité | — | `FREE_FEATURES` (`PremiumContext.tsx:100`), `getSharingQuotaStatus` |
| Définis mais **non implémentés** : `unlimited_history`, `ai_insights`, `widgets`, `pediatre_report`, `night_mode_premium` | — | — | `PremiumContext.tsx:34-95` (types sans effet) |

**Résumé** : aujourd'hui, Premium = plus de voix + PDF illimité. Rien d'autre de substantiel.

---

### 3. Dormant / mort (présent dans le code, absent de l'UI)

| Élément | Type | Preuve |
|---|---|---|
| `services/aiInsightsService.ts` + `services/dataAnonymizationService.ts` | Service mort | Appelle une CF `generateAiInsight` inexistante ; importé par aucun écran. |
| `app/settings/backup.tsx` | Écran factice, orphelin | Valeurs codées en dur (l.36-37), alertes simulées. |
| `app/settings/language.tsx` | Écran orphelin | Aucun lien dans `settings.tsx`. |
| `app/suivibaby/pending-requests.tsx` + `services/babyAttachmentService.ts` | Ancien code mort | Collections hors `firestore.rules`, e-mail factice. |
| `app/(drawer)/baby/(tabs)/immunizations.tsx` | Écran complet (2 409 l.) inaccessible | Onglet caché, aucun `push`. |
| Parrainage (`validateReferralCode`) | Backend sans UI | Aucun appel client. |
| `PremiumFeature` : `widgets`, `pediatre_report`, `ai_insights`, `unlimited_history`, `night_mode_premium` | Gating sans fonctionnalité | `PremiumContext.tsx:34`. |
| `FAMILY_ONLY_FEATURES` vide ; tier `family` conservé pour les anciens abonnés | Offre arrêtée | `PremiumContext.tsx:109`. |
| Modules jamais importés | Code mort | `hooks/usePaginatedEvents.ts`, `hooks/usePromos.ts`, `hooks/useSuccessAnimation.ts`, `components/ui/OfflineBanner.tsx`, `MealCard.tsx`, `IconLoader.tsx`, `AppBackground.tsx`, `BoundedNumberInput.tsx`, `components/suivibaby/ReusableModal.tsx` |
| `services/onboardingAnalytics.ts` | Analytics « vers nulle part » | AsyncStorage seulement. |
| Miroir de l'ancien bucket US | Temporaire | À retirer quand les anciennes versions auront disparu (`docs/MIGRATION_PHOTOS_EU.md`). |
| Cycles d'import | Dette | `stats.ts ↔ eventsService.ts`, `photoCleanup.ts ↔ eventsService.ts`, `AuthContext → ModalContext → use-color-scheme → ThemeContext → AuthContext` (GRAPH_REPORT). |

---

### 4. Écarts et bugs notables (par priorité)

1. **Parrainage incohérent** (conformité) : la carte promet « 1 mois Premium offert », mais aucune saisie de code n'existe (`validateReferralCode` n'est jamais appelé). Et même si un Premium de parrainage était accordé, `PremiumContext` l'ignorerait dès que RevenueCat répond. L'utilisateur garderait alors la voix à 50/jour côté serveur, mais verrait le paywall PDF : avec un quota `isUnlimited` (`remaining: null`), `decidePdfExportAccess` renvoie `paywall` (`premiumGatingService.ts:73`). La carte n'est visible qu'avec l'option marketing activée (off par défaut). Il faut la masquer ou finir la fonctionnalité.
2. **Fuite de coût potentielle sur `parseVoiceCommand`** : son plafond de 200/jour/utilisateur (`functions/src/voice/parse.js:14`) n'est pas lié au quota voix (3 en gratuit). Un client modifié qui passe App Check peut appeler Claude 200 fois par jour. Correction proposée : exiger un jeton émis par `transcribeAudio` ou décompter le même quota.
3. **Rappels en double canal** : notifications locales et push serveur sur les mêmes seuils. À vérifier sur appareil, puis n'en garder qu'un, ou faire que le serveur ignore les appareils qui planifient en local.
4. **Quota PDF côté client** : la consommation n'a lieu qu'après un succès et ses erreurs sont avalées (`stats.tsx:966-971`). Contournable, impact faible.
5. **Expiration côté client** : en secours Firestore, `isPremium` vaut `tier === premium` quel que soit le `status`. Jusqu'à 24 h d'accès après expiration, le temps que `cleanupExpiredSubscriptions` passe.
6. **Écran de sauvegarde factice** dans le bundle : risque s'il est relié un jour.
7. **Récap hebdo désactivé par défaut** : la fonctionnalité de rétention la plus « push » est invisible.
8. **Seuils d'alerte température** non encore relus par un pédiatre (dans le code).
9. **Pas d'analytics produit** : impossible de mesurer l'activation, la rétention ou l'usage par fonctionnalité.
10. **Performance (vercel-react-native-skills)** : aucun FlashList ; écrans monolithiques de 2 000 à 2 700 lignes (`chrono`, `croissance`, `immunizations`, `routines`, `home`) ; `ScrollView` + `.map` dans plusieurs écrans ; nombreuses animations dans Moments. Points positifs : `expo-image` via `PhotoImage`, `React.memo` sur les éléments de chrono, listeners démarrés en différé.

---

### 5. Moteurs de coût

#### 5.1 Inventaire

| Poste | Déclencheur | Fréquence | Ordre de grandeur / commentaire |
|---|---|---|---|
| **Voix : AssemblyAI** | Chaque commande (`transcribe.js:15`) | Jusqu'à 3 ou 50/jour/utilisateur | Modèle `best`, facturé à la durée d'audio (≤ 60 s, en pratique 3 à 10 s). Les quotas existent justement à cause de ce coût (`quotas.js:6-8`). |
| **Voix : Claude Haiku** | Chaque commande transcrite (`llmParser.ts:94` → `parse.js:64`) | idem, plafond 200/jour | Prompt système en cache (`voiceParse.js:406`), `max_tokens` 2048. Tokens journalisés à chaque appel : vérifier le coût réel dans la console Anthropic. |
| **Voix : temps CF** | `transcribeAudio` 512 MiB, sondage AssemblyAI toutes les 1 s (`transcribe.js:177`) | Par commande | Plus le **`minInstances: 1`**, coût fixe ≈ 5 €/mois selon le commentaire du code (`transcribe.js:21-24`). |
| **Listeners Firestore** | Ouverture de l'app et changement d'enfant | Continu | Par enfant : likes (≤ 500), commentaires (≤ 500), jalons récents (≤ 100), événements du jour, Moments, plus les docs user, prefs, abonnement (×2), enfants, accès, invitations, demandes de suppression et photos masquées. **Une reconnexion après plus de 30 min hors ligne relit tout** : jusqu'à environ 1 000 lectures par ouverture pour une famille active avec beaucoup de photos commentées. |
| **Callable par écriture** | `validateAndCreateEvent` / `Update` / `deleteEventCascade` | Chaque saisie (10 à 30/jour/famille) | Invocation et CPU, plus les lectures de validation. Faible en unitaire, mais c'est le premier volume d'invocations. |
| **Rappels serveur** | `checkAndSendReminders` | 48 fois/jour | Pour chaque utilisateur avec rappels : tokens, accès, doc enfant, dernier événement par catégorie, historique anti-spam. Linéaire en nombre d'utilisateurs opt-in, que l'app soit ouverte ou non. **Le premier coût récurrent par utilisateur inactif.** |
| **Photos (Storage)** | Upload d'un jalon (1 600 px JPEG, ~300–600 Ko) et miniature 400 px | À l'usage | Stockage cumulatif et sans limite, egress à chaque affichage de galerie, CF miniature à 512 MiB. Le **miroir US→UE** double temporairement le stockage et ajoute de l'egress inter-régions. |
| **Stats** | Lecture de plages serveur (`stats.tsx:398`) | À l'ouverture | Proportionnel à l'historique affiché. |
| **Récap hebdo** | Lundi | 1/semaine/utilisateur opt-in | Lectures accès, enfant, événements de la semaine et historique, plus 1 e-mail Resend par enfant. |
| **Resend (transactionnel)** | Suppression, modération | Rare | Négligeable. |
| **Jobs quotidiens** | Purges, nettoyages, réconciliation | 5 par jour | Scans de collections : coût fixe, faible à petite échelle. |
| **RevenueCat** | — | — | Commission sur le revenu au-delà du seuil gratuit : ce n'est pas un coût par utilisateur actif. |

#### 5.2 Les 10 fonctionnalités les plus coûteuses par utilisateur actif (estimation sur le code)

| # | Fonctionnalité | Preuve |
|---|---|---|
| 1 | Saisie vocale (AssemblyAI + Claude + CF 512 MiB en sondage + instance chaude) | `transcribe.js:15-25,150-185`, `parse.js:64-110`, quotas dédiés |
| 2 | Temps réel Moments/Galerie (listeners likes et commentaires à 500 docs, jalons) | `socialService.ts:607-655`, `eventsRepository.ts:100-106`, `MomentsNotificationContext.tsx:218` |
| 3 | Photos de jalons (stockage cumulatif, egress, miniatures, miroir US) | `utils/photoResize.ts:11`, `thumbnails.js:80`, `media/photos.js:17` |
| 4 | Rappels push serveur (48 passes/jour, plusieurs lectures par utilisateur et par enfant) | `notifications/reminders.js:32-140` |
| 5 | Saisie d'événements via callable (1 invocation par écriture) | `events/callables.js:15,117` |
| 6 | Accueil temps réel (événements du jour et cache hebdo, rafraîchissement au premier plan) | `home.tsx:578,1261`, `useForegroundServerRefresh.ts` |
| 7 | Statistiques (relecture des plages historiques) | `stats.tsx:398` |
| 8 | Récap hebdomadaire (lectures + Resend) | `recap.js:58-240` |
| 9 | Journal / croissance / soins (fenêtres paginées et rafraîchissements) | `hooks/eventList/useEventWindow.ts` |
| 10 | Export JSON/CSV complet (lecture de tout l'historique) | `exportCollector.ts:123`, `exportService.ts:125` |

---

### 6. Les 10 fonctionnalités les plus utiles aux parents (estimation sur le code)

Critères : place dans la navigation (onglet ou accueil), centralité dans le graphe, durcissement investi, fréquence d'usage implicite.

| # | Fonctionnalité | Preuve |
|---|---|---|
| 1 | Saisie rapide repas / couches / sommeil depuis l'accueil et le FAB | `HomeDashboard()` est le god node n°9 (51 liens) ; FAB et feuilles globales |
| 2 | Partage temps réel entre co-parents et proches (rôles) | Communautés `functions/src/sharing` et `childSharingService` ; rendu gratuit exprès (décision du 2026-11-11) |
| 3 | Minuteurs en cours (sommeil, promenade) synchronisés entre aidants | `useOngoingClock`, `SleepWidget`, `PromenadeWidget`, `docs/PLAN_PROMENADE_SYNC_MULTIUSER.md` |
| 4 | Journal chronologique (« quand a-t-il mangé pour la dernière fois ? ») | Onglet « Journal », 29 références de route `/baby/chrono` |
| 5 | Santé : température avec alerte fièvre selon l'âge, médicaments, symptômes | `utils/temperatureAlert.ts`, alertes non masquables dans `insightEngine.ts:391-441` |
| 6 | Courbes de croissance OMS | Onglet « Croissance » visible ; rendu gratuit (Q7) |
| 7 | Statistiques alimentation / sommeil / tire-lait | Onglet Stats pour les Proches, entrée dans Plus |
| 8 | Saisie vocale mains libres (bébé dans les bras) | Pipeline le plus durci du repo (red-team, idempotence, remboursement) |
| 9 | Rappels et alertes de dépassement de délai | `ReminderWarningWatcher`, réglages des seuils et heures calmes |
| 10 | Souvenirs : jalons, photos, humeur, galerie, likes et commentaires familiaux | Onglet Moments visible, avec badge de nouveautés |

---

### 7. Lecture produit : ce qui peut être Premium, ce qui doit rester gratuit

#### Doit rester gratuit (boucle cœur, sécurité, légal)
- Saisie de tous les types d'événements, accueil, journal, minuteurs.
- Partage et rôles (chaque proche invité est un nouvel utilisateur : c'est l'acquisition).
- Alertes santé (fièvre) : question éthique et risque d'image.
- Courbes OMS et stats de base (décision Q7 déjà prise).
- Export JSON/CSV (portabilité RGPD art. 20), suppression, consentement.
- File hors ligne, rappels de base, insights déterministes de base.
- Un petit quota voix (3/jour) pour faire découvrir la fonctionnalité.

#### Candidats crédibles pour Premium (utiles, récurrents, défendables)
| Candidat | Pourquoi | Effort | Coût de service |
|---|---|---|---|
| **Rapport pédiatre PDF** (période, OMS, santé, vaccins, notes) | Besoin à chaque visite (récurrent), forte valeur perçue, les données existent déjà | Moyen (extension du PDF de `stats.tsx`) | Nul (généré dans l'app) |
| **Voix 50/jour** (existe déjà) | Coût réel, donc plafond justifié | Fait | Élevé, mais couvert par le prix |
| **Photos / souvenirs étendus** (quota gratuit, par ex. N photos par mois, illimité en Premium ; album ou capsule exportable) | Aligne le prix sur le premier coût cumulatif (Storage) ; forte valeur émotionnelle | Moyen | Storage |
| **Notifications croisées entre aidants** (« Papa a donné le biberon à 14 h ») | Valeur quotidienne pour les familles partagées ; ex-cible Famille | Moyen (trigger Firestore + push) | Push et invocations par événement |
| **Insights avancés / tendances hebdo et prévisions** (prochain repas ou dodo), éventuellement avec un résumé IA plus tard | Différenciant, récurrent ; le moteur local existe déjà | Faible en déterministe, élevé en IA (coût Claude, avis de confidentialité) | Nul en local, variable en IA |
| **Récap hebdo enrichi** (PDF ou e-mail avec graphiques, plusieurs enfants) | Rétention ; aujourd'hui gratuit et caché | Faible | Resend |
| **Widgets iOS/Android** | Saisie en 1 tap, forte valeur perçue | Élevé (natif) | Nul |
| Historique au-delà de N jours | Classique, mais à manier avec prudence sur des données de santé (garder les courbes complètes) | Faible | Aucun gain de coût |

---

### 8. Annexe : exports Cloud Functions (46)

| Domaine | Fonction | Type | Fichier:ligne |
|---|---|---|---|
| sharing | `createShareCode`, `setMemberRole` | callable | `functions/src/sharing/roles.js:12-13` |
| sharing | `redeemShareCodeCF` / `cleanupExpiredShareCodes` | callable / 24 h | `sharing/shareCodes.js:62,10` |
| sharing | `createShareInvitation`, `acceptInvitationCF` | callable | `sharing/invitations.js:10,129` |
| events | `validateAndCreateEvent`, `validateAndUpdateEvent`, `deleteEventCascade` | callable | `events/callables.js:15,117,232` |
| voice | `transcribeAudio` (minInstances 1) | callable | `voice/transcribe.js:15` |
| voice | `parseVoiceCommand` | callable | `voice/parse.js:64` |
| voice | `retryAssemblyAIDeletes` | 60 min | `voice/assemblyai.js:76` |
| billing | `getUsageQuotaStatus`, `consumeUsageQuota` | callable | `billing/usage.js:9,46` |
| billing | `revenueCatWebhook` / `cleanupExpiredSubscriptions` | HTTP / 24 h | `billing/revenuecat.js:236,24` |
| billing | `ensureReferralCode`, `validateReferralCode` (pas d'appelant client) | callable | `billing/referral.js:31,77` |
| deletion | `recordHealthConsent`, `withdrawHealthConsent` | callable | `deletion/consent.js:22,78` |
| deletion | `registerAppleRevocation` | callable | `deletion/apple.js:20` |
| deletion | `deleteUserAccount` (admin), `requestAccountDeletion`, `cancelAccountDeletion`, `sendDeletionRequestEmail` / `processScheduledDeletions` | callable / 24 h | `deletion/account.js:29,185,247,272,315` |
| deletion | `createDeletionRequest`, `voteDeletionRequest`, `transferAndLeave`, `getOwnershipBlockers`, `cancelChildDeletion` / `purgeDeletedChildren` | callable / 24 h | `deletion/child.js:15,118,196,294,339,456` |
| notifications | `checkAndSendReminders` | 30 min | `notifications/reminders.js:32` |
| notifications | `sendWeeklyRecap` / `unsubscribeRecap` | lundi 8 h / HTTP | `notifications/recap.js:58,282` |
| moderation | `onReportCreated`, `handleReportCreated`, `submitContentReportCF`, `resolveReport` | trigger Firestore / callable | `moderation/reports.js:215,251,353` |
| admin | `setAdminClaim` / `reconcileAccessIndexNightly` | callable / 3 h 15 | `admin/claims.js:38`, `admin/maintenance.js:16` |
| media | `generatePhotoThumbnail`, `deletePhotoThumbnail` | Storage (UE) | `functions/thumbnails.js:80,85` |
| media | `mirrorLegacyPhotoUpload`, `mirrorLegacyPhotoDelete` | Storage (US) | `media/photos.js:17,31` |
| shared | `photoRefToPath` (exporté, helper) | — | `shared/photos.js` |

## Summary

**Verdict, calculé par le script : pas encore rentable**, mais en net progrès.
- Marge par abonné : 1,53 € par mois (70 %), contre 1,74 € et 66 % au premier tour ; le prix baisse, la marge en pourcentage monte.
- Année 1 : perte d'environ 812 €, contre environ 1 700 € au premier tour.
- Panel simulé : 1 acheteur sur 8 (12 %), contre 0 sur 8 ; la barre est à 25 %.

**Stratégie retenue (architecture A) :** « Premium — prêt pour chaque examen ».
- Le gratuit reste généreux : tout le suivi, enfants et partage illimités, courbes OMS, calendrier des examens, 1 rapport pédiatre, 3 commandes vocales par jour.
- Premium : rapports illimités, kit d'examen, prédictions de tétée et de sieste (vendues seulement si elles sont justes au moins 7 fois sur 10), voix jusqu'à 30 par jour, PDF illimités.
- Prix : 3,49 € par mois, 24,99 € par an avec 14 jours d'essai, et une offre Fondateurs à vie à 49,99 € pendant une durée limitée.
- L'offre Famille (architecture C) ne viendra qu'après 3 mois de données ; l'architecture B est abandonnée.

**Ce qui conditionne la rentabilité :**
1. Ramener le coût d'un utilisateur gratuit de 0,12 € à 0,04 € par mois, en le mesurant d'abord. Sans ça, aucun scénario n'atteint l'équilibre.
2. Environ 5 % des inscrits qui paient.
3. Environ 200 inscrits par mois.

Avec ces trois conditions, l'équilibre arrive au mois 13, frais de la SASU compris.

**Conseil d'administration :** 3 « financer sous conditions », 5,8 sur 10. Il finance un test de ces trois hypothèses, pas encore l'entreprise.

**Calendrier :** lancement discret le 7/1/2027, lancement public le 2/2/2027 (repli au 16/2). Points de décision au 6e et au 12e mois, avec des seuils écrits à l'avance.

**À faire cette semaine :**
- Mesurer le coût réel d'un utilisateur gratuit (export de la facturation GCP).
- Recruter les testeurs via le Google Group.
- Envoyer le sondage de prix.

*Le panel est fait de parents simulés et les chiffres sont des projections. Ceci n'est pas un conseil financier, juridique ou fiscal. Les montants sont en euros, même là où le script affiche « $ ».*

## What the board said

> Méthode : skill `founder-board` (lentilles Offers, Monopoly et Product, d'après `lenses.md`). Les lentilles résument des **cadres publiés** (*$100M Offers*, *Zero to One*, la biographie de Steve Jobs par Isaacson). Les membres du conseil ne sont pas ces personnes et ne parlent pas en leur nom.
> Comme au 1ᵉʳ tour, les trois lentilles ont été appliquées **l'une après l'autre par un seul agent**, pas par trois sous-agents. Elles sont donc un peu moins indépendantes que prévu par la skill.
> Entrées : `CONTEXT.md`, `FEATURE_MAP.md`, `v2-offers.md`, `v2-panel-cfo.md`, `v2-gtm.md`, et le verdict du 1ᵉʳ tour (`board-competitors.md` : 3 × FUND IF, 5,0/10).
> Le dépôt n'a pas été modifié. Le panel cité est **simulé** (8 personas) : ce n'est jamais une preuve d'achat. Les conversions et les coûts sont des **estimations**. Rien ici n'est un avis juridique, fiscal ou financier.

---

### 0. La décision soumise au conseil

> **Lancer avec l'architecture A**, « Premium — prêt pour chaque examen » : 3,49 €/mois, 24,99 €/an, essai de 14 jours, achat à vie fondateurs à 49,99 € jusqu'au 4/4/2027.
> **Après le socle commun** : coût de l'utilisateur gratuit ramené à 0,04 € ou moins, nettoyage avant vente.
> **Soft launch le 7/1/2027, lancement public le 2/2/2027.**
> **Niveau Famille (C)** seulement après 3 mois de données. **B écarté.**

#### Ce qui a changé depuis le 1ᵉʳ tour

| Condition du 1ᵉʳ tour | État au 12/11 |
|---|---|
| C1. Premium recentré sur un résultat (« prêt pour chaque examen ») | **Fait sur le papier** : rapport complet, kit examen, prédictions, calendrier gratuit |
| C2. Rapport pédiatre livré avant le lancement | Planifié (S4, ≈ 5 j), pas encore construit |
| C3. Mesurer la voix, ne jamais bloquer une saisie de nuit | Règle écrite (contrainte n° 3) ; mesure réelle pas encore faite |
| C4. Fiabiliser la voix et la synchronisation | Pas traité explicitement dans la v2 |
| C5. Niche en une phrase | **Fait** : « Notez à deux, arrivez prêts. » |
| C6. Plan des 100 premiers clients avec un coût | **Fait** (5 canaux à 0 €, cibles par semaine) ; coût par client inconnu tant que rien n'est mesuré |
| C7. Première preuve (20 avis, une recommandation de soignant) | Pas encore ; démarche sages-femmes prévue à partir du 25/1 |
| C8. Mon espace santé / carnet numérique | **Absent de la v2** |
| C9. Parcours des 5 premières minutes | Partiellement (onboarding allégé à 3 écrans) |
| C10. Médiateur, paiements, 12 testeurs | En cours ; tous à lancer cette semaine |

---

### 1. Mémo — lentille Offers

**Score : 6/10 (+1) | Vote : FUND IF**

#### Ce qui est fort
- **L'offre vend enfin un résultat, pas un quota.** L'équation de valeur progresse sur les quatre leviers (`v2-offers.md` §5.6) : résultat rêvé 5 → 8, probabilité 4 → 7, délai 6 → 8, effort 5 → 8. Les deux derniers chiffres sont crédibles (essai de 14 jours avec rappel J-2, résiliation en deux touches). Les deux premiers ne le seront qu'après le premier examen réel.
- **L'urgence est vraie.** Le calendrier des 20 examens obligatoires donne une échéance que le parent n'a pas choisie (« examen du 2ᵉ mois dans 5 jours »). L'Offre Fondateurs est datée et réellement retirée. Rien de faux.
- **La pile de garanties est honnête et peu coûteuse** : « Zéro piège », garantie de pérennité (export gratuit, préavis de 6 mois), garantie de résultat formulée sans promettre ce qu'Apple ne permet pas.
- **Le 1ᵉʳ rapport gratuit est un essai par l'usage** au seul moment qui compte. C'est le seul chemin vers l'achat que le panel décrit spontanément (3 personas en A, 0 en C).

#### Ce qui peut la tuer (les 3 risques, du plus dangereux au moins dangereux)
1. **« Le gratuit suffit » s'est renforcé.** 16 refus sur 21 dans le panel v2 donnent cette raison, et le rapport gratuit plus le calendrier gratuit l'ont **aggravée** (« même un rapport pédiatre offert », P004). L'offre empile désormais quatre couches de gratuité avant le paiement : semaine vocale découverte, 1 rapport complet, calendrier, essai de 14 jours. Chacune se défend ; ensemble, elles peuvent repousser le paiement après l'examen du 2ᵉ mois, quand la motivation retombe.
2. **Le prix est encore l'argument implicite.** 3,49 € se situe entre « cher » (≈ 2,50-2,99 €) et « trop cher » (≈ 4-5 €) pour 6 personas sur 8. Baisser de 3,99/29,99 à 3,49/24,99 coûte 26 % de valeur par payant (30,3 € → 23,8 €). Ce n'est rentable que si la conversion monte d'au moins 27 %. Rien ne le prouve : le même persona (Seth, P008) achète dans les trois architectures, quel que soit le prix.
3. **La probabilité perçue reste sans preuve.** Pas d'avis, pas de soignant, une « petite app française inconnue » (P002, P007, dans les trois cas). La garantie de 6 mois est lue comme « une promesse ». La preuve sociale n'arrivera qu'après le lancement, alors que la conversion se joue pendant l'essai.

#### Les questions que je poserais au fondateur
- Combien de parents auront eu **un examen réel pendant leur essai** de 14 jours ? Sinon, ils paient avant d'avoir vu la valeur, ou ne paient pas.
- Le 2ᵉ rapport est-il vraiment plus utile que le 1ᵉʳ, ou le parent garde-t-il le 1ᵉʳ PDF et le montre à chaque fois ?
- Si le sondage montre que 29,99 € ne fait pas baisser l'intention de plus de 21 %, accepterez-vous de remonter le prix ?

#### FUND IF : les conditions
- [ ] **O1.** Faire trancher 24,99 € contre 29,99 € (et 2,99 / 3,49 / 3,99 € au mois) par le sondage, avec la règle chiffrée du §6, pas par intuition.
- [ ] **O2.** Caler le paywall et l'essai sur le **calendrier des examens** : proposer l'essai quelques jours avant un examen (J-5), pas à l'installation, pour qu'il couvre un vrai rendez-vous.
- [ ] **O3.** Mesurer dès le soft launch « rapport gratuit utilisé → essai démarré » ; c'est le déclencheur sur lequel repose toute l'offre.
- [ ] **O4.** Obtenir une première preuve avant le lancement public : ≥ 5 avis libres des testeurs au 2/2 et une relecture nommée du kit par une sage-femme ou un pédiatre (relecture, pas recommandation).

---

### 2. Mémo — lentille Monopoly

**Score : 5/10 (+1) | Vote : FUND IF**

#### Ce qui est fort
- **Une petite niche est choisie et écrite** : les parents qui se relaient, en français, qui arrivent prêts à l'examen. Personne ne vend la préparation aux examens obligatoires français (`v2-offers.md` §2, point 6). C'est un vrai « petit marché qu'on peut dominer » : ≈ 660 000 naissances par an, renouvelé à 100 % tous les 2 ans.
- **La distribution existe sur le papier** et coûte 0 € : boucle de partage (le partage est la raison d'installer la plus citée), ASO, sages-femmes / PMI / RPE avec QR traçables, groupes de parents, vidéos. Chaque canal a une cible et un signal d'abandon. C'est un progrès net par rapport au « aucun canal » du 1ᵉʳ tour.
- **La discipline de coût protège la survie.** Refuser la pub payante tant qu'un inscrit vaut 0,36-0,68 € est la bonne décision (`v2-panel-cfo.md` §2.2).

#### Ce qui peut la tuer (les 3 risques)
1. **Le volume, pas l'offre.** Le CFO équilibre à M13 avec **200 inscrits par mois, +6 % par mois**. À 100 inscrits/mois, A s'équilibre à M22 ; à 50, jamais. À ≈ 500 actifs (40 inscrits/mois), il faudrait 15,8 % de payants. Or aucun des 5 canaux n'a encore produit une seule installation mesurée, et le plan v2-gtm §2.4 suppose 55 à 80 inscrits **par semaine** après le lancement, avec 6 à 7 h de distribution par semaine d'un fondateur qui code aussi. C'est l'hypothèse la plus fragile du dossier.
2. **Rien n'est encore difficile à copier.** Le rapport, le kit et les prédictions sont calculés sur l'appareil : c'est bon pour la marge, mais un concurrent francophone (Baby Daybook en premier) peut les refaire en un trimestre. Huckleberry a déjà des prédictions et une « saisie IA ». Les seuls actifs durables restent ceux du 1ᵉʳ tour : le verrou familial, la confiance soignants, la spécificité française. Aucun n'est encore construit.
3. **L'État n'apparaît plus dans le dossier.** Le 1ᵉʳ tour signalait le carnet de santé numérique dans Mon espace santé, prévu « d'ici fin 2026 » (examens, vaccins, repères). La v2 vend précisément la partie santé (examens, vaccins dans le rapport) et ne mentionne plus ce risque. Si le carnet public affiche les examens et les vaccins gratuitement en 2027, le cœur payant de A s'amincit.

#### Les questions que je poserais au fondateur
- D'où viennent concrètement les 200 inscrits du mois 1 après le lancement, et lequel des 5 canaux en apporte plus de la moitié ?
- Que fait SuiviBaby que le carnet de santé numérique ne fera pas ? (Réponse attendue : le quotidien partagé entre aidants, transformé en rapport.)
- Qu'est-ce qui empêche Baby Daybook de sortir « rapport d'examen français » en mars 2027 ?

#### FUND IF : les conditions
- [ ] **M1.** Mesurer chaque canal avec les liens `ref` dès le soft launch et **couper au bout de 4 semaines** ceux qui ne produisent rien (les signaux d'abandon de v2-gtm §2.2 deviennent des règles).
- [ ] **M2.** Avant le lancement public, une page d'une demi-page : état de Mon espace santé / carnet numérique, et position de SuiviBaby (« on prépare ce que le carnet ne contient pas : le quotidien des aidants »), avec un export compatible si un format public existe.
- [ ] **M3.** Construire un actif lent à copier pendant les 6 premiers mois : un réseau d'au moins 10 sages-femmes ou RPE qui déposent les flyers, suivi par `ref=sf-*`.
- [ ] **M4.** Revoir l'hypothèse de 200 inscrits/mois à la revue J+30 (4/3) avec les vrais chiffres, et recalculer le mois d'équilibre.

---

### 3. Mémo — lentille Product

**Score : 6,5/10 (+0,5) | Vote : FUND IF**

#### Ce qui est fort
- **La phrase existe** : « Notez à deux, arrivez prêts. » Elle tient en 28 caractères, couvre le gratuit (partage) et le payant (examen), et sépare bien les usages : accroche store, paywall, signature.
- **Le moment produit est clair** : la veille de l'examen, on ouvre « préparer la visite » et tout y est, saisi par les deux parents et la nounou. On peut travailler à rebours depuis ce moment.
- **Le soin des parties invisibles se confirme** : nettoyage des promesses fausses (sauvegarde factice, parrainage), correction de `PremiumContext`, mention santé permanente, essai avec rappel. Le fondateur retire ce qui ment avant de vendre.
- **La contrainte « on ne bloque jamais une saisie »** est écrite. Le risque de paywall punitif à 3 h du matin, soulevé au 1ᵉʳ tour, est traité.

#### Ce qui peut la tuer (les 3 risques)
1. **Premium contient encore quatre choses** : rapport, kit, prédictions, voix (et le widget plus tard). Les prédictions sont la pièce la plus chère (≈ 6 j), la plus risquée (« une fourchette ne m'apporte rien », « Huckleberry le fait déjà ») et la seule qui peut produire de mauvais avis si elle se trompe. Elles sont aussi sur le chemin critique du 18/12.
2. **Le plan dépasse la capacité d'une personne.** ≈ 30,5 jours de développement en ≈ 26 jours ouvrés avant les fêtes, avec relecture et test sur appareil de chaque PR par Yoss, plus l'administratif, les testeurs et le sondage. Le registre de risques le classe lui-même « probabilité élevée, gravité élevée ». Un plan qui se rattrape sur les fêtes produit des coins coupés exactement là où le client regarde (le PDF tendu au médecin).
3. **Les coutures de l'expérience payante** : droits testeurs servis par le serveur, RevenueCat, quota PDF passé côté serveur, achat à vie, restauration, rappel J-2, deux plateformes. C'est là que l'expérience casse (un payant qui voit le paywall, un testeur sans son Premium). Les leviers de coût 2 et 4 (8 à 10 j) sont repoussés **pendant** le soft launch, alors que c'est la période où il faut écouter et corriger.

#### Les questions que je poserais au fondateur
- Si vous deviez vendre Premium avec **seulement** le rapport et le kit, le vendriez-vous ? Sinon, les prédictions portent-elles vraiment l'offre ?
- À quoi ressemble le rapport PDF posé sur le bureau du pédiatre ? L'avez-vous montré à un pédiatre ?
- Que voit un testeur le 2/2 au matin s'il n'a pas reçu son Premium ?

#### FUND IF : les conditions
- [ ] **P1.** **Porte de qualité sur les prédictions au 18/12** : test rétrospectif sur les données des testeurs. La prochaine tétée réelle doit tomber dans la fourchette affichée au moins 7 fois sur 10 (seuil à valider), sinon elles sortent de la 1ʳᵉ version payante et ne sont **ni vendues ni affichées dans le paywall**.
- [ ] **P2.** Le rapport et le kit montrés à au moins un professionnel (sage-femme ou pédiatre) avant le soft launch, et relus avant le 22/1 (contenu santé, seuils de température, poids en rouge).
- [ ] **P3.** Gel du périmètre jusqu'à la revue M3 : pas de widget, pas de Famille, pas de nouvelle fonctionnalité payante. Seulement des corrections et les leviers de coût.
- [ ] **P4.** Un test de bout en bout de chaque couture avant le 7/1 : achat, restauration, remboursement, droit testeur, fin d'essai, sur iOS **et** Android.

---

### 4. Synthèse du président

#### Vote
**3 FUND IF, 0 PASS. Score moyen : 5,8/10** (Offers 6, Monopoly 5, Product 6,5), contre 5,0 au 1ᵉʳ tour.

Le conseil **approuve l'architecture A et le calendrier 7/1 → 2/2**, sous conditions. Il **confirme le rejet de B** (11,8 % d'acheteurs nécessaires, 2,4 fois A, aucun renouvellement). Il **approuve le report de C** à la revue M3, avec un critère d'entrée écrit (§7.3).

Ce n'est pas un « fund » franc : l'offre est meilleure, mais **aucun chiffre réel** (conversion, coût du gratuit, volume d'inscrits) n'existe encore. Le dossier repose sur trois hypothèses non mesurées : 0,04 € par gratuit, 5 % de conversion, 200 inscrits par mois. Le conseil finance le **test** de ces trois hypothèses, pas encore l'entreprise.

#### Les risques soulevés par plusieurs membres (en premier)
1. **« Le gratuit suffit »** (Offers, Product). La générosité du gratuit, enrichie par la v2, reste la première cause de non-achat. La réponse n'est pas de réduire le gratuit (contraire aux contraintes de Yoss), mais de placer l'essai au moment d'un examen et de mesurer le déclencheur « rapport gratuit utilisé ».
2. **Le volume d'inscrits** (Monopoly, CFO). Tout l'équilibre M13 dépend de 200 inscrits/mois. Aucun canal n'est encore mesuré. À 50 inscrits/mois, rien ne s'équilibre, quelle que soit l'offre.
3. **La capacité du fondateur** (Product, Monopoly). Développement, relecture, admin, terrain et vidéos pour une seule personne : c'est le risque n° 1 du calendrier et la source probable des coins coupés.
4. **Les prédictions** (Offers, Product). Demandées par le panel, mais jugées sans valeur sous forme de fourchette et comparées à Huckleberry. Elles coûtent 6 jours sur le chemin critique.
5. **La preuve** (Offers, Monopoly). Pas d'avis, pas de soignant au moment où la conversion se joue.

#### Les désaccords à conserver
- **Prédictions.** Offers veut les garder dans la pile (le panel les demande, Huckleberry les vend). Product veut les sortir de la 1ʳᵉ version pour protéger le chemin critique et la confiance. **Arbitrage du président** : porte de qualité le 18/12 (condition P1). Si elles passent, elles sont vendues ; sinon, Premium sort avec rapport, kit, voix et PDF, et elles arrivent plus tard **sans hausse de prix**. v2-gtm §4.1 craint de « changer l'offre pendant qu'on la mesure » : c'est vrai, mais vendre une prédiction fausse coûte plus cher qu'une mesure imparfaite.
- **Prix.** Offers pense que 3,49 € abandonne de la valeur (−26 % par payant) et veut tester 29,99 €/an. Monopoly n'y voit pas l'enjeu principal (le volume l'est). Product ne se prononce pas. **La règle chiffrée du §6 tranche.**
- **Mon espace santé.** Monopoly y voit un risque sur le cœur payant de A. Offers et Product y voient une validation du besoin. Le conseil demande une demi-page de veille (M2), pas un changement d'offre.
- **Socle de coûts avant ou après le soft launch.** Le plan repousse les leviers 2, 3, 4b/4c et 6 après le 7/1 (raisonnable sous 150 utilisateurs). Product craint qu'ils écrasent la phase d'écoute. Le conseil accepte le report **à condition** que le coût soit **mesuré** (levier 0) avant le 7/1 et que le lancement public soit bloqué tant que 0,04 € n'est pas atteint.

---

### 5. Les 5 conditions qui comptent le plus

Toutes les conditions des trois mémos restent à cocher, mais si Yoss ne devait en tenir que cinq :

1. **Le coût du gratuit mesuré, puis ramené à ≤ 0,04 €, avant toute acquisition publique.**
   Levier 0 (export de facturation, compteurs de lectures) en place **avant le 7/1** ; leviers 1, 2 et 4 livrés et coût **mesuré** ≤ 0,04 €/actif/mois (tolérance 0,05 €) au go/no-go du 1/2. Sinon, repli au 16/2. Raison : à 0,12 €, aucune architecture ne s'équilibre en 24 mois et chaque inscrit supplémentaire fait perdre de l'argent (`v2-panel-cfo.md` §2.5). Aucun choix de prix ne pèse autant.
2. **Rien ne se vend avant que tout ce qui ment ou casse ait disparu.**
   Avant la première vente du 7/1 : nettoyage P0 complet (sauvegarde factice, parrainage, `PremiumContext`, fuite `parseVoiceCommand`, textes stores, quota PDF côté serveur), médiateur signé, CGU/CGV publiées, promesse testeurs publiée en 6 points, **et** les règles de l'Offre Fondateurs écrites (dates de début et de fin, y compris ce qui est proposé pendant le soft launch ; v2-offers dit « du lancement public à J+60 », la décision dit « jusqu'au 4/4 » : il faut une seule version, affichée). Test de bout en bout de chaque couture payante sur les deux plateformes (P4).
3. **Un Premium qu'on tend à un médecin sans rougir.**
   Rapport et kit montrés à un professionnel avant le 7/1 et relus avant le 22/1 ; prédictions vendues seulement si elles passent la porte de qualité du 18/12 (P1). Le paywall ne promet que ce qui est livré.
4. **La mesure en place le jour 1, avec des seuils écrits à l'avance.**
   Analytics internes (activation, invitation acceptée, paywall vu, rapport gratuit utilisé, essai, achat, source `ref`) en production au soft launch. **Testeurs exclus des dénominateurs de conversion** (ils ont Premium offert). Les seuils du §7 sont figés aujourd'hui et ne bougent pas après coup.
5. **Le volume prouvé sans payer, et le périmètre gelé.**
   Pas de publicité payante avant une conversion réelle mesurée. Chaque canal est tracé et coupé s'il ne produit rien en 4 semaines (M1). Gel du périmètre jusqu'à M3 (P3) : pas de widget, pas de Famille. Le temps libéré va à la distribution (sages-femmes, groupes, boucle d'invitation).

#### Checklist complète (pour le reste du pack)
- [ ] O1 · prix tranché par le sondage avec la règle du §6 *(founder-pricing)*
- [ ] O2 · essai proposé avant un examen (J-5)
- [ ] O3 · mesure « rapport gratuit → essai »
- [ ] O4 · ≥ 5 avis au 2/2 et relecture nommée du kit
- [ ] M1 · canaux tracés et coupés à 4 semaines *(founder-marketing)*
- [ ] M2 · demi-page Mon espace santé avant le 2/2
- [ ] M3 · réseau de ≥ 10 sages-femmes / RPE à M6
- [ ] M4 · hypothèse de 200 inscrits/mois revue le 4/3 *(founder-cfo)*
- [ ] P1 · porte de qualité des prédictions le 18/12
- [ ] P2 · rapport et kit montrés à un pro avant le 7/1, relus avant le 22/1
- [ ] P3 · gel du périmètre jusqu'à M3
- [ ] P4 · test de bout en bout des coutures payantes iOS + Android
- [ ] Reports du 1ᵉʳ tour encore ouverts : C3 (voix réelle mesurée sur les testeurs), C4 (fiabilité voix et synchro), C7 (preuve), C8 (= M2), C10 (médiateur, paiements, 12 testeurs)

---

### 6. Le sondage de prix : les règles de décision que le conseil garde

Règles à **écrire avant la première réponse** (sondage en ligne le 16/11, clôture le 13/12, décision le 14/12).

**Conservées telles quelles (v2-offers §10) :**
1. **Monadique** : chaque répondant ne voit qu'une architecture. Van Westendorp **à unité imposée** (« par mois » pour A et C, « une fois » pour le Pack B).
2. **A est confirmé** si l'intention « probablement » + « certainement » dépasse **25 %** et si 24,99 €/an reste sous le point « trop cher » (PME).
3. **C passe devant A** seulement si son intention **par foyer** est au moins égale à celle de A **et** si 4,99 € reste sous le PME. Même dans ce cas, C ne remplace pas A au lancement (chantier plus long de 5 à 9 j) : le résultat avance seulement la revue Famille.
4. **B n'est retenu** que si plus de **40 %** déclarent acheter le Pack à 12,99 €. Le conseil garde la règle pour la forme ; elle n'a pas vocation à être atteinte.

**Ajoutées ou précisées par le conseil :**
5. **Seuil d'échantillon.** Une règle ne s'applique que si sa variante a **≥ 25 réponses complètes**. En dessous de 45 réponses au total, on garde A à 3,49 € / 24,99 € et le soft launch tranche (repli déjà prévu par v2-gtm).
6. **Règle chiffrée 24,99 € contre 29,99 €** (Gabor-Granger sur l'annuel). Le passage de 29,99 € à 24,99 € coûte 26 % de valeur par payant (23,8 / 30,3 = 0,785). On garde **24,99 €** seulement si l'intention d'achat à 24,99 € est **au moins 1,27 fois** celle à 29,99 €. Sinon, on lance à **29,99 €/an** (et le mensuel suit : 3,99 € si l'intention à 3,99 € dépasse 0,8 fois celle à 3,49 €).
7. **On ne descend jamais sous le prix décidé pendant la mesure.** Aucun changement de prix entre le 14/12 et la revue M3 (sauf erreur manifeste), pour que le soft launch et les 3 premiers mois mesurent une seule offre.
8. **Le panel simulé ne compte pas.** En cas de conflit, le sondage réel l'emporte sur le panel, et le comportement réel du soft launch l'emporte sur le sondage (les intentions déclarées surestiment l'achat).
9. **Lecture « qui paie ? ».** Si plus d'un tiers des répondants C répondent « on partagerait » ou « l'autre parent », c'est un signal de friction de paiement pour Famille, à noter pour la revue M3.

---

### 7. Critères de poursuite et d'arrêt

Convention : **M1 = février 2027** (premier mois après le lancement public du 2/2). M6 = revue du **lundi 2/8/2027**, M12 = revue du **mardi 1/2/2028**. Tous les taux de conversion s'entendent **testeurs exclus**.

#### 7.1 Revue de fin de soft launch — lundi 1/2/2027, 18 h (go / no-go)

**Attention de méthode.** Le soft launch commence le 7/1 : les premiers essais de 14 jours finissent le 21/1, et le « J30 » de la première cohorte tombe le **6/2, après la revue**. Avec 50 à 100 comptes, 3 % représente 1 à 3 personnes. Le 1/2, on lit donc des **comptes absolus et des indicateurs avancés** ; la conversion J30 est confirmée à la revue J+14 (16/2).

**GO au 2/2 si toutes ces lignes sont vertes :**

| Domaine | Seuil GO |
|---|---|
| Stabilité | Sans crash ≥ 99,5 % sur 14 jours ; aucun bug ouvert de perte ou de mélange de données |
| Paiement | Un achat réel, une restauration et un remboursement traités sur **chaque** plateforme ; webhook RevenueCat cohérent ; droits testeurs visibles |
| Coût | Coût du gratuit **mesuré** ≤ 0,04 €/actif/mois (tolérance 0,05 €) ; leviers 2 et 4 livrés |
| Activation | ≥ 60 % (enfant + ≥ 3 saisies le 1ᵉʳ jour) |
| Rétention J7 | ≥ 35 % |
| Partage | ≥ 40 % des familles avec une invitation acceptée sous 7 jours |
| Achat | Hors Yoss et hors testeurs : **≥ 3 essais démarrés et ≥ 1 conversion payante** |
| Déclencheur | Rapport gratuit / « préparer la visite » utilisé par ≥ 1 actif sur 2 parmi ceux qui ont eu un examen |
| Légal et santé | Contenu santé relu, médiateur affiché, page testeurs en ligne, Offre Fondateurs datée |

**Repli au 16/2 (NO-GO technique)** si une ligne Stabilité, Paiement, Coût ou Légal manque. Pas au-delà du 16/2 sans nouvelle décision écrite.

**Revoir l'offre avant de lancer (NO-GO produit)** si l'un de ces seuils est franchi :
- activation < 40 % ou rétention J7 < 20 % → le problème est le produit (saisie, onboarding), pas le prix ;
- invitations acceptées < 25 % → réparer la boucle de partage avant tout canal ;
- **0 essai démarré** sur ≥ 50 comptes non testeurs, ou rapport gratuit quasi jamais ouvert → le déclencheur de A ne fonctionne pas : revoir le contenu de Premium (pas le prix) avant de dépenser le « moment de lancement ».

**Confirmation au 16/2 (J+14)** : actifs en essai ou payants à J30 ≥ 3 % sur la cohorte du soft launch ; < 1 % déclenche la revue d'offre du 4/3.

#### 7.2 Revue M3 — lundi 3/5/2027 (décision Famille)

Après la fin de l'Offre Fondateurs (4/4), donc sur un mois de prix régulier.
- **Ouvrir le chantier Famille (C)** seulement si : ≥ 30 payants actifs au total (en dessous, la comparaison n'a pas de sens) **et** les comptes appartenant à une famille avec ≥ 2 adultes actifs convertissent **au moins 1,5 fois** mieux que les comptes seuls **et** le coût mesuré d'un payant reste ≤ 0,35 €/mois.
- Sinon, pas de Famille ; le widget (V2) est l'alternative, à décider sur l'usage réel de la voix et la demande des payants.
- Mesurer aussi la part des achats à vie : si elle dépasse 25 % des payants fondateurs, vérifier que la voix ne rend pas ces comptes déficitaires à long terme (net 33,33 € contre ≈ 0,33 €/mois de service).

#### 7.3 Revue M6 — lundi 2/8/2027

Repères du CFO (A, gratuit à 0,04 €, SASU incluse) : 200 inscrits/mois et 5 % de conversion donnent l'équilibre à M13 ; 4 % → M19 ; 3 % → jamais ; 100 inscrits/mois → M22 ; 50 → jamais.

| Indicateur (moyenne M4-M6) | Poursuivre | Zone d'ajustement | Arrêter d'investir dans le payant |
|---|---|---|---|
| Inscrits par mois | ≥ 150 | 80 à 150 | < 80 |
| Inscrits → payants (cohortes à J45) | ≥ 4 % | 2 à 4 % | < 2 % |
| Payants actifs (hors testeurs) | ≥ 50 | 25 à 50 | < 25 |
| Coût mesuré du gratuit | ≤ 0,04 € | 0,04 à 0,06 € | > 0,06 € (et stopper toute acquisition jusqu'à correction) |
| Résultat mensuel lissé, **hors SASU** | ≥ 0 (infra et voix couvertes) | — | < 0 |

- **Poursuivre** : toutes les lignes en vert ou au plus une en zone d'ajustement.
- **Ajuster** (zone jaune) : on change d'abord la distribution si le volume manque, l'offre si la conversion manque (Famille si le critère M3 est rempli, contenu de Premium sinon) ; **jamais une baisse de prix réflexe**.
- **Arrêter d'investir dans le payant** si conversion < 2 % **et** inscrits < 80/mois : aucune combinaison de ces deux chiffres ne s'équilibre en 24 mois dans le modèle. Concrètement : plus de développement de fonctionnalités payantes, l'app passe en maintenance à coût minimal, et Yoss décide entre continuer en projet personnel (le payant ne couvre que l'infra) ou fermer selon la garantie de préavis de 6 mois.

#### 7.4 Revue M12 — mardi 1/2/2028

| Indicateur | Poursuivre et investir | Zone de décision | Arrêter |
|---|---|---|---|
| Payants actifs (hors testeurs) | ≥ 85 (frais fixes SASU couverts selon v2-gtm) | 40 à 85 | < 40 |
| Conversion inscrits → payants | ≥ 4,5 % | 3 à 4,5 % | < 3 % (A ne s'équilibre jamais avec la SASU à 3 %) |
| Résultat mensuel lissé, **SASU incluse** | ≥ −30 € et en hausse (trajectoire vers l'équilibre de M13) | −30 à −150 € | < −150 € et sans tendance |
| Renouvellement des 1ᵉʳˢ annuels (fondateurs, échéances février-avril 2028) | ≥ 35 % (hypothèse du modèle) | 20 à 35 % | < 20 % : la valeur vie s'effondre, revoir la thèse |

- **Poursuivre et investir** : on peut envisager un premier test de CAC payant, plafonné à 14 € par payant (`v2-panel-cfo.md` §2.2), mesuré sur un petit budget.
- **Zone de décision** : soit l'entreprise reste un projet couvrant son infra (seuil sans SASU : ≈ 2,5 % de conversion à 200 inscrits/mois), soit Yoss réduit les frais fixes de la structure. À trancher avec l'expert-comptable.
- **Arrêter** : arrêt du développement, puis fermeture ou cession, en appliquant la garantie de pérennité (préavis de 6 mois, export complet gratuit, droits à vie honorés jusqu'à la fin du service).

---

### 8. La version la plus forte que le conseil voit

Le conseil voit le même business qu'au 1ᵉʳ tour, mieux formulé : **le carnet partagé des parents qui se relaient, qui se transforme à chaque examen obligatoire en un dossier prêt pour le pédiatre.** Le gratuit fait venir des familles entières ; le payant se vend la veille d'un examen, pas à l'installation. Ce que le conseil ajoute au pitch de Yoss : la v2 traite l'offre comme le problème principal, alors que les chiffres disent que ce sont **le coût du gratuit et le volume d'inscrits**. Les trois architectures s'équilibrent à un mois d'écart ; 0,12 € contre 0,04 € et 50 contre 200 inscrits par mois font la différence entre « jamais » et « M13 ». La version la plus forte de SuiviBaby est donc aussi la plus étroite : un Premium court (rapport, kit, voix ; prédictions seulement si elles sont justes), un périmètre gelé, et le temps gagné investi dans un canal lent à copier, les sages-femmes et les relais petite enfance. Le conseil ne la juge pas encore finançable comme entreprise ; il juge finançable, et bien conçu, le test des trois hypothèses qui le décideront d'ici le 2/8/2027.

---

### 9. Limites

- Les trois lentilles ont été appliquées par un seul agent, l'une après l'autre.
- Le panel (8 personas, un seul acheteur, le même partout) ne départage rien sur l'achat.
- Les seuils proposés (porte de qualité à 7 sur 10, ratio 1,5 pour Famille, bornes M6/M12) sont des **choix du conseil** dérivés du modèle CFO, pas des repères de marché. Ils sont à valider par Yoss, puis à figer.
- Le risque Mon espace santé n'a pas été revérifié depuis le 1ᵉʳ tour (source « d'ici fin 2026 »).
- Prochaine étape suggérée : figer le §6 dans le formulaire Tally avant le 16/11, puis rejouer `/founder-cfo` le 4/3 avec les vrais inscrits.

## The offer

> Méthodes suivies : founder-competitors (rafraîchissement ciblé), founder-offer, founder-pricing.
> Base : `CONTEXT.md`, `FEATURE_MAP.md` (commit `eeed711`), et les sorties du premier tour (`board-competitors.md`, `offer-pricing.md`, `cfo.md` + `cfo_work/`, `consumer-brand-marketing.md`, `launch-ops.md`, `plan/summary.md`).
> Fichiers de travail : `docs/strategie/analyses/v2_work/model_v2.py` (modèle par cohorte, sorties recopiées ici).
> Le dépôt n'a pas été modifié.
>
> **À lire avec prudence.** Les prix acheteurs viennent d'un panel **simulé**. Les coûts par fonctionnalité sont des **estimations tirées du code**, car aucune facture détaillée ni télémétrie n'existe. Les taux de conversion sont des hypothèses. Rien de tout cela n'est un avis juridique, fiscal ou financier.

---

### 0. En bref

| | **A — « Prêt pour chaque examen »** | **B — « Pack Bébé » + abonnement Voix** | **C — « Famille »** |
|---|---|---|---|
| Idée | Un Premium par abonnement qui vend un résultat : le pédiatre préparé, et savoir quand viendra la prochaine tétée | Un **achat unique** pour tout ce qui ne nous coûte rien à servir, et un **petit abonnement** pour ce qui coûte chaque mois (voix, photos) | Un abonnement **par famille** : un parent paie, tous les aidants en profitent. Gratuit généreux, avec des limites calées sur nos coûts (voix, photos) |
| Payant | Rapport pédiatre complet, kit des examens, prédictions tétée et sieste, voix 30/jour, PDF illimités ; widget en V2 | Pack : rapport, kit, prédictions, PDF illimités, widget en V2. Voix+ : voix 50/jour et photos au-delà du quota | Tout A, plus : Premium partagé avec tous les aidants, voix 50/jour par Parent, photos illimitées, notifications croisées, récap enrichi |
| Prix TTC | **3,49 €/mois · 24,99 €/an** (essai 14 j) · à vie 49,99 € pendant l'Offre Fondateurs uniquement | **Pack 12,99 €** une fois (puis 14,99 € quand le widget sort) · Voix+ **1,99 €/mois ou 14,99 €/an** | **4,99 €/mois · 39,99 €/an** (essai 1 mois) ; fondateurs : 29,99 € la 1ʳᵉ année ; pas d'achat à vie |
| Effort avant de vendre | **≈ 16 j** (+ widget en V2 : 10 à 15 j) | ≈ 19 j | ≈ 21 à 25 j |
| Coût d'un payant / mois | ≈ 0,33 € | Pack : ≈ 0,05 € ; Voix+ : ≈ 0,33 € | ≈ 0,69 € (jusqu'à ≈ 2 € au plafond) |
| Conversion nécessaire* | **4,8 %** des inscrits | Pack **11,5 %** (avec 1,5 % de Voix+) | **3,6 %** des inscrits (≈ 7 % des familles) |
| Risque principal | Le widget gratuit chez Nara, et un rapport jugé « sympa » sans être indispensable | Un revenu unique trop faible face à des coûts qui durent. Il faut plus de 11 % d'acheteurs | Prix au-dessus du seuil « trop cher » du panel, chantier le plus long, quota photos mal vécu |

\* Seuil d'équilibre à l'état stable, avec 200 inscrits par mois, des frais fixes de 129 €/mois (SASU, Apple et infra fixe) et un utilisateur gratuit ramené à **0,04 €/mois**. À **0,12 €/mois** (coût actuel), les seuils doublent presque : A 9,0 %, B 23 %, C 6,7 %. Détail en §8.

**Classement : 1. A, 2. C, 3. B.**
- **A** est le plus court à construire. C'est l'architecture la plus fidèle au créneau (« arriver prêt à chaque examen ») et la seule dont le prix tombe dans la fourchette acceptable du panel.
- **C** a la meilleure économie par famille, mais il coûte plus de développement et son prix est plus risqué. C'est l'**évolution naturelle de A** après 3 mois de données.
- **B** répond au souhait du panel (« un petit achat unique »), mais il ne s'équilibre qu'à plus de 11 % d'acheteurs, un niveau qu'aucune donnée publique ne rend probable.

Dans les trois cas, deux préalables comptent plus que l'architecture : **ramener le gratuit à 0,04 €** (§4.3) et **faire le nettoyage avant lancement** (§4.4).

---

### 1. Ce qui reste fixe, ce qui change

**Contraintes non négociables (consigne de Yoss) :**
1. Aucune limite sur le nombre d'enfants.
2. Le partage entre aidants reste gratuit : c'est la boucle d'acquisition.
3. On ne bloque jamais la saisie, de nuit comme de jour : aucun quota sur les événements, et le manuel reste toujours possible quand la voix est épuisée.
4. On ne vend que ce qui existe déjà ou qui est construit **avant** d'être vendu.

**Ce que le premier tour a établi :**
- Le gratuit couvre l'essentiel.
- 0 acheteur sur 8 dans le panel simulé.
- Un utilisateur gratuit coûte environ 0,12 €/mois, donc il faut environ 7 % d'actifs payants pour équilibrer.
- Le panel demandait :
  - des avis visibles ;
  - une recommandation par une sage-femme ;
  - un petit achat unique (vers 10 €) ;
  - une fonction qui fait gagner du temps chaque jour ;
  - des prédictions de sieste et de tétée ;
  - une garantie d'export si l'app ferme.

**Ce qui change dans cette v2 :** tout le reste. Le prix, le contenu de Premium, le plafond vocal, l'existence de l'achat à vie, la forme de l'essai et le modèle (abonnement, achat unique ou famille).

---

### 2. Concurrents : ce qu'ils font payer, ce qui convertit (rafraîchissement)

Le premier tour (`board-competitors.md` §5) reste valable pour la carte et les plaintes. Cette passe ne regarde que **la frontière gratuit / payant** et **ce qui fait payer**.

| App | Gratuit | Payant | Prix relevé | Source |
|---|---|---|---|---|
| **Huckleberry** | Suivi sommeil et repas, rapports de base, **synchronisation multi-appareils** | **Plus** : prédictions SweetSpot, conseils et mini-plans, créateur de planning, **« AI logging », widgets, écran verrouillé, Apple Watch**, rapports enrichis. **Premium** : plans de sommeil personnalisés, chat IA « Berry » | Plus 5,74 $/mois facturé à l'année ; Premium 9,99 $/mois facturé à l'année ; « deux semaines » d'accès gratuit | [huckleberrycare.com/pricing](https://huckleberrycare.com/pricing) |
| **Baby Daybook** | Suivi ; « **les courbes de croissance sont désormais gratuites** » (notes de version) | « Premium » (contenu non détaillé sur la fiche) | Mensuel 1,99 à 7,99 € ; annuel 26,99 à 43,99 € ; à vie 43,99 € (affiché « -40 % ») | [App Store FR](https://apps.apple.com/fr/app/id1446283219) |
| **Glow Baby** | Suivi des repas, du sommeil, des couches et des jalons | « Comparative Insights » (« est-ce normal ? »), articles premium ; formule Famille dans certains pays | 59,99 $/an après 7 j d'essai ; à vie 79,99 $ (relevés contradictoires) | [App Store](https://apps.apple.com/app/id1077177456), synthèse via recherche web (fiabilité moyenne) |
| **Nara** | Suivi, **partage avec les proches, widgets**, sans pub | Rien de vérifiable (une source dit « pas d'achats intégrés », un agrégateur parle d'un abonnement) | — | [App Store US](https://apps.apple.com/us/app/id1444639029), [SlashGear](https://www.slashgear.com/1864409/best-baby-tracking-apps-parents-2025), [AppsHunter](https://appshunter.io/ios/topics/nara-baby) |
| **BabyTime** | Suivi, avec pub | **Achats uniques** : aidants supplémentaires 1,99 $, retrait de la pub 3,99 $ (US) | — | [App Store](https://apps.apple.com/app/id1052459780) |

**Repères de conversion (secteur, sources secondaires) :**
- Rapport RevenueCat 2026 : les essais de 17 à 32 jours convertissent à environ 42,5 %, contre 25,5 % pour les essais de 4 jours ou moins. En Santé & Forme, le revenu médian par installation est de 0,48 $ à J14 et de 0,66 $ à J60 ([RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps-2026/), résumé par [SaaStr](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/)).
- Édition 2025 : en Santé & Forme, la conversion essai → payant médiane est de 39,9 % (68,3 % pour le top 10 %), et elle est environ 2 fois plus forte sur iOS que sur Android.
- Ces chiffres n'ont pas été vérifiés dans le rapport complet (pages en aperçu seulement).

**Ce qu'on en retient pour la v2 :**
1. **Chez le leader, le partage et la synchro sont gratuits.** Notre partage gratuit est donc la norme, pas un avantage unique. Il reste notre meilleure accroche d'installation (panel B : 7/8).
2. **Ce qui se vend :**
   - la **prédiction** (sieste, planning) ;
   - la **saisie plus rapide** (widgets, montre, saisie IA) ;
   - les **rapports enrichis** ;
   - le **contenu expert** (plans, chat).

   C'est exactement le contenu de l'architecture A.
3. **La tendance est de libérer les bases** : Baby Daybook a rendu les courbes gratuites. Faire payer l'historique ou les courbes irait à contre-courant, et c'est déjà une plainte (`board-competitors.md` §5.4, thème 2).
4. **Le widget est gratuit chez Nara.** Un widget « simple » ne justifie pas un abonnement à lui seul : il doit apporter la prochaine estimation et l'ajout en un geste.
5. **Huckleberry a déjà une « saisie IA ».** Son support du français n'a pas été vérifié : c'est la menace la plus directe sur notre argument vocal.
6. **Personne ne vend la préparation aux examens obligatoires français.** Le créneau tient toujours.
7. Les essais longs convertissent mieux, et nos prédictions ont besoin de quelques jours de données : **un essai de 14 jours ou plus est cohérent**, ce que l'essai de 7 jours du 11/11 n'était pas.

---

### 3. Les obstacles de l'acheteur, et ce qui y répond

Repris de `offer-pricing.md` §1 (23 obstacles) et complétés par le panel v2. La colonne de droite indique où chaque architecture y répond.

| # | Obstacle (mots du parent) | Réponse | Où |
|---|---|---|---|
| 1 | « Le gratuit me suffit, Premium ne m'apporte rien » (9 citations, raison n° 1) | Vendre un **résultat** récurrent (examen préparé, prochaine tétée), pas un quota | A, C |
| 2 | « Je ne vais pas payer un abonnement pour un PDF » | Premier rapport d'examen **gratuit** ; achat unique en B | A, B, C |
| 3 | « Un petit prix unique, autour de 10 € » | Pack 12,99 € (B) ; à vie fondateurs 49,99 € (A) | B, A |
| 4 | « Des prédictions comme Huckleberry » | Estimation de la prochaine tétée et de la prochaine sieste, calculée **sur l'appareil** | A, B, C |
| 5 | « Si ça ferme, je perds tout » | **Garantie de pérennité** : export complet gratuit à tout moment et préavis de 6 mois avant toute fermeture | Commun |
| 6 | « L'autre parent n'installera pas » | Partage gratuit ; en C, le Premium est partagé : un seul paiement | Commun, C |
| 7 | « Petite boîte inconnue » | Avis visibles (marketing), recommandation sage-femme : le kit examen donne une **raison** de recommander | Commun |
| 8 | « Peur d'oublier de résilier » | Rappel 2 jours avant la fin de l'essai, résiliation en deux touches | Commun |
| 9 | « 3 voix par jour, c'est frustrant » | Semaine découverte à 30 ou 50 voix par jour, puis 3/jour ; saisie manuelle jamais bloquée | Commun |
| 10 | « Je n'en aurai plus besoin dans un an » | Mensuel résiliable, données gardées ; prix annuel bas (A) | A |
| 11 | « Et le 2ᵉ enfant ? » | Enfants illimités sur le même compte, dans toutes les architectures | Commun |
| 12 | « Le prix va monter » | Prix fondateur bloqué tant que l'abonnement reste actif | A, C |
| 13 | « Mes photos vont-elles être bloquées ? » | Jamais : un quota ne s'applique qu'aux **nouveaux** envois, l'existant reste visible et exportable | B, C |
| 14 | « Importer depuis Huckleberry » | Pas maintenant (coût 5/5, formats propriétaires) | — |

---

### 4. Le socle commun aux trois architectures

#### 4.1 Toujours gratuit, quelle que soit l'architecture

- Les 18 types d'événements, l'accueil, le bouton +, le journal, les minuteurs synchronisés, le mode hors ligne, le mode nuit.
- **Le partage illimité et les rôles** (Parent / Proche), pour des enfants illimités.
- Les alertes santé (fièvre selon l'âge), non masquables : une question d'éthique et d'image.
- Les courbes OMS et les statistiques de base. Le marché les a rendues gratuites.
- Les rappels de base, les insights déterministes, les conseils par âge, le récap hebdo (version simple).
- **Le calendrier des examens obligatoires** : les dates sont une information publique. Le faire payer serait mesquin, et c'est le meilleur déclencheur vers Premium (« Examen du 2ᵉ mois dans 5 jours »).
- **L'export CSV et JSON complet**, ainsi que la suppression du compte (RGPD art. 20 et 17). Il faut vérifier que l'export inclut **les photos** (ou un lien pour les télécharger) : ce sont des données fournies par l'utilisateur.
- 3 commandes vocales par jour après une **semaine découverte** (voix au niveau payant pendant 7 jours, sans carte).
- **1 rapport pédiatre complet gratuit** : la valeur se découvre au premier examen.

#### 4.2 Garanties communes (« Zéro piège »), toutes tenables

1. Essai avec **rappel 2 jours avant la fin** (notification locale et e-mail), 0,5 à 1 j de dev.
2. **Résiliation en deux touches** : lien direct vers la gestion d'abonnement du store.
3. **Vos données ne sont jamais prises en otage** : à la fin du payant, tout reste consultable, partagé et exportable.
4. **Garantie de pérennité** : export complet gratuit à tout moment, et engagement écrit dans les CGU à **prévenir 6 mois avant** toute fermeture du service. Coût : 0 € et une ligne de CGU. C'est la réponse à l'objection de pérennité.
5. Réponse humaine sous 48 h ouvrées.

À **ne pas** promettre : « satisfait ou remboursé » sans nuance. Sur iOS, seul Apple rembourse. La seule formulation honnête :
> « Écrivez-nous dans les 14 jours : sur Android nous remboursons, sur iPhone nous vous guidons vers Apple. »

#### 4.3 Rendre l'utilisateur gratuit moins cher : de 0,12 € vers 0,04 €/mois

Point de départ (CFO) : 0,088 € d'infra variable et 0,03 € de voix gratuite par utilisateur actif et par mois. **Aucune facture détaillée n'existe** : les gains ci-dessous sont des ordres de grandeur estimés à partir du code (`FEATURE_MAP.md` §5). Il faut d'abord **mesurer**.

| # | Levier | Pourquoi ça coûte aujourd'hui | Gain estimé €/mois/actif | Effort |
|---|---|---|---:|---:|
| 0 | **Mesurer** : export de la facturation GCP vers BigQuery, alertes de budget, compteurs de lectures par écran (Sentry ou logs) | Sans mesure, l'objectif est invérifiable | — | 1 j |
| 1 | **Supprimer le canal push serveur des rappels** et garder les notifications locales (corrige aussi le bug de double notification) | `checkAndSendReminders` tourne 48 fois par jour, avec plusieurs lectures par utilisateur opt-in, **même inactif** | 0,010 à 0,015 | 1 j |
| 2 | **Listeners Moments** : limiter likes et commentaires à 50 documents au lieu de 500, ne les attacher qu'à l'ouverture de l'onglet Moments, et relire en incrémental (`updatedAt > dernière synchro`) au lieu de tout relire après 30 min hors ligne | Jusqu'à environ 1 000 lectures par ouverture pour une famille active | 0,020 à 0,030 | 2 à 3 j |
| 3 | Limiter `useForegroundServerRefresh` à une relecture toutes les 15 min, et garder en cache les plages des stats | Relectures à chaque retour dans l'app | 0,005 à 0,010 | 1 j |
| 4 | **Voix gratuite moins chère** : (a) corriger la fuite de `parseVoiceCommand`, liée au quota ; (b) parseur local déterministe pour les phrases simples (« biberon 120 », « selle ») avant d'appeler Haiku ; (c) modèle de transcription moins cher, ou reconnaissance sur l'appareil, pour le gratuit (qualité à tester en chuchotant) | AssemblyAI `best` et Haiku à chaque commande | 0,015 à 0,025 (voix gratuite : 0,03 → 0,005-0,015) | 3 à 5 j |
| 5 | `minInstances: 1` → 0 sur `transcribeAudio`, ou réservé aux heures de pointe (démarrage à froid de quelques secondes à tester de nuit) | Environ 5 €/mois fixes, soit 0,01 € par utilisateur à 500 utilisateurs | 0,01 (à 500 utilisateurs) | 0,1 à 1 j |
| 6 | Photos : 1 280 px à qualité 70 (150 à 250 Ko au lieu de 300 à 600), miniatures partout dans les grilles, cache disque ; **fin du miroir US** (forcer une version minimale via `app_config`) | Stockage cumulatif, egress, double stockage US/UE | 0,005 à 0,010 | 1 à 2 j |
| | **Total** | | **0,065 à 0,10** → **≈ 0,03 à 0,05 €/mois** | **≈ 9 à 13 j** |

Conclusion : **0,04 €/mois est atteignable, sans garantie**. Les leviers 1, 2 et 4 font l'essentiel. Le levier 1 a un effet supplémentaire : un utilisateur **inactif** (bébé grandi, app plus ouverte) ne coûte presque plus rien, hors stockage. Le CFO a montré que c'est le levier le plus puissant (besoin de trésorerie de 2 385 € → 314 €). **Il vaut plus que n'importe quel choix de prix.**

#### 4.4 À retirer ou corriger avant de vendre (toutes architectures)

| Priorité | Élément | Problème | Action | Effort |
|---|---|---|---|---:|
| P0 | `app/settings/backup.tsx` | UI factice (date et taille codées en dur, succès simulés) | **Supprimer le fichier** ; la vraie sauvegarde, c'est l'export JSON | 0,1 j |
| P0 | `ReferralCard` + `validateReferralCode` | Promet « 1 mois Premium offert », mais personne ne peut saisir de code. Même accordé, ce Premium serait invisible dans l'app. Un mécanisme maison de déblocage est aussi risqué au regard d'Apple 3.1.1 | **Retirer la carte et désactiver la callable.** Pour un parrainage futur, passer par les codes d'offre Apple et les codes promo Google | 0,3 j |
| P0 | `PremiumContext` | Ignore le `tier` serveur quand RevenueCat répond. En secours Firestore, `isPremium` ne regarde pas `status` | Fusionner RevenueCat et serveur, et vérifier `status`. Indispensable pour les droits accordés côté serveur (testeurs, grandfathering, famille en C) | 1 à 1,5 j |
| P0 | Promesse aux testeurs « **Premium offert à vie au lancement** » (`RECRUTEMENT_ET_SONDAGE.md`) | Ambiguë selon l'architecture (en B, inclut-elle Voix+ ? en C, la famille ?) | **La définir par écrit avant d'envoyer le message** : « toutes les fonctions payantes, présentes et futures, pour votre compte ». L'accorder via un droit promotionnel RevenueCat « à vie ». Coût : environ 20 testeurs × 0,33 à 0,69 € = 7 à 14 €/mois | 0,5 j |
| P0 | `parseVoiceCommand` | Plafond de 200 appels/jour sans lien avec le quota voix : fuite de coût | Exiger un jeton émis par `transcribeAudio`, ou décompter le même quota | 0,5 à 1 j |
| P0 | Textes stores (`docs/STORE_SUBMISSION.md`) | Promettent « Historique illimité » et « Partage famille étendu » ; sous-titre « Suivi bébé intelligent » | Réécrire selon l'architecture retenue | 0,5 j |
| P0 | Types `PremiumFeature` sans effet (`unlimited_history`, `ai_insights`, `night_mode_premium`, `widgets`, `pediatre_report`) | Gating sans fonctionnalité | Supprimer ceux qui ne seront pas vendus, câbler les autres au moment de leur livraison | 0,3 j |
| P0 | Séries de jours consécutifs réservées au Premium (`HomeMilestoneCelebration`) | Restriction non annoncée dans le paywall | **Rendre gratuit** (coût nul) | 0,1 j |
| P0 | Quota PDF consommé côté client | Contournable | Le passer côté serveur si le rapport devient payant (A, B, C) | 0,5 j |
| P1 | `aiInsightsService` + `dataAnonymizationService` | Code mort (la CF n'existe pas) | Supprimer, et retirer toute mention d'« insights IA » de la politique de confidentialité et de l'onboarding | 0,3 j |
| P1 | Rappels en double canal | Double notification probable | Voir le levier 1 | (inclus) |
| P1 | Récap hebdo désactivé par défaut | La meilleure fonctionnalité de rétention est invisible | Proposer l'opt-in à l'onboarding, ou après 7 jours d'usage | 0,5 j |
| P1 | Seuils d'alerte température | Pas relus par un pédiatre | Relecture externe **avant** toute démarche auprès des sages-femmes | externe |
| P1 | Pas d'analytics produit | Impossible de mesurer la conversion | Événements agrégés, internes et sans tiers (activation J1/J7, paywall vu, essai, achat), cohérents avec la promesse « sans traqueur » | 1 à 2 j |
| P2 | `language.tsx`, `pending-requests.tsx` + `babyAttachmentService` (e-mail factice), `OfflineBanner`, modules jamais importés | Code orphelin | Supprimer | 0,5 j |
| P2 | `immunizations.tsx` (2 409 lignes, inaccessible) | Écran caché | Récupérer sa logique d'historique vaccinal pour le rapport pédiatre, puis supprimer l'écran | inclus dans le rapport |

**Total du nettoyage P0 et P1 : ≈ 6 à 8 j.**

---

### 5. Architecture A — « Prêt pour chaque examen »

**Promesse :** « Arrivez à chaque examen avec tout, et sachez quand viendra la prochaine tétée. »
**Nom :** Premium. Offre de lancement : « Offre Fondateurs ».
**Principe :** abonnement par compte. Tout ce qui est payant se calcule sur l'appareil, à coût nul, sauf la voix.

#### 5.1 Gratuit / payant

| Fonctionnalité | Gratuit | Premium | État | Effort |
|---|---|---|---|---:|
| Socle §4.1 (suivi, partage, OMS, stats, alertes, export) | ✓ | ✓ | existe | 0 |
| Calendrier des examens obligatoires et rappel J-3 | ✓ | ✓ | petit chantier | 1 j |
| **Rapport pédiatre complet** (période depuis le dernier examen, courbes OMS, repas, sommeil, couches, santé, vaccins, allergies, notes) | 1 gratuit | illimité | petit chantier (le PDF existe, partiel) | 4 à 6 j |
| **Kit examen** : « préparer la visite » (rapport de la période, questions notées au fil des jours, check-list de l'examen issue du carnet de santé) | — | ✓ | petit chantier | 2 à 3 j |
| **Prédictions** : prochaine tétée (intervalle médian des 3 derniers jours, selon l'heure) et prochaine sieste (fenêtres d'éveil selon l'âge et l'historique), en fourchette, désactivables | — | ✓ | petit chantier (le moteur d'insights local existe) | 5 à 7 j |
| Voix | 3/jour (semaine découverte à 30) | **30/jour** | existe (réglage) | 0,1 j |
| Exports PDF | 1 | illimités | existe | 0,5 j (quota serveur) |
| **Widget** (dernière tétée, couche ou sommeil, prochaine estimation, bouton d'ajout qui ouvre la feuille) | — | ✓ **V2, vendu seulement une fois livré** | gros chantier | 10 à 15 j |

Le plafond vocal passe de 50 à 30 par jour : l'usage réel estimé est d'environ 15, et le pire cas coûte deux fois moins.

**Effort avant de vendre : ≈ 16 j** (rapport 5, kit 2,5, prédictions 6, divers 2), plus le socle commun (§4.3 et §4.4 : ≈ 15 à 20 j). Le widget vient ensuite, sans hausse de prix pour les abonnés existants.

#### 5.2 Prix (founder-pricing)

| Formule | Prix TTC | Net encaissé (TVA 20 %, store 15 %) | Commentaire |
|---|---:|---:|---|
| Mensuel | **3,49 €** | 2,47 €/mois | Sous le seuil « trop cher » du panel simulé (PME ≈ 4,10 €) |
| Annuel (mis en avant) | **24,99 €** | 17,70 €/an (1,48 €/mois) | Équivaut à 7,2 mois de mensuel. Le panel situait le « cher » vers 30 à 35 € par an |
| À vie | **49,99 €**, Offre Fondateurs uniquement | 33,33 € (moyenne Apple 15 % et Google 25 %) | Sous Glow (69,99), proche de Baby Daybook (43,99). Retiré à la date annoncée |

**Arbitrage chiffré.** Baisser le prix n'est pas gratuit. À 3,99 € / 29,99 € / 79,99 €, la valeur nette par payant est de 30,3 € et le seuil de conversion de 3,8 %. À 3,49 € / 24,99 € / 49,99 €, ces chiffres passent à 23,8 € et 4,8 %. La baisse ne paie que si elle augmente la conversion d'au moins 26 %. Le panel simulé (IPP ≈ 2,54 €/mois, 3,99 € « pile sur le seuil cher ») le suggère sans le prouver. **À trancher par le sondage** : Gabor-Granger sur l'annuel à 24,99 € et à 29,99 €, et sur le mensuel à 2,99 €, 3,49 € et 3,99 €.

**Essai : 14 jours sur l'annuel.** Les prédictions ont besoin d'environ une semaine de données, et les essais longs convertissent mieux (RevenueCat 2026). L'essai est complété par **1 rapport complet gratuit** pour tous, qui sert d'essai par l'usage au premier examen.

#### 5.3 Garantie, offre de lancement

- **Garantie :** « Zéro piège » (§4.2), plus une garantie de résultat qu'on peut tenir :
  > « Si le rapport ne vous a pas servi à votre prochain examen, écrivez-nous. »

  Sur Android, on rembourse depuis la Console. Sur iPhone, on guide vers Apple. Coût modélisé (premier tour) : environ 16 € par an à 500 utilisateurs.
- **Offre Fondateurs** (du lancement public jusqu'à J+60, date affichée) : prix bloqué tant que l'abonnement reste actif ; achat à vie à 49,99 € proposé seulement pendant cette période ; ligne directe avec le fondateur. **Pas de prix barré.**

#### 5.4 Coût par utilisateur

- **Gratuit :** environ 0,04 € après les leviers (§4.3), 0,12 € avant.
- **Premium :** environ 0,33 €/mois. Détail : voix à 15 commandes/jour, environ 0,30 € après le parseur local (0,50 € avant), et environ 0,03 € d'infra en plus. Rapport, kit, prédictions et widget sont calculés sur l'appareil, donc gratuits pour nous. Pire cas (30 voix/jour tous les jours) : environ 0,60 à 1,00 €, toujours couvert par chaque formule.

#### 5.5 Contraintes légales et stores

- **Apple 3.1.2(a)** : un abonnement doit apporter une valeur continue. C'est le cas ici : rapport à chacun des examens de 0 à 2 ans, prédictions quotidiennes, voix.
- **3.1.2(c)** : prix, durée, renouvellement et essai affichés avant l'achat, plus un lien vers les CGU et la politique de confidentialité. Le paywall de la PR #70 est déjà conforme sur ce point.
- **Bouton « Restaurer les achats »** obligatoire, à cause de l'achat à vie.
- **Contenu santé :**
  - le kit reprend le calendrier du carnet de santé officiel, **sourcé et relu**, sans diagnostic ;
  - les prédictions sont présentées comme « une estimation à partir de vos saisies, pas un avis médical » ;
  - aucune promesse du type « améliore le sommeil » ;
  - une estimation de tétée ou de sieste n'a pas de finalité médicale, ce qui écarte a priori la qualification de dispositif médical. À vérifier si un jour une fonction « détecte » quelque chose.
- **Droit français :**
  - Offre Fondateurs datée et réellement retirée (L121-4, 7° : pas de fausse urgence) ;
  - pas de prix de référence fictif (L112-1-1) ;
  - « à vie » défini dans les CGU (durée de vie du service, avec la garantie d'export et de préavis) ;
  - médiateur désigné avant la première vente (L612-1).
- **Google :** commission de 25 % sur les achats uniques dans l'EEE (CONTEXT), d'où le net moyen de l'achat à vie.

#### 5.6 Équation de valeur (1 à 10)

| Levier | Offre du 11/11 | A | Ce qui la fait bouger |
|---|---:|---:|---|
| Résultat rêvé | 5 | 8 | « Prêt pour chaque examen » et « je sais quand il aura faim » |
| Probabilité perçue | 4 | 7 | Premier rapport gratuit (preuve), garantie de pérennité, semaine vocale |
| Délai | 6 | 8 | Prédictions dès la 2ᵉ semaine ; examen du 1ᵉʳ mois |
| Effort et sacrifice | 5 | 8 | Essai de 14 jours avec rappel J-2, prix plus bas, résiliation en deux touches |

#### 5.7 Risque principal et parade

**Risque :** le rapport reste « sympa » (« je montre l'app au médecin ») et les prédictions déçoivent, comme celles de Huckleberry, souvent jugées fausses.

**Parades :**
- afficher une **fourchette** et le volume de données utilisé ;
- mesurer l'usage réel du rapport (combien de « préparer la visite » par utilisateur) dès le soft launch ;
- passer à C si les familles partagées sont celles qui convertissent.

---

### 6. Architecture B — « Pack Bébé » (achat unique) + « Voix+ » (abonnement)

**Promesse :** « Payez une fois ce qui ne nous coûte rien, et au mois seulement ce qui nous coûte chaque mois. »

Le principe est très honnête : le prix suit le coût. Il répond directement au « petit prix unique » du panel.

#### 6.1 Gratuit / payant

| Fonctionnalité | Gratuit | Pack Bébé (une fois) | Voix+ (abonnement) | État | Effort |
|---|---|---|---|---|---:|
| Socle §4.1 | ✓ | ✓ | ✓ | existe | 0 |
| Calendrier des examens | ✓ | ✓ | — | petit chantier | 1 j |
| Rapport pédiatre complet | 1 gratuit | illimité | — | petit chantier | 4 à 6 j |
| Kit examen | — | ✓ | — | petit chantier | 2 à 3 j |
| Prédictions tétée et sieste | — | ✓ | — | petit chantier | 5 à 7 j |
| Exports PDF | 1 | illimités | — | existe | 0,5 j |
| Widget | — | ✓ en V2 (inclus pour les acheteurs, **non vendu avant livraison**) | — | gros chantier | 10 à 15 j |
| Voix | 3/jour (semaine découverte à 50) | 3/jour | **50/jour** | existe | 0,1 j |
| Photos de jalons | **20 nouvelles par mois et par enfant** (l'existant n'est jamais touché) | idem | **illimitées** | petit chantier | 2 à 3 j |
| Achat non consommable, restauration, paywall à deux produits | — | — | — | petit chantier | 1,5 à 2 j |

**Effort avant de vendre : ≈ 19 j**, plus le socle commun.

#### 6.2 Prix

| Produit | Prix TTC | Net | Commentaire |
|---|---:|---:|---|
| **Pack Bébé** | **12,99 €** au lancement, **14,99 €** quand le widget sort (vraie hausse, sans prix barré ; les acheteurs gardent tout) | 8,66 € (moyenne Apple 15 % et Google 25 %) ; 9,99 € à 14,99 € | Proche des « 10 € » du panel. Le panel E situe le « cher » vers 25 € en achat unique |
| Voix+ mensuel | **1,99 €** | 1,41 €/mois | Couvre environ 0,30 € de voix, avec de la marge |
| Voix+ annuel | **14,99 €** | 10,62 €/an | — |
| Essai | Pas d'essai sur le Pack, remplacé par le rapport gratuit et la démo des prédictions (aperçu flouté de 3 jours) ; 7 jours sur Voix+ annuel | — | — |

#### 6.3 Garantie, offre de lancement

- **Garantie :**
  > « Achat unique, pas d'abonnement caché. Le Pack reste à vous. »

  Plus la garantie de pérennité et le remboursement Android sous 14 jours.
- **Lancement :** le Pack est à 12,99 € jusqu'à la sortie du widget, puis passe à 14,99 €. C'est vrai et daté par un événement, mais **il ne faut pas promettre une date de widget**. On peut dire : « Le prix passera à 14,99 € à la sortie du widget ; si vous avez déjà le Pack, vous l'aurez sans rien payer. » Cet engagement n'est tenable que si le widget est réellement développé ; sinon, ne rien dire.

#### 6.4 Coût par utilisateur

- **Gratuit :** environ 0,04 € (le quota photos limite la croissance du stockage).
- **Acheteur du Pack :** environ 0,05 €/mois d'infra, sur environ 12,5 mois d'usage, soit environ 0,25 € face à 8,66 € nets. Très rentable par acheteur.
- **Voix+ :** environ 0,33 €/mois.
- Point faible : **un revenu unique face à un coût mensuel**. Sur 24 mois, un gros utilisateur vocal resté en gratuit ne rapporte rien.

#### 6.5 Contraintes légales et stores

- **Apple 3.1.1** : le Pack est un achat intégré non consommable, avec un bouton « Restaurer » obligatoire. Le partage familial Apple peut être activé sur le Pack, mais c'est **irréversible** et propre à iOS (asymétrie avec Android) : à décider en connaissance de cause.
- **3.1.2(a)** : Voix+ a une valeur continue (service serveur). Le quota photos se justifie comme un service de stockage.
- **Google** : 25 % de commission sur l'achat unique dans l'EEE, contre 15 % sur l'abonnement. C'est intégré au net.
- **Droit français :**
  - la hausse de 12,99 € à 14,99 € est légale si elle est annoncée sans fausse réduction ;
  - ne jamais afficher « 14,99 € → 12,99 € » avant que 14,99 € ait réellement été pratiqué (L112-1-1) ;
  - le quota photos doit être annoncé **avant** l'envoi d'une photo ;
  - au-delà du quota, rien n'est supprimé, et l'export (photos comprises) reste gratuit.

#### 6.6 Équation de valeur

Résultat 7 (le même contenu que A, sans prix bloqué), probabilité 7, délai 8, **effort 9** (un seul paiement, pas d'abonnement).

#### 6.7 Risque principal

**L'économie.** Avec 200 inscrits par mois, des frais fixes de 129 € et un gratuit à 0,04 € :
- à 12,99 €, il faut **11,5 % d'acheteurs du Pack** (avec 1,5 % de Voix+) pour s'équilibrer ;
- à 9,99 €, il en faut 15 % ;
- à 0,12 €/mois de coût gratuit, il en faut **23 %**.

Pour 8 % d'acheteurs, il faudrait environ **366 inscrits par mois**, presque le double de A ou C. Le panel E demandait un achat unique, mais « vers 10 € » n'est pas « 1 personne sur 9 achète ». Aucun repère public ne soutient un tel taux pour un achat unique en freemium.

**Parade :** ne garder de B que l'idée d'un petit achat unique, à tester (voir le classement).

---

### 7. Architecture C — « Famille » : un abonnement, toute la famille

**Promesse :** « Un abonnement pour toute la famille : les deux parents, la nounou, les grands-parents. »

C'est la seule architecture où le partage, notre boucle d'acquisition, **augmente** la valeur du payant au lieu de la diluer.

#### 7.1 Gratuit / payant

| Fonctionnalité | Gratuit | Famille | État | Effort |
|---|---|---|---|---:|
| Socle §4.1 | ✓ | ✓ | existe | 0 |
| **Premium partagé** : tout ce qui suit vaut pour **tous les aidants** des enfants dont le payeur est Propriétaire ou Parent | — | ✓ | chantier moyen (droit côté serveur rattaché à l'enfant ; correctif `PremiumContext` ; contrôles dans les CF) | 3 à 4 j |
| Calendrier des examens | ✓ | ✓ | petit chantier | 1 j |
| Rapport pédiatre et kit examen | 1 rapport | illimité, pour tous | petit chantier | 6 à 9 j |
| Prédictions tétée et sieste | — | ✓ | petit chantier | 5 à 7 j (option V1.1) |
| Voix | 3/jour par compte (semaine découverte) | **50/jour pour chaque Parent** | existe ; quota par utilisateur, droit par famille | 0,5 j |
| Photos | **30 nouvelles par mois et par enfant** | illimitées, avec un **album de l'année** (PDF prêt à imprimer) | quota : petit chantier ; album : petit chantier | 2 à 3 j + 3 à 5 j (album en V1.1) |
| **Notifications croisées** (« Papa a donné le biberon à 14 h »), regroupées, en respectant les heures calmes | — | ✓ | chantier moyen (trigger Firestore, push, préférences) | 3 à 4 j |
| Récap hebdo enrichi (graphiques, plusieurs enfants, à tous les aidants) | simple | enrichi | petit chantier | 2 à 3 j |
| Widget | — | V2 | gros chantier | 10 à 15 j |

**Effort avant de vendre :** ≈ 21 j sans album ni prédictions, ≈ 25 j avec les prédictions. Plus le socle commun. C'est l'architecture la plus longue.

#### 7.2 Prix

| Formule | Prix TTC | Net | Commentaire |
|---|---:|---:|---|
| Mensuel | **4,99 €** | 3,53 €/mois | **Au-dessus** du seuil « trop cher » du panel (≈ 4,10 €). À justifier par « par famille, soit environ 2 € par parent » |
| Annuel | **39,99 €** | 28,33 €/an | Sous Huckleberry Plus (environ 69 $), Glow (59,99 $), Baby Connect (59,99 €) |
| Fondateurs | **29,99 € la 1ʳᵉ année, puis 39,99 €/an** (offre de lancement des stores, affichée en toutes lettres) | 21,24 € la 1ʳᵉ année | Le prix régulier est réellement pratiqué ensuite : ce n'est pas un faux ancrage |
| À vie | **Aucun** | — | Les coûts sont récurrents (voix de plusieurs adultes, photos illimitées) : un achat à vie serait un passif. On le dit franchement |
| Essai | **1 mois sur l'annuel** | — | Le temps que l'autre parent et la nounou rejoignent l'app : c'est là que la valeur apparaît |

#### 7.3 Garantie, offre de lancement

- **Garantie :** « Zéro piège », plus :
  > « Si vous arrêtez, vos photos restent visibles et téléchargeables : seuls les nouveaux envois au-delà de 30 par mois attendent. »

  Plus la garantie de pérennité.
- **Lancement :** 1ʳᵉ année à 29,99 € pour les abonnements souscrits avant J+60. Prix bloqué ensuite à 39,99 € tant que l'abonnement reste actif.

#### 7.4 Coût par utilisateur

- **Gratuit :** environ 0,04 €.
- **Famille :** environ **0,69 €/mois**. Détail : voix de 2 Parents à environ 0,30 € chacun, photos environ 0,03 €, notifications croisées environ 0,01 €, infra environ 0,05 €.
- **Pire cas :** 2 Parents à 50 voix par jour, soit environ 2 €/mois. Le mensuel reste positif (3,53 € nets), mais l'annuel fondateur (1,77 €/mois) passe **sous le coût** pour ces familles-là. Il faut surveiller la part de familles au plafond.

#### 7.5 Contraintes légales et stores

- **Apple et Google :** un abonnement qui débloque un **espace partagé** pour d'autres comptes est une pratique courante (espaces de travail payés par un membre), mais il faut l'**écrire clairement** dans la fiche et le paywall :
  > « L'abonnement d'un parent débloque Famille pour tous les aidants des enfants qu'il suit. »
- **3.1.2(c) :** l'offre de lancement doit afficher le prix de la première année **et** le prix ensuite, avec la même lisibilité.
- **RGPD :**
  - les notifications croisées révèlent l'activité d'un aidant aux autres : il faut un **réglage par aidant** (activé ou non), et une mise à jour de la politique de confidentialité ;
  - les photos doivent être exportables gratuitement (art. 20) ;
  - le quota ne s'applique qu'aux nouveaux envois.
- **Droit français :** pas de « -25 % » (on présente un prix de première période, pas une réduction) ; médiateur ; CGU qui précisent ce qui se passe quand le payeur quitte l'enfant (la famille repasse en gratuit, rien n'est perdu).

#### 7.6 Équation de valeur

Résultat 8 (toute la famille alignée et le pédiatre préparé), probabilité 7, délai 7 (il faut que les autres rejoignent), effort 7 (prix plus élevé, mais un seul payeur).

#### 7.7 Risque principal

**Le prix et la durée du chantier.**
- 4,99 € dépasse le seuil du panel.
- Le quota photos touche les grands-parents, c'est-à-dire la boucle d'acquisition émotionnelle, et peut faire naître des avis négatifs.
- C'est 5 à 9 jours de plus que A avant de vendre.

L'économie, en revanche, est la meilleure des trois : **3,6 % des inscrits suffisent**, soit environ 7 % des familles si une famille compte environ 2 inscrits (estimation). À 4,5 % de conversion, l'équilibre arrive dès environ 136 inscrits par mois.

---

### 8. Comparaison chiffrée (modèle `v2_work/model_v2.py`)

**Hypothèses (CFO base, sauf mention) :**
- attrition des actifs 8 %/mois, soit 12,5 mois d'usage moyen ;
- renouvellement annuel 35 % ;
- churn mensuel 8 % ;
- TVA 20 %, commission 15 % sur les abonnements, 20 % en moyenne sur les achats uniques (Apple 15 %, Google 25 %) ;
- frais fixes 129 €/mois (110 € SASU, 8,25 € Apple, environ 11 € d'infra fixe sans `minInstances`) ;
- mix A : 40 % mensuel, 50 % annuel, 10 % à vie ; mix C : 30 % mensuel, 70 % annuel.

« Seuil » = part des inscrits qui doit payer pour équilibrer à l'état stable.

| | Valeur nette d'un payant | Seuil (gratuit 0,04 €) | Seuil (gratuit 0,12 €) | Inscrits/mois nécessaires à la conversion visée |
|---|---:|---:|---:|---:|
| A (3,49 / 24,99 / 49,99) | 23,8 € | **4,8 %** | 9,0 % | 187 à 5 % |
| A au prix du 11/11 (3,99 / 29,99 / 79,99), pour comparer | 30,3 € | 3,8 % | 7,1 % | 127 à 5 % |
| B (Pack 12,99 + Voix+ à 1,5 %) | 8,4 € par Pack | **11,5 %** de Packs | 23,4 % | 366 à 8 % |
| B (Pack 14,99) | 9,7 € par Pack | 9,9 % | 20,2 % | ≈ 200 à 10 % |
| C, prix régulier | 32,3 € | **3,6 %** | 6,7 % | 206 à 3,5 % ; 136 à 4,5 % |
| C, 1ʳᵉ année fondateurs | 27,3 € | 4,2 % | 7,9 % | — |

**Lecture honnête :**
1. **Aucune architecture n'est rentable à 500 utilisateurs actifs, une fois les frais SASU comptés** : à environ 40 inscrits par mois, il faudrait 12 à 16 % de payants. Les 110 €/mois de compta et de banque existent avec ou sans l'app. **L'objectif réaliste des 12 premiers mois est de couvrir l'infra et la voix, pas la SASU.** L'équilibre complet demande environ 190 à 210 inscrits par mois (A ou C).
2. Le **coût du gratuit pèse plus que le choix d'architecture** : passer de 0,12 € à 0,04 € divise les seuils par environ 1,9.
3. La baisse de prix de A coûte 26 % de valeur par payant : à justifier par le sondage, pas par intuition.

---

### 9. Prix : ce que disent les trois sources (founder-pricing)

1. **Acheteurs (simulés, 8 personas, outil `van_westendorp.py`) :**
   - Variante A, réponses plutôt mensuelles : fourchette acceptable **1,10 à 4,10 €**, IPP 2,54 €. Le panel est dans `panel-v2/A/answers`.
   - Variante E : unités mélangées (mensuel, annuel, achat unique), fourchette 3,05 à 25,10 €, **inexploitable** en l'état.
   - Données simulées : elles servent à choisir **quoi tester**, pas à prouver quoi que ce soit.
2. **Concurrents :** l'annuel payant se situe entre 26,99 € (Baby Daybook) et 118 à 130 € (Huckleberry Premium), avec une médiane de 55 à 60 €. Les offres à 60 € et plus vendent de la prédiction et du contenu expert.
3. **Besoin de l'entreprise :** §8.

**Recommandation :**
- architecture **A à 3,49 €/mois et 24,99 €/an**, essai de 14 jours, achat à vie à 49,99 € pour les fondateurs seulement ;
- échelle : Gratuit → Premium annuel (mis en avant) → À vie fondateurs ;
- après 3 mois, si les familles partagées sont celles qui convertissent, ajouter **« Famille » (C) à 39,99 €/an** en niveau supérieur. Cela fait un vrai bon / mieux / meilleur : Gratuit, Premium, Famille.

**Objections de prix à préparer** (panel simulé, à remplacer par de vrais verbatims) :
- « Je n'ai jamais payé un abonnement d'app » ;
- « Je ne vais pas payer pour un PDF avant le rendez-vous du 1ᵉʳ mois » ;
- « Une petite app française : sera-t-elle encore là dans un an ? »

---

### 10. Ce qu'il faut tester avec de vrais parents (avant le 5/1/2027)

1. **Sondage monadique :** chaque répondant ne voit **qu'une** des trois architectures (A, B ou C), décrite en 5 lignes avec son prix. Viser au moins 25 réponses par variante, en recrutant les testeurs Android et les groupes de parents (`RECRUTEMENT_ET_SONDAGE.md`). Mesurer :
   - l'intention d'achat (échelle de 1 à 5) ;
   - le Van Westendorp **avec une unité imposée** (« par mois » pour A et C, « une fois » pour le Pack) ;
   - la fonction qui compte le plus ;
   - la réponse à « qui paierait dans votre foyer ? ».
2. **Règles de décision écrites à l'avance :**
   - A est retenu si son intention « probablement » ou « certainement » dépasse 25 % et si 24,99 € reste sous le PME ;
   - C passe devant si son intention par famille est au moins égale à celle de A **et** si 4,99 € reste sous le PME ;
   - B n'est retenu que si plus de 40 % déclarent qu'ils achèteraient le Pack à 12,99 €.
3. **Soft launch iOS :** mesurer l'usage du rapport gratuit (combien de « préparer la visite » par utilisateur actif), le taux essai → payant et la part d'annuels. Seuil de poursuite : au moins 3 % des actifs à J30 en essai ou en payant.

---

### 11. Limites

- Coûts par fonctionnalité **estimés** à partir du code, faute de facture détaillée : le levier 0 (mesurer) passe avant le reste.
- Conversions **supposées** (4 à 5 % en A, 3,5 à 4,5 % en C, 6 à 10 % de Packs en B), cohérentes avec la fourchette freemium santé du CFO (2 à 5 %), mais non mesurées.
- Le panel est **simulé** ; l'étape « re-tester l'offre sur le panel » de founder-offer n'a pas été relancée. Le re-test se fera avec le sondage réel du §10.
- Chiffres de concurrents relevés le 12/11/2026, à revérifier avant publication. Glow et Nara : sources secondaires.
- Repères RevenueCat issus de résumés publics, pas du rapport complet.

**Sources :**
- [huckleberrycare.com/pricing](https://huckleberrycare.com/pricing)
- [Baby Daybook — App Store FR](https://apps.apple.com/fr/app/id1446283219)
- [Glow Baby — App Store](https://apps.apple.com/app/id1077177456)
- [Nara — App Store US](https://apps.apple.com/us/app/id1444639029)
- [SlashGear 2025](https://www.slashgear.com/1864409/best-baby-tracking-apps-parents-2025)
- [AppsHunter Nara](https://appshunter.io/ios/topics/nara-baby)
- [BabyTime — App Store](https://apps.apple.com/app/id1052459780)
- [RevenueCat SOSA 2026](https://www.revenuecat.com/state-of-subscription-apps-2026/)
- [SaaStr, synthèse RevenueCat](https://www.saastr.com/the-top-10-learnings-from-revenuecats-state-of-subscription-apps/)
- [Adapty 2026](https://adapty.io/state-of-in-app-subscriptions-2026)

## The numbers

> Skills suivies : **founder-consumer** (panel) et **founder-cfo** (économie unitaire).
> Entrée : `v2-offers.md` (A « Prêt pour chaque examen », B « Pack Bébé + Voix+ », C « Famille »).
> Le dépôt n'a pas été modifié.
>
> **Avertissement.** Les acheteurs sont des **personas simulés**, pas de vrais clients. Ils servent à faire remonter des objections, pas à prédire une conversion : un modèle de langage a tendance à être conciliant, donc un taux d'achat simulé est un **plafond**. Les coûts et les conversions du modèle sont des **estimations**. Ce n'est pas un avis financier, fiscal ou juridique : faites vérifier la structure (TVA, IS, rémunération du président) par l'expert-comptable.

Fichiers :
- Panel : `docs/strategie/analyses/v2_panel/` (pitchs `pitch_A.md`, `pitch_B.md`, `pitch_C.md`, `pitch_install_*.md` ; panels `buy_A`, `buy_B`, `buy_C`, `install_A`, `install_B`, `install_C`, chacun avec `results.md`, `answers/` et `briefs/`)
- CFO : `docs/strategie/analyses/v2_cfo/` (`model_v2_cfo.py`, `model_out.json`, `numbers_{A,B,C}_{aujourdhui,apres}.json`, sorties `ue_*.md` de `unit_economics.py`)

---

### 0. En bref

| | A — Prêt pour chaque examen | B — Pack 12,99 € + Voix+ | C — Famille |
|---|---:|---:|---:|
| **Achat (panel simulé, 8 personas)** | 1/8 | 1/8 | 1/8 |
| **Installation et usage pendant 1 semaine** | 6/8 | 6/8 | **4/8** |
| Achèteraient « plus tard, si le rapport gratuit a servi » | 3 | **3 ou 4** | 0 |
| Prix au-delà du seuil « ça devient cher » | 6/8 au-delà de 3,49 €/mois | 5/8 au-delà de 12,99 € | 5/8 placent leur refus à 4,99 €/mois ou en dessous |
| **Valeur vie d'un payant (après chantier coûts)** | 23,7 € | 8,5 € le Pack (+ 11,9 € par Voix+) | **32,3 €** |
| **Part des inscrits qui doit payer** (200 inscrits/mois, SASU incluse, gratuit à 0,04 €) | 4,9 % | 11,8 % de Packs | **3,6 %** |
| Mois d'équilibre (base, gratuit à 0,04 €), avec / sans SASU | M13 / M3 | M13 / M4 | M14 / M4 |
| Mois d'équilibre avec le **coût actuel** (0,12 €) | jamais en 24 mois | jamais | jamais |
| Effort avant de vendre (`v2-offers.md`) | ≈ 16 j | ≈ 19 j | ≈ 21 à 25 j |

**Lecture en trois points :**
1. **Le panel ne départage pas les architectures sur l'achat.** Le même acheteur dit oui dans les trois cas : Seth (P008), le profil « paie volontiers pour gagner du temps ». C'est une progression par rapport au 0/8 du premier tour, mais un seul persona ne prouve rien. Le panel départage en revanche l'**installation** : C perd deux installations (6 → 4). Il montre aussi un **chemin vers l'achat** que C n'a pas : « j'achète après que le rapport gratuit a servi chez le pédiatre ».
2. **Le CFO départage nettement B**, qui est dernier : il faut 2,4 fois plus d'acheteurs que pour A. **Entre A et C, l'écart est faible** : 4,9 % contre 3,6 % de conversion nécessaire, et un équilibre à un mois d'écart.
3. **Le chantier sur les coûts compte plus que le choix d'architecture.** À 0,12 € par utilisateur gratuit, aucune architecture ne s'équilibre en 24 mois. À 0,04 €, les trois s'équilibrent vers M13-M14.

**Verdict sur les preuves : A pour lancer, C comme niveau supérieur après 3 mois de données, B écarté** (détail en §3).

---

### 1. Panel acheteurs (founder-consumer)

#### 1.1 Méthode

- **Personas :** les 8 du premier tour, distribués à l'identique (même `customer.json`, n = 8, graine 2026 ; vérifié identique à `panel-v2/A/personas.json`). Il s'agit de parents français d'un enfant de 0 à 2 ans, répartis en 5 segments (mère primipare, père en horaires décalés, co-parent en garde alternée, nounou, parent très organisé) et 7 comportements d'achat.
- **Pitchs :** un par architecture, rédigé comme le diraient le paywall ou la fiche store, avec les prix et sans rien promettre qui ne soit pas construit (le widget n'est pas vendu). Ils sont dans `v2_panel/pitch_A.md`, `pitch_B.md` et `pitch_C.md`.
- **Deux questions, deux panels par architecture :**
  - « acheter » = souscrire l'offre payante ;
  - « installer » = installer et utiliser vraiment pendant une semaine (même pitch, seule la définition change).
- **Exécution :** 48 sous-agents, un brief par persona, réponses vérifiées et comptées par `python3 -I panel.py check/tally`. Aucune réponse n'a été écrite par le modérateur.

#### 1.2 Résultats

| | A | B | C |
|---|---:|---:|---:|
| Achat | **1/8 (12 %)** | **1/8 (12 %)** | **1/8 (12 %)** |
| Qui achète | Seth (P008) : annuel après l'essai de 14 j | Seth (P008) : le Pack, pas Voix+ | Seth (P008) : annuel fondateurs, essai d'un mois |
| Pourquoi | « Arriver chez le pédiatre avec tout prêt au lieu de remonter nos messages WhatsApp » | « Pour 12,99 € une seule fois j'ai l'estimation de la prochaine sieste et tétée » | « Si la notif "Papa a donné le biberon" m'évite les dix messages WhatsApp par jour avec la nounou » |
| Installation (1 semaine) | **6/8** | **6/8** | **4/8** |
| Refusent d'installer | Tomas (nounou), Ravi (épuisée) | Tomas, Ravi | Tomas, Ravi, **Isla (avis)**, **Dev (garde alternée)** |
| Motifs de refus d'achat | need 5, trust 1, price 1, habit 1 | need 6, trust 1, habit 1 | need 5, price 2, trust 1 |

Premier tour, pour comparer : 0/8 en achat et 6/8 en installation (`panel-v2/A`, `panel-install/A`).

#### 1.3 Pourquoi ils ne paient pas (citations simulées, pas des témoignages)

1. **« Le gratuit suffit »** : 16 refus sur 21. Le 1ᵉʳ rapport pédiatre gratuit et le calendrier des examens gratuit ont **renforcé** cette réponse : « même un rapport pédiatre offert » (Priya, P004, en A).
2. **« La prochaine tétée, je la devine »** : la prédiction ne convainc pas.
   > « La prochaine tétée, c'est mon bébé qui me la dit, et une fourchette ne m'apporte rien. » (P004, A)
   >
   > « Huckleberry fait déjà les prédictions… ici l'estimation n'est qu'une fourchette. » (P008, A, B et C)
3. **Confiance et pérennité** : « petite app française inconnue, sera-t-elle encore là ? ». Isla (P002) et Ravi (P007) le disent dans les trois cas. La garantie de préavis de 6 mois est perçue comme « une promesse ».
4. **Spécifique à C : qui paie ?**
   > « En garde alternée, qui paie ? Je ne vais pas sortir 40 € par an pour que l'autre parent en profite. » (Dev, P005)
   >
   > « Payer 40 € par an de ma poche pour l'enfant de quelqu'un d'autre. » (Tomas, nounou)

   Le partage « gratuit, la norme » vide aussi le cœur de l'offre : « le partage en direct est déjà gratuit, donc je paie surtout pour les notifs » (P008).
5. **Spécifique à B : le prix du Pack** se situe au-dessus du seuil « cher » pour 5 personas sur 8. Quinn (P003) ne l'achèterait pas au-delà de 12 €.

#### 1.4 Ce qui les ferait changer d'avis

- **Le rapport qui a fait ses preuves à un examen**, puis un achat. C'est le chemin le plus cité :
  - en **B** par Priya (P004), Dev (P005) et Elle (P006), pour le Pack : « si le pédiatre trouve le rapport utile, je prendrais le Pack à 12,99 € au prochain examen » ;
  - en **A** par Quinn (P003) et Dev (P005), qui prendraient l'achat à vie « s'il passait sous 20 € », et par Elle (P006) pour l'annuel ;
  - en **C**, personne : les seuls déclencheurs cités supposent de **réduire le gratuit**, ce qui est contraire aux contraintes de Yoss.
- **Des avis visibles** (note ≥ 4,5 avec des avis récents) et le bouche-à-oreille dans les groupes de mamans : Isla et Ravi, dans les trois cas.
- **Pour la nounou :** être invitée par les parents, ou recommandée par la PMI ou le RPE. Une offre « assistante maternelle » est demandée en C.
- **Pour Ravi (épuisée) :** noter en un geste depuis l'écran verrouillé, c'est-à-dire le widget.

#### 1.5 Prix déclarés (simulés, unités non imposées dans le brief, donc à prendre avec prudence)

- **A :** 6 personas sur 8 situent « ça devient cher » vers 2,50-2,99 €/mois et « trop cher » vers 4-5 €/mois. Le prix de 3,49 € se trouve entre les deux. Seuls Seth et Isla l'acceptent sans réserve.
- **B :** la médiane de « bonne affaire » pour le Pack est de 4,5 €, celle de « cher » de 9,5 € et celle de « trop cher » de 15 €. À 12,99 €, le Pack est dans la zone « cher mais possible ». À 14,99 € (après la sortie du widget), il atteint le seuil de refus de 4 personas sur 8.
- **C :** 4 personas placent le refus à 4,99 €/mois, exactement le prix demandé. Ceux qui ont raisonné à l'année placent le « trop cher » à 30 € (Dev), 60 € (Isla) et 80 € (Seth).

#### 1.6 Ce qu'il faut en retenir

- Le panel **ne prouve pas** qu'une architecture vend mieux qu'une autre : 1/8 partout, le même acheteur à chaque fois.
- Il donne **deux signaux exploitables** :
  - C fait **reculer l'installation**. Mettre l'abonnement dans le titre et parler de 40 €/an refroidit les profils « lit les avis » et « garde alternée ». Avec 8 personas, c'est un écart de 2 personnes : une tendance, pas une mesure ;
  - le déclencheur d'achat le plus crédible est **le rapport gratuit qui sert à un vrai examen**. Ce mécanisme est présent dans A et B, absent dans C.
- **Limite :** 8 personas, c'est un « quick » très réduit (la skill recommande 20 à 100). Il faut le confirmer par le sondage monadique réel de `v2-offers.md` §10.

---

### 2. CFO (founder-cfo)

#### 2.1 Hypothèses

Ce sont celles du CFO de base du 11/11 et de `v2-offers.md`. Toutes sont des estimations.

| Hypothèse | Valeur |
|---|---|
| Inscrits | 200 au mois 1, puis +6 %/mois (CFO base) ; la sensibilité fait varier ce point de départ |
| Attrition des actifs | 8 %/mois (environ 12,5 mois d'usage) ; churn mensuel 8 % ; renouvellement annuel 35 % |
| Conversion de base (par inscrit) | A 5 % ; B 8 % de Packs + 1,5 % de Voix+ ; C 3,5 % (hypothèses de `v2-offers.md`, non mesurées) |
| Mix | A : 40/50/10 (mensuel/annuel/à vie) pendant l'Offre Fondateurs (M1-M2), puis 45/55 ; C : 30/70 avec 1ʳᵉ année à 29,99 € en M1-M2 ; Voix+ : 50/50 |
| Net après TVA et store | A 2,47 €/mois · 17,70 €/an · 33,33 € à vie ; B Pack 8,66 € · Voix+ 1,41 €/mois · 10,62 €/an ; C 3,53 €/mois · 28,33 €/an (21,24 € la 1ʳᵉ année fondateurs) |
| **Cas « aujourd'hui »** | Gratuit 0,12 €/actif/mois ; surcoût d'un payant : A 0,53 €, Voix+ 0,53 €, Pack 0,01 €, C 1,09 € (voix à 0,50 € par parent, avant le parseur local) |
| **Cas « après chantier coûts »** | Gratuit 0,04 € ; surcoût d'un payant : A 0,33 €, Voix+ 0,33 €, Pack 0,01 €, C 0,69 € |
| Frais fixes | 19,25 €/mois (Apple 8,25 € et infra fixe 11 €), **+ 110 € de SASU** (compta et banque) dans les cas « avec SASU » |
| Démarrage | 150 € (médiateur, estimation) ; le temps de développement n'est pas compté en cash |
| CAC | 0 € (organique) ; le plafond de CAC est calculé à part |

Le modèle (`v2_cfo/model_v2_cfo.py`) prolonge `v2_work/model_v2.py`, avec une simulation mensuelle sur 24 mois **en trésorerie** : l'annuel et l'achat à vie sont encaissés d'avance. Le « mois d'équilibre » est le premier mois où le résultat **lissé** devient positif (annuel réparti sur 12 mois, achat à vie sur 24 mois, Pack sur 12,5 mois). Les seuils calculés recoupent ceux de `v2-offers.md` (A 4,9 contre 4,8 % ; B 11,8 contre 11,5 % ; C 3,6 contre 3,6 %).

#### 2.2 Économie d'un payant

| | A | B (Pack) | C |
|---|---:|---:|---:|
| Contribution par payant-mois, aujourd'hui → après | 1,30 € → **1,50 €** | 0,68 € → 0,68 € (Pack lissé) | 1,53 € → **1,93 €** |
| Durée de vie moyenne d'un payant | 15,8 mois | 12,5 mois (usage) | 16,7 mois |
| **Valeur vie (LTV) d'un payant**, aujourd'hui → après | 20,5 € → **23,7 €** | 8,5 € (+ Voix+ : 8,8 € → 11,9 €) | 25,6 € → **32,3 €** |
| Valeur nette d'un **inscrit** (conversion de base, moins son coût gratuit sur 12,5 mois), aujourd'hui → après | −0,47 € → **+0,68 €** | −0,69 € → +0,36 € | −0,60 € → **+0,63 €** |
| **Plafond de CAC par payant**, après | **14 €** | 5 € | **18 €** |
| Plafond de CAC par installation, après | ≈ 0,68 € | ≈ 0,36 € | ≈ 0,63 € |

**À retenir :**
- Avec les coûts actuels, **chaque inscrit fait perdre de l'argent**, quelle que soit l'architecture.
- Après le chantier coûts, une installation vaut 0,36 à 0,68 €. Une installation payante d'app parentalité coûte plus de 1,5 € : **pas de publicité payante, dans aucun cas**.

#### 2.3 Part des utilisateurs qui doit payer pour s'équilibrer

État stable, inscrits constants. Le premier chiffre est la conversion par inscrit, le second (entre parenthèses) la part des utilisateurs actifs qui paient.

| Cas | A | B (Packs, + 1,5 % Voix+) | C |
|---|---:|---:|---:|
| 200 inscrits/mois, SASU, gratuit 0,04 € | **4,9 %** (6,1 % des actifs) | 11,8 % (13,7 %) | **3,6 %** (4,8 %) |
| 200 inscrits/mois, sans SASU, 0,04 € | 2,5 % (3,2 %) | 5,1 % (6,9 %) | 1,8 % (2,5 %) |
| 200 inscrits/mois, SASU, gratuit 0,12 € | 10,5 % (13,2 %) | 24,5 % (26,3 %) | 8,4 % (11,2 %) |
| 200 inscrits/mois, sans SASU, 0,12 € | 7,8 % (9,8 %) | 17,8 % (19,6 %) | 6,2 % (8,3 %) |
| **≈ 500 actifs** (40 inscrits/mois), SASU, 0,04 € | 15,8 % (20 %) | 43 % (45 %) | 11,6 % (15,5 %) |
| ≈ 500 actifs, sans SASU, 0,04 € | 4,2 % (5,3 %) | 9,8 % (11,6 %) | 3,0 % (4,1 %) |
| ≈ 500 actifs, SASU, 0,12 € | 23 % (29 %) | 56 % (58 %) | 19 % (25 %) |

**Point d'honnêteté sur C :** un abonnement C couvre une famille, soit environ 2 comptes actifs. « 4,8 % des actifs » représente donc **environ 9 à 10 % des familles**, alors que pour A, il s'agit de 6,1 % des comptes. La comparaison « par foyer qui décide » rapproche fortement A et C.

**À 500 actifs, avec la SASU, aucune architecture n'est atteignable** (12 à 45 % de payants). L'objectif de la 1ʳᵉ année est de couvrir l'infra et la voix, ce qui demande 3 à 5 % hors SASU.

#### 2.4 Trajectoire sur 24 mois (scénario base : 200 inscrits/mois, +6 %/mois)

| | A | B | C |
|---|---:|---:|---:|
| **Après chantier coûts (0,04 €), avec SASU** | | | |
| Mois d'équilibre | **M13** | M13 | M14 |
| Résultat mensuel à M24 | **+170 €** | +97 € | +140 € |
| Trésorerie cumulée à M24 | +2 015 € | +2 426 € | +2 446 € |
| Besoin de trésorerie maximal | 216 € | 150 € | 210 € |
| Part des actifs qui paient à M24 | 6,2 % | 9,8 % | 4,5 % |
| **Après chantier coûts, sans SASU** | M3 · +280 €/mois à M24 | M4 · +207 € | M4 · +250 € |
| **Aujourd'hui (0,12 €), avec SASU** | | | |
| Mois d'équilibre | jamais | jamais | jamais |
| Résultat mensuel à M24 | −347 € | −370 € | −409 € |
| Besoin de trésorerie sur 24 mois | **3 763 €** | 2 818 € | 3 687 € |
| **Aujourd'hui, sans SASU** | jamais · −237 €/mois · 1 123 € | jamais · −260 € · 178 € | jamais · −299 € · 1 047 € |

**Pourquoi B paraît moins gourmand en trésorerie :** le Pack est encaissé d'un coup. Mais son résultat mensuel à M24 est le plus faible, car il ne renouvelle rien.

**Script de la skill (`unit_economics.py`, année 1, unité = payant-mois, lissé et non en trésorerie) :**

| | A aujourd'hui → après | B aujourd'hui → après | C aujourd'hui → après |
|---|---:|---:|---:|
| Seuil (payants actifs) | 211 → 118 | 334 → 206 | 193 → **97** |
| Payants à la fin de l'année 1 | 145 | 231 | 107 |
| Résultat de l'année 1 | −2 200 € → −812 € | −2 130 € → −870 € | −2 439 € → −971 € |
| Besoin de trésorerie (lissé) | 2 350 € → 1 025 € | 2 280 € → 1 046 € | 2 589 € → 1 140 € |

Le script affiche « $ » et « par jour » : lire « € » et « par mois ». L'écart avec le besoin de trésorerie du modèle vient de l'encaissement d'avance de l'annuel, que le script ne voit pas.

#### 2.5 Sensibilité

**À la conversion** (après chantier coûts, SASU incluse ; résultat mensuel à M24, puis mois d'équilibre) :

| Conversion par inscrit | 2 % | 3 % | 4 % | 5 % | 6 % | 8 % | 10 % |
|---|---:|---:|---:|---:|---:|---:|---:|
| A | −144 €, jamais | −39 €, jamais | +65 €, M19 | **+170 €, M13** | +274 €, M10 | +483 €, M7 | +692 €, M6 |
| B (Packs) | −182 € | −135 € | −89 € | −42 €, jamais | +4 €, M24 | **+97 €, M13** | +190 €, M10 |
| C | −71 €, jamais | +70 €, M18 | **+211 €, M12** | +352 €, M9 | +493 €, M8 | +774 €, M6 | +1 056 €, M5 |

Au coût actuel (0,12 €), il faut **10 % pour A (équilibre M16)** et 8 % pour C (M17), et B ne s'équilibre pas même à 12 %.

**Aux inscrits par mois** (point de départ, +6 %/mois ; après chantier coûts, avec SASU) :

| Inscrits au mois 1 | 50 | 100 | 200 | 300 |
|---|---:|---:|---:|---:|
| A (5 %) | jamais (−55 €/mois à M24) | M22 (+20 €) | M13 (+170 €) | **M9** (+319 €) |
| B (8 % de Packs) | jamais (−73 €) | jamais (−16 €) | M13 (+97 €) | M10 (+211 €) |
| C (3,5 %) | jamais (−62 €) | M24 (+6 €) | M14 (+140 €) | M11 (+275 €) |

**Au coût actuel, plus d'inscrits signifie plus de pertes**, dans les trois architectures. Pour A, la perte mensuelle à M24 passe de −184 € avec 50 inscrits à −455 € avec 300. C'est la confirmation du premier tour : **il ne faut pas pousser l'acquisition avant d'avoir baissé le coût du gratuit.**

#### 2.6 Note du CFO

- **La marge :** un payant A laisse 1,50 € par mois après le store et la voix (70 % de son prix HT), un payant C 1,93 € (62 %), un Pack 0,68 € par mois d'usage.
- **La ligne à surveiller : le coût de l'utilisateur gratuit.** Passer de 0,12 € à 0,04 € fait passer l'équilibre de « jamais » à M13-M14, et le besoin de trésorerie de 2 800-3 800 € à 150-220 €. Aucun choix d'architecture ou de prix ne fait autant.
- **Trésorerie :** avec le chantier coûts, 150 à 220 € suffisent. Sans lui, prévoir 3 000 à 4 000 € sur 24 mois, dont l'essentiel correspond aux 110 €/mois de SASU qui existent avec ou sans l'app.
- **Trois leviers chiffrés :**
  1. le coût du gratuit : 0,12 € → 0,04 € (voir ci-dessus) ;
  2. la conversion : pour A, passer de 4 à 6 % fait passer le résultat à M24 de +65 € à +274 € et avance l'équilibre de M19 à M10 ;
  3. le volume : pour A, passer de 100 à 300 inscrits au départ avance l'équilibre de M22 à M9, **mais seulement une fois les coûts baissés**.
- **Conditions du board :** aucun `founder/board.md` n'existe, elles n'ont donc pas été évaluées.

---

### 3. Quelle architecture gagne sur les preuves

| Critère | Gagnant | Chiffre décisif |
|---|---|---|
| Achat (panel) | égalité | 1/8 partout, même persona |
| Installation (panel) | A = B | 6/8, contre 4/8 pour C |
| Chemin crédible vers l'achat (panel) | A, B | 3 personas « après le rapport gratuit », 0 en C |
| Prix acceptés (panel) | A (de peu) | 3,49 € entre « cher » et « trop cher » ; C à 4,99 € = refus pour 4 sur 8 |
| Valeur par payant | **C** | 32,3 € contre 23,7 € (A) et 8,5 € (B) |
| Conversion nécessaire | **C** | 3,6 % contre 4,9 % (A) et 11,8 % (B) ; par famille, C ≈ A |
| Équilibre et trésorerie | A ≈ C ≈ B | M13 à M14 ; 150 à 220 € |
| Effort et risque | **A** | 16 j contre 19 j (B) et 21-25 j (C) |

**Conclusion :**
- **B perd sur les chiffres.** Il exige 11,8 % d'acheteurs, soit 2,4 fois A. Son plafond de CAC est de 5 € par payant et il ne renouvelle rien. À retenir quand même : le panel aime l'idée d'un achat unique déclenché par un rapport qui a servi. On peut la tester comme option dans A, avec un achat à vie bas (le panel cite « moins de 20 € »), sans en faire l'architecture.
- **C gagne sur le papier** (valeur par payant +36 %, seuil −1,3 point). Mais ce gain repose sur une conversion par famille que le panel ne soutient pas : installation à 4/8, la question « qui paie ? » en garde alternée et chez la nounou, aucun déclencheur hors réduction du gratuit. Le chantier dure aussi 5 à 9 jours de plus.
- **A est le meilleur pari pour lancer.** Il garde l'installation, il a un déclencheur d'achat observé (le rapport) et il se construit le plus vite. Son seuil n'est que 1,3 point au-dessus de C.
- **Ajouter C comme niveau « Famille » après 3 mois**, si les données montrent que les familles partagées convertissent.
- **Condition préalable commune :** le chantier qui ramène le gratuit à 0,04 € **avant** toute acquisition. Sans lui, aucune des trois ne s'équilibre en 24 mois.

**Ce qui pourrait inverser ce verdict :** dans le sondage réel, une intention d'achat par foyer au moins égale pour C, et 4,99 € sous le seuil du « trop cher ». Les règles de décision sont dans `v2-offers.md` §10.

## Marketing

> Méthodes suivies : founder-brand, founder-marketing, founder-launch, founder-ops (SKILL.md lus et appliqués).
> Base : `v2-offers.md` (architecture A retenue comme favorite), `CONTEXT.md`, `FEATURE_MAP.md`, `consumer-brand-marketing.md`, `launch-ops.md`, `RECRUTEMENT_ET_SONDAGE.md`, `../UI_UX_AUDIT.md`. Lecture seule de `app.json`, `docs/STORE_SUBMISSION.md` et `public/index.html` pour vérifier l'orthographe du nom.
> **Le dépôt n'a pas été modifié.** Ce plan remplace le calendrier de `launch-ops.md` §0 et §2. Les routines de `launch-ops.md` §4 (support, avis, monitoring, fiscalité) restent valables, sauf mention contraire.
> Ce n'est ni un avis juridique, ni un avis comptable. Les points marqués **[à confirmer]** doivent être vérifiés à la source officielle ou auprès d'un professionnel. Le panel cité est **simulé** : il ne sert jamais de témoignage.

---

### 0. En bref

| Sujet | Décision proposée |
|---|---|
| Orthographe | **« SuiviBaby »** en un mot partout (icône, stores, site, CGU, e-mails). « Suivi Baby » disparaît, « SuiviBaby+ » et « Suivi Enfant » aussi |
| Signature de marque | **« Notez à deux, arrivez prêts. »** Le gratuit fait installer (le partage), le payant fait payer (l'examen préparé) |
| Accroche store | « Les deux parents, la même page. » (validée par le panel : 7 sur 8 installent) |
| Nom du payant | **Premium**, présenté comme « SuiviBaby Premium — prêt pour chaque examen ». Offre de lancement : « Offre Fondateurs » |
| Canaux (0 €) | 1. Boucle de partage gratuite · 2. ASO et avis · 3. Sages-femmes libérales, PMI, RPE · 4. Groupes de parents · 5. Vidéos courtes |
| **Lancement public** | **Le 5/1/2027 ne tient plus.** Nouvelle date : **mardi 2/2/2027** (repli : mardi 16/2). Soft launch payant : **jeudi 7/1/2027** |
| Pourquoi | On ajoute ≈ 41 à 44 jours de développement au total (socle commun 15-20 j + A 16 j + UI/UX ≈ 5 j + invitation et avis 1,5 j), dont ≈ 30,5 j avant le soft launch, alors que l'ancien plan n'en comptait que 5. L'essai de 14 jours impose ensuite au moins 3 semaines de soft launch pour lire une conversion, et la période des fêtes bloque les soumissions |
| Chemin critique | Le **développement** (≈ 30,5 j avant le soft launch), et non plus l'administratif. Apple, Google et le médiateur ont maintenant 3 à 5 semaines de marge, à condition d'être lancés cette semaine |
| Promesse testeurs | « Premium offert à vie » = le niveau Premium individuel, avec ce qui y sera ajouté, voix au plafond des abonnés (30/jour), sur un compte, tant que le service existe (§3) |
| 100 premiers utilisateurs | Fin janvier 2027, à la fin du soft launch |
| 100 premiers payants | Vers **fin septembre 2027** si 4 à 5 % des inscrits paient. À 2 %, pas avant 2028. Dit honnêtement : ≈ 85 payants, c'est le seuil où la SASU est couverte |

---

### 1. Marque (founder-brand)

#### 1.1 Orthographe : « SuiviBaby » ou « Suivi Baby » ?

**Constat (vérifié dans le dépôt) :**
- `app.json` : `"name": "Suivi Baby"`, c'est le nom affiché sous l'icône.
- `docs/STORE_SUBMISSION.md` : « Suivi Baby » (App Store), « Suivi Baby - Suivi bébé » (Play).
- `public/index.html` : « SuiviBaby » (18 fois), domaine et identifiants `suivibaby`.
- Dans l'app, l'audit UI relève aussi « SuiviBaby+ », « Suivi Enfant » et « Samaye » (`UI_UX_AUDIT.md` P2-7).

**Décision recommandée : « SuiviBaby » en un mot.**
- C'est plus distinctif, donc plus défendable dans un dépôt semi-figuratif. Un nom en deux mots descriptifs (« suivi » + « baby ») a peu de chances d'être protégé seul.
- C'est cohérent avec le domaine, les identifiants (`com.tesfa.suivibaby`) et le site.
- Sous l'icône, 9 caractères tiennent sans troncature.

**Coût ASO et parade.** Apple découpe mal un mot collé : « SuiviBaby » ne remonte pas forcément sur la recherche « suivi baby ». On compense dans le champ Nom, qui est le plus indexé : **« SuiviBaby : suivi bébé partagé »** (30 caractères, la limite). On ajoute aussi « baby » dans les mots-clés.

**Mise en œuvre (Claude, dans le socle de nettoyage, ≈ 0,3 j) :**
- constante `APP_NAME` ;
- `app.json` `name` → « SuiviBaby » ;
- remplacer les variantes dans l'app (onboarding, réglages, titre de secours) ;
- fiches stores.

Le nom App Store ne change qu'avec une nouvelle version soumise : on le fait avec la version du soft launch.

**Ce que Yoss doit vérifier (je n'ai lancé aucune recherche, et ceci n'est pas un avis juridique) :**
- INPI ([data.inpi.fr](https://data.inpi.fr)), EUIPO ([eSearch](https://euipo.europa.eu/eSearch)), [TMview](https://www.tmdn.org/tmview) : « suivibaby », « suivi baby », « suivi bébé », ainsi que la signature « Notez à deux, arrivez prêts ».
- Classes à vérifier : 9 (application), 42 (SaaS), 44 (par prudence, services liés à la santé et au soin).
- Dépôt : marque semi-figurative (logo + « SuiviBaby ») à l'INPI. Tarif en ligne annoncé : environ 190 € pour une classe, puis environ 40 € par classe supplémentaire **[à confirmer sur inpi.fr]**. Un conseil en propriété industrielle confirme la disponibilité. Rien n'est protégé avant le dépôt.
- Domaines suivibaby.fr et suivi-baby.fr ; comptes @suivibaby sur Instagram, TikTok, YouTube, Facebook et X, à réserver cette semaine même sans publier.

#### 1.2 Promesse, signature, slogans

La nouvelle offre a deux moteurs, et la marque doit porter les deux sans les mélanger :
- **le gratuit fait venir** : tout le monde note au même endroit (partage illimité) ;
- **Premium fait payer** : on arrive prêt à chaque examen, et on sait quand viendra la prochaine tétée.

**Promesse en une ligne** (ce que le parent peut attendre à chaque fois) :
> « Toute la famille note au même endroit, et vous arrivez à chaque examen avec tout ce que le pédiatre va demander. »

**Signature, trois options :**
1. **« Notez à deux, arrivez prêts. »** (recommandée) : 28 caractères, elle couvre le gratuit et le payant, et elle est assez construite pour être déposable, contrairement à un descriptif.
2. « Les deux parents, la même page. » : reste l'**accroche d'installation** (titre de fiche, flyer, première capture). C'est la mieux validée par le panel, mais elle ne dit rien du payant.
3. « Prêts pour chaque examen. » : réservée au **paywall** et à la page Premium.

Règle d'usage : la fiche store et les réseaux ouvrent sur 2. Le paywall ouvre sur 3. Le logo, le site et le flyer signent avec 1.

#### 1.3 Nom du niveau payant

| Option | Pour | Contre | Verdict |
|---|---|---|---|
| **Premium** | Déjà dans le code (entitlement RevenueCat `premium`, groupe d'abonnements, paywall de la PR #70). Compris de tous. Aucun coût de changement | Banal : le panel disait « Premium ne m'apporte rien » | **Retenu**, mais toujours accompagné du résultat : « Premium — prêt pour chaque examen » |
| Plus | Court | C'est le nom du niveau de Huckleberry : à éviter (règle : ne pas copier un concurrent) | Écarté |
| Pro | Court | Laisse croire que c'est pour les professionnels (nounous, crèches) | Écarté |
| Famille | Parlant | Réservé à l'évolution C (Premium partagé par tous les aidants), à garder pour plus tard | Gardé pour un niveau supérieur éventuel |
| Sérénité, Zen… | Émotionnel | Allégation implicite de santé ou de bien-être, difficile à tenir | Écarté |

À retirer : « SuiviBaby+ » dans l'app. L'offre de lancement s'appelle **« Offre Fondateurs »** : prix bloqué tant que l'abonnement reste actif, achat à vie à 49,99 € **uniquement** jusqu'au dimanche 4/4/2027 à 23 h 59, sans prix barré.

#### 1.4 Ton

On garde les trois adjectifs de `consumer-brand-marketing.md` §3.2 (**complice, sobre et précis, transparent**). Un ajout pour Premium :

| Adjectif | À faire | À éviter |
|---|---|---|
| **Utile, pas inquiétant** (nouveau, pour l'examen et les prédictions) | « Ce que le pédiatre va vous demander, sur une page. » ; « Estimation à partir de vos saisies. » | « Ne ratez plus rien de la santé de bébé », « soyez rassurés », « détecte », tout ce qui joue sur la peur |

**Avant / après (paywall) :**
- *Avant* (offre du 11/11) : « À 3 h du matin, dites-le. SuiviBaby note. Jusqu'à 50 saisies vocales par jour et le rapport pour vos rendez-vous pédiatriques. »
- *Après* : « **Prêts pour chaque examen.** Le rapport pour le pédiatre à chaque rendez-vous, la préparation de la visite, l'estimation de la prochaine tétée et de la prochaine sieste, et la voix jusqu'à 30 fois par jour. 14 jours d'essai, résiliable en deux touches. »
- Pied de paywall (preuves, pas slogan) : « Sans pub · Hébergé en Europe · Export et suppression de vos données à tout moment · Pas un avis médical ».

#### 1.5 Angle de la fiche store

**App Store**

| Champ | Contenu proposé | Taille |
|---|---|---|
| Nom | SuiviBaby : suivi bébé partagé | 30/30 |
| Sous-titre | Repas, sommeil, couches à deux | 30/30 |
| Mots-clés | `baby,allaitement,tétée,biberon,sommeil,couche,nounou,pédiatre,examen,croissance,co-parent,sieste` | 96/100 |
| Texte promotionnel (modifiable sans revue) | « Nouveau : le calendrier des examens obligatoires, et un rapport clair à montrer au pédiatre. » | — |
| 1ʳᵉ ligne de description | « Les deux parents, la même page. Notez tétées, biberons, sommeil et couches en deux secondes, d'une main ou à la voix, et toute la famille est à jour. Le prochain examen arrive ? SuiviBaby vous prévient et prépare la page à montrer au pédiatre. Sans pub, données hébergées en Europe. » | — |

**Google Play**
- Titre : identique au nom App Store (30 caractères).
- Description courte (80 caractères max) : « Notez repas, sommeil et couches à deux, à la voix. Prêts pour chaque examen. » (76).

**Ordre des captures (iPhone 6,9", Android téléphone) :**
1. Partage : « Les deux parents, la même page » (deux téléphones, même journée).
2. Voix : « 3 h du matin. Une phrase. C'est noté. »
3. Calendrier des examens (gratuit) : « L'examen du 2ᵉ mois, dans 5 jours. »
4. Rapport (1 gratuit, puis Premium) : « Ce que le pédiatre va demander, sur une page. »
5. Prédictions (étiquette Premium visible) : « Prochaine tétée : vers 14 h 30 (estimation). »
6. Données : « Export et suppression à tout moment. Hébergé en Europe. »

À retirer de `docs/STORE_SUBMISSION.md` : « Historique illimité », « Partage famille étendu », « intelligent » (P0 de `v2-offers.md` §4.4). Toute capture doit montrer l'interface **après** les correctifs P0 de l'audit UI (contraste en sombre), donc pas avant mi-décembre.

#### 1.6 Identité visuelle : ce qui change

La charte de `consumer-brand-marketing.md` §3.3 reste valable (bleu `#0A7EA4`, nuit `#111827`, corail `#E8785A` jamais en texte sur blanc ; Nunito et Inter, licence OFL ; logo « lien et relais », sans croix médicale ni stéthoscope).

Deux ajouts :
- **La marque, c'est aussi le mode nuit.** On vend « 3 h du matin » : un bouton « Ajouter » à 2,5:1 de contraste en sombre ou un flash gris clair dans une modale contredisent la marque. Les 5 P0 de l'audit UI sont donc des corrections **de marque**, pas de la finition.
- **Les cinq premiers points de contact, mis à jour pour A :**
  1. Fiche store et site : « Les deux parents, la même page », capture du partage, bandeau de preuves.
  2. Onboarding : 3 écrans au plus ; le 2ᵉ invite l'autre parent ; le micro n'est demandé qu'au premier usage de la voix ; la date de naissance déclenche le **calendrier des examens**.
  3. Confirmation : « C'est noté. Léa le voit aussi. » Après achat, un reçu clair avec la date de renouvellement et la façon de résilier.
  4. Premier rappel d'examen (J-3) : « L'examen du 2ᵉ mois approche. Votre rapport est prêt à préparer (1 offert). » C'est le moment de vérité de Premium.
  5. Réponse à la première plainte : modèle de `consumer-brand-marketing.md` §3.2, inchangé.

---

### 2. Marketing (founder-marketing)

#### 2.1 Positionnement

1. **Recommandée.** Pour les parents qui se relaient auprès d'un bébé de 0 à 2 ans (co-parent, nounou, grands-parents), qui se demandent sans cesse « il a bu quand ? » et ne savent jamais quoi répondre au pédiatre, SuiviBaby est le carnet de bord partagé qui se remplit en deux secondes, à la voix si besoin, et qui prépare chaque examen obligatoire. Contrairement à Huckleberry et aux apps anglo-saxonnes, il est en français, sans pub, le partage est gratuit et illimité, et il suit le calendrier des examens du carnet de santé français.
   - *Preuves* : le partage est la raison d'installer la plus citée par le panel (7/8 en B). Personne ne vend la préparation aux examens français (`v2-offers.md` §2, point 6). Prédictions et rapport demandés par le panel.
2. Pour les parents épuisés des premières semaines, l'app qu'on remplit à 3 h du matin sans allumer la lumière. *Second message, celui des vidéos.*
3. Pour les parents attentifs à leurs données, l'app française hébergée en Europe, sans traceurs. *Message de réassurance, jamais en accroche* (le panel le lit comme un slogan).

#### 2.2 Les 5 canaux, avec premières actions et cibles hebdomadaires

**Plafond d'acquisition.** Un payant rapporte environ 23,8 € nets sur sa durée de vie (`v2-offers.md` §8). À 4,8 % de conversion, un inscrit vaut environ 1,1 €. Il coûte environ 0,5 € de service gratuit (0,04 € × 12,5 mois). Il reste donc **environ 0,6 € par inscrit**, alors qu'une installation payante dans la parentalité coûte couramment plus de 1,5 €. **Aucune publicité payante** tant qu'une conversion réelle n'est pas mesurée.

**Suivi des sources** (préalable, Claude, 0,5 j) :
- liens de campagne App Store Connect (`?pt=<id fournisseur>&ct=sf-dupont`) ;
- `referrer=utm_source%3D…` sur Google Play ;
- un événement d'analytics interne « source » à l'inscription (déjà prévu dans le socle analytics).

| # | Canal | Première action (qui, quand) | Cible hebdomadaire | Signal « changer quelque chose » |
|---|---|---|---|---|
| 1 | **Boucle de partage gratuite** | **C, avant le soft launch (1 j)** : à l'onboarding, écran « Invitez l'autre parent ou la nounou » avec un message prérempli (WhatsApp, SMS) contenant le lien `suivibaby.com/invite` (page existante) → store + code de partage ; `ref=invite`. *Limite actuelle : l'invitation par e-mail suppose que l'invité ait déjà l'app (`FEATURE_MAP.md` §1.6). Le lien doit donc passer par le store.* | ≥ 40 % des nouvelles familles avec au moins une invitation acceptée sous 7 jours ; ≥ 0,6 compte invité par famille | < 25 % → revoir le parcours d'invitation avant tout autre canal |
| 2 | **ASO et avis** | C, semaine du 14/12 : nom, sous-titre, mots-clés, 6 captures (§1.5). C, avant le soft launch (0,5 j) : demande d'avis native après 7 jours d'usage et ≥ 20 saisies, jamais la nuit. J-2 : e-mail aux testeurs pour demander un avis libre, sans contrepartie | Après le lancement : +5 avis par semaine ; note ≥ 4,6 ; conversion fiche → installation ≥ 25 % | Conversion < 20 % → refaire la capture 1 ; note < 4,3 → lire chaque avis négatif |
| 3 | **Sages-femmes libérales, PMI, relais petite enfance (RPE, ex-RAM)** | Y, à partir du 25/1, une fois le soft launch stable **et** le contenu santé relu (§2.9) : flyer A6 v2 « Le prochain examen, sans rien oublier » + QR personnalisé `ref=sf-<nom>`. Liste de 30 sages-femmes libérales (annuaire Ameli, Doctolib) et de 3 RPE (Saint-Ouen, Saint-Denis, Paris 17ᵉ et 18ᵉ). C : liste, flyer, e-mail type. **PMI** : service du Département, pas de démarche commerciale ; demander l'autorisation de déposer une information, sans jamais suggérer une recommandation | 5 contacts par semaine, dont 2 qui acceptent de déposer des flyers ; dès mars, 10 installations par semaine depuis `sf-*` | 0 installation `sf-*` après 20 dépôts → changer le message (calendrier gratuit plutôt que rapport) |
| 4 | **Groupes de parents** (Facebook locaux, garde alternée, « bébés de [mois] 2026 », WhatsApp des cours de préparation, Doctissimo, Magicmaman) | **Y, dès cette semaine**, pour les testeurs (§4.6), avec l'accord des admins. Soft launch : 2 ou 3 groupes choisis. Lancement : 5 groupes le jour J | 2 posts par semaine (1 au lancement, puis une réponse aux questions) ; 15 installations par semaine | Si un post rapporte < 3 installations, changer de groupe, pas de message |
| 5 | **Vidéos courtes** (Reels, TikTok, Shorts), puis micro-créatrices | Y réserve les comptes cette semaine. C écrit 6 scripts d'ici le 18/12. Y tourne de nuit, en lumière tamisée, voix réelle, sans visage de bébé. Publication dès le 4/1, 2 par semaine. Micro-créatrices (2 000 à 20 000 abonnés) seulement après le lancement, avec un code Premium à vie et la mention « Collaboration commerciale » | 2 vidéos par semaine ; 1 000 vues par semaine au 1ᵉʳ mois ; ≥ 1 % de visites du profil vers le store | < 300 vues par vidéo sur 4 vidéos → changer les 3 premières secondes, pas le sujet |

**Ce qu'on ne fait pas, et pourquoi :**
- pas de pub Meta ni Apple Search Ads avant une conversion mesurée ;
- pas de presse nationale avant d'avoir des avis ;
- pas de démarche auprès des directions de maternité (cycles d'achat trop longs) ;
- pas de services payants de testeurs (risque de refus Google) ;
- pas de message privé à des inconnus (démarchage).

#### 2.3 Les 100 premiers utilisateurs (d'ici fin janvier 2027)

Un « utilisateur » = un compte qui a créé un enfant et fait au moins une saisie. On compte les testeurs et les comptes invités (co-parents, nounous).

| Semaine (fin) | Cumul visé | D'où ils viennent |
|---|---:|---|
| dim. 22/11 | 15 | ≥ 12 testeurs Android inscrits (6 aujourd'hui) + testeurs TestFlight |
| dim. 6/12 | 22 | 20 testeurs Android (marge), dont ≥ 8 vrais parents |
| dim. 20/12 | 28 | Co-parents des testeurs invités via le nouveau parcours d'invitation |
| dim. 10/1 | 40 | Soft launch (7/1) : premier cercle iOS et Android, 2 groupes choisis |
| dim. 17/1 | 55 | 3ᵉ groupe ; les invitations font ≈ 1/3 des nouveaux comptes |
| dim. 24/1 | 75 | Groupes garde alternée ; 2 premières vidéos |
| dim. 31/1 | **100** | Entourage, vidéos, invitations |

Si l'on est sous 60 le 24/1, ce n'est pas grave pour la décision (le soft launch mesure des **taux**), mais il faut alors repousser la lecture de conversion d'une semaine (repli au 16/2).

#### 2.4 Les 100 premiers payants (honnêtement : vers fin septembre 2027)

**Hypothèses** : 4 à 5 % des inscrits finissent payants (cohérent avec `v2-offers.md`, **non mesuré**). Le paiement arrive environ 14 jours après l'inscription (durée de l'essai). On compte les payants actifs, achat à vie compris, testeurs exclus.

| Période | Inscrits par semaine | Nouveaux payants par semaine | Cumul de payants (fin de période) |
|---|---:|---:|---:|
| Soft launch (7/1 → 31/1) | 15 à 25 | 0 à 1 | **≥ 3** (ligne de succès §4.3) |
| Semaine du lancement (2/2) | 150 | 1 | 4 |
| Février (3 semaines suivantes) | 70 à 80 | 2 à 3 | 12 |
| Mars, avec la fin de l'Offre Fondateurs le 4/4 qui crée une vraie échéance | 60 | 3 à 4 | 28 |
| Avril → juin | 55 à 60 | 2 à 3 | 60 |
| Juillet → septembre | 55 à 65 | 3 | **≈ 100** |

**Repères de rentabilité** (net par payant ≈ 1,6 €/mois après coût de service, mix 40 % mensuel, 50 % annuel, 10 % à vie) :
- ≈ 15 payants couvrent l'infra et la voix ;
- ≈ 85 couvrent les 129 € de frais fixes, SASU comprise.

**Si la conversion réelle est de 2 %**, il faut deux fois plus d'inscrits : 100 payants arriveraient en 2028. La revue J+30 (4/3) doit alors trancher entre l'offre (passer à C, revoir le contenu) et le volume (canal 3 en grand).

#### 2.5 Dix accroches (chacune répond à une objection)

| # | Format | Accroche | Objection traitée |
|---|---|---|---|
| 1 | Titre store | Les deux parents, la même page. | « L'autre parent n'utilisera pas l'app » |
| 2 | Vidéo, 3 s | « Il a bu quand ? » Plus besoin de demander. | Les messages WhatsApp |
| 3 | Vidéo, 3 s | 3 h du matin. Une main. Une phrase. C'est noté. | « Plus de deux gestes, j'abandonne » |
| 4 | Vidéo, 3 s | « Combien il boit par jour ? » Le pédiatre demande, vous avez la page. | « Je ne sais jamais quoi répondre au rendez-vous » |
| 5 | Flyer pro | Le prochain examen, sans rien oublier. Calendrier gratuit, rapport à montrer. | « Pourquoi une sage-femme en parlerait ? » |
| 6 | Paywall | Le premier rapport est offert. Les suivants, avec Premium. | « Je ne vais pas payer pour un PDF » |
| 7 | Capture 6 | Vos données vous appartiennent : export et suppression à tout moment. | « Sera-t-elle encore là dans un an ? » |
| 8 | Post groupe | Faite à Saint-Ouen par un papa développeur. Pas de pub, pas de revente. | « Petite app inconnue, qui est derrière ? » |
| 9 | Post garde alternée | Une semaine chez l'un, une semaine chez l'autre, un seul carnet. | L'historique éclaté |
| 10 | Paywall, ligne 3 | Prochaine tétée vers 14 h 30 : une estimation tirée de vos saisies. | « Je veux des prédictions comme Huckleberry » |

Le partage reste gratuit et le paywall le dit : « Le partage restera toujours gratuit. »

#### 2.6 Campagne de 30 jours autour du lancement (J = mardi 2/2/2027)

| Date | Canal | Action et message |
|---|---|---|
| mar. 19/1 (J-14) | Instagram, TikTok | Récit du fondateur : « Pourquoi j'ai fait SuiviBaby » (aucune allégation santé) |
| jeu. 21/1 | Vidéo | Accroche 3 « 3 h du matin » |
| lun. 25/1 | Terrain | Premiers dépôts de flyers v2 chez 5 sages-femmes, liste des RPE |
| mar. 26/1 | Vidéo | Accroche 4 « Combien il boit par jour ? » |
| jeu. 28/1 | Groupes garde alternée | Accroche 9, avec appel aux retours du soft launch |
| ven. 29/1 | Créatrices | 5 messages personnalisés, code Premium à vie, mention obligatoire expliquée |
| dim. 31/1 (J-2) | E-mail testeurs | « On sort mardi : un avis sur le store aiderait d'autres parents » (libre, sans contrepartie) |
| lun. 1/2 (J-1) | Tous | Revue go / no-go (§4.3), teaser « demain » |
| **mar. 2/2 (J)** | Tous | Annonce : liens stores, accroche 1, Offre Fondateurs datée (fin le 4/4) ; 5 groupes avec l'accord des admins ; LinkedIn |
| mer. 3/2 | Instagram | Carrousel « Ce que SuiviBaby ne fait pas : pas de pub, pas de revente, pas de diagnostic » |
| jeu. 4/2 | TikTok | Deux téléphones côte à côte : le partage en temps réel |
| ven. 5/2 | Groupes | Réponses à chaque commentaire, FAQ publiée |
| lun. 8/2 | Terrain | 5 nouvelles sages-femmes, relance des premières avec leur QR |
| mar. 9/2 (J+7) | Bilan | Revue des 3 chiffres (§2.8) |
| jeu. 11/2 | Vidéo | « Ce que la nounou voit de son côté » (accroche 1, version nounou) |
| lun. 15/2 | Créatrices | Publications des collaborations (mention « Collaboration commerciale ») |
| mar. 16/2 (J+14) | Bilan | Premiers essais arrivés à terme : conversion réelle |
| jeu. 18/2 (J+16) | Tous | Retour honnête sur 2 semaines (vrais chiffres) ; plan de mars : relance Offre Fondateurs à J-30, J-7 et J-1 avant le 4/4 |

**Quand il n'y a rien de neuf** : coulisses, bug corrigé (avec accord de la personne), question en story, « ce que l'app ne fait pas », réponse détaillée à une objection.

#### 2.7 Budget

| Poste | Argent | Temps Yoss par semaine |
|---|---:|---:|
| Boucle de partage, ASO | 0 € (développement Claude) | 1 h (relecture) |
| Flyers A6 (200 exemplaires) | ≈ 20 € | 2 h (terrain, à partir de fin janvier) |
| Groupes de parents | 0 € | 1 h 30 |
| Vidéos | 0 € (téléphone) | 1 h 30 (tournage) |
| Créatrices | 0 € (≈ 10 codes à vie, coût de service ≈ 3 €/mois) | 30 min |
| **Total** | **≈ 20 €** | **≈ 6 à 7 h** (au lieu des 10 h de la v1 : le temps de développement est plus élevé) |

Hors marketing, mais à prévoir : dépôt INPI ≈ 190 à 270 € **[à confirmer]**, relecture santé (§2.9) 0 à 300 €.

#### 2.8 Trois chiffres à suivre chaque lundi

1. **Familles avec au moins une invitation acceptée sous 7 jours** : cible ≥ 40 %, alerte < 25 %.
2. **Rétention J7** (au moins une saisie au 7ᵉ jour) : cible ≥ 35 %, alerte < 20 % → priorité au produit (saisie, onboarding), pas au marketing.
3. **Inscrits → essai ou payant à J30** : cible ≥ 4 %, alerte < 2 % après 300 inscrits → revoir l'offre. Indicateur avancé : nombre de « préparer la visite » par utilisateur actif.

#### 2.9 Limites des allégations santé (A les rend plus sensibles)

Ce n'est pas un avis juridique. En cas de doute, faire relire.

- **Interdit** : « surveille », « détecte », « prévient », « alerte en cas de fièvre », « améliore le sommeil », « recommandé ou validé par des pédiatres ou des sages-femmes » (sauf partenariat réel, écrit et autorisé), « conforme au carnet de santé » sans source, « intelligent » au sens diagnostic.
- **Autorisé** : « noter », « garder une trace », « préparer le rendez-vous », « à montrer à votre professionnel de santé », « examens obligatoires du carnet de santé (source : ministère de la Santé) », « courbes de référence OMS », « estimation à partir de vos saisies ».
- **Prédictions** : toujours une **fourchette**, le volume de données utilisé, et « estimation, pas un avis médical ». Jamais de chiffre présenté comme une norme.
- **Kit examen** : calendrier et check-list repris du carnet de santé officiel, **sourcés et datés**, sans interprétation. Une relecture par un professionnel (sage-femme ou pédiatre) est requise **avant** toute démarche auprès des sages-femmes. Elle couvre aussi les seuils d'alerte de température (`v2-offers.md` §4.4 P1) et les écarts de poids affichés en rouge (`UI_UX_AUDIT.md` P1-20, à corriger).
- **Mention permanente** (fiche, site, rapport PDF) : « SuiviBaby ne remplace pas l'avis d'un professionnel de santé. En cas de doute, appelez votre médecin ou le 15. »
- **Influence commerciale** (loi du 9 juin 2023) : un code Premium à vie offert à une créatrice est une contrepartie, d'où la mention « Collaboration commerciale » obligatoire.
- **Avis** : on peut en demander, jamais les acheter ni les conditionner. La promesse testeurs (§3) n'est **jamais** liée à un avis.
- **Offre Fondateurs** : date de fin affichée et réellement tenue (pas de fausse urgence) ; pas de prix de référence fictif.

---

### 3. Promesse « Premium offert à vie aux testeurs » : définition

#### 3.1 Pourquoi la préciser

Le message actuel (« les testeurs auront Premium offert à vie au lancement ») est ambigu. Quel Premium ? Pour combien de comptes ? La voix est-elle illimitée ? Que veut dire « à vie » si l'app ferme ? Une promesse floue faite à des parents qui nous rendent service est le pire départ possible pour une marque « transparente ». Elle doit tenir en 6 lignes et coûter un montant borné.

#### 3.2 Définition (à publier telle quelle sur `suivibaby.com/testeurs` et dans les CGU)

**« Premium testeur, offert à vie » : ce que c'est, en 6 points**

1. **Qui** : toute personne inscrite au test SuiviBaby (test fermé Android via le groupe ou la liste, ou TestFlight sur iPhone) **avant le mercredi 6 janvier 2027**, qui reste inscrite au moins **14 jours** et utilise l'app au moins **3 jours différents**. Aucun avis, note ou publication n'est demandé, ni pris en compte.
2. **Quoi** : le niveau **Premium individuel**, tel qu'il est vendu au lancement (3,49 €/mois) : rapport pédiatre illimité, kit examen, estimations de tétée et de sieste, exports PDF illimités, saisie vocale. **Les fonctions ajoutées plus tard à ce même niveau Premium sont incluses** (par exemple le widget prévu).
3. **La voix** : même plafond que les abonnés Premium payants, soit **30 saisies vocales par jour** au lancement. La saisie manuelle n'est jamais limitée.
4. **Ce qui n'est pas inclus** : un éventuel niveau supérieur distinct (par exemple une formule « Famille » qui partagerait Premium avec d'autres comptes), et tout achat séparé. Les proches invités gardent l'app gratuite, partage compris.
5. **Pour quel compte** : un seul compte SuiviBaby (l'adresse e-mail utilisée dans l'app), personnel et non cessible. Activé par nous, sans code à saisir, au plus tard le jour du lancement public, et visible dans Réglages > Abonnement.
6. **« À vie »** : aussi longtemps que SuiviBaby est exploité. En cas d'arrêt du service, nous prévenons **6 mois à l'avance** et l'export complet de vos données reste gratuit. Le droit ne se perd qu'en cas d'abus (comptes multiples, revente) ou si vous supprimez votre compte.

*Si vous parlez de SuiviBaby en public, merci de préciser que vous avez reçu Premium en tant que testeur.*

#### 3.3 Pourquoi c'est tenable

- **Coût borné** : environ 20 à 40 testeurs × 0,33 €/mois ≈ 7 à 13 €/mois. Pire cas (40 testeurs au plafond vocal tous les jours) : environ 40 €/mois. La voix plafonnée est ce qui rend la promesse « à vie » soutenable.
- **Cohérent avec l'offre** : le widget est déjà prévu dans Premium sans hausse de prix pour les abonnés (`v2-offers.md` §5.1). Il est donc naturel de l'inclure. « Famille », s'il existe un jour, coûte plus cher à servir (voix de plusieurs adultes) : on l'exclut dès maintenant, par écrit.
- **Technique** : droit promotionnel RevenueCat **sans date de fin**, attribué à l'identifiant Firebase du compte, et tier serveur « premium » avec un motif `tester`. **Prérequis** : la correction de `PremiumContext` (P0 du socle), sans laquelle un droit accordé côté serveur est invisible dans l'app. Aucune saisie de code dans l'app : on évite ainsi le sujet Apple 3.1.1. L'octroi manuel de droits par le serveur est une pratique courante, mais elle reste à garder discrète et sans contrepartie d'achat **[risque faible, à surveiller]**.
- **Vérifiable** : la liste Play Console et la date d'inscription TestFlight, plus 3 jours d'activité, visibles dans les événements d'analytics internes.

#### 3.4 La ligne réécrite du message de recrutement (§1 de `RECRUTEMENT_ET_SONDAGE.md`)

Remplacer :
> **En échange :** l'appli est gratuite, et les testeurs auront Premium offert à vie au lancement.

par :
> **En échange :** l'appli est gratuite, et si vous restez dans le test 14 jours en l'utilisant un peu, votre compte reçoit **Premium offert à vie** : tout ce que contient l'abonnement Premium (3,49 €/mois au lancement), y compris ce qui y sera ajouté, tant que l'appli existe. Saisie vocale comprise, avec le même plafond que les abonnés (30 par jour). Les conditions tiennent en 6 lignes : suivibaby.com/testeurs

Dans le message personnel (§2), ajouter : « En remerciement, Premium t'est offert à vie (conditions : suivibaby.com/testeurs). »
Dans le message d'échange de tests en anglais (§3), ne rien promettre de plus. Ces testeurs sont couverts par la même règle s'ils la remplissent, mais ce n'est pas un argument pour eux.

**Préalable** : le prix de 3,49 € dépend du sondage (décision le 14/12). Jusque-là, écrire « (prix de lancement : environ 3,50 €/mois) », ou retirer le prix de la phrase. La page `suivibaby.com/testeurs` est rédigée par Claude et publiée sur le site (hébergement autorisé) **après validation de Yoss**.

---

### 4. Lancement (founder-launch)

#### 4.1 Verdict sur le 5/1/2027 : il ne tient plus

L'ancien plan supposait environ 5 jours de développement (rapport pédiatre) logés dans l'attente des 14 jours Android. Le nouveau plan en compte environ 41 à 44, dont environ 30,5 avant le soft launch :

| Bloc | Effort | Avant le soft launch | Après le soft launch, avant le public |
|---|---:|---:|---:|
| **UI/UX** : 5 P0 + 11 gains rapides de l'audit | ≈ 2 j | 2 j | — |
| UI/UX : onboarding allégé (3 écrans, connexion Apple/Google en premier, biométrie après la 1ʳᵉ saisie, « Trois touches, ou votre voix ») | ≈ 1 j | 1 j | — |
| UI/UX : footer collant + garde-fou de perte de saisie (P1-7, P1-8) | ≈ 2 j | — | 2 j |
| **Socle, nettoyage P0** (sauvegarde factice, parrainage, `PremiumContext`, fuite `parseVoiceCommand`, textes stores, types morts, séries gratuites, quota PDF serveur, droit testeurs, nom unique) | ≈ 4,5 j | 4,5 j | — |
| Socle, P1 utiles à la mesure : analytics internes, opt-in du récap, retrait des « insights IA », rappel J-2 de fin d'essai, vérification de l'export des photos | ≈ 3,5 j | 3,5 j | — |
| Socle, leviers de coût 0 (mesurer), 1 (push serveur des rappels), 5 (`minInstances`) | ≈ 2 j | 2 j | — |
| Socle, leviers de coût 2 (listeners Moments), 3 (relectures), 4b/4c (voix gratuite moins chère), 6 (photos), plus le code orphelin | ≈ 8 à 10 j | — | 8 à 10 j |
| **Architecture A** : calendrier des examens (1), rapport (5), kit (2,5), prédictions (6), divers (2) | ≈ 16 j | 16 j | — |
| Marketing produit : parcours d'invitation et `ref` (1), demande d'avis (0,5) | ≈ 1,5 j | 1,5 j | — |
| **Total** | **≈ 41 à 44 j** | **≈ 30,5 j** | **≈ 10 à 12 j** |

**Pourquoi on peut décaler une partie du socle :** à moins de 150 utilisateurs, le coût du gratuit est négligeable (150 × 0,12 € ≈ 18 €/mois). Les leviers 2, 3, 4b/4c et 6 comptent pour l'échelle du lancement public, pas pour le soft launch. Les leviers 0, 1 et 5 sont gardés avant, parce qu'ils sont courts et qu'ils corrigent un bug (double notification).

**Calcul.** Du jeudi 12/11 au vendredi 18/12, il y a environ 26 jours ouvrés, pour 30,5 jours de travail. Sans travailler pendant les fêtes, le code « prêt à vendre » arrive vers le 8/1. En travaillant 4 à 5 jours pendant les fêtes (développement seulement, sans soumission), il arrive le 31/12. La soumission iOS a lieu le lundi 4/1 et le soft launch le jeudi 7/1.

Ensuite, avec un essai de 14 jours, les premiers essais ne se terminent qu'à partir du 21/1. Il faut donc au moins jusqu'au 29/1 pour une première lecture de conversion.

**Nouvelle date de lancement public : mardi 2/2/2027.** Repli au mardi 16/2 si un critère de passage manque.

**Les options pour garder le 5/1, et pourquoi je ne les recommande pas :**
- *Lancement public gratuit le 5/1, Premium en février* : on gagne un mois d'avis et d'installations, mais on dépense l'unique « moment de lancement » sur une version sans revenu et sans mesure de conversion. C'est défendable si Yoss privilégie les avis, mais je ne le recommande pas.
- *Retirer les prédictions de la première version payante* : on gagne environ 6 jours, mais on vend un Premium que le panel juge « sympa » sans plus. Et ajouter les prédictions en plein test change l'offre pendant qu'on la mesure.
- *Tout finir avant le 11/12 pour un soft launch le 15/12* : il faudrait environ 30 jours de travail en 4 semaines, avec la relecture de toutes les PR par une seule personne. Ce n'est pas réaliste.

#### 4.2 Le test avant de dépenser

**a) Sondage de prix (réel)** : on reprend `RECRUTEMENT_ET_SONDAGE.md` §5, avec 4 changements tirés de `v2-offers.md` §10.

1. **Monadique** : chaque répondant ne voit qu'une architecture (A, B ou C, en 5 lignes avec le prix). Tally ne tire pas au hasard. Astuce : la question « Dernier chiffre de votre jour de naissance ? » envoie 0-3 vers A, 4-6 vers B et 7-9 vers C.
2. Van Westendorp **à unité imposée** (« par mois » pour A et C, « une fois » pour le Pack B).
3. Gabor-Granger sur A : annuel à 24,99 € et à 29,99 € ; mensuel à 2,99 €, 3,49 € et 3,99 €.
4. Nouvelles questions : « Qui paierait chez vous ? » et « Quelle fonction compte le plus ? ».

Les règles de décision de `v2-offers.md` §10 sont écrites **avant** les réponses.

| Jalon | Date | Cible |
|---|---|---|
| Sondage en ligne (C prépare dans Tally, Y publie) | lun. 16/11 | — |
| Premier point | dim. 29/11 | ≥ 30 réponses complètes |
| Clôture | dim. 13/12 | ≥ 75 (25 par variante), 100 idéalement |
| Décision prix et architecture | **lun. 14/12** | Produits créés dans les stores du 15 au 18/12 |

Si l'on a moins de 45 réponses le 13/12 : on garde A à 3,49 € / 24,99 €, et le soft launch tranche.

**b) Soft launch au vrai prix** (jeudi 7/1 → vendredi 29/1), sans annonce publique, pour 50 à 100 comptes.

| Indicateur | Ligne de succès (écrite le 12/11) | Seuil « revoir l'offre » |
|---|---|---|
| Activation (enfant + ≥ 3 saisies le 1ᵉʳ jour) | ≥ 60 % | < 40 % |
| Rétention J7 | ≥ 35 % | < 20 % |
| Familles avec une invitation acceptée sous 7 jours | ≥ 40 % | < 25 % |
| « Préparer la visite » ou rapport ouvert | ≥ 1 par utilisateur actif ayant eu un examen | quasi nul |
| Actifs en essai ou payants à J30 (`v2-offers.md` §10) | ≥ 3 % | < 1 % |
| Achats réels hors Yoss | ≥ 1 payant converti après essai, ≥ 3 essais en cours | 0 essai |
| Taux sans crash sur 14 jours | ≥ 99,5 % | < 99 % |

Si les vrais acheteurs restent loin du seuil, **on fait confiance aux vrais acheteurs, pas au panel** : on regarde quel levier est utilisé (rapport, prédictions, voix au plafond), puis on revient à l'offre (C si les familles partagées convertissent), avant de toucher au prix.

#### 4.3 Critères de passage au lancement public (revue du lundi 1/2, 18 h)

- Taux sans crash ≥ 99,5 % sur 14 jours, aucun bug de perte ou de mélange de données ouvert.
- Un achat réel et un remboursement traités **sur chaque plateforme**, webhook RevenueCat cohérent.
- Ligne de succès du soft launch atteinte, ou décision écrite de lancer quand même avec l'offre ajustée.
- Leviers de coût 2 et 4 livrés (le gratuit doit coûter environ 0,04 € avant d'en accueillir des centaines).
- Contenu santé relu (§2.9), page testeurs en ligne, droits testeurs activés.
- Note moyenne ≥ 4,3 s'il y a au moins 5 avis ; première réponse au support en moins de 24 h.
- Si un critère manque : **repli au mardi 16/2**, pas au-delà sans nouvelle décision.

#### 4.4 Compte à rebours, semaine par semaine

Légende : **Y** = Yoss seul · **C** = Claude · **Y+C** = Claude prépare, Yoss valide ou signe · ⚑ = chemin critique · ◇ = presque critique (moins de 2 semaines de marge).

##### S1 — jeu. 12/11 → dim. 15/11 : lancer tout ce qui a un délai

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ◇1 | Créer le Google Group `suivibaby-testeurs@googlegroups.com` (tout le monde peut rejoindre, messages réservés aux propriétaires, membres masqués), puis l'ajouter dans Play Console > Tests fermés > Alpha > Testeurs | C via ego-browser **sur accord de Y** | ven. 13/11 |
| ◇2 | Publier l'appel aux testeurs (version §3.4) dans 3 groupes de parents, plus le message personnel à l'entourage ; demander aux 6 testeurs actuels d'en amener 2 chacun | Y | dim. 15/11 |
| ◇3 | Échanges de tests (r/AndroidClosedTesting, groupe « Testers Community ») : message §3 ; Claude tient la liste des applis à tester en retour pendant 14 jours | C (publie si les comptes de Y sont connectés et sur accord) / Y (teste en retour sur son Android) | ven. 13/11 |
| 4 | Apple : vérifier le type de compte ; si individuel, D-U-N-S de TESFA puis migration vers un compte organisation ; statut de commerçant DSA (adresse publique : siège ou domiciliation) | Y | lancé ven. 13/11 |
| 5 | Google : profil de paiement marchand TESFA (SIREN, IBAN pro, Kbis), statut DSA | Y | ven. 13/11 |
| 6 | Médiateur : souscrire CM2C (le rappel du 9/11 est passé) | Y | **dim. 15/11** |
| 7 | Réserver @suivibaby sur Instagram, TikTok, YouTube et Facebook ; vérifier suivibaby.fr | Y | dim. 15/11 |
| ⚑8 | Code : 5 P0 et gains rapides de l'audit UI (`onTint`, modales liées au thème, FAB, chrono, StatsGroup), puis nettoyage trivial (sauvegarde factice, carte de parrainage, séries gratuites, types morts, `APP_NAME`) | C → « go » Y par PR | ven. 13/11 → mar. 17/11 |
| 9 | Préparer le sondage v2 dans Tally (§4.2) | C | dim. 15/11 |

##### S2 — lun. 16/11 → dim. 22/11 : socle, build visible pour les testeurs

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ⚑10 | `PremiumContext` (fusion RevenueCat et serveur, `status`), fuite `parseVoiceCommand`, quota PDF côté serveur | C → Y | jeu. 19/11 |
| ⚑11 | Leviers 0 (export de facturation vers BigQuery, alertes budget), 1 (suppression du push serveur des rappels), 5 (`minInstances`) | C (gcloud autorisé) | ven. 20/11 |
| 12 | **Build 1.0.15** aux testeurs (TestFlight et Alpha) : interface corrigée, visible et utile pour le questionnaire Google | C (autorisé) | mer. 18/11 |
| 13 | Sondage publié : groupes, testeurs, entourage | Y | lun. 16/11 |
| ◇14 | **≥ 12 testeurs Android inscrits** : le compteur de 14 jours démarre au plus tard ce jour | Y (C vérifie chaque jour) | **dim. 22/11** |
| 15 | AssemblyAI en paiement à l'usage, limite de dépense Anthropic | Y | dim. 22/11 |

##### S3 — lun. 23/11 → dim. 29/11 : mesure et argent

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ⚑16 | Analytics internes (activation, J7, paywall vu, essai, achat, source, « préparer la visite »), opt-in du récap, retrait des « insights IA », rappel J-2 de fin d'essai, export des photos vérifié | C → Y | ven. 27/11 |
| ⚑17 | Calendrier des examens obligatoires + rappel J-3 (dates sourcées) | C → Y | dim. 29/11 |
| 18 | Accord Apple « Paid Apps » (banque, W-8BEN-E), statut « Actif » | Y | mer. 25/11 (marge jusqu'au 18/12) |
| 19 | Pages légales : médiateur, CGU (définition de « à vie », préavis de 6 mois, conditions testeurs, remboursement Android / Apple), mentions ; déploiement | C (rédige, déploie) / Y (valide) | 48 h après la convention CM2C |
| 20 | Point sondage : ≥ 30 réponses | Y (diffuse) / C (analyse) | dim. 29/11 |

##### S4 — lun. 30/11 → dim. 6/12 : le rapport

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ⚑21 | Rapport pédiatre complet (période depuis le dernier examen, OMS, repas, sommeil, couches, santé, vaccins récupérés de `immunizations.tsx`), 1 gratuit puis Premium | C → Y | ven. 4/12 |
| 22 | Parcours d'invitation à l'onboarding + `ref` ; demande d'avis native | C → Y | mer. 2/12 |
| 23 | **Build 1.0.16** aux testeurs (calendrier, rapport, invitation) | C | mer. 2/12 |
| 24 | Trouver une sage-femme ou un pédiatre relecteur (kit, seuils de température, wording) | Y | dim. 6/12 |
| ◇25 | Fin des 14 jours (si le compteur est parti le 22/11) | — | dim. 6/12 |

##### S5 — lun. 7/12 → dim. 13/12 : kit, accès production Android

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ◇26 | Demander l'accès à la production Google (C rédige les réponses à partir des retours réels des testeurs) | Y (envoie) / C | lun. 7/12 |
| ⚑27 | Kit examen (« préparer la visite », questions notées, check-list sourcée) | C → Y | jeu. 10/12 |
| ⚑28 | Prédictions tétée et sieste : début | C | — |
| 29 | Clôture du sondage (≥ 75 réponses) | Y + C | dim. 13/12 |
| 30 | Compte marchand Google actif (sinon, relance) | Y | dim. 13/12 |

##### S6 — lun. 14/12 → dim. 20/12 : prix, produits, prédictions

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| 31 | **Décision prix et architecture** (règles écrites) | Y (C présente l'analyse Van Westendorp et Gabor-Granger) | **lun. 14/12** |
| ⚑32 | Prédictions terminées (fourchette, données utilisées, désactivables) | C → Y | ven. 18/12 |
| 33 | Produits App Store Connect et Play (mensuel, annuel avec essai 14 jours, à vie Fondateurs), offerings RevenueCat, clés SDK publiques ; Y dépose la clé .p8 et le JSON du compte de service | C (saisie) / Y (secrets, prix) | ven. 18/12 |
| 34 | Accès production Google accordé (revue jusqu'à 7 jours) | Google | ≈ lun. 14/12 |
| 35 | Fiches stores réécrites (§1.5), 6 scripts vidéo | C | dim. 20/12 |
| 36 | **Build 1.0.17** interne avec achats sandbox | C | ven. 18/12 |

##### S7-S8 — lun. 21/12 → dim. 3/1 : fêtes (aucune soumission publique)

- Y : achats sandbox iOS et achats test Android sur appareil (achat, essai, restauration, annulation, webhook). Repos.
- C : « divers » de A (2 j), captures d'écran sur l'interface finale, compte de démonstration avec données, notes de revue, levier 2 (listeners Moments) sur une branche. Pas de mise en production.
- Les revues Apple ralentissent souvent autour de Noël **[à confirmer : calendrier 2026]**.

##### S9 — lun. 4/1 → dim. 10/1 : soft launch

| # | Tâche | Qui | Échéance |
|---|---|---|---|
| ⚑37 | Soumettre **1.1.0** à la revue App Store avec les achats intégrés (publication manuelle) ; release production Android en déploiement progressif à 20 % | C (build, soumission App Store Connect) / **Y (accord pour la production Android)** | lun. 4/1 |
| 38 | Clôture des inscriptions testeurs éligibles à Premium à vie | — | mer. 6/1 |
| ⚑39 | **Soft launch** France : publication iOS, Android à 100 % ; achat réel par Y puis remboursement, sur chaque plateforme | Y (go) / C | **jeu. 7/1** |
| 40 | Premier cercle invité, 2 groupes choisis ; vidéos 1 et 2 | Y | dim. 10/1 |

##### S10-S12 — lun. 11/1 → dim. 31/1 : écouter, finir le socle, préparer

- C : leviers 3, 4b/4c et 6 ; footer collant et garde-fou de saisie ; correctifs du soft launch ; un train de release par semaine, le mercredi.
- C : droits Premium testeurs activés (RevenueCat promotionnel) d'ici le 29/1 ; textes de lancement, fiche presse, réponses types, site (prix, badges stores, page Premium).
- Y : relecture santé reçue (au plus tard le 22/1) ; terrain sages-femmes à partir du 25/1 ; vidéos 2 par semaine.
- Lundi 25/1 : revue intermédiaire. Lundi 1/2, 18 h : **go / no-go**.

##### Lancement public — mardi 2/2/2027

Revues J+7 (mar. 9/2), J+14 (mar. 16/2), J+30 (jeu. 4/3). Fin de l'Offre Fondateurs le dimanche 4/4 à 23 h 59.

#### 4.5 Chemin critique (ce qui décale tout s'il glisse)

1. ⚑ **Développement avant soft launch (≈ 30,5 j)** : P0 UI → socle (`PremiumContext`, analytics) → calendrier → rapport → kit → prédictions → produits et sandbox (18/12). Chaque jour de retard ici décale le soft launch, donc le lancement. Le goulot, c'est **la relecture par Yoss** (une PR par jour en moyenne), pas l'écriture du code.
2. ⚑ **Revue App Store de la 1.1.0** (4/1 → 7/1) : un rejet (3.1.2, compte démo, mention santé) coûte 2 à 5 jours.
3. ⚑ **Fenêtre de mesure** : au moins 3 semaines après le soft launch, à cause de l'essai de 14 jours.

Presque critiques (marge de 2 à 5 semaines, à lancer quand même cette semaine) : 12 testeurs Android d'ici le 22/11 → accès production autour du 14/12 (marge ≈ 3 semaines) ; accord Apple payant (marge jusqu'au 18/12) ; compte marchand Google ; médiateur avant la **première vente** (7/1) ; décision de prix le 14/12 ; relecture santé avant le 22/1.

Ne sont plus critiques : captures, fiches, compte de démonstration (logés pendant les fêtes).

#### 4.6 Recrutement des testeurs : mode opératoire

- **Objectif** : 12 inscrits le 22/11 au plus tard, 18 à 20 pour la marge, dont au moins 8 vrais parents. Google pose des questions sur l'engagement et les retours.
- **Google Group** (tâche 1) : un nouvel arrivant rejoint le groupe, puis ouvre `https://play.google.com/apps/testing/com.tesfa.suivibaby` avec le même compte Google. Plus besoin d'ajouter les adresses à la main. Garder les deux listes d'e-mails existantes : on n'en retire personne pendant les 14 jours.
- **Échanges de tests** (complément, pas remplacement) : r/AndroidClosedTesting et le groupe « Testers Community ». Pour chaque appli testée en retour, l'ouvrir tous les 2 ou 3 jours pendant 14 jours. Claude tient le tableau, Yoss le fait sur son téléphone.
- **Suivi quotidien** (C, 2 minutes) : nombre d'inscrits dans Play Console. Rappel aux testeurs à J7 (« pensez à ouvrir l'app »). Si l'on passe sous 12, on le dit à Yoss le jour même.
- **Faire vivre le test** : deux builds pendant la période (1.0.15 le 18/11, 1.0.16 le 2/12), un formulaire de retour en 3 questions, et un journal des changements faits suite aux retours (il sert aux réponses du questionnaire Google).
- À ne pas faire : services payants de testeurs, comptes fictifs.

#### 4.7 Jour J — mardi 2/2/2027

| Heure | Action | Qui |
|---|---|---|
| Lun. 1/2, 18 h | Go / no-go (§4.3) ; mêmes versions iOS et Android en ligne ; site, paywall, CGU et médiateur vérifiés | Y + C |
| 7 h 30 | Contrôle : Sentry, fonctions, webhook RevenueCat, budget GCP | C (rapport) / Y (lit) |
| 8 h 30 | Site mis à jour (prix, badges, Offre Fondateurs avec sa date de fin) | C (hébergement autorisé) |
| 9 h | E-mail aux testeurs et à l'entourage : merci, lien, partage, avis libre | Y (envoie) / C (rédige) |
| 9 h 30 | LinkedIn, Instagram, TikTok | Y |
| 10 h – 12 h | 5 groupes de parents, un message adapté à chacun, règles respectées | Y |
| 12 h | Point 1 : installations, erreurs, réponses à tout | Y + C |
| 14 h | E-mail aux sages-femmes déjà rencontrées, presse locale (Le Parisien 93) | Y |
| 16 h | Point 2 : avis (réponse sous 24 h), support | Y (C rédige) |
| 21 h | Point 3 : coûts du jour, erreurs, correctif ou non demain | Y + C |

**Si quelque chose casse** : registre de `launch-ops.md` §3 (arrêt du déploiement progressif Android, revue accélérée Apple, paiements en panne sans perte d'accès gratuit, coupure de la voix si le coût explose).

#### 4.8 Les 30 premiers jours

Tableau hebdomadaire de `launch-ops.md` §5.1, avec trois changements :
- l'objectif d'abonnés devient **≈ 15** (infra couverte), puis **≈ 85** (SASU couverte) ;
- on ajoute « invitation acceptée sous 7 jours » et « préparer la visite » ;
- l'essai devient de 14 jours (lecture essai → payant à J+15).

Les revues :
- **J+7 (9/2)** : qu'est-ce qui casse ? Où les gens abandonnent-ils ? Quel canal amène vraiment des inscrits ?
- **J+14 (16/2)** : premiers essais arrivés à terme, part d'annuels, usage du rapport gratuit.
- **J+30 (4/3)** : payants contre la trajectoire du §2.4. Faut-il ajuster l'offre (passer à C, revoir le quota vocal gratuit), ou seulement la distribution ? Faut-il développer le widget ? Relance de l'Offre Fondateurs.

---

### 5. Opérations (founder-ops)

#### 5.1 Rythme hebdomadaire, phase de construction (maintenant → 7/1)

Hypothèse : Yoss consacre environ 25 à 30 h par semaine à SuiviBaby **[à confirmer par Yoss : temps réellement disponible]**.

| Jour | Bloc | Contenu | Durée Yoss |
|---|---|---|---:|
| **Lundi** matin | Plan | Claude envoie l'état : PR ouvertes, testeurs inscrits, réponses au sondage, coûts GCP, blocages admin. Yoss choisit les 3 priorités de la semaine | 45 min |
| Lundi → jeudi | Construire | Claude code une PR par jour (petites, testées). **Yoss relit et teste sur appareil chaque jour**, puis donne son « go » | 1 h 30 par jour |
| **Mercredi** soir | Train de release | Build iOS (EAS, envoi automatique vers App Store Connect et TestFlight) et .aab Android local vers Alpha. Jamais le vendredi | C ; 15 min Y |
| **Jeudi** | Distribution | Recrutement des testeurs, groupes, sondage ; à partir de janvier, vidéos et terrain | 2 h |
| **Vendredi** matin | Admin | Apple, Google, médiateur, banque, comptable, justificatifs (§5.3) | 1 h 30 |
| Chaque jour | Contrôle | Nombre de testeurs inscrits (alerte de Claude si < 12), retours des testeurs | 10 min |
| Week-end | Rien | Sauf alerte critique | — |

**Après le soft launch** : le rythme de `launch-ops.md` §4.2 s'applique (revue des chiffres le lundi, construction le mardi et le mercredi, release le mercredi, distribution le jeudi, admin le vendredi, astreinte légère le week-end), avec le cycle quotidien de 30 à 45 minutes (support, avis, RevenueCat, Sentry).

#### 5.2 Qui fait quoi

**Yoss seul** (identité, signature, argent, responsabilité, voix publique) :
- Comptes et accords : Apple (entité, D-U-N-S, Paid Apps, DSA, W-8BEN-E, banque), Google (profil marchand, DSA, demande d'accès production), RevenueCat (dépôt de la clé .p8 et du compte de service).
- Contrats : CM2C, assurance RC pro, comptable, INPI, domiciliation éventuelle, relecteur santé, avocat.
- Décisions : prix (14/12), architecture, « go » de chaque PR, mise en production Android, publication iOS, go / no-go du 1/2.
- Publications sous son nom : posts dans les groupes, vidéos, e-mails de support, réponses aux avis, terrain auprès des sages-femmes.
- Achats réels de test, tests en retour pour les échanges de tests, tests sur appareil.

**Claude** :
- Tout le code du plan (UI, socle, A, analytics, invitation), avec tests, PR et revue.
- Builds et envois en test (autorisés), soumission App Store Connect ; production Android **sur accord**.
- Saisie dans les consoles avec la session de Yoss (ego-browser) : Google Group (**sur accord**), fiches stores, produits et prix validés, IARC, étiquettes de confidentialité, offerings RevenueCat, droits promotionnels des testeurs.
- gcloud : alertes budget, export de facturation (autorisé).
- Rédaction : sondage, analyse des prix, posts, scripts vidéo, flyer, CGU et page testeurs (à valider), réponses au questionnaire Google, réponses types, rapport du lundi.
- Site : pages légales, page testeurs, mises à jour (hébergement autorisé).
- Jamais : manipuler les secrets (.p8, JSON de compte de service), signer, saisir des données bancaires ou fiscales, publier sous l'identité de Yoss sans son accord, envoyer des messages privés à des inconnus.

#### 5.3 Administratif et juridique de la SASU (avant la première vente, le 7/1)

| Tâche | Qui | Échéance | Source |
|---|---|---|---|
| Médiateur CM2C signé, affiché dans les CGU et les mentions | Y (signe) / C (pages) | 15/11 → pages le 20/11 | [economie.gouv.fr/mediation-conso](https://www.economie.gouv.fr/mediation-conso) |
| CGU et CGV : prix TTC, renouvellement, essai de 14 jours, résiliation via le store, rétractation, définition de « à vie », préavis de 6 mois, conditions testeurs, Offre Fondateurs datée | C rédige / Y valide (relecture par un avocat recommandée) | 27/11 | — |
| Numéro de TVA intracommunautaire actif ; régime de TVA et éventuelle DES à confirmer avec le comptable | Y | 27/11 | Comptable |
| W-8BEN-E (Apple, Google) | Y | 25/11 | — |
| Statut de commerçant DSA (Apple, Google) ; adresse publique | Y | 13/11 | — |
| RC professionnelle (éditeur de logiciel, données d'enfants) : 2 ou 3 devis | Y | 18/12 | **[à confirmer]** |
| RGPD : registre à jour (retrait des « insights IA », analytics internes), AIPD pour les données de santé d'enfants, décision écrite sur le DPO | C rédige / Y signe | 18/12 | [cnil.fr](https://www.cnil.fr) |
| Question HDS et dispositif médical (rapport destiné au pédiatre, prédictions) | Y (avocat ou CNIL) | 22/1 | **[à confirmer]** |
| Dépôt INPI semi-figuratif « SuiviBaby » | Y | après la recherche d'antériorité, avant le 2/2 | [inpi.fr](https://www.inpi.fr) |
| Facture électronique : capacité de **réception** via une plateforme agréée (depuis le 1/9/2026) | Y + comptable | 18/12 | **[à confirmer]** |
| Rémunération du président en 2027 (impact URSSAF) | Y + comptable | 31/12 | — |

Le récurrent (justificatifs chaque semaine, TVA, rapprochement Apple et Google, comptes annuels, CFE, renouvellements) est décrit dans `launch-ops.md` §4.6, sans changement.

#### 5.4 Outils : ce qui change

- **Tally** (gratuit) pour le sondage. **Google Groups** (gratuit) pour les testeurs.
- **Analytics internes** : événements agrégés écrits par l'app, sans tiers, cohérents avec la promesse « sans traqueur ». Pas de SDK d'analytics externe.
- **Export de facturation GCP vers BigQuery** (levier 0) : coût quasi nul à ce volume **[à confirmer]**.
- Le reste ne change pas : Firebase UE, RevenueCat (gratuit sous 2 500 $ de revenu mensuel), Sentry, AssemblyAI et Haiku, CM2C.

#### 5.5 Registre des risques (les 10 premiers)

| # | Risque | Probabilité | Gravité | Plan |
|---|---|---|---|---|
| 1 | **Le développement déborde** (30,5 j estimés, relecture par une seule personne, estimations tirées du code) | Élevée | Élevée (décale le 2/2) | Petites PR quotidiennes ; si le 18/12 n'est pas tenu pour les prédictions, utiliser les fêtes ; au-delà du 8/1, décaler le public au 16/2 plutôt que de livrer des prédictions bâclées |
| 2 | **Conversion faible** (gratuit généreux, rapport jugé « sympa ») | Élevée | Élevée | Ligne de succès écrite ; mesurer « préparer la visite » ; plan B = C (Famille) ou contenu revu, pas une baisse de prix réflexe |
| 3 | **Testeurs Android insuffisants** ou désinscrits | Moyenne | Moyenne (marge d'environ 3 semaines) | Google Group, 18-20 visés, contrôle quotidien, rappel à J7, deux builds |
| 4 | **Prédictions perçues comme fausses**, d'où de mauvais avis | Moyenne | Moyenne | Fourchette, données utilisées affichées, désactivables, wording « estimation » |
| 5 | **Rejet App Store** de la 1.1.0 (3.1.2, démo, santé) | Moyenne | Moyenne (2-5 j sur le chemin critique) | Paywall de la PR #70, compte démo complet, notes de revue, aucune promesse non livrée ; soumission le lundi 4/1, pas plus tard |
| 6 | **Allégation santé** ou contenu d'examen inexact | Faible à moyenne | Élevée (image, retrait) | Kit sourcé, relecture professionnelle avant le 22/1, liste §2.9, mention permanente |
| 7 | **Fondateur saturé** (relecture + admin + terrain + vidéos) | Élevée | Moyenne | Terrain et vidéos seulement à partir de janvier ; Claude prépare tout ; 3 priorités par semaine, pas plus |
| 8 | **Accord Apple ou compte marchand lent** | Moyenne | Faible maintenant (marge jusqu'au 18/12), élevée au-delà | Lancer cette semaine, relancer à J+5 ; si bloqué le 18/12, soft launch Android d'abord |
| 9 | **Sondage trop maigre** (< 45 réponses) | Moyenne | Faible | Règle de repli écrite (A à 3,49 € / 24,99 €), le soft launch tranche |
| 10 | **Concurrence sur la voix** (« saisie IA » de Huckleberry, si elle marche en français) | Moyenne | Moyenne | Ne pas faire de la voix l'argument principal de Premium ; l'examen français reste le créneau |

Risques secondaires : promesse testeurs mal comprise (d'où la page en 6 points), période des fêtes (attention des parents dispersée), vacances d'hiver de février (zone C) qui pourraient affaiblir un repli au 16/2 **[à vérifier]**, coût du gratuit sous-estimé faute de facture détaillée (levier 0 en premier).

---

### 6. Questions ouvertes pour Yoss

1. **Date** : valides-tu le 2/2/2027 (soft launch le 7/1), ou préfères-tu un lancement public gratuit le 5/1 avec Premium en février (§4.1) ?
2. **Temps disponible** par semaine (relecture, terrain, vidéos) : le plan suppose 25 à 30 h.
3. **Google Group** : j'ai ton accord pour le créer avec ton compte via ego-browser et l'ajouter dans Play Console ?
4. **Nom** : « SuiviBaby » en un mot partout, et « SuiviBaby : suivi bébé partagé » sur les stores ?
5. **Promesse testeurs** : valides-tu les 6 points du §3.2, notamment l'exclusion d'un futur niveau « Famille » et la date limite du 6/1 ?
6. **Médiateur** : CM2C signé d'ici dimanche 15/11 ?
7. **Relecteur santé** : une sage-femme ou un pédiatre dans ton entourage pour le kit et les seuils ?
8. Compte Apple Developer individuel ou TESFA ? Adresse publique pour le DSA ?

---

### 7. Limites

- Les efforts de développement viennent de `v2-offers.md` et de l'audit UI. Ce sont des **estimations tirées du code**, sans historique de vélocité.
- Les conversions (4-5 %) et les volumes d'inscrits sont des **hypothèses**. Les trajectoires de payants du §2.4 servent à fixer des cibles, pas à prévoir.
- Le panel est simulé. Le vrai test, ce sont le sondage (§4.2 a) et le soft launch (§4.2 b).
- Délais des stores, tarifs INPI, obligations fiscales et calendrier des fêtes Apple : à vérifier à la source.
- Aucune recherche de marque, de domaine ou de compte n'a été faite : ce sont des vérifications à faire par Yoss.

## Not done yet

- The competition: run /founder-competitors
- The buyer panel: run /founder-consumer
- Pricing: run /founder-pricing
- Brand: run /founder-brand
- Operations: run /founder-ops
- Launch plan: run /founder-launch

_The panel is simulated buyers and the numbers are projections from your inputs. Confirm demand with real customers and costs with real quotes before you spend. Not financial, legal or tax advice._
