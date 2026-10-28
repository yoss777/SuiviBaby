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
| 4 | Évaluation réelle LLM vs règles, itération du prompt | ✅ |
| 5 | Migration `expo-av` → `expo-audio` | ✅ (test sur appareil à faire) |
| 6 | Revue multi-agents ECC + corrections | ✅ |
| 7 | Recette finale | ⏸️ tests automatisés faits ; évaluation réelle + déploiement en attente |

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

### Hors refonte — correctif Android API 36 (commit `a1beba4`)

Découvert grâce à `expo-doctor` pendant l'étape 5. Le passage à l'API 36
(commit `c8be217`) ne modifiait que le plugin `expo-build-properties` dans
`app.json`. Or `android/` est versionné : EAS ne relance pas de prebuild et
**ignore** les sections `ios`, `android` et `plugins` d'`app.json`. Le build
serait donc parti en API 35. Correctif : `android.compileSdkVersion=36` et
`android.targetSdkVersion=36` dans `android/gradle.properties`. Vérifié par
Gradle : le manifeste fusionné contient `targetSdkVersion="36"`.

À surveiller : cibler l'API 36 **impose** l'affichage bord à bord (edge-to-edge)
alors que `expo.edgeToEdgeEnabled=false` ; à vérifier sur appareil Android.

### Étape 6 — Revue multi-agents ECC ✅

Trois relecteurs ECC lancés en parallèle sur `4dce699..b0c9120`, chacun sur un
angle que l'auteur du code sous-estime typiquement :

| Agent ECC | Angle |
|---|---|
| `ecc:security-reviewer` | injection de prompt, bornes, abus de coût, fuite de données |
| `ecc:silent-failure-hunter` | chemins de repli, erreurs avalées, délais, fuites du recorder |
| `ecc:typescript-reviewer` | contrat avec l'aval, fuseaux / heure d'été, typage, qualité des tests |

**Apport d'ECC dans ce chantier :**
- **`eval-harness`** (étape 0) : méthodologie du banc d'essai — correcteur par
  code, séparation dev/holdout, pass^3, suivi latence et coût.
- **Agents de revue spécialisés** (étape 6) : trois regards indépendants en
  parallèle, au lieu d'une relecture par l'auteur.
- Limite honnête : l'essentiel des ~400 skills et ~80 agents installés ne
  concerne pas ce projet (Bengali, HarmonyOS, Django…). La valeur vient d'une
  poignée de briques bien choisies, pas du volume.

**Résultats de la revue.** Aucun point critique. Chaque constat a été vérifié
dans le code avant d'être corrigé ou écarté.

| Constat (agent) | Décision |
|---|---|
| Cible invalide → « dernier » : risque de supprimer le mauvais événement (silent-failure) | **Corrigé** : une cible ou une heure *donnée mais invalide* rend la réponse inutilisable → repli sur les règles. Absente → défaut documenté (« maintenant » / « dernier »). Cibles datées (`dayOffset`, « celui d'hier à 21h ») |
| Réponse vide ou malformée → « commande non reconnue » au lieu du repli (silent-failure) | **Corrigé** : seul un « rien » choisi par le modèle est respecté ; le reste → repli |
| Valeur hors bornes retirée en silence → biberon de 0 ml enregistré (silent-failure) | **Corrigé** : champs ignorés remontés jusqu'à la confirmation (« ⚠️ Valeur ignorée (hors limites) : quantité ») |
| Créneau consommé même en cas d'échec ; clé révoquée invisible (silent-failure, security) | **Corrigé** : remboursement du créneau ; `console.error` sur 400/401/403/404 ; `not-found` signalé côté client |
| Délais incohérents : client 10 s, serveur jusqu'à 16 s (silent-failure) | **Corrigé** : SDK 6 s sans nouvelle tentative, CF 15 s, client 8 s ; latence ajoutée aux fils d'Ariane |
| `NetInfo.fetch` sans délai (silent-failure) | **Corrigé** : plafonné à 1 s, minuteur nettoyé |
| `relativeTime: 0` ignoré par le finder (typescript) | **Corrigé** : `ago 0` → « dernier » |
| Correction de tétée écrite dans `quantite` au lieu de `duree` (typescript) | **Corrigé** côté mapping LLM (défaut préexistant du parseur à règles, rendu fréquent par le LLM) |
| Test de contrat tautologique (typescript) | **Corrigé** : valeurs distinctes, destination exacte par champ ; vérifié par mutation (poids ↔ taille) |
| Correcteur trop indulgent sur les modifications (typescript) | **Corrigé** : seul `modifications` compte (ce qu'écrit l'app). Référence règles inchangée : 42 % |
| Balises dans les textes libres (security) | **Corrigé** : `<` et `>` retirés |
| Contrôle client du contenu (security, typescript) | **Corrigé** : type et format d'heure vérifiés par événement |
| Tests recorder : Android non couvert, erreur non vérifiée (typescript) | **Corrigé** |
| Règles en « second avis » quand le LLM dit « rien » | **Écarté** : réintroduit les faux positifs mesurés à l'étape 0 |
| Limiteur de débit non atomique (security) | **Reporté** : `checkRateLimit` est préexistant et partagé par toutes les CF ; le plafond journalier, lui, est transactionnel |
| Plafond de dépense global (security) | **Recommandation** : fixer une limite de dépense mensuelle dans la console Anthropic (aucun code, pas de document Firestore très sollicité) |
| Double démarrage du recorder ignoré (silent-failure) | **Reporté** : comportement préexistant, non introduit ici |

Vérifié en plus : toute suppression ou modification passe par la fenêtre de
confirmation (`setConfirmModal`), aucune exécution automatique.

Tests : serveur **167/167**, client **436** réussis (37 échecs préexistants
inchangés), typage 43 erreurs préexistantes.

### Étape 7 — Recette ⏸️

**Fait (automatisé)** : serveur 167/167 ; client 436 réussis, 37 échecs
préexistants inchangés depuis le début du chantier ; typage 43 erreurs, toutes
préexistantes ; référence règles 42 % ; Gradle confirme `targetSdkVersion=36`.

**En attente de `gcloud auth login`** (identifiants expirés, connexion
interactive) :
1. Évaluation réelle Haiku 5.5, puis Opus 5.5 pour comparaison.
2. Ajustement du prompt sur le seul split **dev** si nécessaire, puis mesure
   finale sur le **holdout**.
3. Déploiement de la seule fonction `parseVoiceCommand`
   (`firebase deploy --only functions:parseVoiceCommand`). Sans risque pour
   l'app en production : l'app actuelle ne l'appelle pas, et la nouvelle se
   replie sur les règles si elle est absente.

**À faire sur appareil** (nécessite un nouveau build EAS, que tu pilotes) :
enregistrement `expo-audio` sur iPhone et Android, commande de bout en bout,
affichage edge-to-edge sur Android 16.

**Recommandé** : limite de dépense mensuelle dans la console Anthropic.

**28/10 — tentative d'évaluation réelle.** Accès au secret OK (projet
`samaye-53723`, gcloud reconnecté). Tous les appels sont refusés par l'API :
**« Your credit balance is too low »**. La clé de SuiviBaby n'a plus de crédit
prépayé ; rien n'a été facturé. Conséquence en production : `generateAiInsight`
utilise la même clé et échouerait aussi (aucune invocation sur 30 jours, donc
aucun utilisateur touché). Le lanceur fait désormais un appel de sonde et
s'arrête dès la première erreur de compte.

Décision : limite de dépense mensuelle fixée à **10 €** (≈ 30 000 commandes
vocales sur Haiku 5.5). Reste à **acheter du crédit** dans la console Anthropic.

### Étape 4 — Évaluation réelle ✅ (28/10, après recharge du crédit)

**Trois refus de l'API, trois enseignements** que les tests avec faux client ne
pouvaient pas révéler :
1. « too many optional parameters (36) » : les sorties structurées plafonnent à
   **24 champs optionnels** et **16 champs à type union** (documentation).
2. Schéma refondu en une variante par type d'événement, champs nullables :
   « too many parameters with union types (192) ».
3. Schéma aplati avec valeurs neutres (18 optionnels, 0 union) : « Schema is
   too complex » (limite interne de taille de grammaire).

**Décision : JSON demandé dans le prompt**, schéma inclus dans le prompt système
(statique, en cache), sans grammaire imposée. La sécurité n'en dépend pas : le
validateur serveur revalide chaque valeur, et un JSON invalide bascule sur les
règles. Bonus : plus de compilation de grammaire au premier appel (cache 24 h).

**Défauts trouvés en conditions réelles et corrigés :**
- Le modèle ajoutait parfois une fausse « Correction : » et un second objet JSON
  → extraction du **premier objet JSON complet** (comptage d'accolades hors
  chaînes) + consigne de réponse unique.
- Le modèle a omis une fois la cible de « la température **de 7h** » → elle
  aurait visé la **dernière** température. Désormais une modification ou
  suppression **exige une cible explicite** (« le dernier » → `last`), sinon
  repli.

**Résultats — Claude Haiku 5.5, effort `low`**

| Passage | Total | dev | holdout | pass^3 | p50 / p95 | Coût / commande |
|---|---|---|---|---|---|---|
| 1ᵉʳ (avant corrections) | 69/71 (97 %) | 100 % | **94 %** | 8/8 | 0,88 / 1,34 s | 0,006 ¢ |
| après corrections, ×3 | **71/71 (100 %)** à chaque passage | 100 % | 100 % | 8/8 | 0,84 / 1,6-1,9 s | 0,006 ¢ |
| Référence — règles | 30/71 (42 %) | 45 % | 39 % | — | — | 0 |

Cache de prompt lu sur 87/87 appels. Aucun JSON invalide après correction.

**Réserves :**
- Le holdout n'est plus totalement indépendant (2 corrections déclenchées par
  des cas du holdout, même si génériques) : **le chiffre propre est 94 %**.
- Le corpus est écrit par l'auteur du prompt ; il ne contient ni vraies
  formulations de parents ni erreurs de transcription d'AssemblyAI. Le juge
  final sera l'usage réel (journaux `parseVoiceCommand` : taux de repli, actions).
- Comparaison Opus 5.5 non lancée : Haiku atteint le plafond du corpus.
