# Multi-bébés dans le widget : angle produit et priorisation

> Réponse au brief `BRIEF_MULTI_BEBES.md`, cadrée avec `ecc:product-lens` (diagnostic produit et score ICE). Écrit le 13/11/2026.

## 1. Recommandation

**V1 (lancement du 2/2) : garder A**, le widget suit le bébé actif, avec le prénom toujours visible, gratuit et sans aucune mention du Premium. **Pas de B (swipe), ni maintenant ni plus tard.** Dès qu'on a un chiffre réel sur les foyers à plusieurs bébés suivis : **un bébé choisi par widget (C), d'abord sur iOS**, en V1.5 (mi-mars), seulement si ce chiffre dépasse environ 5 % des foyers actifs.

Côté Premium : **retirer « choix du bébé » de l'argumentaire du 2/2.** Il ne concerne qu'une petite minorité et il n'existe pas encore sur Android. Il ne peut donc pas porter l'offre.

## 2. Pourquoi

### Combien de foyers sont concernés

- **Jumeaux : environ 1,7 % des accouchements en France** (INSEE, 2013 : 13 898 accouchements multiples sur 805 801, dont 97,7 % de jumeaux ; l'INED donne 17,0 pour 1 000). Sources : [INSEE, Les naissances en 2013](https://www.insee.fr/fr/statistiques/1379742), [INED, Accouchements multiples](https://www.ined.fr/fr/tout-savoir-population/chiffres/france/naissance-fecondite/accouchements-multiples/). Un blog cite 16 pour 1 000 en 2022 sans source primaire : **non vérifié**.
- **Fratrie rapprochée dont les deux enfants sont suivis en même temps** (un bébé et un aîné encore saisi dans l'app) : **je ne peux pas le chiffrer avec une source.** Ce chiffre dépend de notre usage réel plus que de la démographie.
- **Ce qu'il faut mesurer** : ajouter une colonne à la requête 0.3 (`PLAN_ACTION_WIDGET.md`, S1, lecture seule), à savoir la part des utilisateurs actifs qui ont saisi des événements pour **au moins 2 enfants différents** sur 14 jours. C'est le seul chiffre qui permet de trancher. Hypothèse de travail, non vérifiée : entre 2 et 6 % des foyers actifs.

### Valeur pour l'utilisateur et coût

- **La valeur est forte pour peu de gens.** Pour un foyer de jumeaux, voir les deux bébés compte énormément : c'est exactement le cas « deux sessions en même temps ». Pour 95 % des foyers ou plus, la valeur est nulle.
- **Le coût porte surtout sur les données, pas sur l'affichage.** Toute option qui montre un bébé non actif (B, C, D, E) oblige l'app à calculer les données de **tous** les bébés. Aujourd'hui, `useNowWidgetSync` écoute un seul `childId` (`hooks/useNowWidgetSync.ts:64-72`), et l'envoi est bloqué dès qu'une donnée appartient à un autre enfant (`:91-93`). Il faudrait plus de listeners Firestore, un `NowWidgetProps` indexé par enfant, et plus de lectures. Or ces lectures pèsent justement sur le chantier « coût des gratuits ».
- **Les plateformes tranchent contre B.** Il n'y a pas de swipe dans WidgetKit, et Glance n'a pas de pager horizontal (voir le brief). B serait donc une fonction propre à Android, peu fiable selon le lanceur (`AdapterViewFlipper` / `StackView`), avec deux comportements différents selon la plateforme.
- **C est faisable sur iOS sans toucher au natif d'expo-widgets.** Le module expose déjà la configuration utilisateur : `setConfigurationParameterEnum` (`node_modules/expo-widgets/build/Widgets.d.ts:35`, `ios/WidgetObject.swift:37`) et `environment.configuration` (iOS 17+, `build/Widgets.types.d.ts:87-90`). **Sur Android, rien d'équivalent** : je ne trouve aucune activité de configuration dans `node_modules/expo-widgets/android`. Il faudrait l'écrire et l'ajouter à notre patch.

### Ce que font les concurrents

| App | Plusieurs bébés dans le widget | Statut |
|---|---|---|
| Huckleberry | Un enfant par widget, à choisir avec « Modifier le widget » puis « Select Child » (iOS). Les Live Activities sont réservées à Premium/Plus. | Vérifié par un extrait de recherche de la [FAQ widgets iOS](https://huckleberry.zendesk.com/hc/en-us/articles/15265962112787-iOS-Widgets-Frequently-Asked-Questions-FAQ) et de la [FAQ Live Activities](https://huckleberry.zendesk.com/hc/en-us/articles/18411865969427-Live-Activities-Frequently-Asked-Questions-FAQ). La page renvoie une erreur 403 à la lecture directe. |
| Baby Daybook | Widgets et profils multiples (jumeaux, fratrie) annoncés sur la [fiche App Store](https://apps.apple.com/app/id1446283219). Comment on choisit l'enfant dans le widget : inconnu. | Partiellement vérifié |
| Mango Baby | La fiche annonce des widgets et plusieurs profils de bébé ([App Store](https://apps.apple.com/app/id1512238725)). | Partiellement vérifié |
| Baby Tracker (Nighp) | Un avis décrit un compte séparé par jumeau ([App Store](https://apps.apple.com/app/id845657206)). Comportement du widget : inconnu. | Non vérifié |
| Glow Baby | Plusieurs bébés dans l'app ([Product Hunt](https://ship.producthunt.com/p/glow-inc/glow-baby)). Widget multi-bébés : rien trouvé. | Non vérifié |
| Baby Buddy | Projet libre, sans widget natif trouvé. Le multi-enfant passe par l'intégration Home Assistant, un capteur par enfant ([guide](https://smarthomescene.com/guides/how-to-setup-baby-buddy-in-home-assistant)). | Non vérifié pour le widget |

**Aucun concurrent trouvé ne fait de swipe entre bébés.** Le standard observé, celui de Huckleberry, c'est un widget par enfant, choisi à l'ajout. C est donc la convention que les parents connaissent déjà.

### Place dans le Premium (lancement le 2/2/2027)

- `WIDGET_SPEC.md` § 8 range « Choix du bébé par widget » dans Premium, et `PLAN_ACTION_WIDGET.md` compte sur lui pour l'offre de lancement. Je le déconseille, pour trois raisons :
  1. il ne concerne que quelques pourcents des foyers et ne fera donc pas convertir ;
  2. il n'existera pas sur Android au 2/2 ;
  3. il frôle la règle du fondateur, « Premium vend le confort, jamais l'accès à ce qui se passe maintenant ». Pour des jumeaux, voir la sieste en cours du second bébé, c'est justement « ce qui se passe maintenant ».
- **Si C arrive plus tard**, le classer en Premium reste défendable, à une condition : **le gratuit garde A**, donc l'accès à tous les bébés en changeant de bébé dans l'app. On ne met jamais de cadenas, de flou ou de mention du Premium dans le widget. Le choix se découvre uniquement dans l'écran d'aide « Ajouter le widget ».

### Score ICE

Formule : impact × confiance ÷ effort, chaque critère de 1 à 5 (effort 5 = le plus coûteux).

| Option | Impact | Confiance | Effort | ICE | Commentaire |
|---|---|---|---|---|---|
| **A. Suivre le bébé actif** (actuel) | 2 | 5 | 1 | **10** | Déjà livré et corrigé ; suffit pour 95 % des foyers ou plus |
| **C. Un bébé par widget, choisi à l'ajout** (iOS d'abord) | 4 | 3 | 3 | **4** | Convention du marché ; API iOS présente ; données de tous les bébés à calculer ; Android à écrire |
| **E. Empilé : sessions en cours de tous les bébés à gauche, journée du bébé actif à droite** | 3 | 3 | 3 | **3** | Respecte le mieux « le direct gratuit pour tous » ; le petit format sature vite avec deux bébés |
| **D. Bouton « bébé suivant »** | 3 | 2 | 4 | **1,5** | App Intent sur iOS 17+, `actionRunCallback` sur Android, absent de notre pont ; risque de mauvais bébé à 3 h du matin |
| **B. Swipe horizontal** | 3 | 1 | 5 | **0,6** | Impossible sur iOS ; Android incertain selon les lanceurs |

## 3. Ce qui casse avec B, l'option écartée

- **3 h du matin, jumeaux.** La mère allaite Léa, le père donne un biberon à Hugo. Sur iPhone, le swipe n'existe pas : le widget de la mère ne montre qu'un bébé. La promesse « je vois les deux » ne tient donc que sur Android, et seulement avec certains lanceurs.
- **Un geste qui se dispute l'écran.** Sur Android, le swipe horizontal sur un widget entre en conflit avec le changement de page du lanceur. Le parent, une main sur le bébé, change d'écran au lieu de changer de bébé.
- **La page du swipe se perd.** Après un rechargement, le widget revient au premier bébé. On regarde alors le mauvais chrono sans s'en rendre compte : c'est pire qu'un bébé fixe.
- **Le coût tombe sur les gratuits.** Il faut écouter et envoyer les données de tous les bébés, pour tous les comptes, avant même de savoir combien de foyers s'en servent.

**Ce qui casse aussi avec A, et qu'on accepte en V1.** La mère a laissé Hugo actif dans l'app, puis lance une tétée de Léa depuis la notification : son widget montre toujours Hugo. On le limite ainsi : prénom toujours visible en haut à gauche (`WIDGET_SPEC.md`, ligne 41) et `childId` dans le lien profond.

## 4. Coût de la recommandation

- **V1 (A)** : rien à faire. On ajoute seulement la colonne « nombre d'enfants actifs » au script 0.3 (lecture seule, local, sans rebuild).
- **V1.5 (C sur iOS, si le seuil est atteint)** :
  - `utils/widgetSnapshot.ts` : props indexées par `childId` ;
  - `hooks/useNowWidgetSync.ts` : écoute des enfants configurés, pas seulement de l'actif ;
  - `services/widgetSync.ts` : appel à `setConfigurationParameterEnum` avec la liste des bébés ;
  - `widgets/BebeMaintenant.ios.tsx` : lecture de `environment.configuration`.
  - La déclaration du paramètre se fait probablement dans la config du plugin : **build EAS iOS** à prévoir.
  - Environ 3 à 4 jours.
- **C sur Android** : une activité de configuration native à écrire dans le patch expo-widgets. Recompilation locale (1 à 2 min). Environ 2 à 3 jours de plus.
- **Risques** :
  - plus de lectures Firestore (à mesurer avec 0.4) ;
  - widget orphelin si un bébé est supprimé ou si le partage est retiré (prévoir un retour au bébé actif) ;
  - budget de rechargement WidgetKit partagé entre plusieurs widgets.

## 5. Ce qui reste incertain, et comment le vérifier

1. **La part des foyers à plusieurs bébés suivis** : requête 0.3 étendue (S1). Seuil de décision : 5 %.
2. **Comment se comporte la configuration iOS d'expo-widgets** : où le paramètre se déclare, et ce qui se passe quand la liste d'options change. À tester dans les prototypes `spike/widget` (ligne « Choix du bébé » du plan).
3. **Le comportement réel des concurrents** (Baby Daybook, Glow, Nighp) : installer les apps et tester l'ajout d'un widget avec deux profils. Ce sont 30 minutes de test sur téléphone, à faire par Yoss.
4. **La demande réelle** : compter les messages du support et les avis qui parlent de « jumeaux » ou de « deux enfants » après le 2/2, avant d'engager C.
