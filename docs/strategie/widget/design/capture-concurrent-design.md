# Capture d'un concurrent : cellule design UI/UX (ui-ux-pro-max, 2026-11-13)

## À reprendre (principes)
- Une place fixe par catégorie : l'œil va à la bonne ligne sans lire. Chez nous la disposition change selon l'état.
- « Il y a » en valeur principale (à 3 h, on veut « depuis combien de temps »), l'heure en petit dessous.
- Un pictogramme par catégorie : glyphes vectoriels monochromes de préférence aux emoji (rendu variable, criards la nuit).
- Sous-ligne d'anticipation (« rappel dans 10 min ») avant le dépassement.

## Moins bon chez eux
Boutons plus forts que les données ; cibles ~40 dp collées ; sommeil ambigu (« 4h48 ago » : dort-il ?) ; abréviations anglaises (« Exp. », « ago ») ; barre d'écran verrouillé illisible ; en-tête photo décoratif ; pas de bilan du jour.

## Saisie depuis le widget
Oui, tard : après le temps réel et le calcul serveur. Seulement démarrer/arrêter tétée, pipi, selle ; biberon et solide ouvrent l'écran prérempli ; jamais de suppression. 48 dp, 8 dp d'écart, en bas ; un seul bouton à libellé changeant pour démarrer/arrêter ; effet visible < 1 s ; « Annuler » ~10 s plutôt qu'une confirmation. Étape intermédiaire : un lien profond par zone vers l'écran de saisie prérempli (80 % du gain).

## Trois priorités
1. Au repos : « il y a » en principal, positions fixes par catégorie (JS seul).
2. Lien profond par zone (JS seul si le pont le permet, sinon patch).
3. Pictogrammes vectoriels + libellé court à la place des pastilles (iOS JS ; Android recompilation).
