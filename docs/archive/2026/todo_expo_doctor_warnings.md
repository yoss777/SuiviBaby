# Expo Doctor — Warnings à traiter

**Date** : 2026-04-08
**Source** : Sortie de `expo-doctor` lors d'un `npx eas-cli build --platform android --profile preview --local`
**Statut global** : 5 checks failed, build EAS local refuse de démarrer (mais le vrai blocage est le PATH `node` côté Gradle, traité séparément).

---

## Contexte

Les warnings ci-dessous sont remontés par `expo-doctor` au début du pipeline EAS. Ils ne bloquent pas tous le build mais polluent les logs et pour certains représentent une dette technique réelle. À traiter dans une session dédiée, **pas en urgence**.

⚠️ Ce qui bloque réellement le build aujourd'hui n'est PAS dans cette liste — c'est un problème de PATH `node` non hérité par le sous-process Gradle (`Cannot run program "node"` au moment où `settings.gradle` exécute `providers.exec { commandLine("node", ...) }`). Voir la conversation du 2026-04-08 pour les options de fix (symlink système ou export PATH avant la commande).

---

## 1. Multiple lock files (HIGH — risque CI silencieux)

**Symptôme** :
```
Multiple lock files detected (pnpm-lock.yaml, package-lock.json).
This may result in unexpected behavior in CI environments, such as
EAS Build, which infer the package manager from the lock file.
```

**Analyse** : `package-lock.json` ET `pnpm-lock.yaml` coexistent à la racine. Le projet utilise `npm ci` partout (CI workflows, postinstall, README). Le `pnpm-lock.yaml` est probablement un résidu d'une expérimentation.

**Action** :
1. Confirmer qu'aucun script ni workflow n'utilise pnpm.
2. Supprimer `pnpm-lock.yaml`.
3. Vérifier `.gitignore` n'exclut pas `package-lock.json`.

**Effort** : trivial (5 min).
**Risque** : très faible si l'audit des scripts confirme zéro usage pnpm.

---

## 2. Schema Expo invalide — `compileSdkVersion`/`targetSdkVersion`/`minSdkVersion` (MEDIUM)

**Symptôme** :
```
Errors validating fields in app.json:
 Field: android - should NOT have additional property 'compileSdkVersion'.
 Field: android - should NOT have additional property 'targetSdkVersion'.
 Field: android - should NOT have additional property 'minSdkVersion'.
```

**Analyse** : Dans [app.json:38-41](app.json#L38-L41) on a :
```json
"compileSdkVersion": 35,
"targetSdkVersion": 35,
"minSdkVersion": 21
```

Ces propriétés ne sont plus valides à la racine de `android.*` dans le schéma Expo SDK 53. Elles doivent passer par le plugin `expo-build-properties` — qui est **déjà configuré** dans [app.json:66-78](app.json#L66-L78) mais sans ces SDK versions, donc ce sont des doublons orphelins ignorés par Expo mais qui font crier le doctor.

**Action** :
1. Migrer les 3 valeurs dans la section `expo-build-properties` du `plugins[]` :
   ```json
   "android": {
     "newArchEnabled": true,
     "enableProguardInReleaseBuilds": true,
     "enableShrinkResourcesInReleaseBuilds": true,
     "compileSdkVersion": 35,
     "targetSdkVersion": 35,
     "minSdkVersion": 21
   }
   ```
2. Supprimer les 3 lignes de `android` racine.
3. Vérifier que `android/build.gradle` reflète bien ces valeurs (puisqu'on est en mode "dossier natif présent", `expo-build-properties` ne re-prebuilde pas — il faudra peut-être les fixer aussi à la main dans `android/build.gradle` selon le mode).

**Effort** : 15 min + validation build.
**Risque** : faible. Aucun comportement runtime ne change.

---

## 3. Native folders + app config — config mal synchronisée (MEDIUM)

**Symptôme** :
```
This project contains native project folders but also has native
configuration properties in app.config.js, indicating it is configured
to use Prebuild. When the android/ios folders are present, EAS Build
will not sync the following properties: orientation, icon, scheme,
userInterfaceStyle, ios, android, plugins, androidStatusBar.
```

**Analyse** : Le projet est dans un état hybride :
- `android/` et `ios/` natifs présents (mode "bare" ou "ejected")
- `app.json` contient des propriétés natives (`ios.bundleIdentifier`, `android.package`, `plugins`, etc.) qui ne sont plus relues par EAS quand les dossiers natifs existent

Conséquence : modifier `app.json` n'a aucun effet sur le build natif tant qu'on ne refait pas `expo prebuild`. C'est exactement ce qui se passe avec notre bump de version : `app.json.expo.version` bumpe à `1.0.1` mais Android utilise `versionName` dans `android/app/build.gradle` et iOS utilise `MARKETING_VERSION` dans `ios/SuiviBaby.xcodeproj/project.pbxproj` — il faut bumper les deux endroits manuellement.

**Décision à prendre** :

**Option A — Mode CNG pur** : supprimer `android/` et `ios/`, laisser EAS regénérer à chaque build.
- Avantages : `app.json` redevient source de vérité unique. Bump version en un seul endroit.
- Inconvénients : impossible si on a des modifs natives custom (probablement le cas vu les mods). Perte de contrôle granulaire.

**Option B — Mode bare assumé** : ajouter `/android` et `/ios` à `.easignore`, accepter que `app.json` ne contrôle plus le natif.
- Avantages : reflète la réalité. Pas de risque de perte de modif.
- Inconvénients : on doit bumper la version à 3 endroits (`app.json`, `android/app/build.gradle`, `ios/.../project.pbxproj`). À documenter dans la checklist release.

**Recommandation** : Option B. Le projet a déjà des modifs natives (Sentry, Firebase, etc.) et un retour à CNG pur serait risqué. Documenter le triple bump dans [PLAN_ACTION_MEP.md](PLAN_ACTION_MEP.md) → "PROCÉDURE DE RELEASE".

**Effort** : 10 min (édition `.easignore` + doc).
**Risque** : nul. C'est un alignement avec la réalité.

---

## 4. Packages unmaintained / sans metadata (LOW — dette tech)

**Symptôme** :
```
Unmaintained: @gorhom/portal, expo-av, react-native-sticky-parallax-header
No metadata available: dotenv, firebase
```

**Analyse par package** :

| Package | État | Action recommandée |
|---|---|---|
| `expo-av` | **Déprécié SDK 53+** — remplacé par `expo-audio` + `expo-video` | Migration nécessaire avant SDK 54. Effort : 1-2j selon usages |
| `@gorhom/portal` | Plus de releases depuis ~1 an | Vérifier si toujours utilisé. Sinon retirer |
| `react-native-sticky-parallax-header` | Quasi mort | À évaluer : si peu utilisé, remplacer par `Animated.ScrollView` natif |
| `dotenv` | Bien maintenu, pas dans React Native Directory | Whitelister via `expo.doctor.reactNativeDirectoryCheck.exclude` |
| `firebase` | SDK officiel, pas dans Directory | Whitelister idem |

**Action immédiate (10 min)** :

Ajouter dans `package.json` pour silencer les faux positifs :
```json
"expo": {
  "doctor": {
    "reactNativeDirectoryCheck": {
      "exclude": ["dotenv", "firebase"]
    }
  }
}
```

**Action moyen terme (à planifier séparément)** :
- Migration `expo-av` → `expo-audio`/`expo-video` avant Expo SDK 54.
- Audit usage `@gorhom/portal` et `react-native-sticky-parallax-header`.

---

## 5. Versions Expo désynchronisées (MEDIUM — peut casser le build)

**Symptôme** :
```
expo@53.0.25 - expected version: ~53.0.27
expo-av@16.0.8 - expected version: ~15.1.7
expo-image-manipulator@14.0.8 - expected version: ~13.1.7
expo-notifications@0.31.4 - expected version: ~0.31.5
expo-router@5.1.10 - expected version: ~5.1.11
react-native@0.79.5 - expected version: 0.79.6
react-native-pager-view@8.0.0 - expected version: 6.7.1
```

**Analyse fine** :

| Package | Installé | Attendu | Type | Risque |
|---|---|---|---|---|
| `expo` | 53.0.25 | ~53.0.27 | Patch retard | Bénin |
| `expo-av` | **16.0.8** | **~15.1.7** | **Major en avance** | ⚠️ Suspect — pourquoi en avance ? |
| `expo-image-manipulator` | **14.0.8** | **~13.1.7** | **Major en avance** | ⚠️ Idem |
| `expo-notifications` | 0.31.4 | ~0.31.5 | Patch retard | Bénin |
| `expo-router` | 5.1.10 | ~5.1.11 | Patch retard | Bénin |
| `react-native` | 0.79.5 | 0.79.6 | Patch retard | Bénin |
| `react-native-pager-view` | **8.0.0** | **6.7.1** | **2 majors en avance** | 🚨 Très suspect |

**Hypothèse** : trois packages ont été bumpés manuellement à des versions plus récentes que ce qu'Expo SDK 53 supporte. Avant de "fixer" en suivant aveuglément la recommandation, il faut savoir **pourquoi** ils ont été bumpés. Si c'est pour un fix précis, downgrade va casser ce fix.

**Action — Investigation d'abord** :
1. `git log --all -p -- package.json | grep -A1 -B1 "react-native-pager-view"` pour voir quand et pourquoi le bump.
2. `git log --all -p -- package.json | grep -A1 -B1 "expo-av"` idem.
3. Si le bump n'a pas de justification → `npx expo install --check` puis accepter les downgrades.
4. Sinon → ajouter ces packages à `expo.install.exclude` dans `package.json` pour expliciter le choix.

**Effort** : 30 min investigation + action selon résultat.
**Risque** : moyen. Un downgrade aveugle peut réintroduire un bug.

---

## Ordre d'exécution suggéré

1. **Quick wins (30 min total)** : items #1 (lock file), #4 partie quick (whitelist dotenv/firebase).
2. **Schema fix (15 min)** : item #2 (migration SDK versions vers expo-build-properties).
3. **Investigation (30 min)** : item #5 (avant tout downgrade, comprendre pourquoi les bumps).
4. **Décision archi (10 min + impact doc)** : item #3 (CNG vs bare assumé). Recommandation : Option B + doc release checklist.
5. **Migration plus tard** : item #4 partie longue (`expo-av` → `expo-audio`/`expo-video`).

---

## Hors scope

- ❌ Le bug `Cannot run program "node"` côté Gradle (problème environnemental nvm/PATH, traité séparément — voir la conversation 2026-04-08).
- ❌ Toute modification du dossier natif `android/` ou `ios/` pour ces warnings (à faire dans une session dédiée avec test build complet).
- ❌ La migration vers CNG pur (Option A de l'item #3) — trop risqué sans audit complet des modifs natives.
