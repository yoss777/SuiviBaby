# Auth UX Enhancements — Plan de suivi

Derniere mise a jour : 2026-03-30

## Haute valeur

- [x] **1. Connexion biometrique (Face ID / Touch ID)**
  - expo-local-authentication + expo-secure-store installes
  - Service: services/biometricAuthService.ts (save/get/clear credentials)
  - Bouton biometrique dans login.tsx (affiche si disponible + enabled)
  - Credentials sauvegardes automatiquement apres login reussi
  - Fallback si credentials expires (clear + message)
  - Prompt biometrique deplace dans onboarding.tsx (fin du carousel)

- [x] **2. Connexion sociale (Google / Apple Sign-In)**
  - Service: services/socialAuthService.ts (Google + Apple)
  - Google Sign-In: @react-native-google-signin/google-signin v16
  - Apple Sign-In: expo-apple-authentication + expo-crypto (iOS only)
  - Boutons dans login.tsx (Google toujours, Apple sur iOS)
  - Profil Firestore cree automatiquement au premier login social
  - Annulation Google geree (response.type === 'cancelled')
  - SignOut Google dans AuthContext
  - Plugins app.json configures

- [x] **3. Validation email en temps reel**
  - Check inline sous le champ email (circle-check vert / circle-xmark rouge)
  - Regex EMAIL_REGEX, emailTouched state, onBlur trigger
  - Message "Format d'email invalide" en rouge

- [x] **4. Keyboard-aware auto-scroll**
  - scrollViewRef + handleInputFocus(yOffset) avec setTimeout 300ms
  - onFocus sur pseudo (150), password (200), confirm password (300)

## Valeur moyenne

- [x] **5. Animation de transition login/inscription**
  - LayoutAnimation.configureNext(easeInEaseOut) dans handleToggleMode
  - UIManager.setLayoutAnimationEnabledExperimental pour Android

- [x] **6. Remember me / email pre-rempli**
  - LAST_EMAIL_KEY dans AsyncStorage
  - Charge au mount, sauve apres login reussi

- [x] **7. Skeleton loading sur reset-password**
  - Shimmer anime (opacity pulse) avec Animated.loop
  - Skeleton circle + title + subtitle + 2 inputs + button
  - Remplace le simple spinner

- [x] **8. Ameliorer privacy/terms**
  - Sommaire cliquable avec scroll vers section (sectionRefs + scrollTo)
  - Bouton flottant "retour en haut" (apparait apres 300px scroll)
  - Applique a privacy.tsx ET terms.tsx
  - Pages web deployees sur Firebase Hosting (privacy.html + terms.html)

## Nice-to-have

- [x] **9. Onboarding illustre**
  - 3 slides: Bienvenue, Suivi complet, Securise
  - Carousel horizontal avec pagination dots animes
  - Bouton "Passer" + "Suivant"/"Commencer"
  - AsyncStorage flag (1ere ouverture uniquement)
  - Verification onboarding deplacee dans boot.tsx (plus de flash login)
  - Prompt biometrique integre a la fin de l'onboarding

- [x] **10. Indicateur de caps lock**
  - handlePasswordKeyPress detecte majuscule via onKeyPress
  - Warning inline avec triangle-exclamation icon
  - Reinitialisation quand une minuscule est tapee

## Statut : 10/10 TERMINE
