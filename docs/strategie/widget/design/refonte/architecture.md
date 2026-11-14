# Refonte du widget « Bébé maintenant » : avis de la cellule architecture (2026-11-14)

# Cellule architectes : modèle partagé, deux moteurs, temps réel

## 1. Diagnostic

**Ce qui marche**
- Le calcul est unique : `functions/shared/widget/index.js` sert à l'app et au serveur, avec `zonedEnv` pour le fuseau. Le payload passe par `toNativeWidgetProps`. Le push FCM Android est en prod (1,2 s mesuré).
- Les chronos défilent seuls des deux côtés (`timerInterval` sur iOS, `ChronometerView`/`ElapsedClockView` sur Android), donc aucun rechargement n'est dépensé.

**Ce qui ne marche pas (cause commune : le contrat porte des données, pas un contenu)**
- La présentation est recalculée deux fois, et de deux façons. `whenShort`, `daysAgo`, `lateSub`, « aucun noté » et la mise en page du repos n'existent que dans `BebeMaintenant.android.tsx` (745 lignes). iOS a sa propre grammaire (`row("Repas", …, "à 19:37", "N repas")`). D'où le blocage n° 3 : deux produits.
- Le contrat est mixte. Il contient des chaînes déjà formatées (`lastMealLabel`, `sinceLabel`) à côté de données brutes, et des champs morts : `nextSide` est toujours calculé alors que « Prochain sein » a été retiré.
- Aucun champ de rôle dans les props. Les deux moteurs ne savent donc pas qu'un Proche ne peut pas saisir (blocage n° 6, TalkBack « Noter un repas »).
- La hiérarchie n'est pas la même : Android fait défiler un `LazyColumn`, ce que WidgetKit ne sait pas faire. On a conçu le contenu pour un moteur, puis porté sur l'autre.
- Dette du patch expo-widgets : 3 vues natives, `openUrl`, `widthDp/heightDp`, `nativeLevel`. Chaque montée de version d'Expo oblige à refaire le patch, et une partie du rendu dépend de `nativeLevel`.
- Temps réel iOS absent : `fanout.js` filtre `platform === "android"`. Il faut un contrat compact, versionné et limité à la taille d'un push APNs.

## 2. Verdict

**Refonte partielle, mais profonde : on refait le contrat et la hiérarchie de contenu, pas les moteurs.** Une refonte totale vers du natif pur résoudrait la dette du patch, mais doublerait les langages (Swift et Kotlin) pour une équipe d'une personne. Le vrai problème est qu'il manque une couche « contenu » partagée. Les deux moteurs ne doivent plus que placer N emplacements selon la taille.

## 3. Propositions

### A. Évolution : même grammaire, contrat v1 enrichi
On ajoute `canWrite` et on supprime `nextSide`. On aligne la grammaire iOS sur celle d'Android (« Dernier repas / il y a 6h58 / dernier à 19:37 »). On garde le `LazyColumn` sur Android et le fil seulement dans le grand iOS.
Partagé : les données. La grammaire reste codée deux fois.

### B. Contrat v2 « emplacements par priorité », sans défilement nulle part (recommandée)
`buildNowWidgetContent()` ajoute aux props un tableau `cards[]` trié par priorité :
1. sessions en cours ;
2. rappel dépassé ;
3. dernier repas ;
4. dernier change ;
5. fil (7 lignes).

Chaque carte contient `{kind, title, sinceMs, atMs, late, reminderAtMs, tap?: "meal"|"diaper"|"nursing", a11y}`, avec `tap` absent si `canWrite=false`. Les libellés relatifs au jour (« hier ») sont tirés de `dayStartMs` par une seule fonction de 10 lignes, recopiée telle quelle dans les deux widgets, avec un test de parité. Les compteurs « 0 repas » descendent dans le fil.

```
iOS petit        iOS moyen                     iOS grand
┌───────────┐   ┌─────────────┬─────────────┐ ┌─────────────┬─────────────┐
│Prénom     │   │Prénom       │● Dernier    │ │(= moyen)    │             │
│●Dernier   │   │●Dernier     │  change     │ ├─────────────┴─────────────┤
│ repas     │   │ repas       │ il y a 2h10 │ │Évènements récents         │
│il y a 6h58│   │il y a 6h58  │ dernier à … │ │● 19:37 Biberon 120 ml     │
│dernier à …│   │dernier à …  │● 14:02 Bain │ │● 18:50 Change · pipi      │
└───────────┘   └─────────────┴─────────────┘ │… 7 lignes                 │
                                              └───────────────────────────┘
Android 2×2      Android 3×2 (défaut)          Android 4×2
┌───────────┐   ┌───────────────────────────┐ ┌──────────────┬────────────┐
│Prénom     │   │Prénom                     │ │Prénom        │Récents     │
│●Repas     │   │●Dernier repas  il y a 6h58│ │●Dernier repas│● 19:37 Bib.│
│il y a 6h58│   │●Dernier change il y a 2h10│ │ il y a 6h58  │● 18:50 Chg │
│●Change 2h │   │● 19:37 Biberon 120 ml     │ │●Dernier chg  │● 14:02 Bain│
└───────────┘   └───────────────────────────┘ │ il y a 2h10  │            │
                                              └──────────────┴────────────┘
Session en cours : la carte 1 (tuile teintée + chrono) remplace « Dernier repas »,
les suivantes glissent d'un emplacement.
```

Partagé : l'ordre, les libellés, les actions, l'a11y et la règle des emplacements (petit/2×2 = 2 emplacements, moyen/3×2 = 3, 4×2 = 3 + 3 lignes de fil, grand = 3 + 7 lignes de fil). Chaque moteur ne garde que la mise en forme.

### C. Refonte totale native
Widget en SwiftUI pur (`@bacons/apple-targets`, App Intents, timeline) et Glance en Kotlin dans un module Expo local. On sort du patch. Le contenu est le même que dans B.

## 4. Coût et risques

| | Jours | Dette | Temps réel | Accessibilité |
|---|---|---|---|---|
| A | 2-3 | Grammaire en double, le patch reste | Inchangé | Corrige le cas du Proche |
| B | 6-8 (contrat 2, Android 2, iOS 1,5, tests de parité 1, a11y 1) | La logique quitte les widgets (Android : ~745 → ~350 lignes, estimé), le patch reste mais n'est plus étendu | Le même `cards[]` part en FCM et en APNs (E7). `v:2` + `widgetCap>=2` dans `fanout.js` pour cohabiter avec les anciennes versions installées. Payload estimé < 2 Ko | `a11y` calculé une seule fois, identique sur TalkBack et VoiceOver |
| C | 12-15 | Supprime le patch, ajoute Swift et Kotlin à maintenir | Meilleur accès aux API (push widget, App Intents) | Natif complet |

**Risques de B**
- Il faut une période de double compatibilité v1/v2, car d'anciens binaires sont encore installés.
- iOS : « il y a » repose sur `Text(date, style: .relative)`, dont le format diffère du « 6h58 » choisi par Yoss. Il faut soit l'accepter, soit passer par une timeline d'entrées, ce qui demande de vérifier ce qu'expose expo-widgets.
- La Live Activity reste à part pour les sessions, mais peut reprendre le même type `card` de session.

**À faire quelle que soit l'option**
- Extraire le patch dans un module Expo local ou le proposer en amont, avant la prochaine montée de SDK.

## 5. Notes (angle architecture)

- **A : 12/20.** Rapide, mais garde la cause du problème : deux grammaires et un défilement impossible sur iOS.
- **B : 17/20.** Un seul contenu, sans défilement, prêt pour le push iOS et pour le rôle Proche. Coût raisonnable, mais la dette du patch reste en place.
- **C : 11/20.** La meilleure maîtrise technique, mais un coût et une maintenance disproportionnés avant le 2/2/2027. À réenvisager après B si les App Intents deviennent indispensables.

Fichiers lus :
- /Users/yoss/Projects/Samaye/docs/strategie/widget/design/BRIEF_REFONTE_WIDGET.md
- /Users/yoss/Projects/Samaye/widgets/BebeMaintenant.android.tsx
- /Users/yoss/Projects/Samaye/widgets/BebeMaintenant.ios.tsx
- /Users/yoss/Projects/Samaye/functions/shared/widget/index.js
- /Users/yoss/Projects/Samaye/functions/src/widget/fanout.js
- /Users/yoss/Projects/Samaye/patches/expo-widgets+58.0.28.patch
- /Users/yoss/Projects/Samaye/docs/strategie/widget/WIDGET_SPEC.md
