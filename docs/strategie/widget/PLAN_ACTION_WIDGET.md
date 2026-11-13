# Plan d'action en sprints : widget SuiviBaby (établi le 13/11/2026)

Sources : [WIDGET_SPEC.md](WIDGET_SPEC.md) (concours de 5 designers et 2 juges) et [BOARD_WIDGET.md](BOARD_WIDGET.md) (3 « financer si », 5,3/10).
## Cadre

- **Sprint** : 2 semaines, du lundi au dimanche, soit environ **6 jours de développement** (hypothèse de 3 j par semaine, à ajuster quand le temps disponible sera fixé).
- **Revue ECC tous les 2 sprints** (fin des sprints 2, 4, 6, 8, 10 et 12). Elle a toujours la même forme, détaillée plus bas : note sur 20, liste P0/P1/P2, et corrections des P0 avant le sprint suivant.
- **Les règles du board** :
  1. **le widget passe en priorité** (décision du fondateur, 13/11/2026), avant le rapport pédiatre et le chantier sur le coût des gratuits, qui reprennent ensuite ;
  2. **le chrono de toute session en cours est visible de tous, gratuitement** ;
  3. **aucune incitation à payer dans le widget** ;
  4. pas de promesse « en direct » sans un test de fiabilité réussi ;
  5. pas de V1.5 sans chiffres d'usage.
- **Rôles** :
  - **Claude** : code, tests, PR, builds, envoi sur les stores ;
  - **Yoss** : décisions, comptes Apple et Google, essais sur téléphone, « go » de fusion pour chaque PR.
- **Chaque PR** :
  - une branche dédiée ;
  - CI complète et verte sur le dernier commit avant de demander le « go » ;
  - tests ajoutés ;
  - jamais de `--force` sur les règles ni les index.
## Vue d'ensemble (révisée le 13/11 : widget en priorité)

| Sprint | Dates | Contenu | Revue ECC |
|---|---|---|---|
| S1 | 16/11 → 29/11 | Décisions et mesures ; **F1 tétée partagée** (4 j) ; début des prototypes (2 j) | |
| S2 | 30/11 → 13/12 | Fin des prototypes (1 j) ; **socle de données** (3 j) ; début des vues (2 j) | **Revue n° 1** |
| S3 | 14/12 → 27/12 | **Widgets small et medium, rappels discrets** | |
| S4 | 28/12 → 10/1 | **Liens profonds, écran verrouillé, début de la Live Activity** ; lancement discret le 7/1 (avec le widget en test) | **Revue n° 2** |
| S5 | 11/1 → 24/1 | **Live Activity, notification Android, direct entre aidants** | |
| S6 | 25/1 → 7/2 | **Test de fiabilité, qualité, release V1** ; lancement public le 2/2 avec le widget | **Revue n° 3** |
| S7 | 8/2 → 21/2 | Mesures du widget ; reprise du rapport pédiatre A et du coût des gratuits | |
| S8 | 22/2 → 7/3 | Rapport pédiatre A ; coût des gratuits | **Revue n° 4** et décision V1.5 (vers mi-mars) |

**Point d'attention** : le calendrier tient seulement à environ 3 j de développement par semaine. Le lancement Premium du 2/2 se fera sans le rapport pédiatre A ; l'offre Premium de lancement reposera sur le widget complet (medium, rappels, choix du bébé), la voix et les PDF. Si un sprint glisse, on décale la release V1 du widget, pas sa qualité (le test de fiabilité reste obligatoire).

---

## S1 (16/11 → 29/11) : décisions, mesures, F1 et début des prototypes
### Décisions

- Décidé le 13/11 : chrono de toute session en cours visible de tous, gratuitement ; widget en priorité ; aucune incitation à payer dans le widget.
- À trancher par Yoss : widget complet pour les comptes inscrits avant le Premium ; autorisation de la requête 0.3 ; temps de développement par semaine.

### Mesures

- **0.3, foyers à plusieurs aidants**
  - Script Node en lecture seule (Admin SDK, exécuté localement, aucune écriture). Pour chaque `children/{childId}` actif, compter les `userId` distincts dans `events` sur 14 jours.
  - Sortie : le pourcentage de foyers avec au moins 2 aidants, et la répartition par type d'événement. Aucune donnée personnelle.
  - Usage : le direct entre aidants étant gratuit, ce chiffre sert à dimensionner le coût des push et à mesurer l'effet du widget sur le partage, plus à décider du périmètre.
- **0.4, coût réel d'un utilisateur gratuit** : Yoss active l'export de la facturation GCP vers BigQuery, Claude analyse.
### F1 : la tétée en cours dans la base partagée (environ 4 j, branche `feat/nursing-live-shared`)

**Comment on l'implémente**

1. **Où stocker** : un document dédié `children/{childId}/live/nursing`, et **pas** un événement `tetee` sans heure de fin. Ainsi, la tétée en cours ne pollue ni les statistiques, ni l'historique, ni les exports, ni les rapports. L'événement `tetee` définitif n'est créé qu'à la fin, comme aujourd'hui.
2. **Contenu du document** : la forme actuelle de `NursingTimerState` (`components/forms/nursingTimer.ts`), complétée de quelques champs.
   ```ts
   interface LiveNursingDoc extends NursingTimerState {
     startedBy: string;        // uid de la mère : jamais affiché (seule la mère allaite)
     deviceId: string;         // appareil qui a fait la dernière écriture
     updatedAt: Timestamp;     // serverTimestamp(), sert à l'expiration (3 h, ou 1 h en pause)
     version: 1;
   }
   ```
3. **Règles Firestore**
   - Ajouter `match /live/{sessionId}` sous `match /children/{childId}` (`firestore.rules:105`).
   - Lecture et écriture par les mêmes personnes que les événements de l'enfant, avec la même fonction d'accès que `/access/{uid}`.
   - Écriture limitée aux champs connus (`keys().hasOnly([...])`).
   - Tests dans `functions/__tests__` avec l'émulateur, puis déploiement des règles **sans** `--force`.
4. **Service** : `services/liveNursingService.ts`, avec 4 fonctions.
   - `subscribe(childId, cb)` : `onSnapshot`.
   - `write(childId, state)` : `setDoc`, avec un anti-rebond de 500 ms sur le changement de sein.
   - `clear(childId)` : `deleteDoc` à l'enregistrement ou à l'annulation.
   - Expiration : la même règle que `PAUSED_DRAFT_TTL_MS` et `RUNNING_DRAFT_TTL_MS`, appliquée en lecture.
5. **Migration de `nursingTimer.ts`**
   - Les fonctions pures (`sideSeconds`, `commitRunning`…) **ne changent pas**.
   - Seule la persistance change : `saveDraft` écrit dans AsyncStorage (cache hors ligne) **et** appelle `liveNursingService.write`.
   - Hors ligne, l'écriture passe par la file hors ligne existante (`services/offlineQueueService.ts`).
   - Au premier lancement, un brouillon local encore valide est repris et poussé dans Firestore.
6. **Conflits** : la dernière écriture gagne, comparée sur `updatedAt`. Deux personnes ne sont jamais censées piloter la même tétée. Si un autre appareil a écrit plus récemment, le formulaire se recharge depuis Firestore.
7. **Affichage chez l'autre parent**
   - `NursingInProgressBanner` et l'accueil s'abonnent au document.
   - L'autre parent voit « Tétée en cours · Sein gauche 12:04 », sans auteur.
   - Un tap ouvre le formulaire en lecture, avec la possibilité de terminer.
8. **Tests**
   - Unitaires : service, expiration, reprise du brouillon.
   - Règles : un non-aidant est refusé.
   - Scénarios : deux appareils, hors ligne puis reconnexion, session oubliée, changement de sein depuis l'autre appareil, suppression avec « Annuler ».
9. **Release** : version de test (Android en build local puis Tests fermés – Alpha ; iOS sur EAS avec soumission automatique), skill `suivibaby-release`.

**Fait quand** : sur deux téléphones réels, le père voit en moins de 5 s la tétée lancée par la mère, même après une coupure réseau, et aucun chrono fantôme n'apparaît après 3 h.

**Skills** : `react-native-skills`, `ecc:react-native-patterns`, `ecc:tdd-workflow`, `ecc:security-review` (règles), `suivibaby-release`, `ego-browser`.


### Prototypes (3 j : 2 j en S1, 1 j en S2, branche `spike/widget`)

| Test | Comment | Repli si échec |
|---|---|---|
| Small iOS avec chrono | `expo-widgets` + `@expo/ui` : `Text` avec `date` + `dateStyle="timer"`, ce qui donne `Text(timerInterval:)` en SwiftUI | `@bacons/apple-targets` : cible WidgetKit en SwiftUI natif dans `targets/widget/` |
| Chrono Android | `Chronometer` dans des RemoteViews, avec `base = elapsedRealtime − (now − débutMs)` | `react-native-android-widget`, ou Glance avec `AndroidRemoteViews` ; sinon « depuis 14:32 » |
| Choix du bébé | `AppIntentConfiguration` sur iOS, activité de configuration sur Android | Le widget suit le bébé actif |
| **Chaînes de build** | `eas build -p ios` (cloud, soumission automatique) **et** `.claude/skills/suivibaby-release/scripts/build-android.sh` (local) avec la nouvelle cible | Bloquant : on corrige avant d'aller plus loin |

**Résultat** : une note d'une page avec les choix retenus. On ferme `spike/widget` et on repart propre sur `feat/widget-v1`.

---

## S2 (30/11 → 13/12) : fin des prototypes, socle de données, puis revue ECC n° 1

### 3.2 Socle de données (3 j, PR n° 1)

1. **`utils/todaySummary.ts`**
   - Fonction pure `computeTodaySummary(events, liveSessions, now, thresholds)`, extraite de `app/(drawer)/baby/(tabs)/home.tsx` (le `useEffect` des lignes 1380 à 1615 et les `useMemo` des lignes 720 à 1030).
   - Mêmes regroupements qu'aujourd'hui : repas à moins de 30 min, couches à moins de 2 min, sommeil borné à minuit.
   - L'accueil utilise désormais cette fonction : **une seule source de chiffres**. Tests unitaires sur des jeux de données réels anonymisés.
2. **`services/widgetSnapshotService.ts`** : construit le snapshot v1 par enfant.
   ```ts
   interface WidgetSnapshotV1 {
     v: 1; generatedAt: number; isPremium: boolean; premiumExpiresAt: number | null;
     child: { id: string; name: string };
     today: { lastMealAt: number | null; nextSide: "left" | "right" | null; mealsCount: number; bottleMl: number;
              lastDiaperAt: number | null; diapersCount: number; sleepMinutes: number };
     live: { nursing?: LiveNursing; sleep?: { startedAt: number; by?: string }; walk?: { startedAt: number; by?: string } };
     alerts: { repas?: number; changes?: number; pompages?: number; vitamines?: number }; // heure de bascule en rouge (ms)
     colors: { light: Palette; dark: Palette }; // softBg, softText, filledText précalculés
   }
   ```
3. **Écriture**
   - iOS : `ExtensionStorage` d'expo-widgets ou un module App Group (UserDefaults suite `group.com.tesfa.suivibaby`).
   - Android : SharedPreferences, puis `updateWidget`.
   - Déclencheurs : chaque événement reçu par l'écoute du jour, chaque changement de `live/nursing`, le retour au premier plan, le changement de statut Premium. Anti-rebond de 2 s.
4. **Gratuit ou Premium** : nouvelle sous-feature `widget_basic` (gratuite) dans `services/premiumGatingService.ts`, à côté de `widgets` (Premium). Le snapshot porte `isPremium`, et le widget n'affiche que ce qui est autorisé, **sans aucune mention du Premium**.
5. **Instrumentation anonyme** : événements `widget_installed`, `widget_removed`, `widget_tap` (taille, zone), sans identifiant personnel. Le format est à valider par Yoss côté vie privée.

**Skills** : `write-swift`, `ecc:swiftui-patterns`, `ecc:kotlin-patterns`, `ecc:documentation-lookup` (la doc d'expo-widgets change vite), `ecc:tdd-workflow`, `suivibaby-release`.


---

## S3 (14/12 → 27/12) : widgets small et medium, rappels discrets (6 j)

**Comment on l'implémente**

1. **Vues**
   - **iOS** : `widgets/Now.tsx` (small) et `widgets/Today.tsx` (medium), écrits avec les composants `@expo/ui` (repli SwiftUI natif si les prototypes l’ont imposé).
   - **Android** : composants équivalents (`Chronometer` ou repli).
   - Maquettes, tailles de texte et couleurs exactes : WIDGET_SPEC § 2 et § 5.
2. **États** : repos, en cours (priorité tétée, puis sommeil, puis promenade), pause, alerte, périmé.
   - Au-delà de 30 min : « mis à jour HH:MM ».
   - Au-delà de 2 h avec une session en cours : « Ouvrir pour actualiser ».
3. **Timeline planifiée**, sans dépenser de rechargement : bascules aux heures d'`alerts.*`, à `runningSince + 3 h`, à 12 h de session, à minuit, à l'expiration de l'abonnement. L'app calcule ces dates et les écrit dans le snapshot ; le widget ne fait qu'afficher.
4. **Rappels discrets** (Premium)
   - Lecture de `ReminderPreferences` (`services/userPreferencesService.ts`) : rappels activés et seuil supérieur à 0.
   - Bascule de la valeur en rouge (`#b91c1c` en clair, `#f87171` en sombre) avec une petite icône. Pas de fond, pas de clignotement.
   - Les heures calmes du parent ne masquent pas l'alerte visuelle.
5. **Pictogrammes** : SF Symbols personnalisés exportés depuis FontAwesome6 (iOS), vecteurs (Android). Pas de police d'icônes RN, qui n'est pas disponible dans une extension.
6. **Modes** : clair et sombre suivent le système ; teinté et transparent avec `widgetAccentable()` sur le picto ; StandBy rouge, avec un sens toujours porté par le texte.
7. **Tests** : instantanés des vues par état et tests de la timeline. Essais sur un vrai iPhone (StandBy de nuit) et un vrai Android.

**Skills** : `write-swift`, `ecc:kotlin-patterns`, `impeccable:impeccable` (relecture visuelle), `apple-design`, `ecc:liquid-glass-design`.

---

## S4 (28/12 → 10/1) : liens profonds, écran verrouillé, début de la Live Activity (6 j), puis revue n° 2

1. **Liens profonds (2 j)**
   - Routes expo-router : `app/baby/[childId]/nursing.tsx`, `sleep/[eventId]`, `walk/[eventId]` et `home?focus=`.
   - Au lancement par lien : bascule sur le bon bébé (`BabyContext`), puis ouverture de la feuille.
   - Tests des liens à froid et à chaud.
2. **Écran d'aide « Ajouter le widget »** dans Réglages. C'est le **seul** endroit où les possibilités Premium du widget sont présentées.
3. **Écran verrouillé iOS (1,5 j)** : formats rectangular, circular (jauge du dernier repas vers le seuil, `ProgressView(timerInterval:)`) et inline, plus l'option « Masquer sur l'écran verrouillé » (`privacySensitive`).
4. **Live Activity, partie 1 (2,5 j)** : `ActivityAttributes` (enfant, type de session) et `ContentState` (côté, horodatages, pause). Démarrage, mise à jour et fin depuis l'app, branchés sur `liveNursingService` et sur le sommeil et la promenade en cours.

## S5 (11/1 → 24/1) : Live Activity, notification Android, direct entre aidants (6 j)

1. **Live Activity, partie 2 (1,5 j)**
   - Dynamic Island : compacte, minimale, étendue.
   - `staleDate` : à l'expiration de la session.
   - Limite de 8 h : nuit désactivée par défaut, fin propre avec « Toujours en cours, ouvrir l'app ».
2. **Notification Android (2 j)** : module Expo en Kotlin `modules/live-notification`.
   - `NotificationCompat` avec `setUsesChronometer(true)`, `setWhen(débutMs)` et la catégorie PROGRESS.
   - `setRequestPromotedOngoing(true)` en style standard, pour le Live Update d'Android 16, avec repli sur la notification permanente classique.
   - Mise à jour à chaque changement d'état.
3. **Direct entre aidants (2,5 j, gratuit pour tous : le chrono doit être visible de tous)**
   - Cloud Function `onLiveSessionWrite`, déclenchée par `children/{childId}/live/*` et par les événements sommeil ou promenade en cours (europe-west1).
   - Pour chaque aidant de l'enfant, hors appareil auteur :
     - **iOS** : push APNs « liveactivity » (push-to-start iOS 17.2+, update, end), avec les jetons enregistrés par appareil dans `device_tokens` ;
     - **Android** : FCM data à haute priorité ; l'app se réveille, réécrit le snapshot et publie la notification.
   - Idempotente, avec un délai maximal de 10 s et des journaux sans donnée personnelle.
   - Le secret APNs est créé par Yoss avec `firebase functions:secrets:set`.
   - Coût : quelques invocations par session ; il sera mesuré en S7 avec le coût des gratuits.

## S6 (25/1 → 7/2) : test de fiabilité, qualité, release V1 (4 j + marge), puis revue n° 3

1. **Test de fiabilité (2 j)** : protocole écrit **avant** de commencer.
   - 50 sessions sur 2 à 3 téléphones réels : app fermée, réseau coupé puis rétabli, nuit complète, redémarrage du téléphone.
   - **Critère d'échec** : plus de 2 % de sessions affichées fausses (chrono, fin ou rappel), ou un délai médian au-dessus de 30 s.
   - En cas d'échec : pas de communication « en direct », correction, puis nouveau test.
2. **Qualité (2 j)** : VoiceOver et TalkBack (une phrase complète par bloc), grand texte (`ViewThatFits` : le chrono ne disparaît jamais), prénoms longs (skill `break-ui`), deux sessions en même temps.
## S7 et S8 (8/2 → 7/3) : mesures du widget, reprise du plan stratégique, revue n° 4

- Correction des retours, puis reprise du rapport pédiatre A et du chantier sur le coût des gratuits. Suivi des indicateurs du widget pendant 4 semaines après la sortie :

| Indicateur | Seuil fixé à l'avance |
|---|---|
| Foyers actifs avec au moins un widget à 30 jours | première mesure, sans seuil |
| Premium avec le medium installé à 30 jours | au moins 40 % |
| Rétention à 60 jours des Premium avec widget, comparée aux Premium sans widget | écart positif |
| Sessions « juste pour regarder » (moins de 5 s sans saisie) | en baisse |
| Valeurs fausses signalées | 0 cas non corrigé sous 7 jours |

- **Décision V1.5 vers mi-mars**, seulement si les seuils sont atteints et si le test de fiabilité tient en production.
  - Contenu (8 à 10 j, 2 sprints) : actions « changer de sein », « terminer », « réveil » et « fin de promenade » ; jeton widget révocable ; Cloud Function `widgetAction` idempotente ; App Intents et `LiveActivityIntent` sur iOS, receiver et WorkManager sur Android ; file hors ligne ; revue de sécurité.
  - Toujours pas de bouton « Démarrer » sur l'écran d'accueil.
- **V2** (4 j) : grand widget en rangées, 3e métrique configurable, format Android 4x1.

## La revue ECC (tous les 2 sprints)

Même format à chaque fois, pour comparer les notes d'une revue à l'autre :

| Volet | Outil | Ce qui est vérifié |
|---|---|---|
| Code | `ecc:code-review` + `ecc:react-review` (TS/React Native) | Bugs, régressions, code mort, tests manquants |
| Sécurité | `ecc:security-review` | Règles Firestore, Cloud Functions, jetons, données personnelles dans les journaux |
| Natif (à partir de S2) | `ecc:swift-reviewer`, `ecc:kotlin-reviewer` | Extension widget, Live Activity, module de notification |
| UI/UX | Audit UI/UX (même grille que les audits V1 à V3) avec `impeccable` et `ui-ux-pro-max` | Fidélité au design, accessibilité, mode sombre, cohérence du widget avec l'app |
| Silences | `ecc:silent-failure-hunter` | Erreurs avalées (synchro, push, snapshot) |

**Livrable** : `docs/strategie/ux/REVUE_ECC_Sxx.md`, avec une note sur 20 et des constats P0, P1 et P2.
- Les **P0 sont corrigés avant le sprint suivant**.
- Les P1 sont planifiés dans le sprint suivant.
## Décisions en attente (Yoss)

1. Widget complet pour les comptes inscrits avant le Premium (proposition : oui, c'est un ajout).
2. Autorisation d'exécuter la requête 0.3 en lecture seule sur la production.
3. Temps de développement par semaine (pour confirmer les dates).

Décidé le 13/11 : chrono de toute session en cours visible de tous gratuitement ; aucune incitation à payer dans le widget ; widget en priorité ; F1 lancé.
