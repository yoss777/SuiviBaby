# Guide de soumission stores — SuiviBaby v1.0.0

## Prérequis

### Code
- [ ] Tous les tests passent (`npm test && npm run test:functions`)
- [ ] TypeScript 0 erreurs (`npx tsc --noEmit`)
- [ ] Pas de `console.log` en production (babel-plugin-transform-remove-console actif)
- [ ] Version dans app.json : `1.0.0`
- [ ] EAS Build profile `production` configuré

### Comptes
- [ ] Apple Developer Account actif ($99/an)
- [ ] Google Play Console actif ($25 one-time)
- [ ] EAS projet configuré (project ID dans app.json)
- [ ] Secrets GitHub configurés : `EXPO_TOKEN`, `GCP_SA_KEY`, `FIREBASE_PROJECT_ID`

### Contenu légal
- [ ] Privacy Policy en ligne : `https://samaye-53723.web.app/privacy`
- [ ] Terms of Service en ligne : `https://samaye-53723.web.app/terms`
- [ ] Page de suppression de compte : `https://samaye-53723.web.app/delete-account`

---

## 1. Build production

```bash
# Via CI/CD (recommandé)
git tag v1.0.0
git push origin v1.0.0
# → Déclenche .github/workflows/release.yml automatiquement

# Ou manuellement
eas build --profile production --platform all --non-interactive
```

## 2. Apple App Store

### App Store Connect
1. https://appstoreconnect.apple.com → My Apps → "+" → New App
2. **Informations requises :**
   - Nom : `Suivi Baby`
   - Sous-titre : `Suivi bébé intelligent`
   - Bundle ID : `com.tesfa.suivibaby`
   - SKU : `suivibaby`
   - Langue principale : Français

### Métadonnées
- **Description courte** (30 chars) : `Suivi bébé intelligent`
- **Description** (4000 chars max) : voir section 5
- **Mots-clés** (100 chars) : `bébé,suivi,allaitement,sommeil,couche,biberon,croissance,parent,santé,vocal`
- **URL support** : `https://samaye-53723.web.app/`
- **URL Privacy Policy** : `https://samaye-53723.web.app/privacy`
- **Catégorie** : Health & Fitness (primary), Lifestyle (secondary)
- **Age rating** : 4+ (pas de contenu sensible)
- **Copyright** : `© 2026 Yoss`

### Screenshots (obligatoires)
- **iPhone 6.7"** (iPhone 15 Pro Max) : 6 screenshots min
- **iPhone 6.5"** (iPhone 14 Plus) : 6 screenshots min
- **iPad Pro 12.9"** (optionnel mais recommandé)

Écrans suggérés :
1. Dashboard home (avec événements du jour)
2. Ajout événement vocal (microphone actif)
3. Chronologie / journal
4. Statistiques et courbes de croissance
5. Partage avec co-parent
6. Écran premium / pricing

### Review notes
```
Compte test pour review :
Email: review@suivibaby.com
Password: [à créer]

L'app nécessite la création d'un profil bébé après inscription.
La fonctionnalité vocale nécessite l'accès microphone.
Les achats in-app utilisent RevenueCat (sandbox pour review).
```

### Soumission
```bash
eas submit --platform ios --latest
```

---

## 3. Google Play Store

### Google Play Console
1. https://play.google.com/console → Create app
2. **Informations requises :**
   - Nom : `Suivi Baby - Suivi bébé`
   - Langue : Français
   - Type : App
   - Gratuit

### Déclarations obligatoires

#### Data Safety
| Catégorie | Collecté | Partagé | Chiffré | Supprimable |
|-----------|----------|---------|---------|-------------|
| Identifiants (email) | Oui | Non | Oui (TLS) | Oui |
| Données de santé (suivi bébé) | Oui | Non | Oui (AES-256) | Oui |
| Photos | Optionnel | Non | Oui | Oui |
| Enregistrement audio (voice) | Temporaire | Non | Oui | Auto-supprimé |

#### Content rating (IARC)
- Aucune violence, contenu sexuel, langage, etc.
- Résultat attendu : **PEGI 3** / **Everyone**

#### Permissions
- `RECORD_AUDIO` : Commandes vocales pour enregistrer les événements bébé
- `INTERNET` : Synchronisation des données avec le cloud
- `CAMERA` : Photos des moments bébé (optionnel)

### Soumission
```bash
eas submit --platform android --latest
```

---

## 4. Beta test (avant soumission finale)

### TestFlight (iOS)
```bash
eas build --profile production --platform ios
eas submit --platform ios --latest
```
1. App Store Connect → TestFlight → Internal Testing
2. Ajouter 5-10 testeurs
3. Attendre 3-5 jours de feedback
4. Vérifier Sentry : 0 crash

### Internal Testing (Android)
```bash
eas build --profile production --platform android
eas submit --platform android --latest
```
1. Play Console → Testing → Internal testing
2. Ajouter testeurs
3. Même durée de test

---

## 5. Description app (FR)

### Courte
Suivi Baby — L'app intelligente pour suivre l'alimentation, le sommeil et la croissance de votre bébé.

### Longue
```
Suivi Baby vous accompagne au quotidien pour suivre le développement de votre bébé.

FONCTIONNALITÉS PRINCIPALES :

🍼 Suivi complet
Biberons, tétées, couches, sommeil, bains, médicaments, vaccins, croissance — tout en un seul endroit.

🎤 Commandes vocales
Ajoutez un événement en parlant : "Biberon de 150 ml à 14h30". Idéal à 3h du matin.

📊 Statistiques et courbes
Visualisez les tendances, comparez avec les courbes OMS, recevez des insights IA personnalisés.

👨‍👩‍👧 Partage famille
Invitez le co-parent, la nounou ou les grands-parents. Chacun peut suivre et contribuer.

🔒 Sécurité et confidentialité
Données chiffrées, conformité RGPD, suppression de compte à tout moment.

📱 Mode hors-ligne
Fonctionne sans internet. Les données se synchronisent automatiquement au retour en ligne.

PREMIUM :
- Commandes vocales illimitées
- Insights IA avancés
- Export PDF pour le pédiatre
- Historique illimité
- Partage famille étendu
```

---

## 6. Post-soumission

- [ ] Monitorer review status (1-3 jours iOS, 1-7 jours Android)
- [ ] Préparer réponses aux questions de review Apple
- [ ] Vérifier Sentry après première vague d'installations
- [ ] Configurer budgets Firebase (voir docs/FIREBASE_MONITORING.md)
- [ ] Activer App Check enforcement après 7 jours de monitoring

---

## 7. Risques connus

| Risque | Impact | Mitigation |
|--------|--------|------------|
| `@shopify/react-native-skia` v2.0.0-next.4 (alpha) | Crash potentiel sur certains devices | Surveiller Sentry, prêt à downgrade |
| RevenueCat placeholder keys | Achats in-app non fonctionnels | Remplacer par vraies clés avant soumission |
| Firebase `samaye-53723` naming | Confusion branding | Transparent pour l'utilisateur, identifiants techniques |
| AdMob absent | Pas de revenus pub tier gratuit | Viable avec subscription seule, AdMob en v1.1 |
