# Lentille Offers

Vote : **R2** | Note du widget actuel : **5/10**

## Ce qui est fort

- **Le marché.** La douleur est forte : à 3 h du matin, l'aidant se demande « il a mangé quand ? ». Les acheteurs sont faciles à trouver, puisque ce sont les utilisateurs déjà installés. En revanche, la natalité ne fait pas grandir ce marché. Le widget ne vend rien : il fait revenir les utilisateurs et donne une preuve de valeur avant le Premium du 2/2.
- **L'équation de valeur.** R2 joue sur les quatre leviers. Le résultat rêvé, c'est savoir depuis quand il a mangé et été changé. Le délai est nul, l'effort aussi (aucun geste). Reste la probabilité perçue, c'est-à-dire la confiance dans le chiffre. Le push Android à 1,2 s en est la preuve, et aucun grand concurrent ne l'offre sur Android (Huckleberry : widgets iOS seulement, Live Update payant).
- **Pas de concurrence par le prix.** Le widget est gratuit et sans incitation à payer, alors que Huckleberry, Nighp et Sprout le font payer. Mais la gratuité n'est pas une offre : ce qui la rend évidente, c'est « il y a » en héros, le fil sans défilement et la parité entre les deux OS.
- **Le stack.** Chaque problème trouve sa solution : « depuis quand », « que s'est-il passé pendant que je dormais » (le fil), « une session est-elle en cours », « je suis Proche, je consulte seulement » (`canWrite`). Tout cela coûte peu, puisque `recent` existe déjà.

## Ce qui tuerait le widget (3 risques)

1. **Un chiffre faux, c'est une confiance perdue.** Un fil iPhone périmé sans E7 détruit la probabilité perçue, le levier qui fait échouer la plupart des offres. Un widget qui ment une seule fois n'est plus regardé.
2. **Un iPhone de second rang.** Si la parité promise n'existe que sur Android, la promesse « vrai pour toute la famille » s'effondre chez la moitié des aidants, souvent l'autre parent.
3. **Le stack qui gonfle avant le lancement.** Live Activity partagée, Actions et auteur, c'est 14 à 18 jours pour une seule personne : le risque est de livrer en retard une offre inachevée plutôt qu'une offre resserrée à l'heure.

## Questions au fondateur

- Quelle preuve donnez-vous qu'un parent garde le widget 30 jours (rétention avec ou sans widget, Android aujourd'hui) ?
- Quelle date ferme pour E7 ? Sans elle, que montre l'iPhone ?
- Le widget fait-il partie du message de lancement (« gratuit, temps réel, toute la famille ») ou reste-t-il un détail ?
- La notification de session Android, déjà prévue, est-elle le bonus le moins cher pour rattraper Huckleberry ?

## Conditions

1. Les correctifs de R1 passent d'abord : `canWrite`, un libellé vocal par zone, suppression du `LazyColumn` et de `nextSide`.
2. Prototype iOS « il y a 6h58 » dès le premier jour. S'il échoue, on garde le format natif, sans étendre le patch.
3. Sur iPhone, le fil du moyen n'apparaît qu'avec E7. D'ici là, deux emplacements « il y a », plus « màj HH:MM » si la donnée a plus de 2 h.
4. De R3, on ne garde avant le 2/2 que la notification de session Android et la Live Activity déjà au plan. L'auteur et le widget Actions passent en V1.5.
5. Mesure : part des actifs avec le widget installé et rétention à J30, à suivre dès la livraison.
