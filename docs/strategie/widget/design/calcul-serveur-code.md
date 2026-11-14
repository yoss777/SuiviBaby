# Calcul serveur du widget : angle code et maintenance

Réponse de l'agent ECC « typescript-reviewer » au brief `BRIEF_CALCUL_SERVEUR.md` (2026-11-13).

## Verdict
La copie serveur n'est pas nécessaire pour le temps réel. Si le serveur calcule, option B (module partagé `shared/widget/` compilé vers `functions/lib/generated/`), sans copie à la main ; sinon D (serveur minimal), le plus sûr côté maintenance. Copie manuelle déconseillée : deux miroirs existent déjà (`functions/lib/quietHours.js`, `functions/lib/enums.js`) avec « garder alignés ».

## Constats dans le dépôt
- `utils/widgetSnapshot.ts` : un seul import, de type (`NursingTimerState`), mais à déplacer hors de `nursingTimer.ts` (AsyncStorage). `formatClock` utilise `getHours()` : heure UTC sur Functions → fuseau explicite requis.
- L'essentiel de la logique est dans `hooks/useNowWidgetSync.ts` (minuit local, filtre biberons, fusion des repas, couleurs) : à extraire en `assembleWidgetInput(events, now, tz, prefs)`.
- Functions : Node 22 CommonJS sans TS ; `firebase.json` n'embarque que `functions/` ; `require("../utils/…")` casse en production ; alias `@/` inconnu.
- `functions/jest.config.js` : seuils de couverture, fichier généré à exclure ou tester. `deploy-functions.yml` ne se déclenche que sur `functions/**` : ajouter `shared/**`.

## Ce que le serveur ne sait pas
- Fuseau horaire (à stocker par appareil avec le jeton push) ; minuit sans événement (tâche planifiée ou repli téléphone).
- Premium (RevenueCat côté app ; à relire en Firestore, avec retard du webhook).
- Seuils de rappels (sur le téléphone ; à écrire dans `user_preferences`) → calcul par destinataire, N fois par événement.
- Brouillon local de tétée (AsyncStorage).

## Ce qui casse ailleurs
- Copie à la main : un biberon d'eau compté comme repas côté serveur après un oubli → 5 repas widget, 4 dans l'app.
- B sans `paths:` : serveur en retard d'une version.
- B sans fuseau : compteurs et « depuis HH:MM » faux autour de minuit.
- D : fil du jour et compteurs périmés app fermée.

## Coût (B)
Une demi-journée d'extraction + une demi-journée build/CI/déploiement. Aucun natif pour B (le service Kotlin reste nécessaire dans tous les cas). Déploiements : Functions, plus règles si on stocke fuseau et préférences. Non vérifié : `firebase deploy` avec lien symbolique ou `file:../`.
