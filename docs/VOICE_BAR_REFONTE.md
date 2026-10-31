# Refonte de l'entrée vocale — barre micro + alignement site / app

> Démarré le 2026-10-31 · Suivi pas à pas, mis à jour à la fin de chaque étape.

## Constat

Le nouveau site (`public/`, commit `ea513c0`, pas encore déployé) montre dans
son hero un téléphone animé avec une **barre micro fixe en bas de l'écran** et
la transcription en direct. Cette maquette diverge de l'app actuelle :

| Élément | Site (`public/index.html`, `public/assets/js/site.js`) | App actuelle |
|---|---|---|
| Micro | Barre sombre en bas, transcription live | Icône nue à droite de « Bonjour » (`home.tsx:1974`), qui rétrécit à 18 px dans l'en-tête au scroll (`home.tsx:1408`) |
| Geste | « Appuyez et parlez… » | **Maintenir** (`onPressIn` / `onPressOut`, `VoiceCommandButton.tsx:87-100`) |
| Après dictée | « Enregistré ✓ » direct | `ConfirmModal` « Confirmer / Annuler » |
| En-tête | Avatar + « Léo · 4 mois » | Prénom centré, puis « Bonjour » + date |
| Stats du jour | 3 tuiles : repas, sommeil, **kg** | Cartes repliables par catégorie (`StatsGroup`), pas de poids |
| Journal | Emoji, heure à droite | Icônes vectorielles (`EVENT_CONFIG`), heure à gauche + frise |
| Couleurs | Fond neutre | Pastels par catégorie (`constants/dashboardColors.ts`) |

La barre micro du site est la **meilleure UX** (zone du pouce, usage à une main
la nuit, retour visible pendant la dictée). Décision : corriger le site pour ne
pas promettre ce qui n'existe pas (phase 1), puis amener la barre dans l'app
(phase 2) ; le site redevient alors fidèle.

## Phase 1 — Aligner le site sur l'app (avant déploiement du site)

- [ ] **1.1 Geste** : « Appuyez et parlez… » → « Maintenez pour parler… »
  (`index.html:158`, `site.js:183`) ; FAQ « Vous appuyez sur le micro » →
  « Vous maintenez le micro » (`index.html:459`).
- [ ] **1.2 Confirmation** : remplacer « Enregistré ✓ » (`site.js:215`, `:229`)
  par une étape de confirmation visible (« Biberon 150 ml à 06:40 ? ✓ »), puis
  l'ajout au journal.
- [ ] **1.3 Icônes et couleurs** : emoji du journal démo (`site.js:146-150`) →
  SVG proches des icônes de l'app (biberon, lune, tétée…), teintes tirées de la
  palette « Pastel Moderne » (biberon `#E8785A`, nuit `#5A6BA4`, tétée `#D66B8F`).
- [ ] **1.4 Tuiles** : remplacer « kg » par une donnée présente sur l'accueil
  (ex. « changes ») ; garder repas / sommeil.
- [ ] **1.5 En-tête démo** : décider avatar/âge (garder si l'étape 2.5 est
  retenue, sinon « Bonjour » + prénom comme l'app).
- [ ] **1.6 Vérif rendu** : captures 1440×900 et 390×844 (mobile réel ou
  émulation DevTools — Chrome headless impose ~500 px min), `prefers-reduced-motion`,
  bouton pause, contraste.
- [ ] **1.7 Déploiement** : `firebase deploy --only hosting` (sur validation).

## Phase 2 — Barre micro dans l'app

- [ ] **2.1 Composant `VoiceBar`** (`components/suivibaby/VoiceBar.tsx`) :
  barre pleine largeur au-dessus de la tab bar, bouton micro rond à gauche,
  libellé « Maintenez pour parler » ; réutilise la logique de
  `VoiceCommandButton` (enregistrement, quota, modales) — extraire un hook
  `useVoiceCommand` plutôt que dupliquer.
- [ ] **2.2 États** : repos / enregistrement (rouge `#ef4444`, durée, onde ou
  point pulsé) / traitement (spinner + « Je réfléchis… ») / proposition (texte
  interprété) / erreur (message + réessayer) / quota atteint (modale existante)
  / permission micro refusée (lien Réglages).
- [ ] **2.3 Placement** : sur l'accueil uniquement dans un premier temps ;
  owner/admin seulement (même règle que l'icône actuelle). Gérer la cohabitation
  avec le FAB `+` (`GlobalFAB.tsx`, bas-droite) : soit FAB remonté au-dessus de
  la barre, soit micro intégré au FAB — trancher sur maquette.
- [ ] **2.4 Retirer l'ancien point d'entrée** : icône de la salutation
  (`home.tsx:1974`) et version en-tête au scroll (`home.tsx:1347-1429`, `:1408`).
- [ ] **2.5 (optionnel) En-tête** : avatar + âge de l'enfant actif, si on veut
  coller à la maquette.
- [ ] **2.6 Accessibilité** : `accessibilityRole="button"`, label/hint « Maintenir
  pour dicter un événement », cible ≥ 48 px, alternative tap-to-toggle pour les
  utilisateurs qui ne peuvent pas maintenir, annonces VoiceOver/TalkBack des états.
- [ ] **2.7 Safe areas / edge-to-edge** : Android 16 edge-to-edge, encoche iOS,
  clavier ouvert (barre masquée), mode sombre (`dashboardColors` dark).
- [ ] **2.8 Tests** : unitaires du hook (états, quota, erreurs), snapshot du
  composant, flow Maestro « maintenir → confirmer → événement au journal ».
- [ ] **2.9 Build EAS + test appareil** (piloté par l'utilisateur).

## Phase 3 — Resynchroniser le site

- [ ] **3.1** Remettre la démo du site au plus près de la `VoiceBar` livrée
  (libellés, états, couleurs), captures d'écran store à jour si besoin.

## Hors périmètre

- Interprétation vocale (CF `parseVoiceCommand`) : inchangée, voir
  `docs/VOICE_LLM_REFONTE.md`.
- Refonte du reste de l'accueil (StatsGroup, frise du journal).
