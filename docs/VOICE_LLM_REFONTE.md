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

**Suites possibles (hors refonte)**
- **Transcription auto-hébergée avec `SYSTRAN/faster-whisper`** : principal
  intérêt, faire disparaître le risque résiduel R3 du red team (audio de
  l'enfant chez un sous-traitant américain). Service Python séparé (Cloud Run
  en Europe), instance chaude nécessaire, coût supérieur à AssemblyAI au volume
  actuel : le gain est la confidentialité, pas l'économie. À trancher par un
  banc d'essai sur de vrais enregistrements. Transcription et interprétation
  étant désormais découplées, le branchement est local à `transcribeAudio`.
- Mode temps réel « Jarvis » — après l'activation d'App Check.
- Siri / App Intents.

## Étapes

| # | Étape | Statut |
|---|---|---|
| 0 | Cadrage, corpus d'évaluation, mesure du parseur actuel | ✅ |
| 1 | Contrat de sortie + validation serveur + mapping client (TDD) | ✅ |
| 2 | Cloud Function `parseVoiceCommand` | ✅ |
| 3 | Intégration client avec repli | ✅ |
| 4 | Évaluation réelle LLM vs règles, itération du prompt | ⏸️ outillage prêt, en attente de la clé API |
| 5 | Migration `expo-av` → `expo-audio` | ✅ (test sur appareil à faire) |
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

### Étape 1 — Contrat, validation serveur, mapping client ✅

**Serveur — [functions/lib/voiceParse.js](../functions/lib/voiceParse.js)**
- `OUTPUT_SCHEMA` : schéma JSON imposé au modèle (structured outputs). Types
  d'événements et énums fermés ; chaque objet en `additionalProperties: false`.
- `SYSTEM_PROMPT` : statique, donc mis en cache. Règles d'extraction par type,
  et une consigne explicite : la transcription est une donnée, jamais une
  instruction.
- `buildUserMessage` : transcription encadrée par `<transcription>` ; les
  chevrons sont neutralisés pour qu'un texte ne puisse pas fermer la balise.
- `sanitizeParseResult` : revalide **toute** réponse du modèle avec les mêmes
  bornes que `validateEventData` (biberon ≤ 500 ml, température 34-43 °C…),
  les mêmes énums, au plus 5 événements (1 pour modifier/supprimer), textes
  nettoyés et tronqués. Une réponse malformée devient `none`, sans exception.
- `functions/lib/enums.js` : ajout de `METHODES_NETTOYAGE_NEZ`, qui manquait
  dans le miroir serveur.

**Client — [services/voice/llmMapper.ts](../services/voice/llmMapper.ts)**
- Convertit la réponse validée en `ParsedCommandResult` : **l'aval ne change pas**.
- Résolution déterministe des heures dans le fuseau du téléphone : une heure
  « dans le futur » (au-delà de 5 min de tolérance) est ramenée à la veille
  (« à 22h » dit à 14h30 → hier 22h).
- Garde les particularités historiques (durée de tétée dans `quantite`, sein
  gauche par défaut, drapeaux pipi/popo).

**Tests**
- `functions/__tests__/voiceParse.test.js` : 15 tests (injection, bornes,
  énums, plafond d'événements, heures, cibles). Suite serveur : 131/131.
- `__tests__/voiceLlmMapper.test.ts` : 13 tests, dont un **test de contrat** qui
  charge le vrai schéma serveur, remplit tous ses champs et vérifie qu'aucun ne
  se perd au mapping. Vérifié par mutation : retirer le mapping de `nomVaccin`
  fait échouer le test.

### Étape 2 — Cloud Function `parseVoiceCommand` ✅

**Appel au modèle — `parseWithClaude`** ([functions/lib/voiceParse.js](../functions/lib/voiceParse.js))
- SDK officiel `@anthropic-ai/sdk` 1.3.0 (nouvelle dépendance de `functions/`).
- `claude-haiku-5-5`, effort `low`, sortie JSON imposée par `output_config.format`.
- Prompt système statique avec `cache_control` : mis en cache entre toutes les
  commandes de tous les parents ; la transcription n'est que dans le message
  utilisateur, après le point de cache.
- Timeout 8 s, 1 nouvelle tentative. Refus, troncature ou JSON invalide →
  `ParseUnavailableError`.

**Cloud Function** ([functions/index.js](../functions/index.js), `exports.parseVoiceCommand`)

| Garde-fou | Détail |
|---|---|
| Authentification | obligatoire ; App Check en surveillance, comme les autres CF |
| Entrée | texte non vide, ≤ 500 caractères |
| Débit | 20 appels / minute / utilisateur (`checkRateLimit`) |
| Coût | plafond de 200 analyses / jour / utilisateur, en transaction dans `usage_limits` (non inscriptible par le client d'après `firestore.rules`) |
| Aucune écriture | la CF ne crée aucun événement : confirmation puis `validateAndCreateEvent` comme avant |
| Vie privée | la transcription n'est **jamais** journalisée ; seuls le modèle, la latence, le nombre d'événements et les tokens le sont |
| Dégradation | toute panne (API, refus, réponse invalide) → `unavailable` → repli client sur le parseur à règles |
| Coupe-circuit | `VOICE_LLM_PARSE_ENABLED=false` au déploiement |
| Modèle | `VOICE_PARSE_MODEL` pour changer de modèle sans modifier le code |

Le quota produit (3 commandes/jour en gratuit) reste décompté par
`transcribeAudio` ; le plafond de 200 est un garde-fou de coût contre un
client scripté qui appellerait directement l'analyse avec du texte.

**Tests** : `functions/__tests__/parseVoiceCommand.test.js` (13 tests :
authentification, entrées invalides, coupe-circuit, plafond, résultat,
transcription absente des journaux, repli sur 3 types de panne) et 6 tests de
`parseWithClaude` avec un faux client. Suite serveur : **150/150**.

### Étape 3 — Intégration client avec repli ✅

**[services/voice/llmParser.ts](../services/voice/llmParser.ts) — `parseVoiceText`**
- Appelle `parseVoiceCommand` (délai 10 s), puis le mapping de l'étape 1.
- **Repli sur le parseur à règles**, sur le même texte, si : hors ligne (sans
  appel réseau), texte > 500 caractères, fonction indisponible / désactivée /
  plafond atteint / délai dépassé / **absente** (ancien backend), réponse
  malformée, ou erreur imprévue.
- Les replis attendus ne laissent qu'un fil d'Ariane Sentry ; seules les erreurs
  imprévues remontent comme incidents.
- Un « rien à enregistrer » du LLM est respecté : on ne relance pas les règles,
  qui créeraient les faux positifs mesurés à l'étape 0.
- Client et serveur sont déployables **dans n'importe quel ordre** : sans la
  fonction déployée, l'app se comporte exactement comme aujourd'hui.

**Branchement** : seul appelant, `processVoiceCommand` dans
[hooks/useVoiceCommand.ts](../hooks/useVoiceCommand.ts), via
`parseCommandsSmart`. L'indicateur de traitement couvre déjà l'attente.

**Confirmation** : au-delà d'une heure d'écart, l'heure s'affiche en clair
(« ⏰ Hier à 23h00 ») au lieu de « Il y a 930 minutes », pour que le parent
puisse vérifier l'heure comprise avant l'écriture
(`formatEventClock`, [utils/date.ts](../utils/date.ts)).

**Tests** : `__tests__/voiceLlmParser.test.ts` (11 tests : chemin LLM, respect du
« rien », 4 replis silencieux, erreur imprévue signalée, réponse malformée, hors
ligne, texte trop long, NetInfo en panne) + 1 test du libellé d'heure.
Suite client : 417 réussis ; les 37 échecs sont **les mêmes qu'avant la refonte**
(BabyContext, childSharingService, storage.rules). Typage : 43 erreurs, toutes
préexistantes.

### Étape 4 — Évaluation réelle ⏸️

**Outillage prêt et vérifié à blanc :**
- [evals/voice/run-llm.js](../evals/voice/run-llm.js) appelle le vrai
  `parseWithClaude` sur le corpus (cas critiques ×3, 4 appels en parallèle) et
  enregistre réponses, latences et tokens dans `evals/voice/results/`.
- [evals/voice/llm.eval.ts](../evals/voice/llm.eval.ts) mappe les réponses avec
  le mapping client et note : pass@1 par split et catégorie, pass^3 sur les cas
  critiques, latence p50/p95, coût moyen par commande, taux de lecture du cache.
- Essai à blanc avec des réponses simulées : 5/5 validés, et l'incohérence
  glissée exprès dans un cas critique est bien détectée par le pass^3.

**Bloquant :** la lecture du secret `ANTHROPIC_API_KEY` depuis Secret Manager a
été refusée par le garde-fou de permissions de Claude Code (légitime : secret de
production). Pour lancer l'évaluation :

```bash
export ANTHROPIC_API_KEY=…            # clé de dev de préférence
node evals/voice/run-llm.js claude-haiku-5-5
node evals/voice/run-llm.js claude-opus-5-5     # comparaison, ≈ 1,5 $
npx jest --config evals/jest.config.js
```

### Étape 5 — Migration `expo-av` → `expo-audio` ✅

- `expo-audio` ~0.4.9 (version alignée sur le SDK 53) ; `expo-av` désinstallé
  et retiré des exclusions `expo install` / `expo-doctor` de `package.json`.
- [services/voice/recorder.ts](../services/voice/recorder.ts) : API impérative
  `AudioModule.AudioRecorder`, mêmes fonctions exportées, aucun appelant modifié.
  Conservés : re-vérification de la permission à chaque enregistrement (T3.2),
  contrôle de l'audio vide (T3.3).
- **Écart avec [MIGRATION_EXPO_AUDIO.md](MIGRATION_EXPO_AUDIO.md)** : le plan
  passait `RecordingPresets.HIGH_QUALITY` tel quel au constructeur. Le hook
  officiel aplatit d'abord le preset par plateforme (`createRecordingOptions`,
  non exporté) ; sans cela, les réglages d'encodage iOS/Android seraient
  ignorés. Reproduit localement dans `platformRecordingOptions`.
- Deux corrections au passage : l'enregistreur natif est libéré (`release()`)
  après l'arrêt ou un démarrage raté ; un échec de `stop()` ne laisse plus le
  module bloqué en « enregistrement en cours » (c'était le cas avec `expo-av`).
- `ios/Podfile.lock` régénéré par `pod install` : `EXAV` retiré, `ExpoAudio`
  ajouté. L'autolinking Android prend le module en compte au build.
- **Tests** : le recorder n'était pas testé du tout (les mocks servaient
  seulement à l'import). Nouveau `__tests__/voiceRecorder.test.ts`, 9 tests :
  preset aplati, double démarrage, T3.2 (redemande / refus définitif), libération
  sur échec, arrêt, arrêt en échec. Suite client : 426 réussis, mêmes 37 échecs
  préexistants ; typage : 43 erreurs préexistantes.

**Reste à faire, sur appareil** (module natif : nécessite un nouveau build, pas
de mise à jour OTA) : enregistrer une commande sur iPhone et Android, vérifier
que la transcription reste correcte avec le nouvel encodeur.
