# Plan temporaire — sync foreground et stop/undo

Ce fichier sert au suivi pendant l'implémentation. Il pourra être supprimé une fois toutes les étapes terminées et validées.

## État des étapes

- [x] Étape 1 — Forcer le refresh foreground depuis le serveur avec `getDocsFromServer`, et protéger contre les réponses obsolètes avec un token de séquence.
- [x] Étape 2 — Ajouter un test Cloud Function garantissant que `heureFin: null` et `duree: null` sont convertis en suppressions Firestore.
- [x] Étape 3 — Dédupliquer les handlers stop sommeil/promenade via un helper local `stopTimedEventWithUndo`.
- [x] Étape 4 — Refactoriser les updates optimistes autour d'un `operationId` retourné par `modifierEvenementOptimistic`, avec tests ciblés.
- [x] Étape 5 — Ajouter une action crayon découvrable à côté de "Terminer" dans les widgets sommeil/promenade, en gardant le long-press comme raccourci.
- [x] Étape 6 — Vérifier les changements ciblés.
- [x] Étape 7 — Auditer les écrans bottom tab et sous-écrans de `plus.tsx` concernés par le refresh foreground serveur.
- [x] Étape 8 — Créer un hook commun `useForegroundServerRefresh` avec seuil 30s, silence offline/erreur et protection anti-race.
- [x] Étape 9 — Intégrer le refresh foreground serveur aux écrans mono-listener.
- [x] Étape 10 — Intégrer le refresh foreground serveur aux écrans multi-listeners en mettant à jour les refs par type avant merge.
- [x] Étape 11 — Corriger le clic crayon sommeil/promenade pour ouvrir la sheet avec `En cours` ON.
- [x] Étape 12 — Aligner `routines.tsx` et `activities.tsx` sur l'UX `home` : stop direct + undo + crayon.
- [x] Étape 13 — Vérifier les changements étendus.
- [x] Étape 14 — Ajouter le refresh foreground serveur à `gallery.tsx` pour éviter les souvenirs photo stale.
- [x] Étape 15 — Retirer le long-press des boutons "Terminer" sommeil/promenade, nettoyer l'a11y et renforcer le contraste du crayon.
- [x] Étape 16 — Factoriser le stop+undo chrono, harmoniser haptics/a11y des widgets et compléter la parité d'édition promenade.
- [x] Étape 17 — Autoriser l'arrêt immédiat d'un chrono créé en optimistic pending et rejouer l'update quand le vrai id Firestore arrive.

## Notes

- `refreshMerged` -> `recomputeMerged` est volontairement différé pour éviter du churn sans changement fonctionnel.
- Le refresh foreground doit rester silencieux en cas d'échec réseau/offline.
- Vérifications effectuées :
  - `npx jest __tests__/optimisticEventsStore.test.ts __tests__/useMergedOptimisticEvents.test.ts --runInBand --watchman=false`
  - `npx jest __tests__/optimisticEventsStore.test.ts __tests__/useMergedOptimisticEvents.test.ts __tests__/useForegroundServerRefresh.test.tsx --runInBand --watchman=false`
  - `npx jest __tests__/useForegroundServerRefresh.test.tsx --runInBand --watchman=false`
  - `npx jest --config functions/jest.config.js functions/__tests__/cloudFunctions.test.js --runInBand --watchman=false`
  - `git diff --check`
  - `npm run typecheck` échoue encore sur des erreurs existantes hors périmètre ; après corrections, aucune erreur ne concerne les fichiers modifiés par ce plan.
- Écrans à couvrir pour le refresh foreground serveur :
  - Mono-listener : `chrono`, `croissance`, `moments/useMomentsData`, `activities`, `pumping`, `growth`, `milestones`.
  - Multi-listeners : `home`, `stats`, `meals`, `routines`, `diapers`, `soins`, `immunizations`.
  - `gallery` est hors optimistic merge ; ajout du refresh foreground serveur en étape dédiée.
