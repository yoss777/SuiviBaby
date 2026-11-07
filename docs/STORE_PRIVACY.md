# Fiches confidentialité des stores (S10.5)

Réponses à donner dans **App Store Connect → Confidentialité de l'app**
(étiquette « nutrition ») et **Play Console → Contenu de l'app → Sécurité des
données**, déduites des flux réels du code (branche `sprint-10/site-stores`,
7 nov. 2026). À comparer avec ce qui est déclaré aujourd'hui dans les deux
consoles, puis à corriger.

Légende : « lié » = lié à l'identité de l'utilisateur (Apple) ; « Tracking » =
suivi publicitaire au sens d'ATT (Apple). Les chemins `fichier:ligne` renvoient
à l'état actuel du code.

---

## 1. Flux de données réels (constat)

| Flux | Données qui quittent l'appareil | Destinataire | Rôle | Preuve |
|---|---|---|---|---|
| Compte | E-mail, pseudonyme (`userName` = nom d'affichage Google/Apple, ou préfixe de l'e-mail), méthode de connexion, `lastLogin` | Firebase Auth + Firestore `users/{uid}` (UE, eur3) | Sous-traitant | `services/userService.ts:46-52`, `services/socialAuthService.ts:53`, `:147-159` |
| Sign in with Apple | Jeton de rafraîchissement Apple (pour révoquer à la suppression) | Firestore + Apple | Sous-traitant / responsable distinct | `functions/index.js:394-401`, `:3067` |
| Profil enfant | Prénom, date de naissance, sexe, e-mail du parent propriétaire | Firestore `children` | Sous-traitant | `app/(drawer)/add-baby.tsx:218-228` |
| Suivi santé | Repas, sommeil, couches, température, médicaments, symptômes, vaccins, croissance, jalons, notes | Firestore `events` via Cloud Functions (europe-west1) | Sous-traitant | `functions/index.js:2683` (`validateAndCreateEvent`), `:2782` |
| Photos | Photos de jalons / souvenirs | Firebase Storage `samaye-53723-photos-eu` (+ bucket hérité US en migration) | Sous-traitant | `services/events/milestonePhoto.ts:77`, `:100-106`, `utils/photoStorage.ts:8-11`, `functions/index.js:64-70` |
| Partage | E-mail de la personne invitée (saisi par l'utilisateur), codes, rôles ; commentaires et likes | Firestore | Sous-traitant | `functions/index.js:1705-1732`, `services/socialService.ts:131`, `:398` |
| Signalements | Motif, message libre, chemin de la photo, e-mail du signaleur → e-mail à `contact@suivibaby.com` | Firestore + Resend | Sous-traitant | `functions/index.js:2047`, `:1840-1885` |
| Consentement santé | Version, horodatage serveur, plateforme | Firestore `consent_records` (conservé 5 ans après suppression) | Sous-traitant | `functions/index.js:2968-3010`, `:83`, `:509-531` |
| Usage interne | Quotas (voix/jour, exports PDF), favoris et avis sur les conseils | Firestore | Sous-traitant | `functions/index.js:1578`, `:1615`, `services/smartContentService.ts:179` |
| Push | Jeton Expo + plateforme + `userId` ; texte des notifications : **prénom de l'enfant + type d'événement + délai** (« Rappel repas — Léa / Plus de 3h depuis le dernier repas ») | Firestore `device_tokens` ; Expo (650 Industries, US) → APNs / FCM | Sous-traitant | `services/pushTokenService.ts:55`, `:76-85`, `functions/index.js:27-29`, `:4663-4664`, `:4676`, `:1992-1998` |
| Commande vocale (facultative) | Audio (base64) → Cloud Function → **AssemblyAI** (upload + transcription FR, puis suppression du transcript) ; texte transcrit + heure locale → **Anthropic** (sans uid ni profil enfant) ; cache du texte 5 min dans Firestore (clé = uid) | AssemblyAI (US), Anthropic (US) | Sous-traitants | `services/voice/recorder.ts:267-275`, `functions/index.js:1093-1345`, `:1030-1075`, `:1356-1410`, `:1486-1545`, `functions/lib/voiceParse.js` (aucun nom/uid), `services/voiceNoticeService.ts:11-15` |
| E-mails | Demande de suppression, confirmation de suppression, récap hebdo (**opt-in**, prénom de l'enfant seulement), issue d'un signalement | Resend (US) | Sous-traitant | `functions/index.js:4252`, `:4455`, `:4823`, `:4897-4915`, `:2333` |
| Diagnostics | Crashs, erreurs, traces de performance (20 %), sessions (release health), breadcrumbs filtrés ; pas de `setUser` dans le code ; `sendDefaultPii: false` ; filtres : e-mails masqués, clés sensibles supprimées, `user` réduit à `{id}` s'il existe | Sentry, région UE (`ingest.de.sentry.io`) | Sous-traitant | `app/_layout.tsx:43-60`, `utils/sentryFilters.ts:14-15`, `:76`, `.env` (DSN) |
| Intégrité | Jetons App Attest / DeviceCheck (iOS), Play Integrity (Android) | Firebase App Check (Google/Apple) | Sous-traitant | `config/appCheck.ts:121-130` |
| Achats | **Aucun aujourd'hui en production** : clés RevenueCat = `PLACEHOLDER` → `getApiKey()` renvoie `null` et le SDK n'est **pas initialisé** dans les builds de production. Une fois les clés mises : uid Firebase (`Purchases.logIn`), historique d'achat, identifiants appareil collectés par le SDK ; webhook → `subscriptions/{uid}` | RevenueCat (US) | Sous-traitant | `services/revenueCatService.ts:19-34`, `:51-72`, `:87-90`, `contexts/PremiumContext.tsx:165`, `:196`, `functions/index.js:3353`, `:3546` |
| Analytics | **Aucun envoi** : `onboardingAnalytics` écrit uniquement dans AsyncStorage (pas de Firebase Analytics, Amplitude, etc. dans `package.json`) | — | — | `services/onboardingAnalytics.ts:1-50` |
| Publicité | Aucune ; pas de permission `AD_ID` dans le manifeste de l'AAB (`build-1794037372995.aab` vérifié) ; `NSPrivacyTracking = false` | — | — | `ios/SuiviBaby/PrivacyInfo.xcprivacy` |

Code dormant à surveiller : `services/aiInsightsService.ts:58-60`, `:259-280`
appelle une Cloud Function `generateAiInsight` qui **n'existe pas** dans
`functions/` et n'est appelée par aucun écran. Si elle est un jour branchée,
elle enverrait profil enfant et événements « anonymisés » à Claude : nouvelle
finalité à ajouter à la politique et aux fiches.

Chiffrement en transit : oui partout (SDK Firebase, callables HTTPS, upload
Storage en `https://firebasestorage.googleapis.com`, Sentry, Expo, Resend,
AssemblyAI, Anthropic en HTTPS).

---

## 2. App Store — « Confidentialité de l'app »

Réponse préalable : **« Oui, nous collectons des données »**. Tracking : **Non**
pour toutes les catégories (pas d'ATT nécessaire).

| Catégorie Apple | Type | Collecté | Finalité(s) | Lié | Tracking | Preuve |
|---|---|---|---|---|---|---|
| Coordonnées | **Adresse e-mail** | Oui | Fonctionnalités de l'app | Oui | Non | `services/userService.ts:46`, `functions/index.js:1716-1732` (invités) |
| Coordonnées | **Nom** (pseudonyme / nom Google-Apple, prénom de l'enfant) | Oui | Fonctionnalités de l'app | Oui | Non | `services/socialAuthService.ts:53`, `app/(drawer)/add-baby.tsx:219` |
| Santé et forme | **Santé** (suivi, température, médicaments, symptômes, vaccins, croissance, date de naissance et sexe de l'enfant) | Oui | Fonctionnalités de l'app | Oui | Non | `functions/index.js:2683`, `app/(drawer)/add-baby.tsx:220-221` |
| Contenu utilisateur | **Photos ou vidéos** | Oui | Fonctionnalités de l'app | Oui | Non | `services/events/milestonePhoto.ts:77` |
| Contenu utilisateur | **Données audio** (commande vocale) | Oui | Fonctionnalités de l'app | Oui | Non | `services/voice/recorder.ts:267`, `functions/index.js:1198-1225` |
| Contenu utilisateur | **Autre contenu utilisateur** (notes, commentaires, signalements, texte dicté) | Oui | Fonctionnalités de l'app | Oui | Non | `services/socialService.ts:398`, `functions/index.js:2047` |
| Identifiants | **Identifiant utilisateur** (uid Firebase) | Oui | Fonctionnalités de l'app | Oui | Non | `services/pushTokenService.ts:79` |
| Identifiants | **Identifiant de l'appareil** (jeton push Expo ; jetons App Check) | Oui | Fonctionnalités de l'app | Oui | Non | `services/pushTokenService.ts:55`, `config/appCheck.ts:121-130` |
| Données d'utilisation | **Interactions avec le produit** (quotas, favoris/avis sur les conseils) | Oui | Fonctionnalités de l'app | Oui | Non | `functions/index.js:1615`, `services/smartContentService.ts:179` |
| Diagnostics | **Données de plantage** | Oui | Fonctionnalités de l'app | **Non** | Non | `app/_layout.tsx:43-60` |
| Diagnostics | **Données de performances** | Oui | Fonctionnalités de l'app | **Non** | Non | `app/_layout.tsx:54-57` |
| Diagnostics | **Autres données de diagnostic** (breadcrumbs filtrés, sessions) | Oui | Fonctionnalités de l'app | **Non** | Non | `utils/sentryFilters.ts` |
| Achats | **Historique d'achat** | **Pas encore** — à cocher dans la version qui met les vraies clés RevenueCat (lié : oui ; fonctionnalités de l'app) | — | — | — | `services/revenueCatService.ts:19-34` |
| Localisation, Contacts, Infos financières, Historique de navigation/recherche, Infos sensibles, Messages, Publicité | — | Non | — | — | — | aucune API utilisée |

Remarques Apple :
- « Fonctionnalités de l'app » couvre explicitement la réduction des plantages
  et l'amélioration des performances : pas besoin de cocher « Analyses » pour
  Sentry. Cocher « Analyses » en plus n'est pas faux mais n'est pas nécessaire.
- Diagnostics « non lié » : aucun `Sentry.setUser` dans le code et le filtre
  ne garde que `user.id`. Le SDK natif peut toutefois poser un identifiant
  d'installation aléatoire (pas l'uid) : cela reste « non lié ».
- Données audio : l'audio transite et reste chez AssemblyAI le temps de la
  transcription (puis suppression avec relance) ; plus long qu'un traitement
  « en temps réel » au sens d'Apple → déclarer.
- Guideline 5.1.2(i) (partage avec une IA tierce) : l'avis vocal avant la
  première utilisation (`services/voiceNoticeService.ts`) y répond ; le citer
  dans les notes de review si Apple pose la question.
- **Manifeste de confidentialité** : `ios/SuiviBaby/PrivacyInfo.xcprivacy` a
  `NSPrivacyCollectedDataTypes` **vide**. Le dossier `ios/` est versionné (pas
  de prebuild sur EAS) : remplir ce fichier avec les mêmes types que ci-dessus
  (cf. checklist).

### Classification et catégorie (Apple)
- Catégorie : **Santé et forme** (principale). **Ne pas** choisir la catégorie
  Enfants (Kids) : l'app est destinée aux parents ; la catégorie Kids
  imposerait l'absence d'analytics/SDK tiers et un contrôle parental.
- Questionnaire d'âge : pas de contenu violent/sexuel ; répondre **Oui** à
  « contenu généré par les utilisateurs » / partage entre utilisateurs
  (commentaires et photos entre parents invités, avec signalement) et
  « informations médicales » de façon occasionnelle (conseils, alertes de
  température, courbes OMS). Résultat attendu : 4+ ou 9+ selon la grille ; à
  vérifier à l'écran.

---

## 3. Google Play — « Sécurité des données »

Questions générales :
- Votre app collecte-t-elle ou partage-t-elle des types de données requis ? **Oui**
- Toutes les données collectées sont-elles chiffrées en transit ? **Oui**
- Proposez-vous un moyen de demander la suppression des données ? **Oui**
- Méthodes de création de compte : **nom d'utilisateur/e-mail + mot de passe** et
  **OAuth (Google, Apple)**.
- URL de suppression de compte : **`https://suivibaby.com/delete-account`**
  (servie par `public/delete-account.html`, réécriture `firebase.json:68-69` ;
  repli : `https://samaye-53723.web.app/delete-account`). Suppression partielle
  des données sans supprimer le compte : **Oui** (suppression d'événements, de
  photos, d'un profil enfant, retrait du consentement).

**Partagé = Non partout** : tous les destinataires (Firebase, AssemblyAI,
Anthropic, Resend, Expo, Sentry, RevenueCat) sont des prestataires agissant
pour notre compte, et le partage entre co-parents est déclenché par
l'utilisateur ; ce ne sont pas des « partages » au sens de Google.

| Catégorie Play | Type | Collecté | Partagé | Éphémère | Facultatif ? | Finalités | Preuve |
|---|---|---|---|---|---|---|---|
| Infos personnelles | **Adresse e-mail** | Oui | Non | Non | Obligatoire | Fonctionnement de l'app, Gestion du compte, Communications du développeur | `services/userService.ts:46`, `functions/index.js:4252` |
| Infos personnelles | **Nom** (pseudonyme, prénom de l'enfant) | Oui | Non | Non | Obligatoire | Fonctionnement de l'app, Gestion du compte | `services/socialAuthService.ts:53`, `app/(drawer)/add-baby.tsx:219` |
| Infos personnelles | **ID utilisateur** (uid) | Oui | Non | Non | Obligatoire | Fonctionnement de l'app, Gestion du compte | `services/pushTokenService.ts:79` |
| Infos personnelles | **Autres infos** (date de naissance, sexe de l'enfant) | Oui | Non | Non | Obligatoire | Fonctionnement de l'app | `app/(drawer)/add-baby.tsx:220-221` |
| Santé et remise en forme | **Infos de santé** | Oui | Non | Non | Obligatoire | Fonctionnement de l'app | `functions/index.js:2683` |
| Photos et vidéos | **Photos** | Oui | Non | Non | Facultatif | Fonctionnement de l'app | `services/events/milestonePhoto.ts:77` |
| Fichiers audio | **Enregistrements vocaux ou audio** | Oui | Non | Non (transcript chez AssemblyAI jusqu'à suppression) | Facultatif | Fonctionnement de l'app | `functions/index.js:1198-1225`, `:1030` |
| Activité dans l'app | **Interactions avec l'app** (quotas, favoris/avis) | Oui | Non | Non | Obligatoire | Fonctionnement de l'app | `functions/index.js:1615`, `services/smartContentService.ts:179` |
| Activité dans l'app | **Autre contenu généré par l'utilisateur** (notes, commentaires, signalements, texte dicté) | Oui | Non | Non | Facultatif | Fonctionnement de l'app, Sécurité/prévention de la fraude (signalements) | `services/socialService.ts:398`, `functions/index.js:2047` |
| Infos et performances de l'app | **Journaux de plantage** | Oui | Non | Non | Obligatoire | Fonctionnement de l'app, Analyses | `app/_layout.tsx:43-60` |
| Infos et performances de l'app | **Diagnostics** (perf, sessions) | Oui | Non | Non | Obligatoire | Fonctionnement de l'app, Analyses | `app/_layout.tsx:54-57` |
| Appareil ou autres ID | **ID d'appareil ou autres** (jeton push, jetons App Check / Play Integrity) | Oui | Non | Non | Obligatoire | Fonctionnement de l'app, Prévention de la fraude/sécurité/conformité | `services/pushTokenService.ts:55`, `config/appCheck.ts:125` |
| Infos financières | **Historique des achats** | **Pas encore** — à cocher avec la version qui active RevenueCat (Facultatif ; Fonctionnement de l'app, Gestion du compte) | | | | | `services/revenueCatService.ts:19-34` |
| Position, Contacts, Messages, Agenda, Fichiers et documents, Historique de navigation, Applis installées | — | Non | | | | | aucune API utilisée (l'export JSON/PDF est partagé par l'utilisateur via la feuille de partage, rien n'est envoyé à nos serveurs) |

### Public cible, Familles et santé (Play)
- **Public cible et contenu** : tranche **18 ans et plus** uniquement. L'app
  s'adresse aux parents ; ne pas cocher de tranche < 13 ans, sinon la politique
  Familles s'applique (SDK certifiés Familles, pas d'Anthropic/AssemblyAI non
  certifiés, etc.). À « L'app pourrait-elle involontairement attirer des
  enfants ? » : **Non** (justification : outil de suivi pour parents, compte
  requis, pas de contenu ludique).
- **Programme Familles / « Approuvé par les enseignants »** : ne pas s'inscrire.
- **Applications de santé** (déclaration obligatoire) : cocher le suivi de santé
  / bien-être (suivi de l'alimentation, du sommeil, de la croissance d'un
  nourrisson) ; ce n'est **pas** un dispositif médical, pas d'usage clinique.
- **Identifiant publicitaire** : **Non** (pas de permission `AD_ID` dans l'AAB).
- Classification IARC : pas de violence/sexe ; répondre Oui au partage de
  contenus entre utilisateurs (photos/commentaires entre co-parents invités).

---

## 4. Suppression et conservation (rappel pour les deux consoles)

- In-app : Paramètres → Supprimer le compte (`app/(drawer)/settings.tsx:570`,
  `services/accountDeletionService.ts:252`) → `requestAccountDeletion`
  (`functions/index.js:4281`), délai de grâce **30 jours**
  (`functions/index.js:4216`), purge par `processScheduledDeletions`
  (`:4411`) : Auth, profil, photos, accès, jetons push, révocation Apple, puis
  e-mail de confirmation (`:4455`).
- Web : `public/delete-account.html` (méthode e-mail `privacy@suivibaby.com`).
- Conservation : enfant supprimé 30 j (`:54`), journaux 90 j (`:56`),
  invitations 7 j (`:58`), cache vocal 5 min / TTL (`:1172`), preuve de
  consentement 5 ans (`:83`), saisies dans un carnet partagé conservées
  anonymisées pour les autres parents.

---

## 5. Questions ouvertes pour Yoss

1. **Contrats « pas d'entraînement »** : confirmer par écrit (DPA / conditions
   commerciales) qu'AssemblyAI et Anthropic n'utilisent pas les données pour
   entraîner leurs modèles et la durée de rétention côté prestataire
   (Anthropic API : rétention par défaut des entrées/sorties ; ZDR ?). La
   politique contient encore « [À VÉRIFIER] ».
2. **Sentry** : le réglage projet « Prevent Storing of IP Addresses » / data
   scrubbing serveur est-il activé ? (sinon l'IP est stockée côté Sentry, à
   mentionner). Confirmer aussi sur un vrai événement qu'aucun `user.id`
   autre qu'un identifiant d'installation n'arrive.
3. **Analytics** : aucun fournisseur aujourd'hui (les événements d'onboarding
   restent sur l'appareil). Un fournisseur est-il prévu (Firebase Analytics,
   cf. commentaire `services/onboardingAnalytics.ts:3`) ? Si oui : nouvelle
   ligne « Analyses » dans les deux fiches, mise à jour de la politique et du
   manifeste.
4. **RevenueCat** : date de mise en place des vraies clés ; ce jour-là, cocher
   « Historique d'achat » (Apple) / « Historique des achats » (Play) et
   compléter le manifeste iOS. Activer ou non les attributs d'abonné (e-mail,
   IDFA) côté RevenueCat ? (recommandé : non).
5. **Ce qui est déclaré aujourd'hui dans les consoles** : non visible depuis le
   dépôt. `docs/STORE_SUBMISSION.md:101-106` (seule trace) est périmé : pas de
   journaux de plantage, pas d'ID d'appareil, « audio temporaire » et
   « AES-256 » imprécis.
6. **Fonction IA « insights avancés »** (`services/aiInsightsService.ts`) :
   abandonnée ou prévue ? Si prévue, il faut la Cloud Function, une ligne
   Anthropic supplémentaire dans la politique et l'avis préalable.
7. **Domaine de l'URL de suppression** : `suivibaby.com` est-il bien relié à
   l'hébergement Firebase avant de le mettre dans Play (sinon utiliser
   `samaye-53723.web.app`) ?

---

## 6. Checklist par console

### App Store Connect (Confidentialité de l'app)
- [ ] Cocher : E-mail, Nom, Santé, Photos ou vidéos, Données audio, Autre
      contenu utilisateur, Identifiant utilisateur, Identifiant de l'appareil,
      Interactions avec le produit → *Fonctionnalités de l'app*, **lié**, pas de
      tracking.
- [ ] Cocher : Données de plantage, Données de performances, Autres données de
      diagnostic → *Fonctionnalités de l'app*, **non lié**, pas de tracking.
- [ ] Ne pas cocher Achats tant que RevenueCat n'est pas actif ; l'ajouter dans
      la même version que les clés.
- [ ] URL de politique : `https://suivibaby.com/privacy`.
- [ ] Catégorie Santé et forme, **pas** Kids ; refaire le questionnaire d'âge
      (UGC entre utilisateurs, infos médicales occasionnelles).
- [ ] Remplir `NSPrivacyCollectedDataTypes` dans
      `ios/SuiviBaby/PrivacyInfo.xcprivacy` (EmailAddress, Name, Health,
      PhotosorVideos, AudioData, OtherUserContent, UserID, DeviceID,
      ProductInteraction, CrashData, PerformanceData, OtherDiagnosticData) au
      prochain build.

### Play Console (Sécurité des données + Contenu de l'app)
- [ ] Types collectés : E-mail, Nom, ID utilisateur, Autres infos, Infos de
      santé, Photos, Enregistrements audio, Interactions avec l'app, Autre
      contenu généré, Journaux de plantage, Diagnostics, ID d'appareil.
- [ ] **Partagé : Non** partout ; chiffré en transit : Oui ; suppression : Oui.
- [ ] Facultatifs : Photos, Audio, Autre contenu généré ; le reste obligatoire.
- [ ] URL de suppression de compte renseignée (cf. question 7).
- [ ] Public cible : 18+ uniquement, pas de programme Familles.
- [ ] Déclaration « Applications de santé » remplie (suivi bien-être nourrisson,
      non médical).
- [ ] Identifiant publicitaire : Non.
- [ ] Ajouter Historique des achats le jour où RevenueCat est activé.
