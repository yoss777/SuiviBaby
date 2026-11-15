# Refonte du widget « Bébé maintenant » : étude de la cellule marché (2026-11-14)

## Cellule marché : les widgets des apps de suivi bébé (14/11/2026)

Méthode : le skill perplexity s'est chargé, mais aucun outil Perplexity n'est connecté dans cette session. J'ai donc utilisé WebSearch et WebFetch. Mes sources sont les fiches App Store et Play, les aides en ligne des éditeurs et la presse. Reddit n'a rien remonté directement. Les pages d'aide Huckleberry ont refusé l'accès (erreur 403) : ce qui les concerne vient des extraits de recherche. Aucun fichier n'a été modifié.

### Par application

- **Huckleberry** (leader, le plus cité sur Reddit)
  - Widgets d'écran d'accueil sur **iOS seulement**, payants (Plus) : « Quick Log » et « One Tap Tracking », boutons de saisie, activités au choix.
  - Écran verrouillé payant (Plus/Premium) : Live Activity sur iOS, **Live Update sur Android 16+**.
  - Elle se déclenche au lancement d'un chrono sieste ou tétée, à une saisie de sommeil ou de repas (affiche alors le « dernier repas »), et pour SweetSpot (prochaine sieste, iOS seulement).
  - Avis négatifs : boutons du widget qui ne lancent pas le suivi, texte blanc sur fond blanc en mode clair, pas de biberon dans le suivi en direct.
  - Contradiction : une note de version promet une synchro instantanée entre appareils, l'aide dit « propre à l'appareil, mise à jour seulement à l'ouverture ».
  - https://huckleberrycare.com/product/free · https://huckleberry.zendesk.com/hc/en-us/articles/18411865969427-Live-Activities-Frequently-Asked-Questions-FAQ · https://apps.apple.com/us/app/huckleberry-baby-tracker/id1169136078
- **Baby Tracker (Nighp)** : widgets écran d'accueil et écran verrouillé « pour l'info rapide », widgets « What's Next » (prochaine étape, payant Plus 5,99 $/mois), Live Activity pour les sessions, Dynamic Island, complications Watch (activités récentes et temps écoulé). https://apps.apple.com/app/id779656557
- **Nara Baby** : plusieurs widgets d'accueil (temps depuis le dernier repas ou sommeil). Live Activity pour sommeil, tire-lait, tétée et mixte, **partagée avec les autres aidants**, démarrage et arrêt sans déverrouiller. Avis : widgets qui se figeaient, corrigé depuis. https://apps.apple.com/app/id1444639029
- **Sprout** : « widgets interactifs et Live Activities » pour lancer les chronos depuis l'accueil ou l'écran verrouillé, prévision de sieste dans le widget. Grande complication Watch : temps depuis repas, sommeil et change, plus durées en cours. Bugs de Live Activity bloquée corrigés. Abonnement de 5,99 $/semaine à 59,99 $/an. https://apps.apple.com/us/app/baby-tracker-log-sprout/id551448817
- **Baby Daybook** : widgets iPhone avec start/stop de tétée sans déverrouiller et heure du dernier change ou biberon. Avis : « dommage que le grand widget à actions multiples ait disparu ». Côté Android, rien de vérifié (la fiche Play n'a pas pu être lue). https://apps.apple.com/app/id1446283219
- **Mango Baby** (référence la plus riche, prime unique de 9,99 $)
  - **14 widgets gratuits** : Récents, Actions rapides, Résumé du jour, Activité seule (interactive, désactivable), graphiques, profil, écran verrouillé circulaire.
  - Mode veille StandBy, widgets teintés, Dynamic Type, contrôles du Centre de contrôle (un par sein).
  - Une saisie depuis le widget lance une Live Activity.
  - Avis élogieux sur le StandBy « temps depuis le dernier biberon et le dernier change ».
  - https://apps.apple.com/app/id1512238725
- **Android natif** :
  - **Dobbin** : notification permanente qui compte sur l'écran verrouillé de **tous les aidants**, Live Update sur Android 16, widget « éveillé depuis ».
  - **FeedRight** : dernier repas avec chrono en direct, journée, saisie en un geste.
  - **Tummy Timer** : saisie depuis la notification ou le widget.
  - Liens : https://play.google.com/store/apps/details?id=com.dobbin.app · https://play.google.com/store/apps/details?id=com.feedRight · https://play.google.com/store/apps/details?id=com.tummytimer
- **Sans widget trouvé** :
  - Glow Baby : chrono et Watch seulement (https://apps.apple.com/app/id1077177456).
  - ParentLove : rien sur iOS ni sur Android (https://apps.apple.com/us/app/id1038554631).
  - BabyConnect : Watch, Alexa et Siri seulement (https://en.babyconnect.com/).
  - À confirmer sur appareil.
- **Hors bébé** :
  - **Apple Fitness** : anneaux plus bouton « démarrer un exercice », le moyen ajoute l'heure et l'intensité.
  - **Google Health 5.0** (ex-Fitbit, mai 2026) : widget « Quick Access » redimensionnable **de 1 à 6 indicateurs (jusqu'à 5×3)**.
  - **Android 16/17** : la puce de statut affiche un chronomètre qui compte seul. Le modèle « Metric Style » d'Android 17 vise santé et minuteurs.
  - Liens : https://9to5google.com/2026/05/20/google-health-5-0-widget/ · https://developer.android.com/develop/ui/compose/notifications/live-update · https://androidauthority.com/android-17-live-updates-metric-style-template-3669117

### 5 tendances dominantes

1. **« Il y a » avant tout** : le temps depuis le dernier repas, change ou sommeil est l'information n°1 partout (Nara, Mango StandBy, complication Sprout, FeedRight). Les compteurs du jour passent au second plan.
2. **Les sessions en cours sortent du widget** vers Live Activity, Dynamic Island ou Live Update Android 16, avec un chrono système qui avance sans rechargement.
3. **Plusieurs widgets spécialisés** plutôt qu'un seul widget complet (Mango 14, Huckleberry 2, Nara plusieurs) : actions, récents, une seule activité, résumé.
4. **Saisie et chrono en un geste** depuis le widget (boutons interactifs iOS 17, Centre de contrôle), souvent payante chez les leaders.
5. **Le fil des événements récents est rare** : seul Mango propose un grand widget « Récents ». Les autres montrent 1 à 3 « dernier X ».

### 3 manques que SuiviBaby pourrait occuper

1. **Parité et temps réel partagé sur Android** : Huckleberry n'a pas de widget Android et réserve le Live Update au payant et à Android 16+. Le push serveur de SuiviBaby (1,2 s en veille profonde) n'a pas d'équivalent connu chez les grands, à part la notification de Dobbin.
2. **Fiabilité multi-aidants** : les avis reprochent des widgets figés, des chronos qui ne démarrent pas et une Live Activity propre à l'appareil. Un affichage « vrai pour toute la famille » est un argument différenciant.
3. **Gratuit et sans incitation à payer** : chez les leaders, widgets et Live Activities sont un argument d'abonnement. Un widget complet et gratuit (règle SuiviBaby) se démarque, comme Mango, cité pour cette raison.

### Conséquences pour iPhone et Android

- **iPhone** :
  - Ne pas chercher le fil complet dans le moyen. Le marché fait du petit et du moyen centrés « il y a » (repas, change), plus un grand « Récents » façon Mango.
  - Les sessions passent en Live Activity (déjà prévue en S4/S5), seul moyen d'avoir un chrono qui avance sans dépendre du budget de rechargement.
  - Une Live Activity partagée entre aidants (comme Nara) suppose le push iOS (E7).
  - Étudier un deuxième widget « Actions » interactif (App Intents) plutôt que d'alourdir le principal.
- **Android** :
  - L'avance est réelle (temps réel, chrono natif). Le marché va vers un widget redimensionnable qui montre plus d'indicateurs à mesure qu'il grandit (Google Health).
  - En 3×2 : « il y a » plus les sessions. En 4×2 ou plus : ajout des récents sans défilement caché.
  - Ajouter une notification permanente en Live Update (Android 16+) pour les sessions en cours, comme Huckleberry et Dobbin.
- **Commun aux deux** : une seule logique de libellés (« il y a 6h58 », « dernier à 19:37 ») partagée entre plateformes, puisqu'aucun concurrent n'a deux formulations différentes selon l'OS. Les boutons doivent disparaître pour un Proche.
