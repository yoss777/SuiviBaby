# Refonte du widget « Bébé maintenant » : avis de la cellule produit (2026-11-14)

# Cellule produit : contenu du widget (product-lens, job-to-be-done et ICE)

**Job-to-be-done** : « À 3 h du matin, ou quand je prends le relais, savoir en 1 seconde depuis quand il a mangé, s'il a été changé, ce qui est en cours et ce qui s'est passé en mon absence, sans ouvrir l'app. »

## 1. Diagnostic

**Ce qui marche**
- La donnée est unique : `functions/shared/widget/index.js` sert à l'app et au serveur. Le temps réel Android répond en 1,2 s en veille profonde, c'est notre vrai différenciateur.
- Le chrono des sessions est gratuit et se met à jour sans rechargement sur les deux plateformes. Aucune incitation à payer n'apparaît dans le widget.
- « Il y a 6h58 » répond directement au réveil nocturne.

**Ce qui ne marche pas**
- **Deux produits.** Android dit « Dernier repas / il y a… / dernier à », iOS dit « Repas / à HH:MM / N repas ». Le moyen iOS n'a pas de fil, et le fil Android se cache sous la ligne de flottaison (il faut défiler). Sur les deux plateformes, ce qui a le plus de valeur est donc invisible.
- **Valeur mal ordonnée.** « 0 repas / 0 change » le matin occupe la place de l'information utile. Les compteurs servent au bilan du soir, pas au réveil.
- **Pas de relais possible.** Ni `recent` ni `lives` ne portent d'auteur, donc on ne voit pas ce que la nounou a fait. La spec prévoyait pourtant « Sieste lancée par Awa ». La règle « jamais d'auteur sur une tétée » doit rester.
- **Rôle absent des données.** Les props ne disent pas si l'utilisateur est un Proche, d'où le « Noter un repas » lu par TalkBack à quelqu'un qui ne peut pas saisir.
- **iOS figé** : pas de push avant E7. Le fil du grand widget vieillit, et un fil périmé est pire que pas de fil.

## 2. Verdict : refonte partielle du **contenu et de la grammaire**, pas du moteur

Une refonte totale serait du gaspillage. La couche de données, le temps réel Android et les vues natives patchées fonctionnent. Ce qu'il faut refaire :
- une hiérarchie unique par taille, identique sur les deux plateformes ;
- aucun défilement, nulle part ;
- un auteur sur les événements hors tétée ;
- le rôle dans les props.

Il faut le faire **avant le 2/2/2027**. Le widget est notre levier de rétention gratuit, et un widget incohérent pendant les cohortes de lancement coûte plus cher qu'une semaine de travail.

## 3. Propositions (contenu partagé : `buildNowWidgetProps` + `role` + `recent[].by`)

### P1 « Réveil d'abord » : une grammaire, trois paliers, zéro défilement (recommandée)

Les compteurs ne s'affichent que s'ils sont supérieurs à 0 et seulement dans les grandes tailles. Le fil se limite à 3 lignes en moyen et 6 en grand. L'auteur est affiché hors tétée.

```
iOS petit / Android 2×2        iOS moyen / Android 3×2
┌─────────────┐                ┌──────────────────────────────┐
│ Prénom      │                │ Prénom              Aujourd'hui│
│ Dern. repas │                │ Dern. repas  │ 14:02 Change·pipi│
│ il y a 2h10 │                │ il y a 2h10  │   Marc          │
│ Dern. change│                │ Dern. change │ 12:22 Tétée 15m │
│ il y a 40min│                │ il y a 40min │ 11:05 Sieste 1h │
└─────────────┘                └──────────────────────────────┘
(en cours : le chrono remplace le bloc de gauche)

iOS grand / Android 4×2 (le 4×2 = moyen élargi, fil à 3 lignes + ligne « Auj. 5 repas · 4 changes · 3h20 »)
┌──────────────────────────────┐
│ Prénom                Aujourd'hui │
│ Dern. repas il y a 2h10 │ Dern. change il y a 40min │
│ Auj. : 5 repas · 4 changes · sommeil 3h20 │
│ Évènements récents (6, sans défilement)   │
│ ● 14:02 Change · pipi — Marc              │
│ ● 12:22 Tétée 15 min                      │
└──────────────────────────────┘
```

**Rétention** : elle sert le réveil nocturne et le relais. **ICE** 5×4÷3 = **6,7**.

### P2 « Relais » : le fil comme cœur

En moyen et plus : « Depuis ton dernier passage » (3 à 6 événements, avec auteur hors tétée) à droite, et en dessous seulement l'âge du dernier repas.

```
petit / 2×2 : identique à P1 (pas la place pour un fil)
moyen / 3×2 :  │ Repas il y a 2h10 │ 3 nouveaux : 14:02 Change — Awa … │
grand / 4×2 :  + Sieste en cours 0:42 — lancée par Awa
```

Fort pour la nounou et le second parent. Faible au réveil, où « nouveaux » n'a pas de sens. Il faut un « dernier passage » par utilisateur, donc un état serveur en plus. **ICE** 4×3÷4 = **3**.

### P3 « Minimal » : maintenant seul, fil absent sauf en grand

```
petit / 2×2 : chrono ou « il y a 2h10 »
moyen / 3×2 et 4×2 : repas | change | sommeil (3 grands chiffres)
grand iOS seulement : + 7 événements
```

Le moins cher et le plus robuste avec le budget iOS. Mais il abandonne le relais, qui est notre différenciateur face à Huckleberry. **ICE** 3×4÷1,5 = **8** en théorie, mais l'impact sur la rétention est faible.

**Gratuit et Premium dans les trois propositions** : contenu identique pour tous. Premium n'ajoute que le rouge discret des rappels du change, pompage et vitamines, et le choix de l'enfant. Pas de cadenas, pas de ligne absente « à débloquer ».

## 4. Coût et risques

| | Jours | Risques |
|---|---|---|
| P1 | 5 à 7 (2 rendus, champs `by` et `role`, tests de parité) | Fil iOS périmé sans E7 : afficher « mis à jour HH:MM » au-delà de 2 h. Accessibilité : une phrase par ligne, pas d'action pour un Proche. |
| P2 | 8 à 10 | Nouvel état « dernier passage », coût des envois FCM, confidentialité de l'auteur (la nounou doit voir son prénom affiché ailleurs). |
| P3 | 2 à 3 | Perte du relais, régression perçue sur Android. |

**Risques communs**
- Ne jamais donner d'auteur à une tétée : test unitaire sur `recent`.
- Le prénom de l'aidant devient une donnée affichée sur l'écran d'accueil : `privacySensitive` sur iOS.
- Le temps réel iOS (E7, Live Activity) reste le vrai plafond de valeur sur iPhone. P1 le contourne sans le résoudre.

**Mesure de succès** (déjà en spec) : foyers avec widget installé à 30 jours et rétention à 60 jours avec ou sans widget. À instrumenter **avant** le 2/2 pour avoir une base de comparaison.

## 5. Notes /20 (angle produit : utilité quotidienne et rétention)

- **P1 « Réveil d'abord » : 17/20.** Elle sert le réveil et le relais, une seule grammaire, pas de défilement, coût raisonnable.
- **P2 « Relais » : 13/20.** Bonne idée pour une V2, trop chère et trop faible au réveil pour le lancement.
- **P3 « Minimal » : 11/20.** Sûre, mais elle sacrifie le différenciateur entre aidants.

**Prochaine étape** : ajouter `role` et `recent[].by` (hors tétée) dans `functions/shared/widget/index.js`, puis rendre P1 à l'identique sur iOS et sur Android. En parallèle, prioriser E7 (push iOS).
