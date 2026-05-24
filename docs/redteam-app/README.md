# Red Team App — Plans d'action

Suite logique au red team voice ([VOICE_PIPELINE_REDTEAM_REPORT.md](../VOICE_PIPELINE_REDTEAM_REPORT.md)). Couvre les domaines applicatifs hors pipeline vocal.

**Ordre d'exécution validé :** A → B1 → B3 → B2 → B4 → B5 → B6.

Chaque domaine a son MD plan avec :
- Surfaces d'attaque identifiées
- Gaps actuels
- Actions correctives (priorité + effort)
- Tests à ajouter
- Métriques à surveiller post-fix

| # | Plan | Domaine | Statut |
|---|------|---------|--------|
| A | [A_BORNES_UI.md](A_BORNES_UI.md) | Bornes quantitatives UI (forms d'events) | 🟡 plan rédigé, exécution en cours |
| B1 | [B1_SHARING.md](B1_SHARING.md) | Partage co-parent (invitations, share codes) | ⚪ recon à faire |
| B3 | [B3_AUTH.md](B3_AUTH.md) | Authentification & sessions | ⚪ recon à faire |
| B2 | [B2_DELETION.md](B2_DELETION.md) | Suppression de données (RGPD) | ⚪ recon à faire |
| B4 | [B4_PAYMENTS.md](B4_PAYMENTS.md) | Paiements & quotas (RevenueCat) | ⚪ recon à faire |
| B5 | [B5_EXPORTS_AI_PHOTOS.md](B5_EXPORTS_AI_PHOTOS.md) | Exports, AI insights, photos | ⚪ recon à faire |
| B6 | [B6_MODERATION.md](B6_MODERATION.md) | Modération & reports | ⚪ recon à faire |

**Légende statut :**
- ⚪ recon à faire (plan vide, agent à lancer)
- 🟡 plan rédigé, exécution non démarrée ou en cours
- 🟢 livré (code + tests + déploiement + closure report)
