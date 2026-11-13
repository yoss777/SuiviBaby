# Widget SuiviBaby « Maintenant » : spécification finale

> Décisions du fondateur (13/11/2026) : le chrono de toute session en cours est visible de tous gratuitement (§ 8) ; aucune incitation à payer dans le widget ; le widget passe en priorité, avant le rapport pédiatre.
>
> Correction du fondateur (13/11/2026) : seule la mère allaite. La tétée n'a donc jamais d'auteur affiché ; le suivi à plusieurs concerne l'autre parent pour la tétée, et la nounou ou la famille pour le biberon, la sieste, la promenade et les couches.

Base retenue : la proposition « Maintenant » sur une carte SuiviBaby calme (skill impeccable), première au cumul des notes (64/80). On y ajoute les meilleures idées des quatre autres propositions, selon ce que les juges ont retenu. Aucun fichier du dépôt n'a été modifié.

---

## 1. Résumé et verdict

- **Ce que c'est** : un widget d'écran d'accueil qui répond à une seule question, « où en est-on avec bébé, maintenant ? ». Sa forme dépend de l'état.
  - Si une tétée, un sommeil ou une promenade est en cours, son chrono prend la place principale.
  - Sinon, le widget affiche le temps écoulé depuis le dernier repas et le prochain sein (G/D).
- **Répartition des rôles** : l'écran d'accueil sert à consulter. Le minuteur en direct vit là où on le voit sans déverrouiller : la Live Activity et la Dynamic Island sur iPhone, la notification permanente sur Android.
- **Livraison** : V1 en lecture seule avec des liens profonds fiables. Les actions directes (changer de sein, terminer) arrivent en V1.5, seulement si les prototypes sont concluants.
- **Préalable bloquant** : la tétée doit être enregistrée « en cours » dans Firestore, comme le sommeil (point F1 de l'audit). Sans cela, la tétée en cours de la mère n'apparaît pas chez l'autre parent (ni chez la personne qui prend le relais avec un biberon).
- **Verdict** : c'est une bonne idée, et la meilleure justification concrète du Premium (« gain de temps quotidien »). Un parent consulte l'app 10 à 15 fois par jour et met 6 à 10 s à chaque fois. Le vrai différenciateur face à Huckleberry ou Baby Daybook est le suivi à plusieurs : « je vois sur mon écran verrouillé la tétée en cours de la mère, la sieste ou la promenade lancée par la nounou ». Le principal risque n'est pas l'affichage. C'est la **fraîcheur entre aidants** et la **fiabilité des boutons**. Huckleberry est critiqué justement pour des boutons de widget qui ne démarrent rien. D'où une V1 sobre et honnête.

---

## 1bis. Structure et position retenues

### Règle unique de position

> **Ce qui est en cours vit en haut à gauche. Ce qui est cumulé vit à droite et en bas. Une même information garde la même place dans toutes les tailles.**

Les cinq propositions arrivent toutes à la même structure de fond : un small « Maintenant » qui change selon l'état, et un medium avec « Maintenant » à gauche et le jour à droite. Les désaccords portent sur les détails. Voici comment ils sont tranchés.

| Question | Positions des designers | Choix retenu et raison |
|---|---|---|
| Que montre le small au repos ? | Tous : dernier repas et prochain sein | **Retenu.** C'est la question qui décide de l'action suivante. |
| Densité du small en cours | impeccable : 5 niveaux (total, « + Promenade ») ; emil : un seul chiffre fort | **Version épurée (emil)** : picto, chrono, sein actif, côté opposé figé. On retire « total » et « + Promenade ». Une 2e session apparaît seulement sous forme d'un petit picto nommé en haut à droite (pas un « +1 » muet). |
| Chrono de la tétée : côté actif ou total ? | emil : total G+D ; les autres : côté actif | **Côté actif.** La durée par sein est l'information clé pendant l'allaitement (les deux juges sont d'accord). |
| Colonne droite du medium : « combien » ou « depuis quand » ? | impeccable : totaux ; product-lens : « il y a X » ; natif : « depuis » puis le compteur | **« Depuis » d'abord, compteur ensuite**, sur deux niveaux de lecture : l'heure du dernier en gros, le total en petit. La nuit, on cherche « quand », pas « combien ». |
| Ordre des lignes du medium | Accueil de l'app : Alimentation, Santé, Sommeil | **Repas, Couches, Sommeil** : un seul modèle mental avec l'app. |
| Grand widget | Frise de 12 h (impeccable, emil) ou rangées fixes (product-lens) | **Rangées fixes par activité.** Plus lisible en une seconde et moins coûteux à rendre avec le sous-ensemble de composants d'expo-widgets. Pas de ligne vide « Sieste (aucune) ». |
| Où placer les boutons (V1.5) | small : non (tous) ; large : 3 boutons de démarrage (natif, product-lens) | **Une seule action contextuelle, sous le chrono qu'elle commande** (emil), dans le medium uniquement. **Aucun bouton « Démarrer » sur l'écran d'accueil.** Les boutons multiples vivent dans la Live Activity et la notification. |
| Auteur de la session (« par Awa ») — **jamais pour une tétée** (c'est toujours la mère qui allaite, l'information est inutile) | impeccable : seulement en Live Activity ; product-lens : jusque dans le small | **Dans la Live Activity, la notification, le grand widget et la ligne secondaire du medium**, pas dans le small (risque de troncature en grand texte). Il est masquable sur l'écran verrouillé. |
| Prénom du bébé | Haut gauche ou haut droite | **Haut gauche, en caption secondaire.** C'est la convention de l'app, et il est indispensable avec plusieurs bébés. Un widget correspond à un enfant, choisi dans la configuration du widget. |

### Rôle de chaque surface

| Surface | Rôle | Contenu |
|---|---|---|
| Écran d'accueil small (et **StandBy**) | Une réponse | Session en cours, sinon dernier repas et prochain sein |
| Écran d'accueil medium | La réponse et le contrôle du jour | Maintenant à gauche, Repas / Couches / Sommeil à droite |
| Écran d'accueil large (V2) | La journée | Une rangée par activité |
| Écran verrouillé iOS (rectangular, circular, inline) | Coup d'œil sans déverrouiller | Chrono en cours, ou « Repas il y a… · D » ; jauge du prochain sein |
| Live Activity et Dynamic Island | Ce qui tourne, seulement pendant la session | Chronos G et D séparés, auteur, puis actions en V1.5 |
| Notification permanente Android (Live Update sur Android 16) | Équivalent de la Live Activity | Chrono système, auteur, puis actions en V1.5 |

**StandBy** (iPhone en charge à l'horizontale sur la table de nuit) réutilise le small. C'est l'emplacement principal des tétées de nuit. En StandBy de nuit (filtre rouge), aucune information ne doit dépendre de la couleur.

**Smart Stack** : on renseigne la pertinence (relevance) pour que le widget remonte dans la pile quand une session démarre.

**Placement conseillé à l'utilisateur** (écran d'aide « Ajouter le widget » dans l'app) : le medium en haut de la première page ou en tête d'une Smart Stack, le rectangular sur l'écran verrouillé, StandBy pour la nuit. Sur Android : le 4x2 sur l'écran principal, avec les notifications SuiviBaby autorisées.

---

## 2. Tailles retenues et maquettes

### Ordre des métriques (hiérarchie unique)

1. Session en cours et son chrono. Priorité : tétée, puis sommeil, puis promenade.
2. Sein actif, ou prochain sein (G/D).
3. Temps depuis le dernier repas, avec alerte au-delà du seuil de rappel.
4. Dernière couche (heure) et nombre de couches du jour.
5. Sommeil total du jour (seulement la part tombée aujourd'hui).
6. Compteurs : nombre de repas et ml de biberon.
7. Promenade : seulement si elle est en cours, ou dans le grand widget.
8. Métadonnées : auteur, « mis à jour HH:MM » si le snapshot est périmé.

**Exclus** : humeur, conseils, croissance, jalons, tire-lait (sauf dans le total des ml).

### MVP (V1)

**iOS small / Android 2x2, au repos**
```
┌──────────────────────┐
│ Lina                 │  caption 12/500, secondaire
│ Dernier repas        │  footnote 13, secondaire
│                      │
│ 2 h 10               │  34/700, chiffres à chasse fixe (relatif iOS)
│ Tétée à 12:22        │  footnote, secondaire
│ Prochain sein ( D )  │  pastille pill, bordure #D66B8F
└──────────────────────┘
Seuil dépassé : « Dernier repas » passe en errorText + icône d'alerte.
Android : « à 12:22 » en gros, « il y a ~2 h » en petit
(pas de relatif qui se met à jour seul sur Android).
```

**iOS small / Android 2x2, en cours**
```
Tétée                          Sommeil (avec une promenade en même temps)
┌──────────────────────┐       ┌──────────────────────┐
│ (o) Tétée       Lina │       │ (z) Sieste  Lina (w) │  (w) = picto promenade,
│                      │       │                      │      libellé VoiceOver
│ 12:04                │       │ 1:42:10              │
│ ▶ Sein gauche        │       │ depuis 12:51         │
│ D 4:10               │       │                      │
└──────────────────────┘       └──────────────────────┘
En pause : chrono figé (pauseTime), couleur secondaire, « En pause » écrit.
```

**iOS medium / Android 4x2, « Aujourd'hui »**
```
┌─────────────────────────────────────────────┐
│ Lina                                        │
│ (o) Tétée           │ ● Repas     il y a 2 h │
│                     │             6 · 420 ml │
│ 12:04               │ ● Couches   à 13:05    │
│ ▶ Sein gauche       │             5 auj.     │
│ D 4:10              │ ● Sommeil   5 h 10     │
└─────────────────────────────────────────────┘
Au repos, colonne gauche : Dernier repas / 2 h 10 / Tétée à 12:22 / ( D )
Colonne gauche : environ 45 % de la largeur. Chaque ligne de droite est
une zone de tap distincte.
Android 3x2 : on retire la ligne Couches. En 2x2 : bascule auto sur le small.
```

**Écran verrouillé iOS**
```
Rectangular              Circular        Inline
┌────────────────────┐    .-~~-.         (o) Tétée G 12:04
│ (o) Tétée · G      │   /  D   \        ou  Repas il y a 2 h 10 · D
│ 12:04              │  | ▓▓▓░░  |
│ D 4:10             │   \      /   jauge = dernier repas → seuil
└────────────────────┘    '-..-'    (ProgressView timerInterval)
Repos : │ Repas il y a 2 h 10 │ Prochain : D │
Rendu monochrome : sens porté par le picto et le texte.
```

**Live Activity (V1, sans boutons) et Dynamic Island**
```
┌─────────────────────────────────────────┐
│ (o) Tétée · Lina                         │
│   GAUCHE ▶ ▌          DROIT              │
│   12:04               4:10 (en pause)    │
│                           total 16 min   │
└─────────────────────────────────────────┘
Compacte : ( (o)G ········· 12:04 )   Minimale : ( (o) )
Étendue : contenu de l'écran verrouillé, plus serré.
Sommeil / promenade : un seul chrono et « depuis 13:05 ».
V1.5 : [ ⇄ Changer de sein ] [ Terminer ] (pas de bouton Pause au début)
```

**Notification permanente Android**
```
┌──────────────────────────────────────────┐
│ (o) SuiviBaby · Tétée            12:04 ▶ │
│ Sein gauche · D 4:10                     │
│ Lina                                     │
│ (V1.5)  CHANGER DE SEIN       TERMINER   │
└──────────────────────────────────────────┘
Chip de barre d'état sur Android 16 : [(o) G 12:04]
```

### V2

**iOS large / Android 4x4 : rangées fixes**
```
┌─────────────────────────────────────────────┐
│ Lina                              ven. 13 nov.│
│ (o) Tétée · Sein G    12:04 ▶                │ ← rangée en cours :
│─────────────────────────────────────────────│   fond pâle catégorie
│ (z) Sommeil   réveil à 13:40      5 h 10 auj.│
│─────────────────────────────────────────────│
│ ( ) Couches   à 13:05             5 auj.     │
│─────────────────────────────────────────────│
│ (w) Promenade  —                  0 auj.     │
│─────────────────────────────────────────────│
│ Dernier : change à 13:05 · Marc             │
└─────────────────────────────────────────────┘
Pas de frise ni de grille de boutons.
```
Également en V2 : 3e métrique du medium configurable (Couches ou Promenade), format Android 4x1 (une ligne) si la demande existe.

---

## 3. Minuteurs (tétée G/D, sommeil, promenade)

**Principe** : le widget ne compte jamais lui-même. L'app écrit des horodatages absolus, et c'est le système qui fait défiler le chrono.

### Tétée

| Élément | Calcul et affichage |
|---|---|
| Début du chrono du côté actif | `runningSince − secondesDuCôté × 1000`, affiché avec `Text(timerInterval:)` ou `date` + `dateStyle="timer"` (@expo/ui, iOS 16+) |
| Côté inactif | Texte figé (« D 4:10 ») |
| Total | `runningSince − (left + right) × 1000` : seulement dans la Live Activity et le large |
| Pause | `pauseTime: updatedAt`, avec le mot « En pause » écrit |
| Format | M:SS sous une heure, H:MM:SS au-delà |
| Chiffres | Toujours à chasse fixe (`monospacedDigit`, ou `tnum` sur Android), pour que le chrono ne bouge pas |

### Sommeil et promenade

- Début du chrono = `heureDebut` (`showsHours`).
- La ligne secondaire indique « depuis 13:05 ».
- Une option « minutes seulement » pour le sommeil est à tester : le défilement à la seconde peut être anxiogène.

### Transitions planifiées (`updateTimeline` sur iOS, alarme inexacte sur Android), sans dépenser de rechargement

- **Seuil de rappel atteint** : alerte (errorText + icône).
- **`runningSince` + 3 h en marche, ou + 1 h en pause** : « Tétée à vérifier : ouvrir », pour reproduire l'expiration du brouillon.
- **Session de plus de 12 h** (sommeil sans heure de fin) : « En cours depuis plus de 12 h, vérifier ». C'est le garde-fou contre le chrono fantôme.
- **Minuit** : remise à zéro des totaux.
- **Expiration connue de l'abonnement** : retour à l'état gratuit.

### Rafraîchissement

- L'app appelle `updateSnapshot` ou `reload` **à chaque changement d'état réel** reçu de l'écoute Firestore : début, changement de côté, pause, fin, nouvel événement d'un autre aidant. Elle le fait aussi au retour au premier plan.
- Anti-rebond d'environ 2 s. On ne recharge jamais à chaque seconde.
- On ne compte jamais sur les environ 40 à 70 rechargements par jour de WidgetKit (ordre de grandeur, sans garantie).
- **Garde-fou de fraîcheur** :
  - si le snapshot a plus de 30 min, on affiche « mis à jour HH:MM » en caption ;
  - s'il a plus de 2 h et contient encore une session en cours, on affiche « Ouvrir pour actualiser » à la place du chrono.

### Fraîcheur entre aidants (limite réelle)

Le snapshot est écrit par l'app de **ce** téléphone. Si l'app de l'aidant B est fermée, son widget ne voit pas la tétée lancée par A. Remèdes, du plus fiable au moins fiable :

1. **Live Activity démarrée par push** (iOS 17.2+). Une Cloud Function réagit à l'événement « en cours » et envoie un push APNs push-to-start, puis des mises à jour et la fin.
2. **Message FCM data à haute priorité** (Android). Il réveille l'app, qui réécrit le snapshot et publie la notification.
3. **Push silencieux iOS**, qui réveille l'app pour réécrire le snapshot. Il est limité par le système, sans garantie.
4. **(V2) Timeline provider natif** qui lit le snapshot auprès d'une Cloud Function avec le jeton widget. Impossible dans le bac à sable d'expo-widgets, qui n'a pas de réseau.

### Live Activity

- Une seule par enfant, qui montre la session prioritaire.
- `staleDate` à l'expiration du brouillon.
- **Limite de 8 h actives** (puis jusqu'à 4 h figée). Conséquences :
  - la Live Activity du sommeil de nuit est **désactivée par défaut** ;
  - si elle est activée, elle se termine proprement avec « Toujours en cours, ouvrir l'app ».
- Payload de 4 Ko au plus.
- Dans la Dynamic Island, la largeur du chrono est contrainte (environ 52 pt), car `Text(timerInterval:)` réserve sinon la largeur maximale.

### Android

- **Widget** : `Chronometer` dans des RemoteViews, avec `base = elapsedRealtime − (currentTimeMillis − débutMs)`. Il faut recalculer à chaque rendu et relancer le rendu sur `BOOT_COMPLETED` et `TIME_SET`. **À prototyper** (support non confirmé dans expo-widgets Compose).
- **Repli** si le Chronometer ne fonctionne pas : « depuis 14:32 » en gros et « ≈ 12 min » en petit, réécrit à chaque push. Jamais de faux chrono figé. `updatePeriodMillis` de 30 min sert uniquement de filet de sécurité.
- **Notification** (surface de référence) :
  - `setUsesChronometer(true)` et `setWhen(début en heure murale)`, ce qui résiste au redémarrage ;
  - catégorie PROGRESS ;
  - `setRequestPromotedOngoing(true)` avec un **style standard sans vue personnalisée** (sinon Android 16 refuse la promotion) ;
  - repli sur la notification permanente classique.
- On ne promet pas que le glissement pour fermer est bloqué : sur Android 14+, l'utilisateur peut fermer la notification.

---

## 4. Interactions et liens profonds

### V1 (lecture seule)

- **Small** : une seule zone de tap (`widgetURL`), choisie selon l'état.
- **Medium et large** : un `Link` par zone sur iOS, un `clickAction` ou `actionStartActivity` par Box sur Android. Chaque zone fait au moins 44 x 44 pt.

Routes à créer (l'accueil n'accepte aujourd'hui que `?firstTrack`). Le `childId` est **toujours** présent :

| Zone | Lien |
|---|---|
| Tétée en cours, ou démarrage avec le prochain sein présélectionné | `suivibaby://baby/{childId}/nursing?side=right` |
| Sommeil en cours (arrêt avec « Annuler » de 5 s dans l'app) | `suivibaby://baby/{childId}/sleep/{eventId}` |
| Promenade en cours | `suivibaby://baby/{childId}/walk/{eventId}` |
| Lignes du medium | `suivibaby://baby/{childId}/home?focus=meals\|diapers\|sleep` |

Au lancement par lien, l'app bascule sur le bon bébé avant d'ouvrir l'écran.

**Configuration du widget** : choix du bébé (`AppIntentConfiguration` sur iOS, activité de configuration sur Android), avec le bébé actif par défaut. Le support d'`AppIntentConfiguration` dans expo-widgets est à vérifier. À défaut, on suit le bébé actif, et le `childId` dans le lien protège contre une action sur le mauvais bébé.

### V1.5 (actions directes, après prototype)

- **Où** :
  - medium : **une seule** action contextuelle sous le chrono (« Changer » ou « Terminer » pendant une tétée, « Réveil » pendant un sommeil, « Fin » pendant une promenade) ;
  - Live Activity et notification : deux actions, « Changer de sein » et « Terminer ».
- **Pas de démarrage depuis l'écran d'accueil** tant que la fiabilité n'est pas prouvée. Pas d'action destructrice, pas de bouton supprimer.
- **iOS 17+** : `Button(intent:)` et `LiveActivityIntent` natifs, via @bacons/apple-targets ou un module Swift. Le `onPress` d'expo-widgets ne fait pas d'appel réseau.
- **Android** : `actionRunCallback` ou BroadcastReceiver, puis WorkManager en mode expédié.
- **Serveur** : une Cloud Function HTTPS **idempotente**, avec un `clientActionId` (UUID) généré côté client. Elle est authentifiée par un **jeton widget révocable**, limité à un enfant et à ces actions : `startNursing(side)`, `switchSide`, `stopNursing`, `stopSleep`, `stopWalk`. Le jeton se gère dans Réglages > Widgets.
- **Retour visuel en trois états** :
  1. appuyé ;
  2. optimiste : l'intent écrit d'abord le snapshot dans l'App Group et recharge, avec la mention « Envoi… » en caption ;
  3. confirmé : la mention disparaît.
- **En cas d'échec** : retour à l'état précédent et « Pas envoyé : ouvrir l'app ».
- **Sans réseau** : file d'attente dans l'App Group ou les SharedPreferences, avec « en attente de synchro ». On ne laisse jamais croire aux autres aidants qu'ils sont à jour.
- **Annulation** : « Terminer » enregistre la fin. L'« Annuler » reste dans l'app, proposé à la prochaine ouverture.

---

## 5. Design

### Surfaces

- **Fond** : la carte de l'app, `#ffffff` en clair, `#1f2937` en sombre, posé via `containerBackground`, qui est obligatoire sur iOS 17+ (StandBy, mode sans fond).
- **Sans ombre ni bordure** : la profondeur vient du système, comme `flatInDark()` dans l'app.
- **Rayons** : ceux du système pour le conteneur (`system_app_widget_background_radius` sur Android 12+). `radius.md` 12 pour les boutons et les blocs internes, `pill` pour la pastille G/D.
- **Espacements** : padding 16 (`space.md`), 12 entre les blocs, 8 entre libellé et valeur.

### Couleurs : tokens existants uniquement

| Usage | Clair | Sombre |
|---|---|---|
| Accent tétée (picto, point, barre de 3 px sous le sein actif) | `#D66B8F` | `#D66B8F` |
| Repas / biberon | `#E8785A` | `#E8785A` |
| Couches (miction) | `#5BA4A4` | `#5BA4A4` |
| Sieste / nuit | `#7C6BA4` / `#5A6BA4` | idem |
| Promenade | `#8BC46B` | `#8BC46B` |
| Fond pâle du bloc en cours : alimentation / tétée | `#FEF5F3` | `#2d1a14` |
| Fond pâle : sommeil | `#F5F3F8` | `#1a1526` |
| Fond pâle : promenade | `#F3F9EF` | `#8BC46B` à 15 % sur `#1f2937` |
| Fond pâle : santé | `#F0F7F7` | `#162a2a` |
| Texte fort (chronos, chiffres) | `#1f2937` | `#f9fafb` |
| Texte secondaire | `#6b7280` | `#9ca3af` |
| Texte décoratif | `#9ca3af` | `#7b8494` |
| Alerte | `#b91c1c` + icône | `#f87171` + icône |
| Texte de catégorie lisible | `#A83F23` alimentation, `#5B4A85` sommeil, `#2B6A6A` santé, `#047857` / `#065F46` promenade | `#E8785A`, `#A898D0`, `#5BA4A4`, `#A7F3D0` |

### Règles de couleur

- **Aucun texte dans l'accent brut.** Contrastes sur blanc : `#D66B8F` = 3,3:1, `#8BC46B` = 2,06:1. Sur `#1f2937` : `#D66B8F` = 4,44:1, `#7C6BA4` ≈ 3,2:1.
- Chronos et chiffres toujours en texte fort neutre.
- Le libellé « Tétée » est en texte fort neutre, à côté du picto rose.
- Si un libellé rose devient indispensable, ajouter **un seul** token texte tétée dans `dashboardColors` : `#E89AB5` en sombre (6,8:1) et une variante framboise foncée à au moins 4,5:1 en clair. C'est à valider, pas requis en V1.
- **Texte sur aplat** (bouton suggéré « Sein D ») : `getAccentColors(accent, scheme).filledText`, qui donne `#111827` sur `#D66B8F` (5,37:1), jamais du blanc en dur.
- **Valeurs précalculées par l'app** : `softBg`, `softText` et `filledText`, pour les deux thèmes, sont écrites dans le snapshot. Le widget ne recalcule rien.

### Typographie

- Police système (SF sur iOS, Roboto sur Android). Pas de SF Rounded, que l'app ne sert pas. Graisses numériques uniquement.

| Élément | Style |
|---|---|
| Chrono principal, small | 34/700 |
| Chrono principal, medium | 28 à 30/700 |
| Valeurs de droite | bodyStrong 15/600 |
| Libellés | footnote 13 ou caption 12/500, en secondaire |
| Prénom | caption 12/500 |

- Au plus trois tailles de texte par widget. Pas de majuscules.
- Chiffres à chasse fixe partout.

### Pictogrammes

- Les polices d'icônes RN **ne sont pas disponibles dans une extension** : il faut des assets. SF Symbols personnalisés exportés depuis FontAwesome6 sur iOS, vecteurs sur Android.
- Pictos concernés : person-breastfeeding, bed et moon, person-walking, picto couche (goutte) et baby-bottle.
- Pas d'emoji.

### Modes

- Clair et sombre suivent le système. Le mode nuit 22 h–7 h de l'app ne s'applique pas au widget, mais le chiffre principal de 34 pt couvre ce besoin.
- Modes teinté et transparent d'iOS 18/26 (Liquid Glass) : `widgetAccentable()` sur le picto uniquement.
- Écran verrouillé en rendu monochrome (vibrant), StandBy en rouge de nuit : **toute information tient sans couleur**, grâce au picto, à la lettre G/D et aux mots « en pause » ou « en retard ».
- Contraste renforcé : bordure de 1 px `#e5e7eb` / `#374151`.
- Android : pas de couleurs dynamiques Material You. On garde l'identité de la marque.

### Accessibilité

- Une phrase VoiceOver/TalkBack complète par bloc, par exemple « Tétée en cours, sein gauche, 12 minutes, sein droit 4 minutes » ; pour une sieste lancée par la nounou : « Sieste en cours depuis 13 h 05, lancée par Awa ».
- Dynamic Type plafonné vers `.xxLarge`, avec `ViewThatFits` qui retire d'abord la ligne secondaire, puis la 2e activité, **jamais le chrono**. `minimumScaleFactor` à 0,7 sur les valeurs.
- Cibles d'au moins 44 pt sur iOS et 48 dp sur Android.
- Option **« Masquer sur l'écran verrouillé »** (prénom, auteur), via `privacySensitive` / `redacted`.
- Tests avec un prénom long (skill `break-ui`).

---

## 6. Architecture technique recommandée

### Couche de données partagée

- **Extraire de `home.tsx`** (le `useEffect` des lignes 1380 à 1615 et les `useMemo` des lignes 720 à 1030) une **fonction pure** `computeTodaySummary(events, now, thresholds)`. Elle reprend les regroupements existants : repas à moins de 30 min, couches à moins de 2 min, sommeil borné à minuit. Elle est utilisée par l'accueil **et** par le snapshot, pour garantir les mêmes chiffres.
- **Snapshot JSON versionné** (`v: 1`). Il s'appuie sur la proposition de la cartographie, enrichie des champs suivants :
  - `generatedAt` ;
  - `isPremium` et `premiumExpiresAt` ;
  - `child` et `children[]` ;
  - `today` : meals, nursing.nextSide, diapers, sleep ;
  - `live` : nursing, sleep, walk, avec `startedBy` et `expiresAt` ;
  - `thresholds` ;
  - `colors` : softBg, softText et filledText pour clair et sombre.
- **Où il est écrit** :
  - un snapshot par enfant ;
  - écrit dans l'App Group `group.com.tesfa.suivibaby` (UserDefaults) sur iOS, dans les SharedPreferences sur Android ;
  - réécrit à chaque événement de `ecouterEvenementsDuJour` (anti-rebond de 2 s), au retour au premier plan, et au changement de statut Premium.

### Librairies

| Besoin | Choix | Porte de sortie |
|---|---|---|
| Widgets iOS et Live Activity | **expo-widgets ~58.0.x** + `@expo/ui` (Text timer, Gauge) | **@bacons/apple-targets** (WidgetKit en SwiftUI natif) |
| Widget Android | expo-widgets avec `enableAndroid` (Compose), **sous réserve du prototype Chronometer** | **react-native-android-widget 0.20.x**, ou Glance fait main avec `AndroidRemoteViews` |
| Notification permanente Android | Petit module natif Expo (Kotlin) : `setUsesChronometer`, `setRequestPromotedOngoing`, actions | — |
| Démarrage des Live Activities par push | Cloud Function (déclencheur Firestore sur un événement « en cours ») + APNs, avec les jetons push-to-start enregistrés par appareil et par aidant | — |
| Fraîcheur Android | FCM data à haute priorité (même Cloud Function) | — |
| Actions V1.5 | App Intents natifs (apple-targets ou module Swift), receiver Android + WorkManager, Cloud Function `widgetAction` idempotente, jeton widget (émission, révocation, portée) | — |

### Préalable F1

Écrire la tétée en cours dans Firestore (event `tetee` avec `runningSide`, `runningSince`, `leftSeconds`, `rightSeconds`, et sans heure de fin), comme le sommeil. `nursingTimer.ts` garde AsyncStorage uniquement comme cache hors ligne.

### Builds

- Ce sont tous des config plugins appliqués au prebuild : compatibles avec **EAS cloud iOS (soumission automatique vers App Store Connect)** et avec le **build .aab Android local**.
- Sur iOS, il faut :
  - un App ID pour l'extension ;
  - l'App Group ;
  - la capacité Push (déjà présente ou à confirmer) ;
  - un profil de provisioning supplémentaire, géré par EAS.
- Il faut un dev build : Expo Go ne prend pas en charge les widgets.
- **À valider dès l'étape 1** sur les deux chaînes de build.

---

## 7. Skills, agents et connecteurs

| Statut | Élément | Usage |
|---|---|---|
| **Obligatoire** | `react-native-skills` / `ecc:react-native-patterns` | Config plugins, module natif, extraction du calcul pur |
| **Obligatoire** | `write-swift` + `ecc:swiftui-patterns` | Widget SwiftUI ou expo-widgets, Live Activity, App Intents |
| **Obligatoire** | `ecc:kotlin-patterns` (+ `ecc:kotlin-review`) | Notification permanente, receiver, Chronometer, WorkManager |
| **Obligatoire** | `suivibaby-release` | Nouvelle cible iOS, App Group, provisioning, EAS, AAB local |
| **Obligatoire** | `ecc:security-review` | Jeton widget, Cloud Function d'action, portée et révocation (V1.5) |
| **Obligatoire** | `ecc:documentation-lookup` (Context7, s'il est installé) | Doc expo-widgets et @expo/ui, qui change vite |
| Recommandé | `impeccable:impeccable` ou `ui-ux-pro-max` | Relecture visuelle et contrastes |
| Recommandé | `apple-design`, `ecc:liquid-glass-design` | Modes teinté, transparent et StandBy |
| Recommandé | `ecc:accessibility` / `ecc:frontend-a11y` | VoiceOver, TalkBack, Dynamic Type |
| Recommandé | `break-ui` | Prénoms longs, grand texte, deux sessions en même temps |
| Recommandé | `ecc:product-lens` | Découpage gratuit / Premium et mesures |
| Recommandé | `ego-browser` | Envoi de l'AAB sur Play (Tests fermés – Alpha), vérification dans App Store Connect |
| Optionnel | `ecc:compose-multiplatform-patterns` | Seulement si on part sur Glance fait main |
| Optionnel | `perplexity` / `ecc:deep-research` | Veille sur les concurrents et sur expo-widgets |
| Optionnel | Figma | Si des maquettes sont produites |
| Inutile | `animate-expo`, `emil-design-eng` (animation) | Les widgets n'ont pratiquement pas d'animation |

**Outils en ligne de commande nécessaires** : EAS CLI, Firebase CLI (Cloud Functions, règles), gcloud (secret APNs). Aucun connecteur MCP n'est obligatoire.

---

## 8. Gratuit vs Premium

> **Décision du fondateur (13/11/2026)** : une session en cours (tétée, sommeil, promenade) est une donnée partagée du foyer. Son chrono est **visible de tous, gratuitement**, comme le sommeil et la promenade en cours le sont déjà dans l'app. Premium vend le confort et la mise en forme, jamais l'accès à ce qui se passe maintenant.

- Il faut créer une sous-feature **`widget_basic`** (gratuite) à côté de **`widgets`** (Premium) dans `premiumGatingService`. Aujourd'hui, `checkFeatureAccess('widgets')` est faux pour les comptes gratuits et pour les grandfathered.

**Gratuit (`widget_basic`)**, pour tous les comptes
- Small : sessions en cours avec chrono en direct (tétée G/D, sommeil, promenade), y compris celles lancées par un autre aidant ; au repos, « Dernier repas il y a… », l'heure et le prochain sein.
- Écran verrouillé iOS (rectangular, circular, inline), Live Activity et Dynamic Island, notification permanente Android : le chrono de toute session en cours du foyer.
- Synchronisation entre aidants par push (Live Activity push-to-start, FCM data), puisque le chrono doit être visible de tous.
- Alerte du repas sur le small, si le parent a réglé ce rappel.
- **Aucune incitation à payer dans le widget (décision du fondateur, 13/11/2026)** : pas de ligne « Premium », pas de cadenas, pas de flou, pas de lien vers le paywall. Un tap ouvre toujours l'app sur l'écran concerné. La découverte du widget Premium se fait uniquement dans l'app (écran d'aide « Ajouter le widget », page Premium).
- Medium posé par un compte gratuit : la partie « en cours » (gauche) complète, et à droite le dernier repas et le prochain sein, sans message ni emplacement vide. À l'expiration d'un abonnement, même chose.

**Premium (`widgets`)**
- Medium complet (Repas, Couches, Sommeil du jour) et large (V2).
- **Rappels discrets** : le widget reprend les rappels réglés par le parent dans Réglages > Notifications (`ReminderPreferences.thresholds` : `repas`, `changes`, `pompages`, `vitamines`, seuils propres à chaque parent). Quand un seuil est dépassé et que ce rappel est activé (rappels activés et seuil > 0 ; par défaut tout est à 0, donc aucune alerte tant que le parent n'a rien réglé), la valeur concernée passe en rouge (`#b91c1c` clair / `#f87171` sombre) avec une petite icône d'alerte, par exemple « Couches · à 09:05 ». Pas de fond rouge, pas de clignotement, pas de badge. L'heure de bascule est planifiée dans la timeline. Les heures calmes ne masquent pas l'alerte visuelle (le widget ne sonne pas).
- Choix du bébé par widget (plusieurs widgets, un par enfant).
- Actions directes en V1.5 (changer de sein, terminer, réveil, fin de promenade).

**Expiration** : `isPremium` et sa date d'expiration sont recopiés dans le snapshot ; une entrée de timeline planifiée fait retomber le widget sur la version gratuite.

**Grandfathered** : décision à prendre (proposition : ils gardent le widget complet, puisqu'il s'agit d'un ajout).

**Pitch du paywall (dans l'app uniquement, jamais dans le widget)** : à réécrire, puisque le direct est gratuit. Piste : « D'un coup d'œil, la journée de bébé et les rappels qui comptent pour vous, sans ouvrir l'app. »

**Conséquence assumée** : le widget pèse moins dans la valeur Premium que dans la version initiale (le board le voyait déjà comme un bonus, pas un pilier). En contrepartie, il devient un argument d'installation et de rétention pour tous, et le coût serveur des push entre aidants porte aussi sur les comptes gratuits : à mesurer (S6).

**Mesures de succès**
- Part des foyers actifs avec au moins un widget installé à 30 jours (tous comptes).
- Au moins 40 % des Premium avec le medium installé à 30 jours.
- Baisse des sessions « juste pour regarder » (moins de 5 s sans saisie).
- Rétention à 60 jours des foyers avec widget, comparée à ceux sans widget.

---

## 9. Plan de réalisation

| # | Étape | Contenu | Estimation |
|---|---|---|---|
| 0 | **F1 : tétée en cours dans Firestore** | Modèle d'événement en cours, migration de `nursingTimer`, écoute, règles, tests à plusieurs appareils | 3 à 4 j |
| 1 | **Prototypes jetables** | expo-widgets iOS small avec Text timer ; Chronometer Android avec expo-widgets ; `AppIntentConfiguration` ; build EAS iOS et AAB local avec la nouvelle cible | 3 j |
| 2 | **Socle de données** | `computeTodaySummary` extrait de `home.tsx` et testé ; snapshot v1 ; écriture App Group et SharedPreferences ; anti-rebond ; sous-feature `widget_basic` | 3 j |
| 3 | **Widgets V1** | Small et medium iOS, 2x2 et 4x2 Android ; repos, en cours, pause, alerte, fraîcheur ; timeline (seuil, 3 h, 12 h, minuit) ; assets d'icônes ; clair, sombre, teinté, StandBy | 5 à 6 j |
| 4 | **Liens profonds et configuration** | Routes `baby/{childId}/…`, bascule de bébé, écran d'aide « Ajouter le widget » | 2 j |
| 5 | **Écran verrouillé iOS** | Rectangular, circular (jauge), inline ; option de masquage | 1,5 j |
| 6 | **Live Activity locale et notification Android** | Live Activity démarrée par l'app (sans boutons) ; notification avec chrono, Live Update Android 16 et repli | 4 j |
| 7 | **Synchronisation entre aidants** | Cloud Function push-to-start et mises à jour APNs, jetons par appareil, FCM data Android | 4 j |
| 8 | **QA et release** | Accessibilité, `break-ui`, appareils réels, TestFlight, Play Tests fermés – Alpha | 3 j |
| | **Total V1** | | **≈ 28 à 31 j** |
| 9 | **V1.5 : actions** | Jeton widget et révocation, Cloud Function idempotente, App Intents et LiveActivityIntent, receiver et WorkManager, file hors ligne, revue de sécurité | 8 à 10 j |
| 10 | **V2** | Large et 4x4 en rangées, 3e métrique configurable, 4x1 Android | 4 j |

### Risques et parades

| Risque | Parade |
|---|---|
| F1 non livré : promesse multi-aidants impossible | Étape 0 bloquante ; aucun discours « à plusieurs » avant |
| Chronometer non pris en charge dans expo-widgets Android | Prototype à l'étape 1 ; repli react-native-android-widget ou Glance ; sinon « depuis 14:32 » assumé ; la notification porte le vrai chrono |
| expo-widgets encore jeune | Porte de sortie @bacons/apple-targets ; snapshot v1 indépendant de l'outil |
| Snapshot périmé (app tuée, budget épuisé) | « mis à jour HH:MM » au-delà de 30 min, « Ouvrir pour actualiser » au-delà de 2 h, push-to-start, FCM data |
| Live Activity limitée à 8 h, nuit qui dépasse | Désactivée par défaut pour la nuit ; fin propre |
| Chronometer faux après redémarrage | Base recalculée à chaque rendu ; receivers `BOOT_COMPLETED` et `TIME_SET` |
| Promotion Android 16 refusée | Style standard ; notification permanente classique en repli |
| Boutons peu fiables (défaut Huckleberry) | V1 sans boutons ; V1.5 idempotente avec retour en trois états et échec explicite |
| Contraste des accents rose et vert | Aucun texte en accent brut ; teintes lisibles ; `filledText` |
| Le sens disparaît en monochrome, teinté ou StandBy rouge | Picto, lettre G/D et mots écrits ; tests sur appareil dès l'étape 3 |
| Chiffres différents entre widget et accueil | Fonction pure partagée, testée |
| Mauvais bébé | Un widget par enfant ; `childId` dans chaque lien |
| Confidentialité sur l'écran verrouillé | `privacySensitive` + option « masquer » |
| Mécontentement des grandfathered | Décision avant le lancement (recommandation : small en direct offert) |
| Nouvelle cible qui casse la release | Validation EAS et AAB local dès l'étape 1 (`suivibaby-release`) |

---

## 10. Classement du concours

| Rang | Proposition (skill) | Juge 1 (simplicité / design / 3 h du matin / faisabilité = total) | Juge 2 (idem) | Cumul /80 |
|---|---|---|---|---|
| **1** | « Maintenant », carte calme (impeccable) | 7 / 9 / 9 / 8 = **33** (gagnant juge 1) | 6 / 9 / 9 / 7 = **31** | **64** |
| 2 | « Maintenant / Aujourd'hui », natif d'abord (write-swift + swiftui + kotlin) | 6 / 8 / 8 / 9 = **31** | 6 / 8 / 9 / 9 = **32** (gagnant juge 2) | **63** |
| 3 ex æquo | « Un seul chrono » (emil-design-eng + apple-design) | 9 / 8 / 8 / 7 = **32** | 8 / 7 / 8 / 6 = **29** | **61** |
| 3 ex æquo | « Depuis quand ? » (ecc:product-lens) | 7 / 7 / 9 / 7 = **30** | 7 / 8 / 9 / 7 = **31** | **61** |
| 5 | « Coup d'œil » (ui-ux-pro-max) | 7 / 8 / 8 / 8 = **31** | 6 / 8 / 8 / 7 = **29** | **60** |

### Idées greffées sur la proposition gagnante

- **De l'approche native** :
  - limite de 8 h des Live Activities ;
  - `elapsedRealtime`, `BOOT_COMPLETED` et `TIME_SET` ;
  - Android 16 en style standard ;
  - FCM data et push-to-start pour la fraîcheur entre aidants ;
  - icônes en assets, largeur du chrono contrainte ;
  - heure absolue sur Android ;
  - `childId` dans chaque lien ;
  - couleurs précalculées dans le snapshot.
- **De « Un seul chrono »** :
  - cohérence spatiale stricte entre les tailles ;
  - une seule action sous le chrono ;
  - aucun « Démarrer » sur l'écran d'accueil ;
  - garde-fou au-delà de 12 h ;
  - masquage sur l'écran verrouillé ;
  - ordre de l'accueil de l'app.
- **De « Depuis quand ? »** :
  - « depuis » avant « combien » ;
  - « par Awa » ;
  - large en rangées fixes ;
  - sous-feature `widget_basic` ;
  - indicateurs de succès et pitch du paywall.
- **De « Coup d'œil »** :
  - remontée dans la Smart Stack ;
  - fonction pure partagée avec `home.tsx` ;
  - état « Ouvrir pour actualiser » (seuil ramené à 2 h) ;
  - 3e métrique configurable en V2.

### Éléments écartés

- Total et « + Promenade » dans le small.
- Frise de 12 h.
- Grilles de boutons de démarrage dans le large.
- Bouton Pause au lancement.
- Chrono de tétée affichant le total G+D.
- SF Rounded.
- Filet coloré de 4 pt.
- Seuil de fraîcheur à 6 h.
- Nouveaux tokens rose et vert non nécessaires.