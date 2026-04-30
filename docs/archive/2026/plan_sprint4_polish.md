# Sprint 4 — Polish & finitions

> **Durée cible :** 1 semaine (5 j ouvrés)
> **Branche :** `sprint4/polish`
> **Préreq :** Sprints 1, 2, 3 mergés
> **Output attendu :** version 1.2.x prête pour soumission stores avec marketing assets

## Objectif

Finalisations techniques (assets, perf, monitoring) + nettoyage du dépôt + préparation soumission stores. Sprint moins critique mais nécessaire avant un push marketing.

## Vue d'ensemble

| # | Tâche | Effort | Fichiers |
|---|-------|--------|----------|
| 1 | Conversion assets PNG → WebP + audit splash video | 0,5 j | `assets/images/`, `assets/bootsplash2.mp4` |
| 2 | `cachePolicy="memory-disk"` sur expo-image | 0,25 j | `components/PhotoImage.tsx` |
| 3 | Pagination `deletion-requests.tsx` + autres queries | 0,5 j | `app/settings/deletion-requests.tsx` |
| 4 | Cloud Functions `concurrency` + min instances | 0,5 j | `functions/index.js` |
| 5 | Cleanup AssemblyAI : suppression audio post-transcription | 0,5 j | `functions/index.js:364-506` |
| 6 | Migration `expo-av` → `expo-audio` (si décidé) | 1,5 j | `services/voice/recorder.ts` |
| 7 | Nettoyage docs racine (todos doublons, archive) | 0,25 j | racine projet |
| 8 | Sentry Performance traces (startup, navigation, CFs) | 0,5 j | `app/_layout.tsx`, services |
| 9 | Soumission stores : screenshots, release notes, metadata | 1 j | EAS, store consoles |

Sous-total **~5,5 j** (tâche 6 conditionnelle au plan Sprint 2).

---

## Tâche 1 — Conversion assets

### Constat
- `assets/images/{icon,notification-icon,adaptive-icon,splash-icon}.png` ~141 KB chacun = 564 KB
- `assets/bootsplash2.mp4` : 471 KB
- PNG non compressé alors qu'WebP donne ~25 % de la taille

### Étapes
1. **Audit splash video** :
   - Vérifier où `bootsplash2.mp4` est utilisé (`grep -rn "bootsplash2" .`)
   - Si vraiment utilisée pour l'écran de launch → garder mais transcoder à `-crf 28` ffmpeg
   - Sinon : supprimer
2. **Conversion PNG → WebP** :
   ```bash
   for f in assets/images/{icon,notification-icon,adaptive-icon,splash-icon}.png; do
     cwebp -q 85 "$f" -o "${f%.png}.webp"
   done
   ```
3. Mettre à jour `app.config.js` / `app.json` pour pointer vers les `.webp`
   - **Attention :** Apple/Google peuvent encore exiger PNG pour certains assets (icon principal). À vérifier dans la doc Expo.
   - Pour les assets manifest natifs (notification-icon Android), garder PNG.
4. Tester un build EAS preview → confirmer rendu identique
5. Mesurer bundle size avant/après (`npx expo export --platform android` puis `du -sh dist/`)

### Definition of Done
- [ ] Bundle size réduit d'au moins 300 KB
- [ ] Build EAS preview valide visuellement (icon, splash, notification)
- [ ] Aucune régression visuelle

---

## Tâche 2 — `cachePolicy` sur expo-image

### Étapes
1. Ouvrir `components/PhotoImage.tsx`
2. Ajouter `cachePolicy="memory-disk"` au `<ExpoImage>` :
   ```tsx
   <ExpoImage
     source={{ uri }}
     cachePolicy="memory-disk"
     transition={150}
     ...
   />
   ```
3. Si la tâche 7 du Sprint 1 (signed URLs) est déployée : adapter le cache au TTL des signed URLs (50 min, donc `cachePolicy="memory"` peut suffire pour ce cas).
4. Tester : ouvrir une galerie, fermer l'app, rouvrir → photos chargées instantanément depuis le disque

### Definition of Done
- [ ] `cachePolicy` en place
- [ ] Test de cache hit confirmé
- [ ] Aucune régression sur le rafraîchissement après upload nouvelle photo

---

## Tâche 3 — Pagination des queries Firestore

### Cibles
- `app/settings/deletion-requests.tsx` — query sans `limit()`
- Auditer les autres : `grep -rn "onSnapshot\\|query.*where" --include="*.tsx" app/`

### Étapes
1. Pour chaque query identifiée sans `limit()` :
   - Si dataset borné par nature (≤ 50 items) → `limit(50)` suffit, pas de pagination UI
   - Si dataset peut grossir → paginer avec `startAfter(lastDoc)` + bouton "Charger plus" ou infinite scroll
2. Reprendre le pattern existant `usePaginatedEvents` si applicable
3. Mesurer avant/après le nombre de reads via Firebase console

### Definition of Done
- [ ] Toutes les queries ont un `limit()` explicite
- [ ] Pagination UX en place pour les datasets > 50
- [ ] Diff Firestore reads visible sur 7 j post-déploiement

---

## Tâche 4 — Cloud Functions `concurrency` + min instances

### Constat
- Aucune CF n'a de `concurrency` ni de `minInstances` configuré → cold start 3-10 s sur les pics

### Étapes
1. Identifier les CFs critiques (latence importante pour UX) :
   - `transcribeAudio` (synchrone côté user)
   - `validateAndCreateEvent` (idem)
   - `getUsageQuotaStatus`
2. Ajouter aux options :
   ```js
   exports.transcribeAudio = onCall(
     {
       region: "europe-west1",
       secrets: ["ASSEMBLYAI_API_KEY"],
       concurrency: 30,         // requêtes simultanées sur même instance
       minInstances: 1,         // garde 1 instance chaude
       memory: "512MiB",
     },
     async (request) => { ... }
   );
   ```
3. **Coût** : `minInstances: 1` = ~5 €/mois par CF. Limiter à 2-3 CFs critiques.
4. Pour les CFs batch (`purgeDeletedAccounts`, `cleanupExpiredShareCodes`) : pas besoin de `minInstances`.
5. Déployer + monitorer P95 latence sur 7 j

### Definition of Done
- [ ] `concurrency` configuré sur 3+ CFs critiques
- [ ] `minInstances: 1` sur 2-3 CFs (coût ~10-15 €/mois validé)
- [ ] P95 latency mesurée avant/après — cible : –50 % sur les CFs concernées

---

## Tâche 5 — Cleanup audio AssemblyAI

### Constat
- `functions/index.js:364-506` proxy AssemblyAI mais ne supprime jamais l'audio uploadé côté AssemblyAI → données enfant retenues indéfiniment chez le tiers

### Étapes
1. Identifier l'API AssemblyAI de delete : `DELETE https://api.assemblyai.com/v2/transcript/{transcriptId}`
2. Après réception du transcript final (L:493 environ), ajouter :
   ```js
   try {
     await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
       method: "DELETE",
       headers: { authorization: ASSEMBLYAI_API_KEY },
     });
   } catch (e) {
     console.warn("AssemblyAI delete failed (non-fatal):", e.message);
   }
   ```
3. Tester avec un transcript test, vérifier que l'API retourne 404 sur GET après le DELETE

### Definition of Done
- [ ] Delete appelé pour 100 % des transcriptions
- [ ] Logs confirment les deletes
- [ ] Privacy policy mise à jour si elle parle d'AssemblyAI

---

## Tâche 6 — Migration `expo-av` → `expo-audio` (conditionnel)

### Préreq
- Décision Sprint 2 tâche 4 : exécution maintenant ou plus tard
- Si Expo SDK 54 sortie imminente → faire maintenant

### Étapes
Cf. `docs/MIGRATION_EXPO_AUDIO.md` créé en Sprint 2.

1. `npm install expo-audio`
2. Refactorer `services/voice/recorder.ts` :
   - Remplacer `Audio.Recording` par `useAudioRecorder` hook (ou API impérative équivalente)
   - Garder la même API publique (les callers ne changent pas)
3. Tester sur iOS + Android :
   - Démarrage / arrêt enregistrement
   - Permissions micro
   - Background recording si applicable
4. Désinstaller `expo-av`

### Definition of Done
- [ ] `expo-av` retiré de `package.json`
- [ ] Tests voice (`__tests__/services/voice/`) verts
- [ ] Test manuel : flow vocal complet sur iOS + Android

---

## Tâche 7 — Nettoyage docs racine

### Cibles (à archiver/supprimer)
- `IMPLEMENTATION_SUCCESS_ANIMATION.md` + `INTEGRATION_SUCCESS_ANIMATION_TODO.md` → doublons, fonction live, archiver
- `todo_auth_enhance.md` + `todo_auth_improvements.md` → consolider en 1 ou archiver si fait
- `todo_update_banner_remediation.md` → résolu, archiver
- `audit-remaining-v2.md` → résolu (audit du 2026-04-27 le remplace), archiver
- `PLAN_ACTION_MEP.md` → MEP terminée 6 avril, archiver
- `analyse_monetisation.md` + `todo_monetisation.md` → fait, archiver
- `plan_sync_foreground_stop_undo.md` → terminé selon git log, archiver
- `plan_workflow_compte_suppression_programmee.md` → terminé, archiver
- `todo_DateTimePickerRow.md`, `todo_recaphebdo.md`, `todo_smart_content.md`, `todo_stats_enhance.md`, `todo_promenade_enhance.md`, `todo_promos.md`, `todo_notifications.md`, `todos_next_events.md`, `UPDATES_SUMMARY.md` → audit individuel : si la feature est live, archiver

### Étapes
1. Créer `docs/archive/2026/` (ou `docs/archive/`)
2. `git mv` les fichiers archivés (préserve l'historique)
3. Pour les TODOs encore actifs (rare) : renommer en `plan_*.md` et garder en racine
4. Mettre à jour `README.md` section "Docs" avec un index propre

### Definition of Done
- [ ] Racine ne contient plus que : `README.md`, `ROADMAP.md`, plans actifs, plans `sprint*`
- [ ] `docs/archive/` peuplé avec historique
- [ ] `README.md` à jour

---

## Tâche 8 — Sentry Performance traces

### Constat
- Sentry capture les erreurs mais pas les performances
- Pas de visibilité sur startup time, navigation transitions, latence CFs côté client

### Étapes
1. Vérifier la version `@sentry/react-native@~6.14.0` supporte Performance — oui depuis v5
2. Activer dans `app/_layout.tsx` :
   ```ts
   Sentry.init({
     dsn: SENTRY_DSN,
     enableAutoPerformanceTracing: true,
     tracesSampleRate: 0.1,  // 10 %
     enableNativeFramesTracking: true,
   });
   ```
3. Wrapper les CFs callable côté client avec un span Sentry :
   ```ts
   const transaction = Sentry.startTransaction({ name: `cf:${functionName}`, op: "callable" });
   try {
     return await callable(data);
   } finally {
     transaction.finish();
   }
   ```
   Centraliser dans un wrapper `services/cloudFunctionsClient.ts`.
4. Vérifier les dashboards Sentry après 24 h

### Definition of Done
- [ ] Performance tracing actif
- [ ] Dashboard Sentry montre transactions startup, navigation, CFs
- [ ] Sample rate raisonnable (10 %) pour éviter de saturer le quota Sentry

---

## Tâche 9 — Soumission stores

### Étapes
1. **Screenshots** :
   - 6+ par plateforme (iPhone 6.7", iPhone 5.5", iPad 12.9", Android phone, Android tablet)
   - Outils : Screenshot Studio ou Figma + maquettes
   - Cible : montrer les fonctionnalités phares (suivi, multi-bébé, voix, partage, mode nuit)
2. **Release notes** (FR + EN) :
   - Liste les nouveautés depuis 1.0.3 (sécurité renforcée, refonte performance, etc.)
   - Format Apple : 4000 chars max, format Google : idem
3. **Metadata** :
   - Description longue actualisée (mentionner RGPD, soft-delete, App Check)
   - Keywords ASO : "suivi bébé", "allaitement", "tétée", "biberon", "couche", "sommeil bébé"
   - Privacy URL : confirmer https://samaye-53723.web.app/privacy
4. **TestFlight + Play internal** : 5-7 jours de test interne minimum avant promotion review
5. **Soumission** :
   - iOS : EAS Submit (`eas submit -p ios`)
   - Android : EAS Submit (`eas submit -p android`)

### Definition of Done
- [ ] 12+ screenshots produits et uploadés
- [ ] Release notes FR + EN validées
- [ ] Metadata à jour des 2 stores
- [ ] Builds en TestFlight et Play internal
- [ ] Soumission en cours de review

---

## Tests transverses Sprint 4

| Test | Status |
|------|--------|
| Bundle size réduit ≥ 300 KB | ⚠️ requis |
| Sentry Performance dashboard alimenté | ⚠️ requis |
| Coût Firestore reads diminué (mesuré 7 j) | ⚠️ cible |
| Coût CFs : `minInstances` reste sous 20 €/mois | ⚠️ cible |
| Aucun TODO racine non actif | ⚠️ requis |
| Build EAS production iOS + Android verts | ⚠️ requis |

## Definition of Done globale Sprint 4

- [ ] 9 tâches mergées
- [ ] Bump version `1.2.0` (ou `1.3.0` si Sprint 3 a déjà bumpé)
- [ ] Stores en review
- [ ] `docs/archive/` peuplé
- [ ] Dashboard Sentry Performance public à l'équipe
- [ ] Communication interne (changelog, release notes finales)

## Risques globaux

- **Risque store review** : plus la version est lointaine de 1.0.3, plus le risque de rejet est élevé. Mitigation : changelog détaillé + tester avec App Store Connect "Review prep" tool.
- **Risque coût** : `minInstances` peut surprendre sur la facture. Suivre la facture GCP J+7 et ajuster si > 30 €/mois.
- **Risque migration `expo-audio`** : encore en preview, breaking changes possibles. Si bloquant → reporter au Sprint 5.

---

## Suite proposée (post-Sprint 4)

- **Sprint 5** : refacto charts (`TeteesChartSkia` 1006 LOC, `PompagesChartSkia` 982 LOC, etc.) + sortie de Skia alpha si v2.0 stable disponible
- **Sprint 6** : acquisition (ASO, content Instagram, partenariats maternités) — non-tech, drive PM
- **Sprint 7** : tier Famille polish (paywall, dashboard partagé temps réel)
