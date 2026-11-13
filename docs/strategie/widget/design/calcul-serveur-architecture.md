# Calcul serveur du widget : angle architecture

Réponse de l'agent ECC « architect » au brief `BRIEF_CALCUL_SERVEUR.md` (2026-11-13).

## Verdict
Le calcul côté serveur est nécessaire, une copie ne l'est pas. Option B : un seul module pur dans `functions/shared/widget/`, importé par l'app (Metro lit le CommonJS) et par les Functions (seul `functions/` est déployé). Transport du plan : push FCM data → service Kotlin. C, D et la copie à la main écartées.

## Pourquoi
- Le téléphone ne peut pas recalculer app fermée de façon fiable (fenêtre FCM ~10 s ; push silencieux iOS « two or three per hour », jeté après fermeture forcée). Le push WidgetKit iOS 26 ne porte aucune donnée : il impose un résultat déjà calculé sur un endpoint.
- La logique est large (hook l. 39-197, `home.tsx` l. 1524-1536 pour le sommeil, `excludeOptimistic`) et change souvent (3 commits cette semaine). Le projet a déjà quatre miroirs manuels.
- Contrat de données : heures en ms mises en forme sur l'appareil (`sinceMs`, `lastMealKind` au lieu de découper des libellés) ; `dayStartMs` calculé avec `device_tokens.tz`, et le widget masque les compteurs après minuit sans push (redessin programmé à minuit sur Android) ; calcul du jour injecté (local côté app, `Intl` + fuseau côté serveur).
- Versions : format `v` par ajouts seulement, le serveur lit `appVersion` / `widgetCap` de l'appareil. Calcul en deux étages : par enfant et fuseau (sessions, compteurs, fil), puis par utilisateur (Premium, rappels).

## Ce qui casse ailleurs
- Copie à la main : regroupement passé à 45 min dans l'app seulement → « 5 repas » sur le widget, 4 dans l'Accueil.
- C : Samsung écran éteint, la relecture dépasse la fenêtre ; iPhone, 4e push de l'heure perdu.
- D : « dernier repas 14:32 » à côté de compteurs d'avant la saisie ; le widget se contredit.

## Risques restants
Premium changé sans événement (parade : recalcul au webhook RevenueCat) ; voyage (jour décalé jusqu'à l'ouverture, heures justes) ; équivalence `usePremium` / `billing/subscription.js` à confirmer.

## Coût
Environ 2 jours JS à la place de E1-E2 : `functions/shared/widget/` (`snapshot.js`, `inputs.js`, `day.js`, `colors.js`, `index.d.ts`), façade `utils/widgetSnapshot.ts`, hook réduit à la collecte, jeux de test communs rejoués des deux côtés. Natif : rien de plus que le plan. Déploiements : ceux du plan, sur accord de Yoss ; CI qui teste le module avant le déploiement des Functions.
