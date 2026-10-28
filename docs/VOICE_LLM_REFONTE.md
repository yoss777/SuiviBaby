# Refonte de la brique vocale — interprétation par LLM

> Démarré le 2026-10-28 · Suivi pas à pas, mis à jour à la fin de chaque étape.

## Objectif

Remplacer l'interprétation par règles (≈ 2 100 lignes de détecteurs/regex dans
`services/voice/`) par une interprétation par LLM, **sans régresser** sur la
sécurité acquise lors du red team voix (`docs/VOICE_PIPELINE_REDTEAM_REPORT.md`)
ni sur l'expérience actuelle (confirmation avant écriture, modification /
suppression, multi-événements).

## Architecture cible

```
expo-audio (enregistrement)
   └─► CF transcribeAudio (AssemblyAI, inchangée)        → texte
          └─► CF parseVoiceCommand (Claude, NOUVELLE)     → JSON structuré, validé serveur
                 └─► client : mapping déterministe        → ParsedCommandResult[]
                        └─► flux existant (confirmation → validateAndCreateEvent …)

Repli : si parseVoiceCommand échoue (hors ligne, timeout, quota, réponse
invalide), le client utilise le parseur à règles actuel sur le même texte.
```

Principes :
- **Le LLM n'écrit jamais en base.** Il produit une proposition ; l'écriture
  passe toujours par la confirmation utilisateur puis `validateAndCreateEvent`,
  qui applique les bornes serveur.
- **Le LLM ne calcule pas les dates.** Il renvoie « maintenant », « il y a N
  minutes » ou « à HH:MM » ; la conversion en horodatage est faite par du code
  déterministe dans le fuseau du téléphone.
- **La transcription est une donnée non fiable** (injection de prompt possible) :
  sortie contrainte par schéma JSON, puis revalidée côté serveur (énums, bornes).
- **Contrat de sortie identique** (`ParsedCommandResult`) : l'aval ne change pas.

## Périmètre

| Inclus | Exclu (et pourquoi) |
|---|---|
| Interprétation LLM + repli règles | Changement de STT — exige un banc d'essai sur de vrais enregistrements |
| Jeu d'évaluation chiffré | Mode temps réel « Jarvis » — dépend d'App Check, gardé en dernière étape |
| Intégration client | Siri / App Intents — module natif + droits Apple, chantier séparé |
| Migration `expo-av` → `expo-audio` | |
| Revue multi-agents (ECC) + recette | |

## Étapes

| # | Étape | Statut |
|---|---|---|
| 0 | Cadrage, corpus d'évaluation, mesure du parseur actuel | ✅ |
| 1 | Contrat de sortie + validation serveur + mapping client (TDD) | ⬜ |
| 2 | Cloud Function `parseVoiceCommand` | ⬜ |
| 3 | Intégration client avec repli | ⬜ |
| 4 | Évaluation réelle LLM vs règles, itération du prompt | ⬜ |
| 5 | Migration `expo-av` → `expo-audio` | ⬜ |
| 6 | Revue multi-agents ECC + corrections | ⬜ |
| 7 | Recette finale | ⬜ |

---

## Journal

### Étape 0 — Cadrage ✅

**Choix du modèle.** Candidat par défaut : **Claude Haiku 5.5** (`claude-haiku-5-5`),
effort `low`. Raison : extraction courte vers un schéma fermé, sensible à la
latence ; ≈ 40× moins cher qu'Opus 5.5 (0,10 $ / 0,50 $ par million de tokens
contre 4 $ / 20 $). Le modèle reste un paramètre ; l'étape 4 compare Haiku 5.5
et Opus 5.5 sur le corpus, et la décision finale s'appuie sur les chiffres.
Le secret `ANTHROPIC_API_KEY` existe déjà en production (utilisé par
`generateAiInsight`) : pas de nouveau secret à créer.

**Banc d'essai** — `evals/voice/` (hors `npm test`, lancé par
`npx jest --config evals/jest.config.js`) :
- `corpus.json` : 71 phrases, 13 catégories, horloge figée au 28/10/2026 14h30.
  **40 en dev** (ajustement du prompt autorisé), **31 en holdout** (mesure seule).
  8 cas `critical` rejoués 3 fois (`pass^3`).
- `grader.ts` : correcteur déterministe (pas de LLM juge), couvert par
  `__tests__/voiceEvalGrader.test.ts` (6 tests).
- Méthodologie reprise de la skill ECC `eval-harness` : correcteur par code,
  séparation dev/holdout contre le sur-apprentissage, suivi latence + coût.

**Référence — parseur à règles actuel : 30/71 (42 %)** · dev 45 % · holdout 39 %

| Catégorie | Score | Cause principale |
|---|---|---|
| temps | 1/11 | une heure absolue (« à 13h ») est ignorée : l'événement est daté de *maintenant* |
| familier | 5/19 | « il a pris 120 », « 6 kilos 400 », « une heure et demie » non compris |
| rien | 1/5 | « combien de biberons ? », « il n'a pas voulu son biberon » créent un biberon |
| simple | 11/19 | valeurs manquées (38,5 °C, 80 ml gauche / 60 droite) |
| multi | 4/7 | « sieste de 45 minutes vers 10h » → durée 600 min |
| modifier / supprimer | 5/7 | « mets la température de 7h à 38,9 » vu comme un ajout |

Ajustements d'équité du correcteur (après le premier passage, en défaveur
d'aucun parseur) : h28 accepte « ROR » pour le vaccin rougeole ; h29 reformulé
(« sérum et mouche-bébé » admettait légitimement deux événements).

Bug existant découvert, hors refonte : « dans 30 min » produit un événement
futur que `validateEventData` rejette (date > maintenant + 5 min).
