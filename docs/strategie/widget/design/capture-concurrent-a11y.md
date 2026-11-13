# Capture d'un concurrent : angle accessibilité (ECC a11y-architect, 2026-11-13)

## À reprendre
- Icône toujours doublée d'un texte (WCAG 1.1.1, 1.4.1) ; notre emoji du fil reste accompagné du libellé.
- État « en retard » porté par un mot et une icône (« Exp. 12:35 », cloche), pas par le rouge seul.
- Actions groupées à droite, de taille uniforme (à porter à 48 dp minimum).
- Côté de tétée écrit (« (L) »), pas seulement par couleur ou position.

## Moins bon chez eux
Contrastes faibles (gris sur gris, rouge clair), texte 11-12 px dans la barre ; boutons Stop/Play distingués par plein/contour seulement ; pipi/selle en pictogrammes sans texte ; aucune annulation visible ; barre dense lue en fragments par un lecteur d'écran.
Chez nous : chrono de la session en premier, lecture seule (pas de saisie accidentelle), jamais d'auteur sur une tétée.

## Saisie depuis le widget : oui, en deux temps, sous conditions
Ordre : pipi / selle d'abord, puis « Arrêter la tétée », démarrer une tétée en dernier.
Conditions : cibles de 48 dp (44 pt iOS) espacées de 8 dp ; libellé explicite nommant le bébé (« Arrêter la tétée de Léo ») ; annulation visible ~10 s dans le widget, annoncée à TalkBack (sinon pas de saisie) ; retour non visuel ; pas de « + » vers un menu ; anti double appui et déduplication serveur ; échec affiché en texte (« Non envoyé, ouvrir l'app »), jamais de faux succès ; pas de bouton sur écran verrouillé sans protection.

## Trois priorités
1. Lisibilité et étiquettes (emoji + mot, contrastes 4,5:1, sp, phrase d'annonce par bloc) : JS seul.
2. Boutons Pipi / Selle / Arrêter la tétée avec annulation : JS + écriture serveur authentifiée + recompilation et tests du pont.
3. Retard exprimé par texte + icône : JS seul, puis serveur.
