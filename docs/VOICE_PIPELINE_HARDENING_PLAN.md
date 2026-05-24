# Voice Pipeline — Plan d'action de hardening

Plan d'action issu du red team du pipeline de commande vocale (enregistrement → AssemblyAI → parsing → écriture Firestore via Cloud Functions).

**Scope :** [services/voice/](../services/voice/), [services/voiceCommandService.ts](../services/voiceCommandService.ts), [hooks/useVoiceEventCreator.ts](../hooks/useVoiceEventCreator.ts), CF `transcribeAudio` + `validateAndCreateEvent` + `validateAndUpdateEvent` dans [functions/index.js](../functions/index.js), [firestore.rules](../firestore.rules).

**État existant à connaître avant d'agir :**
- `validateEventData` ([functions/index.js:1327-1437](../functions/index.js#L1327-L1437)) borne déjà : biberon (0-500ml), sommeil (1-1440min), pompage (0-500ml), température (34-43°C), bain (20-45°C), croissance (taille/poids/tête), date (now + 5min max), nom médicament/vaccin/vitamine non vide.
- Idempotency partielle côté CF create ([functions/index.js:1478-1492](../functions/index.js#L1478-L1492)) via `idempotencyKey` sur la collection `events` — **mais n'est pas appliquée côté `transcribeAudio` ni côté `validateAndUpdateEvent`**.
- Quota voix + rate limit (10/min) déjà en place sur `transcribeAudio`.
- Toutes les écritures events passent par Cloud Functions (pas de write direct depuis le voice path).

---

## Lot 1 — CRITIQUE (à shipper avant tout autre travail vocal)

### T1.1 — Tronquer `rawText` / `contextNote` avant écriture Firestore
**Fichier :** [services/voice/firebaseFormatter.ts:6-18](../services/voice/firebaseFormatter.ts#L6-L18)

**Problème :** `rawText` (transcription brute AssemblyAI) et `contextNote` sont concaténés sans `.slice()`, sans escape, et `validateEventData` n'inspecte pas `note`. Un audio long ou crafté → document Firestore obèse, charges réseau, possibles crashes UI.

**Action :**
1. Dans `formatDataForFirebase`, normaliser :
   ```ts
   const MAX_RAW_TEXT = 300;
   const MAX_CONTEXT_NOTE = 200;
   const safeRaw = (command.rawText ?? "").slice(0, MAX_RAW_TEXT).trim();
   const safeContext = (command.contextNote ?? "").slice(0, MAX_CONTEXT_NOTE).trim();
   let note = `Ajouté par commande vocale: "${safeRaw}"`;
   if (safeContext) note = `${safeContext} - ${note}`;
   ```
2. Côté CF, ajouter dans `validateEventData` un check global avant le `switch` :
   ```js
   if (data.note !== undefined) {
     if (typeof data.note !== "string" || data.note.length > 1000) {
       throw new HttpsError("invalid-argument", "Note trop longue (max 1000 caractères).");
     }
   }
   ```

**Test :** unitaire `firebaseFormatter.test.ts` avec `rawText = "x".repeat(5000)` → vérifier `note.length <= 600`.

**Effort :** 30 min.

---

### T1.2 — Idempotency key dans `transcribeAudio`
**Fichier :** [services/voice/recorder.ts:88-110](../services/voice/recorder.ts#L88-L110), [functions/index.js:415-588](../functions/index.js#L415-L588)

**Problème :** un retry réseau côté client = ré-upload audio chez AssemblyAI + double consommation de quota. Pas de dédoublonnage côté CF.

**Action :**
1. **Client** — générer un `idempotencyKey` (uuid v4 ou `${uid}-${Date.now()}-${hash}`) à l'appel de `transcribeAudio` :
   ```ts
   const result = await transcribe({ audioBase64, idempotencyKey });
   ```
2. **Serveur** — cache court (Firestore collection `voice_transcribe_cache` avec TTL 5min, ou Memorystore si disponible) :
   - Avant `reserveVoiceQuota`, lookup `voice_transcribe_cache/{uid}_{idempotencyKey}`.
   - Si hit : retourner le texte caché, **ne pas re-consommer le quota**.
   - Si miss : exécuter, puis `set` avec `expireAt = now + 5min` (TTL policy Firestore).
3. Garder le rate limit existant (10/min) pour bloquer le spam.

**Test :** appeler `transcribeAudio` deux fois avec le même `idempotencyKey` → seul le premier appel hit AssemblyAI, le second renvoie le texte caché sans toucher le quota.

**Effort :** 2-3 h (TTL policy + cache + tests).

---

### T1.3 — Réservation de quota après succès AssemblyAI (ou rollback)
**Fichier :** [functions/index.js:462-588](../functions/index.js#L462-L588)

**Problème :** [ligne 464](../functions/index.js#L464) `reserveVoiceQuota` est appelé **avant** l'upload AssemblyAI. Si la CF crash, timeout, ou si AssemblyAI retourne `error`, le quota est consommé sans transcription.

**Action — option A (préférée) :**
- Déplacer `reserveVoiceQuota` après le `return { text: ... }` réussi, mais **garder** `checkRateLimit` avant (le rate limit empêche déjà l'abus).
- Tradeoff : un utilisateur peut envoyer jusqu'à 10 audios/min sans quota consommé tant qu'ils échouent.

**Action — option B (plus robuste) :**
- Garder la réservation actuelle, ajouter un `try/catch` global :
  ```js
  let quotaReserved = false;
  try {
    await reserveVoiceQuota(db, uid);
    quotaReserved = true;
    // ... appels AssemblyAI ...
    return { text: result.text || "" };
  } catch (error) {
    if (quotaReserved) {
      await refundVoiceQuota(db, uid).catch(err => console.error("Refund failed", err));
    }
    throw error;
  }
  ```
- Créer la fonction `refundVoiceQuota` (décrement atomic + log audit dans `voice_quota_refunds`).

**Recommandation :** option B. Ne pas dépendre uniquement du rate limit ; les erreurs AssemblyAI sont fréquentes (timeout, language detection foireuse).

**Test :** mocker fetch AssemblyAI pour qu'il throw → vérifier que le quota est rollback (lecture Firestore `voice_quota/{uid}`).

**Effort :** 1-2 h.

---

### T1.4 — Plafonner le nombre d'events créés par commande vocale
**Fichier :** [services/voice/textParser.ts:144-236](../services/voice/textParser.ts#L144-L236), [functions/index.js:1447-1510](../functions/index.js#L1447-L1510)

**Problème :** `splitIntoSegments` peut produire 10+ segments. Chaque segment → 1 event Firestore créé. Un free tier (3 commandes vocales/jour) peut générer 30+ events/jour en chaînant des phrases.

**Action :**
1. **Client** — dans `voiceCommandService` (ou le hook `useVoiceEventCreator`), tronquer `segments` à `MAX_SEGMENTS_PER_COMMAND = 5` avec un toast UI "Seuls les 5 premiers événements ont été enregistrés".
2. **Serveur** — ajouter un compteur par commande dans `validateAndCreateEvent` :
   - Le client envoie `voiceCommandId` (uuid partagé entre tous les events d'une même commande).
   - CF tracke `events_per_voice_command/{voiceCommandId}` ; si > 5, throw `resource-exhausted`.

**Test :** simuler une phrase à 8 segments → vérifier que 5 events créés, 3 rejetés avec message utilisateur clair.

**Effort :** 1 h client + 1 h serveur.

---

## Lot 2 — ÉLEVÉ (à shipper dans la semaine)

### T2.1 — Cleanup AssemblyAI garanti
**Fichier :** [functions/index.js:550-573](../functions/index.js#L550-L573)

**Problème :** le DELETE vers AssemblyAI n'est pas awaited et le `.catch()` peut silencieusement perdre l'erreur. Audio d'enfant orphelin = GDPR Art. 17/33.

**Action :**
1. Awaiter le DELETE avec un timeout court (3s) :
   ```js
   const cleanupController = new AbortController();
   const cleanupTimer = setTimeout(() => cleanupController.abort(), 3000);
   try {
     const r = await fetch(`...transcript/${transcriptId}`, {
       method: "DELETE",
       headers: { authorization: apiKey },
       signal: cleanupController.signal,
     });
     if (!r.ok) throw new Error(`status=${r.status}`);
   } catch (err) {
     // Queue pour retry async
     await db.collection("pending_assemblyai_deletes").add({
       transcriptId,
       createdAt: admin.firestore.FieldValue.serverTimestamp(),
       attempts: 0,
       lastError: String(err?.message ?? err),
     });
   } finally {
     clearTimeout(cleanupTimer);
   }
   ```
2. Créer un scheduled job (CF v2 `onSchedule("every 60 minutes")`) qui consomme `pending_assemblyai_deletes` :
   - Pour chaque doc, retry DELETE.
   - Si succès : delete doc.
   - Si échec et `attempts >= 5` : log alerte Sentry + garder le doc pour audit manuel.

**Test :** mocker le DELETE pour retourner 500 → vérifier que le doc est créé dans `pending_assemblyai_deletes` avec `transcriptId`.

**Effort :** 3 h.

---

### T2.2 — Optimistic lock sur `validateAndUpdateEvent`
**Fichier :** [functions/index.js:1515-1577](../functions/index.js#L1515-L1577), [hooks/useVoiceEventCreator.ts](../hooks/useVoiceEventCreator.ts)

**Problème :** deux parents qui disent en même temps "modifie le dernier biberon" → last-write-wins, donnée écrasée sans warning. Risque réel sur données médicales (quantité de médicament, température).

**Action :**
1. À chaque lecture d'event côté client, conserver `updatedAt` (ou `version`).
2. Le client envoie `expectedUpdatedAt` dans `validateAndUpdateEvent`.
3. CF utilise une transaction Firestore :
   ```js
   await db.runTransaction(async (tx) => {
     const snap = await tx.get(eventRef);
     if (!snap.exists) throw new HttpsError("not-found", "Événement introuvable.");
     const current = snap.data();
     if (expectedUpdatedAt && current.updatedAt &&
         current.updatedAt.toMillis() !== expectedUpdatedAt) {
       throw new HttpsError("aborted", "L'événement a été modifié entre-temps. Veuillez réessayer.");
     }
     tx.update(eventRef, {
       ...updateData,
       updatedAt: admin.firestore.FieldValue.serverTimestamp(),
     });
   });
   ```
4. Côté UI vocale, si `aborted` : re-fetch l'event, demander confirmation à l'utilisateur ("Cet événement a déjà été modifié, voulez-vous appliquer votre changement quand même ?").

**Test :** deux callables concurrents avec le même `expectedUpdatedAt` → l'un réussit, l'autre est rejeté avec code `aborted`.

**Effort :** 3-4 h.

---

### T2.3 — Whitelist stricte des énumérations dans les détecteurs
**Fichiers :** [services/voice/detectors.ts](../services/voice/detectors.ts), [functions/index.js:1327-1437](../functions/index.js#L1327-L1437)

**Problème :** `typeBiberon`, `typeActivite`, `typeJalon`, `consistance`, `couleur`, `typeSolide`, `momentRepas`, `humeur` sont assignés via string match sans whitelist. CF ne valide pas ces champs.

**Action :**
1. Créer un module partagé `services/voice/enums.ts` :
   ```ts
   export const TYPES_BIBERON = ["lait_maternel", "lait_infantile", "eau", "jus"] as const;
   export const TYPES_ACTIVITE = ["lecture", "musique", "jeux", "promenade", "autre"] as const;
   // ... etc
   ```
2. Dans `firebaseFormatter.ts`, filtrer chaque enum avant écriture :
   ```ts
   typeBiberon: TYPES_BIBERON.includes(command.typeBiberon as any) ? command.typeBiberon : undefined,
   ```
3. Côté CF (`validateEventData`), ajouter un `case` pour chaque type avec validation enum :
   ```js
   case "biberon":
     // ... bornes quantité existantes ...
     if (data.typeBiberon !== undefined && !TYPES_BIBERON.includes(data.typeBiberon)) {
       throw new HttpsError("invalid-argument", `typeBiberon invalide: ${data.typeBiberon}`);
     }
     break;
   ```
4. Dupliquer les enums dans `functions/index.js` (ou extraire dans un fichier `functions/lib/enums.js`).

**Test :** unitaire CF avec `typeBiberon = "lait_de_chevre"` → throw.

**Effort :** 2 h.

---

### T2.4 — Bornes quantitatives génériques dans les détecteurs
**Fichier :** [services/voice/detectors.ts](../services/voice/detectors.ts)

**Problème :** `parseInt(match[1])` partout sans validation. La CF borne biberon/sommeil/pompage/croissance/température/bain — mais `tetee.quantite` (durée en min), `activite.duree`, `medicament.dosage`, `solide.quantite` ne sont pas bornés côté CF.

**Action :**
1. Helper centralisé dans `services/voice/detectors.ts` :
   ```ts
   function parseQuantity(raw: string, { min, max }: { min: number; max: number }): number | undefined {
     const n = parseInt(raw, 10);
     if (Number.isNaN(n) || n < min || n > max) return undefined;
     return n;
   }
   ```
2. Remplacer tous les `parseInt(match[1])` dans les détecteurs par `parseQuantity(match[1], { min: 0, max: SOMETHING })` avec bornes par type.
3. Ajouter les bornes manquantes dans `validateEventData` côté CF :
   - `tetee.duree` : 0-180 min
   - `activite.duree` : 0-1440 min
   - `medicament.dosage` : string non vide, length <= 100
   - `solide.quantite` : enum ("petit", "moyen", "grand") ou number borné

**Test :** unitaire `detectors.test.ts` avec "biberon -50ml" → `quantite === undefined`.

**Effort :** 2 h.

---

### T2.5 — Tolérance temporelle resserrée pour `findEventByIdentifier`
**Fichier :** [hooks/useVoiceEventCreator.ts](../hooks/useVoiceEventCreator.ts) (zones `findEventByIdentifier`)

**Problème :** "modifie le biberon de 15h20" cherche dans ±30 min. Si deux biberons à 15h05 et 15h35, l'algo peut modifier le mauvais.

**Action :**
1. Resserrer la tolérance à ±10 min par défaut.
2. Si plusieurs candidats dans la fenêtre, **ne pas deviner** : retourner un état `ambiguous` au composant UI, qui demande confirmation explicite ("Lequel ? Biberon de 15h05 ou 15h35 ?").
3. Pour `isLast: true`, vérifier qu'aucun autre event du même type n'existe à moins de 5 min de différence (sinon ambiguous).

**Test :** seed deux events biberon à 15h05 et 15h35, query "biberon de 15h20" → status = `ambiguous`, pas de modification.

**Effort :** 2-3 h (logique + UI confirmation).

---

## Lot 3 — MOYEN (backlog, à faire avant prochain audit)

### T3.1 — Profilage ReDoS sur `splitIntoSegments`
**Fichier :** [services/voice/textParser.ts:144-160](../services/voice/textParser.ts#L144-L160)

**Action :**
1. Ajouter un guard d'entrée : si `text.length > 2000`, tronquer + warn.
2. Bench le pattern avec [safe-regex2](https://www.npmjs.com/package/safe-regex2) ou un test perf qui mesure le temps de parsing sur des inputs adversariaux ("et ".repeat(500), virgules en cascade).
3. Si le pattern est jugé instable, réécrire avec un parser linéaire (split sur séparateurs simples puis post-traitement).

**Effort :** 2 h.

---

### T3.2 — Re-vérifier les permissions micro à chaque enregistrement
**Fichier :** [services/voice/recorder.ts:34-59](../services/voice/recorder.ts#L34-L59)

**Action :**
1. Dans `startRecording`, appeler `requestPermissions` (ou `Audio.getPermissionsAsync`) avant `Audio.Recording.createAsync`.
2. Si refusé, throw une erreur typée `VoicePermissionDeniedError` que l'UI catch pour proposer "Ouvrir les réglages".

**Effort :** 1 h.

---

### T3.3 — Détection silence / audio vide
**Fichier :** [services/voice/recorder.ts](../services/voice/recorder.ts), CF `transcribeAudio`

**Action :**
1. Côté client, après `stopRecording`, vérifier que la durée d'enregistrement > 500ms et que la taille du fichier > 5KB. Sinon, ne pas appeler la CF (économie quota).
2. Côté CF, si `audioBase64.length < 5000`, throw `invalid-argument` avant l'upload AssemblyAI.

**Effort :** 1 h.

---

### T3.4 — Feedback explicite pour les contributors
**Fichiers :** [firestore.rules:75](../firestore.rules#L75), [functions/index.js:1473](../functions/index.js#L1473), [hooks/useVoiceEventCreator.ts](../hooks/useVoiceEventCreator.ts)

**Problème :** un contributor peut déclencher une commande vocale, l'UI montre un succès optimistic, mais la CF rejette (rôle insuffisant). Divergence locale/serveur sans feedback.

**Action :**
1. Avant l'appel CF, dans le hook, lire le rôle de l'utilisateur sur l'enfant (déjà en context probablement) et **bloquer** la commande vocale avec un toast clair si le rôle n'est pas owner/admin.
2. Ou bien : harmoniser les permissions en autorisant les contributors côté CF (décision produit à confirmer).

**Effort :** 1 h (selon la décision).

---

### T3.5 — Bornes sur l'amplitude temporelle relative
**Fichier :** [services/voice/textParser.ts:176-210](../services/voice/textParser.ts#L176-L210)

**Problème :** "il y a 99999 heures" parse en `relativeOffset = 99999*60` minutes. Timestamp résultant peut être absurde mais la CF accepte (juste un check `> now + 5 min`).

**Action :**
1. Borner `relativeOffset` à 7 jours (10080 min). Au-delà, log + ignorer.
2. Ajouter côté CF : refuser `date` < `now - 30 days` (configurable).

**Effort :** 1 h.

---

## Stratégie de livraison

| Lot | Sévérité | Effort estimé | Priorité |
|-----|----------|---------------|----------|
| Lot 1 (T1.1 → T1.4) | Critique | 1 jour | Sprint en cours |
| Lot 2 (T2.1 → T2.5) | Élevé | 2 jours | Sprint suivant |
| Lot 3 (T3.1 → T3.5) | Moyen | 1 jour | Backlog avant prochain audit |

**Ordre recommandé d'exécution :**
1. **T1.1 + T1.4** ensemble (même PR : on touche `firebaseFormatter.ts` et on ajoute le plafond segments). Tests unitaires solides.
2. **T1.2 + T1.3** ensemble (PR fonctions : idempotency + rollback quota). Déployer avec rollout progressif (1% → 100% sur 24h).
3. **T2.1** seul (cleanup AssemblyAI + scheduled job). Requiert TTL policy Firestore activée.
4. **T2.2** seul (optimistic lock — change le contrat client/serveur, mérite sa PR).
5. **T2.3 + T2.4** ensemble (whitelist + bornes).
6. **T2.5** seul (changement UX visible).
7. **Lot 3** au fil de l'eau.

**Tests à ajouter en parallèle :**
- Suite jest dédiée `services/voice/__tests__/redteam.test.ts` avec entrées adversariales :
  - `rawText` 10000 chars
  - `splitIntoSegments` avec 100 segments
  - quantités négatives, NaN, énums inventées
  - timestamps futurs/passés extrêmes
- Tests d'intégration CF (emulator) pour T1.2, T1.3, T2.1, T2.2.

**Monitoring post-déploiement :**
- Sentry alerts sur :
  - `voice_quota_refunds` (volume → indicateur erreurs AssemblyAI)
  - `pending_assemblyai_deletes` (croissance anormale → DELETE qui échoue systématiquement)
  - HttpsError `aborted` sur `validateAndUpdateEvent` (taux > 1% = problème UX optimistic lock)
- Dashboard Firestore : taille moyenne des docs `events` (devrait rester stable après T1.1).

---

## Hors scope (à discuter séparément)

- Migration AssemblyAI → un provider auto-hébergé (Whisper on-device via expo-modules) pour éliminer le risque GDPR sous-traitant. Effort : 1-2 semaines, gain : élimine totalement T2.1.
- Chiffrement E2E des notes médicales (médicaments, symptômes). Effort : 1 semaine, gain : confidentialité même en cas de compromission Firestore.
- Attestation de présence (le parent qui ajoute l'event était physiquement avec l'enfant). Hors scope produit pour l'instant.
