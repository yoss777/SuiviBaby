# Lentille Product

Vote : **R2** | Note du widget actuel : **5/10**

Cette lentille résume un cadre publié (biographie de Steve Jobs par Isaacson et pratiques d'Apple). Elle ne parle au nom de personne. L'avis marché vient de `marche.md`, faute de Perplexity connecté.

## Ce qui est fort

- **Une phrase claire** : « Depuis quand il a mangé et été changé, et qui fait quoi maintenant. » R2 tient en une phrase, R1 non.
- **On part du vrai moment.** À 3 h du matin, un parent jette un œil au téléphone. R2 met « il y a 6h58 » en héros et relègue les « 0 repas ». C'est le standard du marché (Nara, StandBy de Mango, Sprout).
- **On sait dire non.** Plus de défilement, plus de compteurs inutiles, plus de « Prochain sein ». Le widget Actions et l'auteur sont reportés.
- **Ce que personne d'autre n'a** : un Android complet, gratuit et à jour en 1,2 s. Huckleberry n'a pas de widget Android, et Huckleberry comme Nighp réservent le leur à l'abonnement.
- **Le soin des détails invisibles** : `canWrite`, un libellé vocal par zone, le test « jamais d'auteur sur une tétée ».

## Ce qui tuerait le widget (3 risques)

1. **Un fil iOS périmé.** Le parent voit « Récents » sans le change que l'autre aidant a noté à 02:40. Un widget qui ment détruit la confiance plus vite qu'un widget vide. Nara a eu des avis négatifs pour des widgets figés.
2. **La couture entre les deux OS.** Si l'iPhone affiche « 7 h 35 min » et Android « il y a 6h58 », le couple voit toujours deux produits (retour n° 3). Tout le bénéfice de la grammaire unique disparaît.
3. **La dispersion avant le 2/2.** Vouloir tout R3 (Live Activity partagée, APNs, auteur, actions) pour une seule personne donne des surfaces moyennes partout au lieu d'un widget excellent. Les avis sur Huckleberry, avec des boutons qui ne démarrent rien, montrent ce que coûte une fonction bâclée.

## Questions au fondateur

- Quelle est la seule information qui doit rester si le widget n'a qu'une ligne : le repas, ou ce qui est en cours ?
- Accepteriez-vous un moyen iPhone **sans fil** tant qu'E7 n'existe pas ? Le marché le fait, Mango compris.
- L'auteur sur le fil répond-il à un vrai besoin de relais, ou à une envie de contrôle ? La nounou est-elle d'accord pour que son prénom s'affiche ?
- Avez-vous vu le grand widget iOS sur un vrai appareil, de nuit, en mode clair et en mode sombre ?

## Conditions

1. Livrer d'abord les correctifs de R1 : `canWrite`, un libellé vocal par zone, suppression du `LazyColumn` et de `nextSide`.
2. Prototyper « il y a h:mm » sur iOS dès le premier jour. En cas d'échec, adopter un seul format, identique sur les deux OS, plutôt que de patcher expo-widgets.
3. Ne pas afficher de fil au moyen iPhone sans E7 : deux emplacements « il y a » seulement. Garder le fil 3 lignes en 3×2 pour Android.
4. Tester avec la police à 200 % et en troncature avant la mise en production.
5. Avant le 2/2, ne prendre de R3 que la Live Activity et la notification de session déjà planifiées. Reporter l'auteur et le widget Actions en V1.5.
6. Critère de sortie : un parent comprend le widget en moins de 2 secondes, sans ouvrir l'app.
