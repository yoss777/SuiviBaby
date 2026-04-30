# Monitoring Firebase — SuiviBaby

## 1. Alertes de budget (Google Cloud Billing)

### Configuration
1. Aller sur https://console.cloud.google.com/billing
2. Sélectionner le projet `samaye-53723`
3. Menu **Budgets & alerts**
4. Créer un budget :
   - Nom : `SuiviBaby Production`
   - Montant : selon projection (voir section 5)
   - Seuils d'alerte : **50%**, **90%**, **100%**, **150%**
   - Destinataires : email(s) de l'équipe

### Seuils recommandés pour le lancement
| Seuil mensuel | Alerte | Action |
|---------------|--------|--------|
| $10/mois | Warning 50% ($5) | Vérifier Dashboard |
| $25/mois | Warning 90% ($22.50) | Analyser les patterns de coûts |
| $50/mois | Critical 100% ($50) | Investiguer immédiatement |

## 2. Firebase Console — Métriques à surveiller

### Firestore (https://console.firebase.google.com/project/samaye-53723/firestore/usage)
- **Reads/day** : objectif < 50K/jour au lancement
- **Writes/day** : objectif < 10K/jour
- **Deletes/day** : < 1K
- **Storage** : croissance prévisible (~1 KB/événement)

### Cloud Functions (https://console.firebase.google.com/project/samaye-53723/functions/log)
- **Invocations/day** : par fonction
- **Errors/day** : objectif 0 en prod
- **Execution time** : p50 < 500ms, p99 < 5s
- **Cold starts** : surveiller si > 30% des invocations

### Authentication (https://console.firebase.google.com/project/samaye-53723/authentication/users)
- **Users actifs** : croissance, rétention
- **Sign-in methods** : répartition email/Google/Apple

## 3. Sentry — Erreurs applicatives

### Dashboard
- URL : https://tesfa-f9.sentry.io/projects/suivibaby/
- Métriques clés : crash-free rate (cible > 99.5%), unresolved issues

### Alertes Sentry à configurer
1. **New issue** : notification immédiate (Slack/email)
2. **Issue regression** : notification si un bug fermé réapparaît
3. **Crash-free rate < 99%** : alerte critique

## 4. RevenueCat — Métriques business

### Dashboard
- URL : https://app.revenuecat.com/
- Métriques : MRR, active subscribers, trial conversion, churn rate

### Alertes RevenueCat
- Configurer webhooks → Cloud Function `revenueCatWebhook` (déjà fait)
- Monitorer les events `BILLING_ISSUE` et `CANCELLATION`

## 5. Projections de coûts Firestore

### Par session utilisateur (estimation)
| Opération | Reads | Writes |
|-----------|-------|--------|
| Ouverture app (boot) | ~10 | 1 |
| Ajout événement | 3 | 2 |
| Navigation tabs | ~5 | 0 |
| Session typique (15 min) | ~30 | 5 |

### Projection mensuelle
| DAU | Reads/mois | Writes/mois | Coût estimé |
|-----|-----------|------------|-------------|
| 100 | 90K | 15K | Gratuit (quota) |
| 1,000 | 900K | 150K | ~$5/mois |
| 10,000 | 9M | 1.5M | ~$30/mois |
| 50,000 | 45M | 7.5M | ~$150/mois |

> Seuil gratuit Firebase : 50K reads/jour, 20K writes/jour
> Le seuil payant est atteint à environ **800-1400 DAU**

## 6. Procédures de configuration (à faire AVANT le lancement)

### 6.1 Budget Google Cloud (5 min)
1. https://console.cloud.google.com/billing → projet `samaye-53723`
2. Menu latéral → **Budgets & alerts** → **Create budget**
3. Nom : `SuiviBaby Production`
4. Scope : projet `samaye-53723`, tous services
5. Budget amount : **$50/mois** (ajuster après 1er mois de données)
6. Seuils : **50%** ($25), **90%** ($45), **100%** ($50), **150%** ($75)
7. Notifications → cocher **Email to billing admins**
8. Ajouter emails : `privacy@suivibaby.com` + email perso

### 6.2 Alertes Sentry (10 min)
1. https://tesfa-f9.sentry.io/projects/suivibaby/ → **Alerts** → **Create Alert**
2. **Alerte 1 — New Issue** :
   - When: A new issue is created
   - Conditions: Environment = production
   - Action: Send email + Slack (si configuré)
3. **Alerte 2 — Issue Regression** :
   - When: An issue changes state from resolved to unresolved
   - Action: Send email
4. **Alerte 3 — Crash-free rate** :
   - Type: Metric Alert
   - Metric: `session.crash_free_rate`
   - Threshold: When below **99%** for 1 hour
   - Action: Send email (CRITICAL)
5. **Alerte 4 — Error spike** :
   - Type: Metric Alert
   - Metric: Number of errors
   - Threshold: When above **50 errors** in 1 hour
   - Action: Send email

### 6.3 Firebase Console (5 min)
1. https://console.firebase.google.com/project/samaye-53723/firestore/usage
2. Vérifier que les quotas gratuits ne sont pas atteints
3. Vérifier que tous les index sont déployés (Indexes tab)
4. Vérifier que les rules sont à jour (Rules tab)

### 6.4 RevenueCat (5 min)
1. https://app.revenuecat.com/ → projet SuiviBaby
2. Vérifier que le webhook est configuré et reçoit les events
3. Activer les alertes email pour `BILLING_ISSUE` et `CANCELLATION`

## 7. Checklist de lancement monitoring

- [ ] 6.1 Budget Google Cloud créé avec 4 seuils
- [ ] 6.2 Sentry : 4 alertes configurées
- [ ] 6.3 Firebase Console vérifié (quotas, rules, indexes)
- [ ] 6.4 RevenueCat dashboard actif + webhook vérifié
- [ ] Baseline métriques documentée (reads, writes, users avant lancement)
- [ ] Config Sentry app améliorée (sessions, perf, breadcrumbs) ✅ fait dans _layout.tsx

## 7. Runbook — Que faire en cas d'alerte

### Coûts Firestore élevés
1. Vérifier Firebase Console → Usage tab
2. Identifier la collection avec le plus de reads
3. Vérifier les listeners Firestore actifs (BabyContext, socialService)
4. Chercher les queries sans pagination
5. Si urgent : activer le mode maintenance (feature flag)

### Crash rate élevé
1. Vérifier Sentry → Issues récentes
2. Identifier le stacktrace et le device/OS
3. Rollback si nécessaire (`eas update --rollback`)
4. Hotfix et redéploiement

### Cloud Function erreurs
1. Firebase Console → Functions → Logs
2. Filtrer par fonction et sévérité
3. Vérifier rate limiting et quotas
4. Redéployer si fix nécessaire (`firebase deploy --only functions:nomFonction`)

## 8. App Check enforcement (T1 — Sprint 1)

### Contexte
Les Cloud Functions wrappées par `withAppCheck()` participent à App Check.
L'enforcement est piloté par la variable d'env `APPCHECK_ENFORCE`. Tant
qu'elle vaut `false` (défaut), les requêtes sans token App Check sont
acceptées mais loguées en `UNVERIFIED`. Quand elle vaut `true`, les CFs
rejettent en 401 toute requête sans token valide.

### Procédure d'activation

**Préreq strict** : tous les builds en prod (≥ 1.0.3) doivent avoir
l'attestation native App Check active (cf. `config/appCheck.ts`). Sans
cela, l'activation bloque les clients légitimes.

1. **Audit logs (au moins 7 j)**
   ```bash
   ./scripts/auditAppCheck.sh 7d
   ```
   Le script doit retourner `STATUS: READY`. Si `NOT READY` : investiguer
   les CFs > 0.5 % UNVERIFIED avant d'activer.

2. **Activation progressive** — d'abord sur CFs critiques (impact coût) :
   ```bash
   # Définir la variable d'env pour le déploiement
   firebase functions:config:set appcheck.enforce=true
   # OU via .env.production avec APPCHECK_ENFORCE=true
   firebase deploy --only \
     functions:transcribeAudio,functions:revenueCatWebhook,functions:consumeUsageQuota
   ```

3. **Monitoring 24 h** sur Sentry + Cloud Logs :
   - Aucun pic d'erreurs `unauthenticated` côté client
   - Aucun pic d'erreurs `App Check token invalid` côté CF

4. **Étendre à toutes les CFs** :
   ```bash
   firebase deploy --only functions
   ```

5. **Re-audit J+7** après l'extension complète :
   ```bash
   ./scripts/auditAppCheck.sh 7d
   ```
   Doit montrer 100 % VERIFIED.

### Rollback (5 min)

Si on observe un pic d'erreurs côté client après activation :
```bash
firebase functions:config:unset appcheck.enforce
firebase deploy --only functions
```

Tant que Firebase n'a pas hard-deprecated les builds non-attestés, la
bascule reste possible dans les deux sens.

### CFs concernées

Toutes les CFs `onCall` du fichier `functions/index.js` qui passent par
`withAppCheck(...)`. Le webhook RevenuCat (`onRequest`) reste protégé
indépendamment par son secret Bearer — App Check ne couvre pas ce cas
par design (les webhooks viennent de fournisseurs externes).

### Audit script

`scripts/auditAppCheck.sh` :
- requête `gcloud logging` sur la fenêtre demandée
- agrège VERIFIED / UNVERIFIED par CF
- exit non-zero si une CF dépasse le seuil de 0,5 %
- utilisable en CI pour pré-vérifier toute bascule
