# Timeline du widget Android : arbitrage architecture (2026-11-14)

Avis de l'agent `ecc:architect` sur `BRIEF_TIMELINE.md` (architecture, maintenance, coût). Sources : capture 01:36, `widgets/BebeMaintenant.android.tsx`, `functions/shared/widget/index.js`, `plugins/withWidgetIcons.js`, `RecentEventsList.tsx`.

## Q1 : lignes du fil

| Option | Note | Raison |
|---|---|---|
| (a) picto + heure + libellé (actuel) | 11/20 | 17 drawables générés, plugin `withDangerousMod`, vue native `ImageView` teintée ; picto 13 dp peu lisible, colonne des heures décalée |
| (b) heure puis picto | 13/20 | mêmes coûts natifs ; heures alignées |
| (c) sans picto | 15/20 | le plus simple ; aucun repère visuel |
| (d) pastille 8 dp (couleur du type) | **17/20** | pur Glance (`dot()` existe), aucune ressource native, même pastille que la frise de l'Accueil, iOS trivial |

Recommandation (d) : [pastille 8 dp][6][heure, largeur fixe 36 dp][6][libellé]. Garder `icon` dans `WidgetEvent` comme clé de couleur (pas de couleur hexadécimale dans le message push). Supprimer le plugin, les drawables et le script.

## Q2 : libellé du bloc au repos

| Option | Note | Raison |
|---|---|---|
| A. « ● Repas · il y a » / 5h59 / « à 19:37 » (actuel) | **16/20** | tient dans ~108 dp ; « il y a » collé à la durée |
| B. « Dernier repas » / grand « il y a 5h59 » / « à 19h37 » | 7/20 | ~175 dp en 30 sp : déborde ; « 19h37 » à côté de « 5h59 » brouille heure et durée |
| C. « Dernier repas » / 5h59 / « il y a · à 19:37 » | 12/20 | « Dernier change » (~112 dp) déborde ; durée lue avant son sens |

Convention : heure « 19:37 », durée « 5h59 » / « 45 min ». Ne pas toucher `clock()` ni `env.clock`.

## Q3 : colonne de droite

4×2 : zone ≈ 162 dp, compteurs 48+8+48+48 = 152 dp : le fil commence hors écran.

| Option | Note |
|---|---|
| Harmoniser l'espacement seul | 12/20 (fil toujours caché) |
| Fil à la place des compteurs | 11/20 |
| Retirer le fil | 13/20 |
| **Compteurs compacts (20 dp, non cliquables) au repos, items 48 dp en session, écart uniforme** | **17/20** |

Au repos, les liens repas/change sont déjà à gauche : les compteurs peuvent devenir des lignes compactes et laisser 3 à 4 événements visibles. En session, 3 × 48 dp avec 8 dp partout.

## Risques

- Message push inchangé (`icon` conservé), loin des 3 500 octets.
- TalkBack : le fil n'est pas lu ; ajouter « Dernier évènement : HH:MM libellé ».
- À vérifier sur le S21 Ultra en clair et en sombre.
