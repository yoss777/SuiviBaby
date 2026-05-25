# Red Team App — Plans d'action

Suite logique au red team voice ([VOICE_PIPELINE_REDTEAM_REPORT.md](../VOICE_PIPELINE_REDTEAM_REPORT.md)). Couvre les domaines applicatifs hors pipeline vocal.

**Ordre d'exécution validé :** A → B1 → B3 → B2 → B4 → B5 → B6.

Chaque domaine a son MD plan avec :
- Surfaces d'attaque identifiées
- Gaps actuels
- Actions correctives (priorité + effort)
- Tests à ajouter
- Métriques à surveiller post-fix

| # | Plan | Domaine | Surfaces (Critique/Élevé/Moyen/Faible) | Statut |
|---|------|---------|---------------------------------------|--------|
| A | [A_BORNES_UI.md](A_BORNES_UI.md) | Bornes quantitatives UI (forms d'events) | 5C / 3É / 3M | 🟡 plan rédigé, factorisations à venir |
| B1 | [B1_SHARING.md](B1_SHARING.md) | Partage co-parent | 0C / 2É / 3M / 1F | 🟡 plan rédigé |
| B3 | [B3_AUTH.md](B3_AUTH.md) | Authentification & sessions | 2C / 4É / 1M | 🟡 plan rédigé |
| B2 | [B2_DELETION.md](B2_DELETION.md) | Suppression de données (RGPD) | 3C / 4É / 3M | 🟡 plan rédigé |
| B4 | [B4_PAYMENTS.md](B4_PAYMENTS.md) | Paiements & quotas (RevenueCat) | 1C / 3É / 2M | 🟡 plan rédigé |
| B5 | [B5_EXPORTS_AI_PHOTOS.md](B5_EXPORTS_AI_PHOTOS.md) | Exports, AI insights, photos | 0C / 1É / 2M / 3F | 🟡 plan rédigé |
| B6 | [B6_MODERATION.md](B6_MODERATION.md) | Modération & reports | 1C / 1É / 3M / 2F | 🟡 plan rédigé |

**Total brut :** 12 surfaces CRITIQUES, 18 ÉLEVÉ, 17 MOYEN, 6 FAIBLE = **53 surfaces** identifiées.

## Avancement

| Chantier | Statut | Closure |
|---|---|---|
| **Lot 0** (5 critiques transversales — T0.2 à T0.6) | 🟢 livré | [LOT0_CLOSURE.md](LOT0_CLOSURE.md) |
| **A** (bornes UI, 13 gaps) | 🟢 livré | [A_CLOSURE.md](A_CLOSURE.md) |
| **B1** (sharing co-parent, 7 surfaces) | 🟢 livré | [B1_CLOSURE.md](B1_CLOSURE.md) |
| **B2** (deletion RGPD, 10 surfaces) | 🟢 livré | [B2_CLOSURE.md](B2_CLOSURE.md) |
| 0.1 App Check | ⏸ reporté TOUT DERNIER | [0_APP_CHECK_SETUP.md](0_APP_CHECK_SETUP.md) |
| B3-B6 | 🟡 plans rédigés | — |

**Légende statut :**
- ⚪ recon à faire (plan vide, agent à lancer)
- 🟡 plan rédigé, exécution non démarrée ou en cours
- 🟢 livré (code + tests + déploiement + closure report)

## Top CRITIQUES à shipper en premier (cross-domaines)

Vu les 12 critiques étalées sur tous les domaines, la priorité absolue (à exécuter avant tout chantier "complet" sur A) :

1. **B3-S6 — activer `APPCHECK_ENFORCE=true`** : sinon toutes les autres défenses CF sont contournables via curl. **Bloqueur 0.**
2. **B4-S1 — Svix webhook RC** : pas de signature crypto = forge totale possible. **Bloqueur 1.**
3. **B6-S4 — admin claim audit + ownership** : admin global peut supprimer events de n'importe quel enfant. **Bloqueur 2.**
4. **B3-S2 — CF `setAdminClaim`** : sans elle, pas d'audit possible (pré-requis de B6-S4).
5. **B2-S1+S5 — RGPD orphelins** : 7 collections + AssemblyAI sans userId. Risque légal direct.
6. **B2-S3 — restreindre `deleteUserAccount` à self** : suppression by tiers possible.

Ces 6 critiques peuvent former un **"Lot 0"** parallèle au chantier A.
