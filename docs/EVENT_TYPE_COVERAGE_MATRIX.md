# Matrice de couverture - Types d'events ciblés

Date: 2026-03-29
Source: phase 4 du plan `EVENT_OPTIMISTIC_PROPAGATION_PLAN.md`

## Décision de périmètre

- `couche` reste supporté côté backend et formats de commande, mais n'est plus un event UI moderne de premier niveau.
- Le produit moderne affiche et manipule le domaine "couches" via `miction` et `selle`.
- Les écrans `home`, `chrono`, `diapers` et les caches du jour doivent donc couvrir `miction` / `selle`, pas `couche`.

## Matrice

| Type | Add | Edit | Delete | Optimistic create | Optimistic update | Home | Chrono | Écran dédié | Offline | Statut | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `vaccin` | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Supporté | Lecture dédiée via `immunizations`, lecture générale via hook partagé |
| `vitamine` | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Supporté | Même contrat que `vaccin` |
| `couche` | Non UI moderne | Non UI moderne | Non UI moderne | Non UI moderne | Non UI moderne | Non | Non | Dérivé via `diapers` | N/A | Backend/legacy | Le domaine couches UI passe par `miction` / `selle` |
| `nettoyage_nez` | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Supporté | Couvert via `routines` et lecture générale |
| `jalon` | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Supporté | Ajout rapide humeur migré sur optimistic |
| `activite` | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Supporté | `chrono` lit maintenant via hook partagé |
| `sommeil` | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Oui | Supporté | `chrono` et `routines` alignés sur le même contrat |

## Implications

- Toute réintroduction de `couche` dans un écran moderne doit être traitée comme une nouvelle décision de produit et d'architecture.
- Tant que cette décision ne change pas, toute nouvelle feature "couches" doit s'appuyer sur `miction` / `selle` pour la propagation optimistic et le rendu cross-screen.
