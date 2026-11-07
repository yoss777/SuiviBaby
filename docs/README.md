# Documentation SuiviBaby

Index de la documentation du dépôt. Chaque document est listé une fois, par
thème. Dernière mise à jour : 2026-11-07 (sprint S13.7).

Le point d'entrée pour l'état courant est
[PLAN_SPRINTS_AUDIT.md](PLAN_SPRINTS_AUDIT.md) (plan des sprints) et
[SUIVI_ACTIONS.md](SUIVI_ACTIONS.md) (échéances et décisions en attente). Pour
exploiter l'app, lire [RUNBOOK.md](RUNBOOK.md).

Les fichiers à la racine du dépôt : [README.md](../README.md) (présentation et
commandes) et [ROADMAP.md](../ROADMAP.md).

## Produit

- [PREMIUM_OFFRE_CIBLE.md](PREMIUM_OFFRE_CIBLE.md) : offre Premium visée et écarts avec l'implémentation.
- [UX_IMPROVEMENTS_MATRIX.md](UX_IMPROVEMENTS_MATRIX.md) : suivi des améliorations UX écran par écran.
- [EVENT_TYPE_COVERAGE_MATRIX.md](EVENT_TYPE_COVERAGE_MATRIX.md) : types d'événements couverts par l'app (matrice).
- [SETTINGS_CHANGELOG.md](SETTINGS_CHANGELOG.md) : historique des modifications de l'écran Réglages.
- [STATS_PERF_REFONTE.md](STATS_PERF_REFONTE.md) : refonte de l'écran Statistiques (performance et fluidité).
- [VOICE_BAR_REFONTE.md](VOICE_BAR_REFONTE.md) : refonte de l'entrée vocale (barre micro, alignement site et app).
- [PHOTO_MODERATION_IMPLEMENTATION_PLAN.md](PHOTO_MODERATION_IMPLEMENTATION_PLAN.md) : plan de modération des photos d'enfants.

## Architecture

- [ENVIRONMENTS.md](ENVIRONMENTS.md) : environnements (production, staging), déploiement, release mobile.
- [adr/](adr/) : décisions d'architecture (ADR), numérotées.
  - [0001-android-cloud-build.md](adr/0001-android-cloud-build.md) : pourquoi le build Android cloud échouait et le montage retenu.
  - [0002-app-check-enforcement.md](adr/0002-app-check-enforcement.md) : critères et étapes pour imposer App Check.
  - [0003-expo-updates.md](adr/0003-expo-updates.md) : décision sur les mises à jour OTA (expo-updates).
- [CLOUD_FUNCTIONS_COLD_START_TRADEOFF.md](CLOUD_FUNCTIONS_COLD_START_TRADEOFF.md) : `minInstances` ou démarrage à froid (décision en suspens).
- [EVENT_OPTIMISTIC_PROPAGATION_PLAN.md](EVENT_OPTIMISTIC_PROPAGATION_PLAN.md) : propagation des ajouts et modifications d'événements (interface optimiste).
- [PERMISSIONS.md](PERMISSIONS.md) : modèle des permissions (rôles, documents d'accès, règles).
- [PERMISSIONS_IMPLEMENTATION.md](PERMISSIONS_IMPLEMENTATION.md) : guide d'implémentation des permissions.
- [PERMISSIONS_DEPLOYMENT.md](PERMISSIONS_DEPLOYMENT.md) : déploiement du système de permissions (résumé).
- [PERMISSIONS_FINAL_STATUS.md](PERMISSIONS_FINAL_STATUS.md) : état final des permissions. Chevauche les deux précédents : à fusionner.
- [STORAGE_SECURITY.md](STORAGE_SECURITY.md) : sécurité du stockage des photos et médias.
- [PLAN_PROMENADE_SYNC_MULTIUSER.md](PLAN_PROMENADE_SYNC_MULTIUSER.md) : synchronisation multi-utilisateur des widgets promenade et sommeil.
- [VOICE_LLM_REFONTE.md](VOICE_LLM_REFONTE.md) : refonte de la commande vocale par LLM.
- [VOICE_PIPELINE_HARDENING_PLAN.md](VOICE_PIPELINE_HARDENING_PLAN.md) : plan de durcissement du pipeline vocal.
- [VOICE_PIPELINE_REDTEAM_REPORT.md](VOICE_PIPELINE_REDTEAM_REPORT.md) : rapport de test d'attaque du pipeline vocal (clôture).
- [RUNTIME_MIGRATION_2026.md](RUNTIME_MIGRATION_2026.md) : migration des fonctions vers Node 22 et firebase-functions v5 (exécutée en avril 2026).
- [MIGRATION_EXPO_AUDIO.md](MIGRATION_EXPO_AUDIO.md) : migration de `expo-av` vers `expo-audio`.
- [ASSETS_WEBP_TODO.md](ASSETS_WEBP_TODO.md) : conversion des images en WebP (partielle).

## Exploitation

- [RUNBOOK.md](RUNBOOK.md) : procédures d'exploitation (déploiements, release, sauvegardes, alertes, incidents, maintenance).
- [ENVIRONMENTS.md](ENVIRONMENTS.md) : mise en place et commandes de l'environnement de staging, release mobile, maintenance hebdomadaire.
- [FIREBASE_MONITORING.md](FIREBASE_MONITORING.md) : alertes budget, Sentry, RevenueCat, App Check et sauvegardes (commandes et seuils).
- [RUNTIME_VALIDATION_CHECKLIST.md](RUNTIME_VALIDATION_CHECKLIST.md) : checklist de validation runtime.
- [MIGRATION_PHOTOS_EU.md](MIGRATION_PHOTOS_EU.md) : migration des photos vers le bucket européen (étapes et reste à faire).
- [STORE_SUBMISSION.md](STORE_SUBMISSION.md) : soumission aux stores. Écrit pour la v1.0.0 : à mettre à jour avant reprise.
- [SUIVI_ACTIONS.md](SUIVI_ACTIONS.md) : échéances, contrôles et décisions en attente (à relire chaque lundi).

## Légal et conformité

- [STORE_PRIVACY.md](STORE_PRIVACY.md) : réponses aux fiches de confidentialité des stores (App Store, Google Play).
- Pages publiques du site (`public/`) : [privacy.html](../public/privacy.html) (confidentialité), [terms.html](../public/terms.html) (CGU), [mentions-legales.html](../public/mentions-legales.html), [delete-account.html](../public/delete-account.html) (suppression de compte).
- Textes de consentement santé : affichés par l'app (écran de consentement) ; version enregistrée côté serveur.

## Audits et plans

- [AUDIT_COMPLET_2026-11.md](AUDIT_COMPLET_2026-11.md) : audit complet du 2026-11-05 (neuf revues par domaine).
- [PLAN_SPRINTS_AUDIT.md](PLAN_SPRINTS_AUDIT.md) : plan des sprints issu de l'audit (S1 à S13).
- [SUIVI_ACTIONS.md](SUIVI_ACTIONS.md) : suivi des actions de l'audit et des décisions (D1 à D10).
- [redteam-app/](redteam-app/README.md) : plans d'action et clôtures de la revue de sécurité de l'app (lots A, B et 0).

## Archive

- [archive/](archive/README.md) : plans, todos et audits terminés (sprints 1 à 4, anciens todos, versions précédentes de la monétisation).
