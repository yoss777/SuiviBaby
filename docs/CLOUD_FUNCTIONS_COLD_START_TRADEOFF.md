# Cold start vs facturation — le trade-off `minInstances`

> Sprint 4 / S4-T4 — décision en suspens
> Date : 2026-04-30
> Périmètre : Cloud Functions critiques sur projet `samaye-53723` (Blaze)

## TL;DR

`transcribeAudio` (commande vocale) est la seule CF où le cold start est visible par l'utilisateur — 3 à 8 secondes entre le release du bouton micro et l'apparition du transcript. Pour l'éliminer, il faut une instance "warm" en permanence (`minInstances: 1`), ce qui coûte ~5 €/mois fixe.

Trois options réalistes :
1. **Accepter les 5 €/mois** : flip `--force` au prochain deploy, cold start disparaît.
2. **Retirer `minInstances`** : zéro coût additionnel, on revit le cold start 3-8s sur la première commande après inactivité.
3. **Approche hybride** : warmup côté client à l'ouverture de l'app — coût quasi-nul, élimine le cold start dans 95 % des cas réels (voir §6).

Recommandation : **option 3 d'abord**, refallback à l'option 1 si métriques montrent que le warmup ne suffit pas.

---

## 1. Contexte business

Suivi Baby permet de logger un événement (tétée, biberon, change, etc.) via **commande vocale** : l'utilisateur appuie sur un bouton micro, parle 1-3 secondes ("ajoute un biberon de 120 ml"), relâche. Le pipeline :

1. App enregistre l'audio (`expo-av`)
2. App envoie le base64 audio à la CF `transcribeAudio`
3. CF proxie vers AssemblyAI, attend le résultat (1-5s typique)
4. CF retourne le texte transcrit
5. App parse le texte, ouvre la sheet pré-remplie

La perception utilisateur : entre le release du bouton et l'apparition de la sheet, **chaque seconde compte**. Un parent qui change un bébé en pleine nuit n'a pas envie d'attendre 8 secondes.

## 2. Le problème : cold start

### Comment ça marche, Cloud Functions Gen 2

Cloud Functions Gen 2 = Cloud Run sous le capot. Comportement par défaut :
- Une CF n'a aucune instance qui tourne au repos
- À la première requête, GCP doit :
  1. Récupérer le container image depuis Artifact Registry (~1-2s)
  2. Démarrer le container (~500ms)
  3. Initialiser le runtime Node.js 22 (~500ms-1s)
  4. Charger le module `firebase-functions` + nos imports (~500ms-1s)
  5. Exécuter le handler
- **Total cold start** : 3 à 8 secondes selon la mémoire allouée et l'inactivité réseau

Une fois warm, les requêtes suivantes prennent quelques dizaines de ms côté CF (avant l'appel AssemblyAI).

### Quand est-ce qu'une CF cold-start ?

GCP garde une instance warm pendant ~15 minutes sans trafic, puis la termine. Patterns problématiques pour nous :
- **Premier réveil de la matinée** : 8h, l'utilisateur fait sa première commande vocale, la CF a été down toute la nuit → cold start
- **Reprise après pause** : l'utilisateur fait une commande à 14h, puis reprend à 16h30 → cold start
- **Après scaling down** : si le trafic est bas, GCP réduit à zéro instance → cold start

À l'inverse, si tu es en plein flow (5 commandes en 10 min), l'instance reste warm naturellement.

## 3. Que fait `minInstances: 1`

`minInstances: N` force GCP à toujours garder N instances pré-démarrées. Tant qu'il y a au moins 1 requête en cours, GCP peut en lancer plus (jusqu'à `maxInstances`, défaut 100). Quand le trafic redescend, GCP termine les surplus mais **garde toujours au moins N**.

Effet pratique : la requête utilisateur tombe sur une instance déjà warm → 0 cold start, juste la latence réseau + le travail réel.

### Coût exact

Facturation Cloud Functions Gen 2 = `(memory) × (CPU) × (temps actif)` en GiB-seconde et vCPU-seconde.

Pour `transcribeAudio` actuellement configurée :
- Mémoire : 512 MiB = 0.5 GiB
- CPU : 1 vCPU (default)
- Région : europe-west1 (= Belgique = $0.0000035/GiB-s + $0.0000337/vCPU-s)
- Temps actif : 24h × 30j = 2 592 000 s

```
Coût mémoire  = 0.5 × 0.0000035 × 2 592 000 ≈ 4.54 $/mois
Coût CPU      = 1 × 0.0000337 × 2 592 000 ≈ ... wait that's wrong
```

Correction — le pricing Cloud Functions Gen 2 idle (instance warm sans requête) facture :
- Memory only à $0.0000025 per GiB-second
- 50 % du CPU rate idle

```
Idle memory  = 0.5 × 0.0000025 × 2 592 000 ≈ 3.24 $/mois
Idle CPU     = 1 × 0.0000050 × 2 592 000 ≈ 12.96 $/mois (si tarif full)
                                          ≈ 6.48 $/mois (idle 50 %)
```

Honnêtement la facturation Cloud Functions Gen 2 pour minInstances est complexe et dépend de plein de paramètres (CPU allocation, idle behavior). Firebase docs annoncent **typiquement 5-10 $/mois pour `minInstances: 1` sur 512 MiB en europe-west1**.

Mon estimation prudente : **5-8 €/mois**. Je n'ai pas le bill exact pour confirmer.

### Le warning Firebase au deploy

> `Pass the --force option to deploy functions that increase the minimum bill`

Firebase bloque le deploy par défaut pour qu'un dev ne mette pas accidentellement minInstances=10 et se retrouve avec 50€/mois sans s'en rendre compte. Avec `--force`, on confirme avoir lu et accepté.

## 4. Évaluation des trois options principales

### Option 1 — `minInstances: 1` + `--force`

**Avantages** :
- Cold start = 0 sur transcribeAudio. UX optimale.
- Setup immédiat (un flip de flag).
- Réversible à tout moment (revert le commit, redeploy sans `--force`).

**Inconvénients** :
- ~5-8 €/mois fixe **même la nuit, même si zéro user**.
- Le coût scale linéaire si on ajoute d'autres CFs en `minInstances: 1`.
- N'aide que pour transcribeAudio. Les autres CFs warm aussi en passant mais c'est marginal vu leur trafic.

**Verdict** : simple, fiable, coûteux. Bon premier choix si on prévoit > 100 DAU sur la voix.

### Option 2 — `minInstances: 0` (= retirer)

**Avantages** :
- Zéro coût additionnel.
- Aucun overhead de gestion.

**Inconvénients** :
- Cold start 3-8s sur la première commande vocale du matin / après pause longue.
- Cumulé avec la latence AssemblyAI (1-5s) → utilisateur attend 4-13s sur sa première commande.
- Mauvaise première impression pour un nouvel utilisateur qui découvre la commande vocale.

**Verdict** : OK si tu acceptes que la voix soit "lente sur la première utilisation puis rapide ensuite".

### Option 3 — Warmup côté client (recommandée)

À l'ouverture de l'app (`app/_layout.tsx` ou `app/boot.tsx`), faire un appel best-effort à transcribeAudio avec un audio bidon ou un endpoint de health-check qu'on ajoute à la CF.

```ts
// pseudo-code dans boot.tsx
useEffect(() => {
  // Fire-and-forget warmup. The CF will be warm by the time the user
  // hits the voice button.
  warmupTranscribeAudio().catch(() => {});
}, []);
```

Implémentation minimale : ajouter un mode `warmup: true` à transcribeAudio qui retourne immédiatement sans appeler AssemblyAI.

**Avantages** :
- Zéro coût additionnel (utilise le free tier des invocations).
- Couvre 95 % des cas réels : un user qui ouvre l'app va l'utiliser dans les 15 min.
- Implémentable en une CF tweak + un useEffect.

**Inconvénients** :
- 1 invocation gratuite par session (largement sous le free tier de 2M/mois).
- Ne couvre pas le cas où l'app reste backgroundée 30 min puis l'user fait une commande vocale (mais expo-router/AppState pourraient déclencher un re-warmup au foreground).
- Demande un peu de code (~20 lignes) — pas un simple flag.

**Verdict** : meilleur ratio coût / impact. C'est l'option à essayer en premier.

## 5. Alternatives viables additionnelles

### 5.1 Réduire la mémoire à 256 MiB

`transcribeAudio` proxie un audio base64 + un POST. Pas besoin de 512 MiB en théorie. À 256 MiB, le coût `minInstances: 1` divise par 2 → ~3 €/mois.

**À tester** : redéployer en 256 MiB et vérifier qu'on ne dépasse pas la mémoire avec un audio de 1 min (~1.5 MiB de base64). Probablement OK.

### 5.2 Scheduled minInstances

Cloud Run permet de définir un schedule pour `minInstances` :
- 7h-22h : `minInstances: 1` (heures actives parents)
- 22h-7h : `minInstances: 0` (la nuit, cold start acceptable)

Coût : ~60 % du always-on, soit ~3 €/mois. Économie : ~2 €/mois.

**Implémentation** : pas natif Firebase, faut un Cloud Scheduler qui appelle l'API Cloud Run pour update le service. Complexité : moyenne.

**Verdict** : économie marginale (2 €/mois) pour la complexité ajoutée. À ignorer sauf si on bascule à minInstances >= 3 (où l'enjeu devient 15+ €/mois).

### 5.3 Switch de fournisseur de transcription

`transcribeAudio` proxie vers AssemblyAI (proxy CF nécessaire pour cacher la clé API). Si on passe à un fournisseur dont la clé peut être appelée directement depuis le client (via App Check + token court-vie), on supprime la CF entièrement → plus de cold start.

Candidates :
- **OpenAI Whisper API** : pas de support natif RN, et la clé doit toujours rester serveur → même problème
- **Google Cloud Speech-to-Text** : peut être appelé depuis client si on génère un token Cloud IAM côté serveur. Mais on ré-introduit un appel serveur de toute façon

**Verdict** : pas une vraie sortie. Le cold start est un problème de Cloud Functions, pas du provider de transcription.

### 5.4 Whisper côté client (`whisper.cpp` via expo)

Faire la transcription sur le device, plus de CF du tout.

**Avantages** :
- Zéro coût serveur, zéro cold start
- Privacy : l'audio enfant ne quitte jamais le téléphone (énorme win RGPD)
- Marche offline

**Inconvénients** :
- Bundle size +20-100 MB selon le modèle
- Drain batterie significatif
- Qualité de transcription en français < AssemblyAI sur les modèles compacts
- Devrait gérer iOS + Android natif (lib RN existante mais maintenance variable)

**Verdict** : énorme effort R&D, énorme gain privacy. À considérer pour une v2.0 mais pas pour ce sprint.

### 5.5 Côté CF : "lazy warm" au premier user du matin

GCP exécute déjà cette logique nativement avec `minInstances: 0`. Le premier user du matin **est** le warmup. Pas d'option "warm me before 8am" sur Cloud Functions sans `minInstances` ou Cloud Scheduler.

On pourrait setup un Cloud Scheduler qui ping `transcribeAudio` à 7h chaque matin. Coût : invocations gratuites, mais l'instance cold-start de toute façon, donc le bénéfice est mince.

**Verdict** : peu pertinent.

### 5.6 Désactiver la voix en free tier

Si tu décides que la voix est une feature Premium uniquement, le volume baisse → moins de coups de cold start parce que les premium sont des heavy users → instances probablement warm en permanence sans `minInstances`.

**Verdict** : décision produit, pas technique. À évaluer sur les métriques RevenueCat actuelles.

## 6. Mécanique du warmup côté client (option 3 détaillée)

### Implémentation proposée

**1. Ajouter un mode warmup à `transcribeAudio`**

```js
// functions/index.js
exports.transcribeAudio = onCall(..., async (request) => {
  if (request.auth) monitorAppCheck(request, "transcribeAudio");

  // Warmup mode: just touch the function so it stays alive.
  if (request.data?.warmup === true) {
    return { warmed: true };
  }

  // ... rest of the existing logic
});
```

Coût additionnel par warmup : ~50ms de CPU, ~0.0001 € — invisible dans le free tier.

**2. Ping au démarrage de l'app**

```ts
// app/_layout.tsx ou hooks/useTranscribeWarmup.ts
import { httpsCallable } from "firebase/functions";
import { functions } from "@/config/firebase";

export function useTranscribeWarmup() {
  useEffect(() => {
    const warmup = httpsCallable(functions, "transcribeAudio");
    warmup({ warmup: true }).catch(() => {});
  }, []);
}
```

Appeler depuis `app/_layout.tsx` après auth confirmée.

**3. Re-warmup au foreground**

```ts
useEffect(() => {
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") {
      // Re-ping if the app was backgrounded > 10 min
      const last = lastWarmupRef.current ?? 0;
      if (Date.now() - last > 10 * 60 * 1000) {
        warmup({ warmup: true }).catch(() => {});
        lastWarmupRef.current = Date.now();
      }
    }
  });
  return () => sub.remove();
}, []);
```

### Couverture estimée

- User ouvre l'app puis fait une commande vocale dans les 15 min : **100 % des cas couverts** (instance warm depuis le ping de boot).
- User ouvre l'app, la background 30 min, retour, commande vocale : couvert par le re-warmup au foreground.
- User reçoit une notif push, tape dessus, fait une commande vocale immédiatement : couvert (le ping de boot fire à l'app launch).
- User a l'app ouverte en background depuis 1h sans interaction et fait soudainement une commande vocale : **non couvert** — cold start. Cas rare en pratique.

Estimation : **95 % des cas réels couverts** sans `minInstances`.

### Coût

- 1 ping par cold launch de l'app
- 1 ping par foreground après > 10 min background
- Disons 5 pings/user/jour × 500 DAU × 30 jours = 75 000 invocations/mois
- Free tier Cloud Functions : 2 000 000 invocations/mois → **on consomme 4 % du free tier**
- Coût : **0 €**

À 5 000 DAU : 750 000 invocations/mois → 37 % du free tier → toujours 0 €.

À 50 000 DAU : 7.5 M invocations/mois → 5.5 M payantes à $0.40/M → ~2.2 €/mois.

## 7. Décision proposée

| DAU | Recommandation |
|-----|----------------|
| < 1 000 | Option 3 (warmup client). Économise 5 €/mois sans dégrader l'UX. |
| 1 000 – 10 000 | Option 3. Si métriques Sentry montrent > 5 % des transcribeAudio à > 5s end-to-end, escalader vers option 1. |
| > 10 000 | Option 1 (`minInstances: 1`). À ce volume, le warmup client commence à coûter en invocations payantes, et la fiabilité prime sur l'optimisation. |

À ton volume actuel (probablement < 500 DAU), **option 3 est clairement le bon choix**.

## 8. Plan d'action immédiat

Si tu acceptes l'option 3 :
1. Retirer `minInstances: 1` de `transcribeAudio` dans `functions/index.js` (revert partiel de S4-T4)
2. Ajouter le mode warmup à `transcribeAudio` (~5 lignes)
3. Ajouter `useTranscribeWarmup` dans `app/_layout.tsx`
4. Redéployer (sans `--force` puisqu'on n'augmente plus la facture min)
5. Monitorer Sentry Performance sur le span `transcribeAudio` pendant 7 jours
6. Si > 5 % au-dessus de 5s end-to-end, escalader vers option 1

Si tu préfères option 1 (rapidité) :
1. Lancer `firebase deploy --only functions:transcribeAudio,... --force`
2. Confirmer dans la facture GCP (https://console.cloud.google.com/billing/linkedaccount?project=samaye-53723) que le minimum mensuel est bien ~5-8 €
3. Re-évaluer dans 3 mois quand le DAU aura grossi

## 9. Monitoring à mettre en place quoi qu'il arrive

- **Sentry Performance** : tracer `transcribeAudio` end-to-end côté client pour mesurer la distribution des latences (P50, P95, P99). Déjà activé dans `app/_layout.tsx` (S4-T8).
- **Cloud Logging** : alert si > 10 % des invocations transcribeAudio dépassent 10s.
- **GCP Billing** : alert à 10 €/mois et à 25 €/mois sur le projet `samaye-53723`. Déjà documenté dans `docs/FIREBASE_MONITORING.md`.

## 10. Liens

- Pricing Cloud Functions Gen 2 : https://cloud.google.com/functions/pricing-2nd-gen
- minInstances doc : https://cloud.google.com/run/docs/configuring/min-instances
- Commit S4-T4 (origine de la discussion) : `941af48`
- Sprint 4 plan : `docs/archive/2026/plan_sprint4_polish.md`
