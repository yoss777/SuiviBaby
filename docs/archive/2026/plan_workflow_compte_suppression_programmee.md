# Plan detaille — Workflow compte en suppression programmee

## Suivi implementation

- [x] Etape 1 — typer `pendingDeletion` dans le modele `User`
- [x] Etape 2 — ajouter la garde `pendingDeletion` dans `boot.tsx`
- [x] Etape 3 — ajouter la garde `pendingDeletion` dans `login.tsx`
- [x] Etape 4 — creer `app/(auth)/pending-deletion.tsx`
- [x] Etape 5 — adapter `settings.tsx` pour `signOut()` apres succes
- [ ] Etape 6 — validations ciblees lint/navigation

## Statut global

- statut implementation : `fonctionnel, en attente de validation manuelle`
- statut architecture : `coherent pour v1`
- statut lint cible : `OK hors bruit preexistant`
- statut merge : `a decider apres QA manuelle`

## Perimetre du lot

Inclus :

- garde `pendingDeletion` au boot
- garde `pendingDeletion` au login
- ecran `/(auth)/pending-deletion`
- logout immediat apres demande de suppression
- centralisation des helpers `pendingDeletion` dans `accountDeletionService`

Non inclus :

- listener temps reel intra-app si le compte passe en `pendingDeletion` alors que le drawer est deja ouvert
- deep link email vers l'ecran `pending-deletion`
- nettoyage global de `login.tsx`
- refonte du wording email

## Preconditions QA

- un compte test existant avec email/mot de passe connus
- acces a la boite mail ou au moins verification du declenchement de l'email
- possibilite de tester :
  - lancement normal
  - relaunch app
  - logout/login
  - reseau lent ou coupe
- idealement test sur Android et iOS

### Notes d'avancement

#### Etape 1 terminee

- `types/user.ts` expose maintenant `pendingDeletion?: { scheduledAt; deletionDate }`
- `AuthContext` charge deja le doc user complet depuis Firestore, donc aucune autre exposition supplementaire n'est necessaire pour lire `user.pendingDeletion`

#### Etapes 2 et 3 terminees

- `boot.tsx` redirige maintenant vers `/(auth)/pending-deletion` avant tout flux enfants/drawer si `user.pendingDeletion.deletionDate` existe
- `login.tsx` applique la meme garde avant de router vers `/(drawer)/baby` ou `explore`
- la garde est donc presente sur les deux points d'entree critiques du flux session

#### Etape 4 terminee

- creation de `app/(auth)/pending-deletion.tsx`
- ecran base sur les neutres `nc`, `SafeAreaView`, carte centrale et CTA simples
- actions presentes :
  - `Annuler la suppression`
  - `Se deconnecter`
- garde locale : si l'utilisateur n'a plus de `pendingDeletion`, retour vers `/boot`
- `app/(auth)/_layout.tsx` declare maintenant explicitement l'ecran `pending-deletion`

#### Etape 5 terminee

- `settings.tsx` deconnecte maintenant l'utilisateur juste apres un `requestAccountDeletion()` reussi
- le flux ne laisse plus l'utilisateur dans le drawer apres la demande
- en cas d'echec de `signOut()` apres programmation reussie, un message dedie informe que la suppression est bien planifiee mais que la deconnexion automatique a echoue

#### Validation en cours

- lint OK sur :
  - `types/user.ts`
  - `app/boot.tsx`
  - `app/(auth)/pending-deletion.tsx`
  - `app/(auth)/_layout.tsx`
- `services/accountDeletionService.ts` centralise maintenant les helpers :
  - `hasPendingDeletion(user)`
  - `getPendingDeletionDateFromUser(user)`
  - `formatPendingDeletionDate(date)`
- `requestAccountDeletion()` retourne maintenant l'objet `pendingDeletion`, ce qui evite de recalculer la date localement
- `settings.tsx` ne relit plus Firestore au mount pour recuperer la date de suppression ; il derive maintenant l'etat depuis `AuthContext` puis force un `refreshUser()` apres programmation/annulation
- `settings.tsx` conserve un warning preexistant non bloquant : `languagePreference` inutilise tant que l'ecran langue reste commente
- `git diff --check` est propre sur les fichiers touches
- il reste du bruit preexistant dans `app/(auth)/login.tsx` qui n'est pas specifique a ce workflow et n'a pas ete nettoye dans ce lot

### Bruit preexistant a garder en tete

Dans `app/(auth)/login.tsx` :

- `Animated` inutilise
- dependances de hook incomplètes
- plusieurs apostrophes JSX non echappees

Ce bruit n'est pas introduit par le workflow `pendingDeletion`, mais il pollue un lint global tant qu'il n'est pas nettoye.

## Checklist QA manuelle

### Bloc A — scenario nominal

- [ ] A1. utilisateur connecte ouvre `settings`
- [ ] A2. demande la suppression avec mot de passe valide
- [ ] A3. la demande est acceptee
- [ ] A4. l'utilisateur est deconnecte immediatement
- [ ] A5. retour sur le flux auth
- [ ] A6. reconnexion avec le meme compte
- [ ] A7. affichage de `/(auth)/pending-deletion`
- [ ] A8. la date affichee est correcte

### Bloc B — annulation

- [ ] B1. depuis `pending-deletion`, tap sur `Annuler la suppression`
- [ ] B2. annulation reussie
- [ ] B3. `refreshUser()` retire bien `pendingDeletion`
- [ ] B4. retour vers `/boot`
- [ ] B5. reprise du flux normal vers drawer/explore/add-baby

### Bloc C — logout depuis l'ecran dedie

- [ ] C1. depuis `pending-deletion`, tap sur `Se deconnecter`
- [ ] C2. retour sur `/(auth)/login`
- [ ] C3. aucune entree dans le drawer

### Bloc D — erreurs et cas limites

- [ ] D1. mauvais mot de passe sur `settings` -> erreur propre
- [ ] D2. echec reseau sur `cancelAccountDeletion()` -> message d'erreur et ecran reste visible
- [ ] D3. echec `signOut()` apres programmation -> message dedie visible
- [ ] D4. relaunch app avec compte encore `pendingDeletion` -> retour vers l'ecran dedie

### Bloc E — reseau degrade

- [ ] E1. session Firebase connue + user doc non resolu -> boot reste en fallback
- [ ] E2. aucune navigation prematuree vers le drawer
- [ ] E3. quand `user` est resolu avec `pendingDeletion`, redirection vers `/(auth)/pending-deletion`

### Bloc F — accessibilite

- [ ] F1. titre de l'ecran pending deletion lu correctement
- [ ] F2. date annoncee clairement
- [ ] F3. focus correct sur le bouton principal
- [ ] F4. etats `loading/disabled` lisibles pendant annulation/logout

## Template de resultats QA

Utiliser ce format pour tracer les tests :

```md
### Session QA
- Date :
- Device :
- OS :
- Build :

#### Resultats
- A1-A8 :
- B1-B5 :
- C1-C3 :
- D1-D4 :
- E1-E3 :
- F1-F4 :

#### Bugs observes
- ...

#### Decision
- OK pour merge / corrections requises
```

## Criteres de sortie

Le lot est consideré pret a merger si :

- le scenario nominal est valide
- l'annulation est valide
- aucune entree dans le drawer n'est possible avec un compte `pendingDeletion`
- le cas `degraded` ne bypass pas la garde
- aucun bug bloquant accessibilite/UX n'est observe sur l'ecran dedie

## Decision produit

Quand un utilisateur demande la suppression de son compte :

1. le compte passe en `pendingDeletion`
2. la session est fermee immediatement
3. un email de confirmation est envoye
4. l'utilisateur peut revenir avant la date limite
5. s'il se reconnecte avant l'echeance, il ne retourne pas directement dans l'app
6. il passe d'abord par un ecran dedie lui proposant :
   - `Annuler la suppression`
   - `Se deconnecter`
   - eventuellement `Continuer sans annuler` si on veut un acces restreint, mais ce n'est pas recommande au premier passage

## Ou rattacher cet ecran

### Recommandation

Le rattacher au flux `boot/auth`, pas a `home`.

### Pourquoi pas `home`

- `home` est un ecran metier, pas un point de garde de session
- si on le met dans `home`, l'utilisateur peut voir une partie de l'app avant le blocage
- le compte en suppression programmee est un etat global du compte, pas un etat local d'un enfant ou d'un dashboard

### Point d'entree recommande

Ordre de priorite de navigation :

1. `boot.tsx`
2. `login.tsx` si l'utilisateur arrive par reconnexion directe
3. eventuellement un guard commun reutilisable si plus tard d'autres ecrans auth doivent respecter cette regle

### Routage cible

Ajouter un ecran dedie dans `app/(auth)/pending-deletion.tsx`

Raison :

- c'est un ecran de garde de compte, proche de `login` et `onboarding`
- il doit reutiliser la logique visuelle des ecrans auth
- il doit pouvoir etre affiche avant tout acces au drawer et aux tabs

## UX cible

### Apres confirmation de suppression

Sur `settings.tsx` :

1. l'utilisateur saisit son mot de passe
2. `requestAccountDeletion(password)` reussit
3. on envoie l'email de confirmation
4. on appelle `signOut()`
5. on redirige vers `/(auth)/login` ou directement `/(auth)/pending-deletion` selon ce qui est le plus propre

Recommendation :

- faire `signOut()`
- puis `router.replace("/(auth)/login")`
- au boot/login suivant, si `pendingDeletion` est detecte, rediriger vers `/(auth)/pending-deletion`

Ca evite de faire dependre le flux de suppression d'une navigation speciale fragile apres logout.

### Si l'utilisateur se reconnecte avant la date limite

Cas nominal :

1. auth Firebase OK
2. doc user charge
3. `pendingDeletion` present
4. on route vers `/(auth)/pending-deletion`

Il ne doit pas arriver directement dans `/(drawer)/baby`, `explore`, ni `add-baby`.

### Actions sur l'ecran

#### Action principale

`Annuler la suppression`

- appelle `cancelAccountDeletion()`
- affiche un feedback succes
- redirige vers le flux normal `boot -> baby/explore/add-baby`

#### Action secondaire

`Se deconnecter`

- appelle `signOut()`
- redirige vers `/(auth)/login`

#### Action a eviter pour l'instant

`Continuer dans l'app`

Je ne la recommande pas dans la v1.

Si on la met, on brouille le message produit :
- le compte est en suppression
- mais l'app reste pleinement utilisable

Mieux vaut etre clair : tant que le compte est pending deletion, il faut choisir entre annuler ou quitter.

## Contenu de l'ecran

### Titre

`Suppression du compte programmee`

### Message principal

`Votre compte sera supprime definitivement le <date>.`

### Message secondaire

`Vous pouvez encore annuler cette demande avant cette date.`

### Bloc info

Inclure un texte simple :

- les donnees sont encore conservees jusqu'a la date limite
- apres cette date, la suppression sera definitive

### Boutons

1. `Annuler la suppression` — bouton principal
2. `Se deconnecter` — bouton secondaire/ghost

## Style et coherence UI

L'ecran doit suivre la logique visuelle des ecrans `/(auth)` et les tokens neutres de l'app.

### Base visuelle

Reutiliser :

- `getNeutralColors(colorScheme)`
- `SafeAreaView`
- fond avec `nc.background`
- cartes avec `nc.backgroundCard`
- texte avec `nc.textStrong`, `nc.textMuted`
- bordures avec `nc.borderLight`

### Structure recommandee

- hero simple centree verticalement, mais sans prendre toute la hauteur
- carte principale au centre
- hint de la section suivante visible si possible
- pas de layout marketing, pas de gros hero illustratif lourd

### Composants a reutiliser si pertinents

- `InfoModal` pour les erreurs ou confirmations si besoin
- patterns de `login.tsx` pour marges, cards, typographie, safe area
- eventuellement `BackgroundImage` de `boot.tsx` uniquement si ca reste coherent avec les auth screens et sans alourdir

### Couleurs

Utiliser un ton de warning/erreur controle :

- accent principal du CTA : `nc.error`
- fond tres leger si bloc d'alerte : `nc.errorBg` si disponible
- ne pas surcharger tout l'ecran en rouge

L'ecran doit rester lisible, pas anxiogene.

## Accessibilite

### Exigences minimales

- titre principal annonce en premier
- date de suppression explicite dans le texte, pas uniquement visuelle
- bouton principal avec `accessibilityRole="button"`
- bouton secondaire idem
- si action en cours :
  - desactiver les boutons
  - annoncer un texte du type `Annulation en cours`

### Lecture d'ecran

Le message doit etre stable et court :

- `Suppression du compte programmee`
- `Votre compte sera supprime le 12 mai 2026. Vous pouvez encore annuler cette demande.`

Ne pas multiplier les hints si le texte visible suffit.

## Logique technique

## 1. Enrichir `useAuth()`

Verifier que le contexte auth expose ou peut exposer clairement :

- `user`
- `firebaseUser`
- `loading`
- doc user complet avec `pendingDeletion`

Si `pendingDeletion` n'est pas deja dans l'objet user, il faudra le conserver dans la forme exposee par `AuthContext`.

## 2. Ajouter un helper de lecture

Option recommandee :

ajouter un helper/selector simple, par exemple :

- `const hasPendingDeletion = !!user?.pendingDeletion?.deletionDate`
- `const pendingDeletionDate = user?.pendingDeletion?.deletionDate ?? null`

Pas besoin d'un service separe si `AuthContext` charge deja le doc user.

## 3. Modifier `boot.tsx`

Dans le flux principal :

1. attendre `authLoading === false`
2. si pas de user -> onboarding/login comme aujourd'hui
3. si user avec `pendingDeletion` -> `router.replace("/(auth)/pending-deletion")`
4. sinon continuer vers enfants/baby/explore

La garde `pendingDeletion` doit arriver avant toute navigation vers le drawer.

## 4. Modifier `login.tsx`

Dans l'effet qui reroute apres login :

actuellement :

- si user charge + enfants charges -> route vers `/(drawer)/baby` ou `explore`

il faudra inserer avant :

- si `user.pendingDeletion` -> `router.replace("/(auth)/pending-deletion")`

Comme ca le flux reste correct meme si `login` est atteint directement sans repasser par `boot`.

## 5. Creer `app/(auth)/pending-deletion.tsx`

Responsabilites :

- lire `pendingDeletionDate`
- afficher la date formatee
- proposer annulation
- proposer logout
- bloquer double tap avec etat local `isCancelling`

Pseudo-flux :

1. tap `Annuler la suppression`
2. `cancelAccountDeletion()`
3. refetch user ou `refreshUser()`
4. afficher succes
5. rediriger vers `app/boot` ou route normale

Si echec :

- message d'erreur simple
- rester sur place

## 6. Modifier `settings.tsx`

Apres succes de `requestAccountDeletion(password)` :

1. envoyer l'email comme aujourd'hui
2. fermer la modal
3. vider le mot de passe
4. appeler `signOut()`
5. rediriger vers login

Important :

ne plus laisser l'utilisateur dans le drawer apres cette action.

## 7. Email transactionnel

Contenu minimum :

- confirmation de la demande
- date exacte de suppression
- phrase explicite : `Reconnectez-vous avant cette date pour annuler la suppression`

Si plus tard on veut mieux faire :

- deep link vers l'app
- ouverture directe vers `pending-deletion`

## Etats et cas limites

### Cas 1 — premier lancement offline apres suppression demandee

Si on n'a pas le doc user a jour, il peut etre difficile de savoir qu'il est `pendingDeletion`.

Regle recommandee :

- si on n'a qu'une session Firebase mais pas de doc user resolu, on ne doit pas autoriser l'entree dans le drawer sur simple supposition
- garder le fallback `connexion lente`

Donc le mode degrade ne doit pas contourner cette garde compte.

Verification implementation :

- `boot.tsx` ne navigue pas vers le drawer tant que `user` n'est pas resolu
- si `firebaseUser` existe mais `user` est encore absent avec `authStatus === "degraded"`, le boot reste en attente/fallback
- la garde `pendingDeletion` est donc evaluee avant toute entree dans l'app

### Cas 2 — utilisateur deja sur l'app, puis demande suppression

On doit le sortir immediatement de la session :

- `requestAccountDeletion()`
- `signOut()`
- `router.replace("/(auth)/login")`

### Cas 3 — annulation reussie

Apres `cancelAccountDeletion()` :

- invalider/refetch user
- verifier que `pendingDeletion` a disparu
- reprendre flux normal

### Cas 4 — suppression definitive deja passee

Si la CF a deja supprime le compte :

- la connexion doit echouer normalement
- login affiche un message standard

Pas besoin de logique specifique supplementaire dans l'app.

### Cas 5 — multi-device

Scenario :

1. device 1 demande la suppression
2. device 2 est deja connecte et deja ouvert dans le drawer
3. device 2 peut rester temporairement dans l'app tant que le doc user n'est pas relu ou qu'aucune reaction temps reel n'intervient

Position v1 :

- acceptable
- non bloquant pour ce lot

Amelioration v2 recommandee :

- ajouter une reaction temps reel dans `AuthContext` sur le doc user
- si `pendingDeletion` apparait alors que l'utilisateur est deja dans le drawer, forcer une redirection vers `/(auth)/pending-deletion`

## Risques residuels v1

1. multi-device deja ouvert dans le drawer :
   - fenetre de quelques minutes possible avant reaction
   - acceptable pour v1

2. bruit technique historique dans `login.tsx` :
   - sans impact direct sur le workflow
   - mais pollue un lint global

3. email transactionnel :
   - pas encore enrichi avec deep link
   - acceptable pour v1

## Hors lot / v2

- listener temps reel `pendingDeletion` dans `AuthContext`
- deep link email vers `pending-deletion`
- nettoyage ESLint de `login.tsx`
- eventuel test automatise du workflow auth/deletion
- meilleure telemetrie sur :
  - demande de suppression
  - affichage ecran `pending-deletion`
  - annulation reussie

## Decision merge

Etat actuel recommande :

- `ne pas merger avant QA manuelle`
- `merge apres validation de la checklist QA`

Si la QA passe :

- cocher `Etape 6`
- ajouter un resume de validation dans ce document
- proceder au commit/push final

## Plan d'implementation

### Etape 1

Verifier l'objet `user` expose par `AuthContext` et y inclure `pendingDeletion` si necessaire.

### Etape 2

Creer `app/(auth)/pending-deletion.tsx` avec :

- meme structure que les auth screens
- `nc`
- safe area
- accessibilite propre
- CTA principal `Annuler la suppression`

### Etape 3

Ajouter la garde `pendingDeletion` dans `boot.tsx`.

### Etape 4

Ajouter la garde `pendingDeletion` dans `login.tsx`.

### Etape 5

Modifier `settings.tsx` pour faire `signOut()` apres succes de la demande.

### Etape 6

Verifier le wording de l'email de confirmation.

## Fichiers probablement touches

- `app/boot.tsx`
- `app/(auth)/login.tsx`
- `app/(auth)/pending-deletion.tsx`
- `app/(auth)/_layout.tsx` si besoin de header/options specifiques
- `app/(drawer)/settings.tsx`
- `contexts/AuthContext.tsx`
- `services/accountDeletionService.ts` si on veut ajouter un helper
- eventuellement la CF/email si le wording doit evoluer

## Validation manuelle

### Scenario nominal

1. user connecte
2. demande suppression
3. session fermee
4. retour sur login
5. reconnexion
6. affichage de l'ecran `pending-deletion`
7. annulation
8. retour dans l'app

### Scenario logout simple

1. user sur ecran pending deletion
2. tap `Se deconnecter`
3. retour login

### Scenario erreur

1. annulation echoue
2. l'ecran reste visible
3. message d'erreur affiche

### Scenario accessibilite

1. VoiceOver/TalkBack
2. lecture du titre
3. lecture de la date
4. focus correct sur le CTA principal

## Decision finale recommandee

Oui, il faut deconnecter l'utilisateur apres la demande de suppression.

Mais la bonne implementation n'est pas un simple `signOut()` dans `settings`.

Il faut :

- un ecran dedie `pending-deletion`
- une garde dans `boot` et `login`
- une UX auth-coherente
- un retour clair par email

Le bon rattachement est donc :

`settings -> signOut -> login/boot -> pending-deletion -> annulation ou logout`
