# Checklist de validation runtime

Date: 2026-03-29
Contexte: validation manuelle du chantier de propagation add/edit d'events avec optimistic UI, avec focus sur `chrono`, `meals`, `diapers`, l'offline/resync et le feedback global d'erreur.

## Pré-requis

- Lancer l'app en mode dev avec la toolchain Node chargée:
  - `source ~/.nvm/nvm.sh && npm start`
- Ouvrir un simulateur iOS/Android ou un device physique.
- Garder les logs Metro visibles pendant la session.
- Utiliser un enfant avec suffisamment d'historique pour tester `7j`, `14j` et `30j`.

## Résultat attendu global

- Aucun warning React du type `Maximum update depth exceeded`.
- Aucun écran bloqué en chargement infini.
- Toute création/édition apparaît immédiatement.
- La propagation est cohérente entre écran source, `chrono` et `home`.
- Le mode offline garde le rendu visible jusqu'au resync.
- Le retour online ne crée ni doublon ni rollback parasite.

## Checklist Chrono

### Montée d'écran

- Ouvrir [chrono.tsx](/Users/yoss/Projets/SuiviBaby/app/(drawer)/baby/(tabs)/chrono.tsx).
- Vérifier qu'aucun warning `Maximum update depth exceeded` n'apparaît.
- Vérifier que l'écran charge correctement et que la liste s'affiche.

### Fenêtre de temps

- Basculer `7j`.
- Basculer `14j`.
- Basculer `30j`.
- Vérifier que le changement de plage reste fluide.
- Fermer puis rouvrir l'écran.
- Vérifier que la plage restaurée est bien `7`, `14` ou `30`, jamais autre chose.

### Scroll / focus

- Scroller jusqu'en bas de la liste.
- Vérifier qu'aucun chargement en boucle n'apparaît.
- Changer d'onglet puis revenir sur `chrono`.
- Mettre l'app en arrière-plan puis au premier plan.
- Vérifier qu'il n'y a pas de rerender infini ni de flicker anormal.

## Checklist Meals

Écran: [meals.tsx](/Users/yoss/Projets/SuiviBaby/app/(drawer)/baby/(tabs)/meals.tsx)

### Création

- Ajouter une tétée.
- Ajouter un biberon.
- Ajouter un repas solide.
- Vérifier que chaque event apparaît immédiatement dans l'écran.

### Édition

- Modifier une tétée existante.
- Modifier un biberon existant.
- Vérifier que la mise à jour est visible immédiatement.

### Propagation

- Après ajout/édition, aller sur `chrono`.
- Vérifier que les events y sont visibles sans action manuelle spéciale.
- Aller sur `home`.
- Vérifier que les indicateurs concernés ont bien convergé.

## Checklist Home

Écran: [home.tsx](/Users/yoss/Projets/SuiviBaby/app/(drawer)/baby/(tabs)/home.tsx)

### Propagation dashboard

- Depuis `meals`, ajouter un biberon puis revenir sur `home`.
- Vérifier la mise à jour des widgets/indicateurs repas.
- Depuis `diapers`, ajouter une miction puis revenir sur `home`.
- Vérifier la mise à jour des indicateurs couches/changes.
- Depuis `chrono`, éditer un event déjà affiché aujourd'hui.
- Vérifier que `home` reflète bien la version modifiée.

### Focus / retour d'onglet

- Ouvrir `home`.
- Basculer sur un autre onglet, créer un event, puis revenir.
- Vérifier que `home` a bien convergé sans refresh manuel.

### Feedback global

- Déclencher une mutation qui échoue depuis un onglet autre que `home`.
- Revenir sur `home` ou rester hors `home`.
- Vérifier que le toast d'erreur n'est pas dépendant de l'ouverture du dashboard.

## Checklist Diapers

Écran: [diapers.tsx](/Users/yoss/Projets/SuiviBaby/app/(drawer)/baby/(tabs)/diapers.tsx)

### Création

- Ajouter une miction.
- Ajouter une selle.
- Vérifier apparition immédiate dans la liste.

### Édition

- Modifier une miction existante.
- Modifier une selle existante.
- Vérifier que l'édition reste visible immédiatement.

### Propagation

- Aller sur `chrono`.
- Vérifier la présence et la cohérence des events.
- Revenir sur `diapers`.
- Vérifier qu'il n'y a pas de duplication ou de saut visuel.

## Checklist Offline / Resync

### Création offline

- Couper le réseau du simulateur/device.
- Depuis `chrono`, `meals` ou `diapers`, créer un event.
- Vérifier qu'il reste visible immédiatement.
- Changer d'onglet puis revenir.
- Vérifier qu'il reste visible.

### Édition offline

- Toujours offline, modifier un event existant.
- Vérifier que la modification reste visible.
- Vérifier qu'il n'y a pas de retour visuel à l'ancien état.

### Resync

- Réactiver le réseau.
- Attendre la convergence Firestore/queue offline.
- Vérifier:
  - pas de doublon
  - pas de disparition parasite
  - même état final sur écran source et `chrono`

## Checklist Toast global d'échec

- Déclencher un échec contrôlé si possible:
  - Functions indisponibles
  - erreur backend volontaire
  - configuration dev cassée de manière temporaire
- Lancer une création ou une édition depuis un onglet autre que `home`.
- Vérifier qu'un toast d'erreur apparaît quand même.

## Notes à relever pendant la QA

- Date/heure du test
- Plateforme testée
- Écran concerné
- Action effectuée
- Résultat observé
- Logs utiles
- Capture éventuelle

## Critère de sortie

La validation runtime est considérée satisfaisante si:

- `chrono`, `meals` et `diapers` ne produisent plus de boucle de rendu;
- `home` reflète correctement les mutations propagées depuis les autres écrans;
- add/edit se propagent correctement;
- offline puis resync restent stables;
- le feedback d'erreur optimistic est global;
- aucun bug bloquant nouveau n'est observé.
