# Lentille Monopoly

Vote : **R2** | Note du widget actuel : **5/10**

Lentille appliquée : résumé du cadre publié dans *Zero to One* (2014). Les informations sur le marché viennent de `marche.md` et d'une recherche web faite le 14/11, Perplexity n'étant pas connecté.

## Ce qui est fort

- **Un petit marché qu'on peut dominer** : les foyers à plusieurs aidants (parents, nounou, grands-parents) qui sont sur Android. Huckleberry n'a pas de widget Android, et sa Live Update est payante et réservée à Android 16. SuiviBaby a déjà un push serveur qui arrive en 1,2 s en veille profonde. Le widget Android est donc l'endroit où l'on prend une grosse part d'un petit segment.
- **Un effet de réseau en germe** : chaque aidant invité rend le widget plus utile aux autres, puisqu'il voit ce que l'autre a noté. Une fonction isolée ne crée pas cet effet, alors que l'usage partagé d'une famille le crée.
- **Une distribution déjà intégrée** : chaque invitation d'aidant ajoute un utilisateur sans coût d'acquisition.
- **R2 crée de la différence sans dépenser** : un fil visible dès le 3×2, gratuit, sans incitation à payer, alors que le marché montre en général 1 à 3 « dernier X ».

## Ce qui tuerait le widget (3 risques)

1. **Une copie à six mois** : le « il y a » en héros est devenu la norme (Nara, Mango, Sprout). Dobbin (Live Update partagée, Now Bar Samsung) et Tymbr (« noté une fois, vu par tous » sur iOS, Android et le web) sont déjà sur le créneau multi-aidants Android. Si l'avantage se limite à la mise en page, il n'y a pas de position durable.
2. **Un iPhone figé** : sans E7, le slogan « vrai pour toute la famille » est faux pour la moitié du foyer. Un fil périmé dégrade la marque, qui est le seul actif durable accessible ici.
3. **La dette du patch expo-widgets** : une montée de SDK qui casse le widget efface l'avance technique en une version, et un fondateur seul ne peut pas la reconstruire à chaque fois.

## Questions au fondateur

- Quel est le secret, ce que tu sais et que les autres ignorent ? Le relais entre aidants (qui a fait quoi, hors tétée) ou le temps réel ?
- Quel petit marché vises-tu d'abord : la France francophone, Android, avec une nounou ? Combien de foyers, et quelle part en 2027 ?
- Combien d'aidants actifs compte un foyer qui garde le widget, comparé à un foyer qui le retire ?
- Qu'est-ce qui empêche Dobbin de livrer ton fil 3×2 le mois prochain ?

## Conditions

- **R2 d'abord**, avec les correctifs de R1 (`canWrite`, libellés vocaux) au jour 1 et le prototype iOS « il y a 6h58 » avant de figer `v:2`.
- **E7 est un préalable au lancement**, pas une option : c'est lui qui rend l'effet de réseau réel sur les deux systèmes.
- **Mesurer le réseau** : nombre d'aidants par foyer qui utilisent le widget, et rétention du widget selon ce nombre. Sans ce chiffre, on ne sait pas si l'on construit un monopole ou une fonction.
- **Sortir le patch dans un module local** avant la prochaine montée de SDK.
- **L'auteur sur le fil hors tétée** est le candidat le plus sérieux pour un avantage durable (il matérialise le relais). C'est à Yoss de trancher la question de confidentialité, mais à tester dès la V1.5.

Sources : [Dobbin (Play)](https://play.google.com/store/apps/details?id=com.dobbin.app) · [Tymbr (Play)](https://play.google.com/store/apps/details?id=com.tymbrmobile) · [FAQ Live Activities Huckleberry](https://huckleberry.zendesk.com/hc/en-us/articles/18411865969427-Live-Activities-Frequently-Asked-Questions-FAQ)
