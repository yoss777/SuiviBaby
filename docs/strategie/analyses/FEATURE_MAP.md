# SuiviBaby — Carte fonctionnelle complète

> Établie le 2026-11-12 sur la branche `fix/premium-offer-compliance` (commit `eeed711`), en lecture seule.
> Sources : `graphify-out/GRAPH_REPORT.md` (3 119 nœuds, 123 communautés), lecture des routes `app/`, des services/contexts/hooks, de `functions/index.js` et `functions/src/**`, de `firestore.rules`, et de `docs/PREMIUM_OFFRE_CIBLE.md`.
> Les chemins sont relatifs à `/Users/yoss/Projects/Samaye`. `fichier:ligne` pointe vers le point d'entrée (composant ou export).
> **Limite importante** : il n'y a aucune donnée d'usage réelle dans le repo. `services/onboardingAnalytics.ts` n'écrit que dans AsyncStorage, en local, et rien ne remonte. Les classements « valeur » et « coût » ci-dessous s'appuient donc sur le code (centralité, fréquence d'appel, déclencheurs), pas sur la télémétrie.

---

## 0. Architecture en une minute

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

## 1. Inventaire des fonctionnalités par domaine

Légende maturité : **solide** = complet et durci (tests, idempotence, règles) · **partiel** = marche mais incomplet ou incohérent · **stub** = UI factice ou backend absent · **mort** = non atteignable ou jamais appelé.

### 1.1 Compte, authentification, onboarding

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

### 1.2 Enfants et sélection

| Fonctionnalité | Ce que l'utilisateur peut faire | Point d'entrée | Données | Serveur | Gating | Maturité | Écarts |
|---|---|---|---|---|---|---|---|
| Ajouter un enfant | Nom, date de naissance, sexe | `app/(drawer)/add-baby.tsx:29` | `children`, `children/{id}/access/{uid}`, `user_child_access` | — | Gratuit, enfants illimités (décision 2026-11-11) | solide | — |
| Choisir l'enfant actif | Sélecteur au boot et dans le drawer | `app/child-picker.tsx:39`, `app/boot.tsx:572`, `components/drawer/CustomDrawerContent.tsx` | `BabyContext` | — | Gratuit | solide | — |
| Modifier un enfant | Profil et allergies (`components/forms/AllergiesEditor.tsx`) | `app/settings/edit-child.tsx:62` | `children` | — | Gratuit | solide | — |
| Masquer des enfants | Retirer un enfant de sa liste sans le supprimer | `app/settings/hidden-children.tsx:35` | `users` (liste masquée) | — | Gratuit | solide | — |
| Supprimer un enfant | Demande de suppression avec **vote** si plusieurs propriétaires, transfert de propriété avant de partir | `app/settings/deletion-requests.tsx:73`, `components/suivibaby/DeletionRequestNotifier.tsx`, `components/ui/OwnershipTransferModal.tsx` | `childDeletionRequests`, soft-delete puis purge | `createDeletionRequest`, `voteDeletionRequest`, `cancelChildDeletion`, `transferAndLeave`, `getOwnershipBlockers`, `purgeDeletedChildren` (quotidien) (`functions/src/deletion/child.js:15-456`) | Gratuit | solide | — |
| Rattachement de « bébé simulé » | Approuver des demandes d'attachement | `app/suivibaby/pending-requests.tsx:26`, `services/babyAttachmentService.ts` | `babies`, `babyAttachmentRequests` | — | — | **mort** | Écran orphelin, e-mail codé en dur `parent@example.com` (l.30). Ces collections ne figurent pas dans `firestore.rules` : la règle par défaut refuse tout (l.693). |

### 1.3 Boucle de suivi quotidien (le cœur du produit)

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

### 1.4 Souvenirs : moments, jalons, galerie

| Fonctionnalité | Ce que l'utilisateur peut faire | Point d'entrée | Données | Serveur | Gating | Maturité | Coûts | Écarts |
|---|---|---|---|---|---|---|---|---|
| Moments (onglet) | Humeur du jour (1 à 5), vue semaine, timeline, galerie Polaroid, likes et commentaires, badge « nouveaux moments » | `moments.tsx:51`, `components/moments/*`, `hooks/useMomentsData.ts`, `contexts/MomentsNotificationContext.tsx` | `events` (jalon `humeur`/`photo`), `eventLikes`, `eventComments` | — | Gratuit | solide | Listeners likes et commentaires (500 docs chacun par enfant, `services/socialService.ts:607-655`) et jalons (100) | Animations lourdes (confettis, particules). |
| Jalons | Dents, premiers pas, sourires, mots, photo | `milestones.tsx:281`, `components/forms/MilestonesForm.tsx`, `services/events/milestonePhoto.ts` | `events`, Storage `children/{id}/…` | `generatePhotoThumbnail` (400 px) | Gratuit | solide | Storage (photos 1 600 px JPEG et miniatures) | — |
| Galerie | Grille de photos, plein écran, likes et commentaires, signalement | `gallery.tsx:410`, `components/moments/SwipeGallery.tsx` | idem | `submitContentReportCF` | Gratuit | solide | Egress Storage | — |
| Photos masquées | Masquer une photo pour soi | `app/settings/hidden-photos.tsx:35` | `user_hidden_photos` | — | Gratuit | solide | — | — |
| Modération | Signaler une photo ou un commentaire ; masquage automatique si signalé par le propriétaire ou par 2 personnes ; e-mail à l'admin ; push à l'auteur | `components/moments/ReportModal.tsx`, `services/contentReportService.ts` | `reports` | `submitContentReportCF`, `onReportCreated`, `handleReportCreated`, `resolveReport` (admin) (`functions/src/moderation/reports.js`) | Gratuit | solide | Resend et push | La résolution passe par des scripts (`scripts/resolveReport.mjs`, `listOpenReports.mjs`) : pas de console admin. |
| Célébration de jalons d'usage | Modale « 1 mois de suivi », « 100e repas », « nuit de 6 h » ; **séries de jours consécutifs réservées à Premium** | `components/suivibaby/home/HomeMilestoneCelebration.tsx:44` (`checkFeatureAccess("milestones_capsule")`), `services/milestoneCelebrationService.ts:193` | AsyncStorage / `user_content` | — | Mixte : séries = Premium | solide | — | Restriction Premium **non annoncée** dans le paywall (`app/settings/premium.tsx:73-95`). Pas illégal (c'est un bonus), mais incohérent avec la règle « ne lister que ce qui est réservé ». |

### 1.5 Fonctions « intelligentes » (dérivées)

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

### 1.6 Partage et co-parentalité

| Fonctionnalité | Ce que l'utilisateur peut faire | Point d'entrée | Données | Serveur | Gating | Maturité | Écarts |
|---|---|---|---|---|---|---|---|
| Partager un enfant (code) | Générer un code à usage unique valable 7 jours | `app/(drawer)/share-child.tsx:37`, `services/childSharingService.ts:61` | `shareCodes` | `createShareCode`, `redeemShareCodeCF`, `cleanupExpiredShareCodes` (quotidien) | **Gratuit et illimité** (décision 2026-11-11) | solide | — |
| Invitation par e-mail | Invitation in-app, acceptée via `InvitationListener` | `share-child.tsx`, `components/ui/InvitationListener.tsx`, `InvitationModal.tsx` | `shareInvitations` | `createShareInvitation`, `acceptInvitationCF` (`functions/src/sharing/invitations.js:10,129`) | Gratuit | solide | Pas d'e-mail réel : l'invité doit déjà avoir l'app. La page `public/invite.html` existe. |
| Rejoindre un enfant | Saisir un code | `app/settings/join-child.tsx:64` | — | `redeemShareCodeCF` | Gratuit | solide | — |
| Gérer les accès | Lister les membres, changer le rôle Parent/Proche, retirer quelqu'un | `manage-access.tsx:200` | `children/{id}/access` | `setMemberRole` | Gratuit (propriétaire seulement) | solide | — |
| Index d'accès | Réconciliation nocturne de `user_child_access` | — | — | `reconcileAccessIndexNightly` (3 h 15) | — | solide | — |

### 1.7 Hors ligne et synchronisation

| Fonctionnalité | Détail | Point d'entrée | Maturité |
|---|---|---|---|
| File hors ligne | SQLite `pending_events`, 3 essais, backoff jusqu'à 5 min, 8 échecs transitoires tolérés, créations de plus de 25 jours abandonnées, idempotence | `services/offlineQueueService.ts:46-63,282,416`, `hooks/useFailedWrites.ts`, `utils/queuedWriteLabel.ts` | solide |
| Affichage optimiste | Store optimiste et fusion avec le serveur | `services/optimisticEventsStore.ts`, `hooks/useMergedOptimisticEvents.ts` | solide |
| Rafraîchissement au premier plan | Relecture serveur au retour dans l'app | `hooks/useForegroundServerRefresh.ts` | solide (mais coûte des lectures) |
| Bannière hors ligne | `components/ui/OfflineBanner.tsx` | — | **mort** (jamais importée) |
| Avertissement export | Bloque ou avertit si des écritures sont en attente | `services/exportCollector.ts:28` | solide |

### 1.8 Exports

| Format | Où | Contenu | Gating | Maturité | Écarts |
|---|---|---|---|---|---|
| CSV (tous les événements d'un enfant) | Plus > Exporter (`app/(drawer)/baby/(tabs)/plus.tsx:190`, `services/exportService.ts:125`) | Tous les types | Gratuit | solide | — |
| JSON (sauvegarde complète, portabilité RGPD art. 20) | `app/settings/export.tsx:270` | Enfants sélectionnés, filtrés selon le rôle (`exportCollector.ts:72`) | Gratuit (doit le rester) | solide | — |
| PDF « rapport » | Stats (`stats.tsx:938`), généré dans l'app (expo-print) | Tétées, pompages, sommeil, allergies | 1 gratuit, puis Premium | partiel | Ce n'est pas le « rapport pédiatre » promis (pas de courbes OMS, de santé ni de vaccins, cf. `docs/PREMIUM_OFFRE_CIBLE.md` §3). Quota consommé côté client après succès. |
| Fichiers temporaires | Nettoyés au bout d'1 h (`services/tempShareService.ts:12`) | — | — | solide | — |
| Sauvegarde / restauration | `app/settings/backup.tsx:15` | — | — | **stub** | UI entièrement factice : date « 26 décembre 2025 » et taille « 45.2 MB » codées en dur, alertes de succès simulées. Orpheline. Ne surtout pas la relier en l'état. |

### 1.9 Notifications

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

### 1.10 Monétisation

| Fonctionnalité | Point d'entrée | Serveur | Maturité | Écarts |
|---|---|---|---|---|
| Paywall et achat (mensuel 3,99 €, annuel 29,99 €, à vie 79,99 € ; essai lu depuis le store) | `app/settings/premium.tsx:116`, `utils/premiumOffer.ts:22`, `services/revenueCatService.ts` | `revenueCatWebhook` (HTTP), `cleanupExpiredSubscriptions` (quotidien) (`functions/src/billing/revenuecat.js:236,24`) | solide (conforme aux stores depuis `70ddab0`/`eeed711`) | — |
| État d'abonnement côté client | `contexts/PremiumContext.tsx` (RevenueCat d'abord, Firestore en secours, cache 7 jours) | `subscriptions/{uid}` | partiel | Quand RevenueCat répond, le `tier` Firestore est ignoré (l.201-222) : un Premium accordé côté serveur seulement (parrainage) est invisible dans l'app. En secours Firestore, `isPremium` ne regarde que `tier`, pas `status` (l.287) : il dépend du job quotidien d'expiration. |
| Quotas serveur | `services/premiumUsageService.ts` | `getUsageQuotaStatus`, `consumeUsageQuota` (`functions/src/billing/usage.js:9,46`), `quotas.js` | solide | — |
| Parrainage | Drawer > `ReferralCard` (`components/suivibaby/dashboard/ReferralCard.tsx:42,102`), visible seulement si l'option marketing est activée | `ensureReferralCode`, `validateReferralCode` (1 mois Premium au filleul, et au parrain dans la limite de 10) (`functions/src/billing/referral.js:31,77`) | **partiel / cassé** | **`validateReferralCode` n'est appelé nulle part dans l'app** : on peut partager son code, mais personne ne peut le saisir. Pourtant la carte promet « 1 mois Premium offert ». C'est une promesse non tenue, donc un risque de conformité. |
| Promotions | Drawer > `PromoBanner`, `services/promoService.ts` | `promotions`, `user_promos` (impressions, clics) | partiel | Désactivé tant que l'option marketing n'est pas cochée (off par défaut). |
| Grandfathering | `PremiumContext.tsx:296` | `subscriptions.grandfathered` | solide | — |

### 1.11 Admin et ops

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

## 2. Gating Free / Premium aujourd'hui (état réel du code)

| Fonctionnalité | Gratuit | Premium | Où c'est appliqué |
|---|---|---|---|
| Commandes vocales | 3/jour (minuit, heure de Paris) | 50/jour | **Serveur** : `functions/src/billing/quotas.js:5-9,91` (réservation transactionnelle, remboursement en cas d'échec). Client : `hooks/useVoiceInput.ts`. |
| Export PDF | 1 au total | Illimité | Client `stats.tsx:944` + `premiumGatingService.ts:67` ; compteur serveur `usage_limits.pdfExportCount`. |
| Célébration des séries de jours consécutifs | non | oui | Client `HomeMilestoneCelebration.tsx:47` |
| Enfants, partage, stats, courbes OMS, insights, export CSV/JSON, rappels, récap | illimité | — | `FREE_FEATURES` (`PremiumContext.tsx:100`), `getSharingQuotaStatus` |
| Définis mais **non implémentés** : `unlimited_history`, `ai_insights`, `widgets`, `pediatre_report`, `night_mode_premium` | — | — | `PremiumContext.tsx:34-95` (types sans effet) |

**Résumé** : aujourd'hui, Premium = plus de voix + PDF illimité. Rien d'autre de substantiel.

---

## 3. Dormant / mort (présent dans le code, absent de l'UI)

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

## 4. Écarts et bugs notables (par priorité)

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

## 5. Moteurs de coût

### 5.1 Inventaire

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

### 5.2 Les 10 fonctionnalités les plus coûteuses par utilisateur actif (estimation sur le code)

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

## 6. Les 10 fonctionnalités les plus utiles aux parents (estimation sur le code)

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

## 7. Lecture produit : ce qui peut être Premium, ce qui doit rester gratuit

### Doit rester gratuit (boucle cœur, sécurité, légal)
- Saisie de tous les types d'événements, accueil, journal, minuteurs.
- Partage et rôles (chaque proche invité est un nouvel utilisateur : c'est l'acquisition).
- Alertes santé (fièvre) : question éthique et risque d'image.
- Courbes OMS et stats de base (décision Q7 déjà prise).
- Export JSON/CSV (portabilité RGPD art. 20), suppression, consentement.
- File hors ligne, rappels de base, insights déterministes de base.
- Un petit quota voix (3/jour) pour faire découvrir la fonctionnalité.

### Candidats crédibles pour Premium (utiles, récurrents, défendables)
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

## 8. Annexe : exports Cloud Functions (46)

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
