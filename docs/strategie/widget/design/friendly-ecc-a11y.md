# Réponse : icônes, humeur et widget « friendly » — angle accessibilité et compréhension

Base : `BRIEF_FRIENDLY.md`, `widgets/BebeMaintenant.android.tsx` (libellé TalkBack global via `semantics({ contentDescription })` sur la racine), `components/moments/` (HeroMoodCard, VerticalMoodTimeline).

## 1. Verdict

1. **Icônes à la place du texte** : non en remplacement, oui en complément. Icône + mot court, jamais l'icône seule. Pas de remplacement pour pipi / selle / biberon / tétée / solide.
2. **Emoji d'humeur à côté du prénom** : non dans l'en-tête. Si le fondateur y tient : oui à condition que l'humeur date de moins de 3 h environ, qu'elle soit accompagnée de son mot (« Content ») et qu'elle ne soit jamais lue par TalkBack comme un emoji. Préférer une icône dessinée (drawable) plus tard. La règle « pas d'emoji » reste valable pour le reste du widget.
3. **Plus friendly** : oui à condition de passer par le texte et la forme (formulations douces, coins arrondis déjà présents, phrase d'état), pas par la couleur seule ni par du décor. Aucun nouveau signal ne doit tenir à la couleur.

## 2. Pourquoi (angle accessibilité et compréhension)

### 2.1 Icônes

- **WCAG 1.1.1 (contenu non textuel) et 1.4.1 (utilisation de la couleur)** : le sens ne peut pas dépendre de la couleur seule. Le Fil du jour actuel n'a que des ronds de couleur (repas `#E8785A` contre couches `#5BA4A4`) suivis d'un libellé. Le libellé sauve la situation. Si on le retire au profit d'icônes, on tombe dans l'anti-pattern « sens porté par l'icône seule ».
- **WCAG 1.4.11 (contraste des éléments non textuels, 3:1)** : les pastilles actuelles sont des ronds de 8 dp. `#8BC46B` sur `#ffffff` fait environ 2,1:1, soit sous les 3:1. En clair, une icône de promenade verte ne passerait pas. À utiliser en clair : les teintes foncées de `CAT.*.text` (par ex. `#3F7A2A`). Calculs approximatifs, non vérifiés avec un outil.
- **Daltonisme** : rose tétée `#D66B8F` et violet sommeil `#7C6BA4` se confondent en deutéranopie, et le vert `#8BC46B` avec le rose aussi. Seuls la forme de l'icône et le mot les distinguent. C'est l'argument pour une icône aux silhouettes très différentes (goutte, lune, lait, couche, cuillère) plutôt que des ronds.
- **Ambiguïté** : pipi, selle, biberon, tétée et solide n'ont pas d'icône standard partagée. Une goutte pour pipi et une pastille marron (à éviter) pour selle sont des conventions d'apps, pas de norme. NN/g : les icônes sans libellé sont ambiguës sauf quelques-unes universelles (loupe, maison). Source de principe, non revérifiée ici. Le mot reste donc obligatoire.
- **Faible littératie et parents non francophones natifs** : c'est le seul vrai gain des icônes. Un symbole + un mot court appuie la compréhension (principe de codage dual). Conserver des mots simples : « Repas », « Couche », « Pipi », « Selle », « Biberon », « Tétée », « Sieste », « Nuit ». Éviter « rappel dépassé » seul, remplacer par « en retard » ou garder « rappel » associé à la couleur d'alerte et à un symbole « ! ».
- **Taille** : sous 16 dp, une icône de catégorie devient illisible pour la basse vision. Le Fil du jour est en 12 sp avec des lignes de 24 dp : une icône de 16 dp tient, mais c'est le texte à 12 sp (sous le seuil de confort, WCAG n'impose pas de taille mais Material recommande ≥ 12 sp au minimum) qui pose le vrai problème. Le widget doit suivre la taille de police système : `sp` le fait déjà, mais les hauteurs fixes (`ITEM_H = 40`, ligne 24, `fixedLine`) coupent le texte à 200 % de taille de police. À corriger (voir 2.4).

### 2.2 Humeur

- **Comment l'app l'affiche** : emoji + mot. Échelle de 1 à 5 : 😢 Difficile (rouge), 😐 Mitigé (orange), 🙂 OK (bleu), 😄 Content (vert), 🥰 Rayonnant (rose). Dans `HeroMoodCard`, chaque bouton a `accessibilityLabel="Humeur <mot>"` : l'emoji n'est donc pas lu seul. C'est la bonne pratique à copier.
- **Emoji lus par les lecteurs d'écran** : TalkBack et VoiceOver lisent le nom Unicode (« visage qui pleure », « visage souriant avec des cœurs »). Dans une phrase en français, le rendu est inégal selon la version d'Android et la langue installée. Il vaut mieux masquer l'emoji (le libellé racine du widget ne le contient pas, donc rien à faire côté TalkBack à condition de ne pas l'y ajouter) et lire le mot : « Humeur : Content ».
- **Variation de rendu** : l'emoji change de dessin selon le fabricant (Samsung, Google, Xiaomi). Samsung a historiquement des 😐 et 🙂 d'expression différente. Pour un état de santé et d'humeur, une lecture différente d'un téléphone à l'autre dans le même foyer est un risque de compréhension. Non vérifié sur les appareils du foyer.
- **Humeur ancienne affichée comme actuelle** : risque principal. Un « 😢 Difficile » de ce matin lu à 22 h est faux et culpabilisant. Exigences : afficher l'heure (« Content · 14:20 ») ou masquer au-delà de 3 h ; ne jamais afficher l'humeur 1 ou 2 sans le contexte « ce matin / à 14:20 ».
- **Culpabilité et lecture de nuit** : une humeur négative sur l'écran d'accueil, vue par tout le foyer (partenaire, nounou), peut être lue comme un jugement. Pour 1 et 2, proposer de ne pas l'afficher dans le widget (choix produit : l'humeur est un jalon saisi par un parent, pas une mesure). L'humeur 4 et 5 seulement est une option sûre mais biaisée : à décider.
- **Couleur** : les couleurs de l'échelle d'humeur (rouge, orange, bleu, vert, rose) sont un cas de couleur seule. Dans le widget, ne pas les utiliser. Mot + forme uniquement.
- **Règle « pas d'emoji »** : la garder par défaut. L'assouplir seulement pour ce cas, avec mot adjacent. Dans `Text` Glance, l'emoji suit la police du téléphone et ne respecte pas `color` : il n'y a pas de problème de contraste, mais il n'y a pas non plus de garantie de lisibilité sur fond teinté.

### 2.3 Friendly

- **Leviers accessibles** : phrase d'état courte en bas ou en tête de tuile (« Bébé dort depuis 1h59 », « Tout est calme »), vocabulaire du foyer (prénom déjà en pastille), tutoiement ou formulation neutre, absence de ton d'alerte quand rien n'est en retard.
- **Éviter** : exclamations, emoji décoratifs, couleurs saturées en plus (lecture de nuit : le thème sombre `#1f2937` est bon, ne pas ajouter de fond clair ni de zones à forte luminosité).
- **Mouvement** : le Fil du jour défile (`LazyColumn`). WCAG 2.2.2 (pause, arrêt, masquage) vise le mouvement automatique de plus de 5 s ; ici le défilement est manuel, donc conforme. Il faut en revanche que le contenu essentiel (les trois résumés) soit visible sans défiler, ce qui est le cas.
- **Non francophones natifs** : phrases courtes, un seul sens par mot, pas d'abréviation (« Prom. » pour Promenade en petit format est à remplacer par le mot ou l'icône + « Prom. »), pas d'expression (« depuis » reste simple).

### 2.4 État actuel du widget : constats

1. **Libellé racine** (`semantics`) : bonne base. Il se lit comme une phrase. Vérifier que `contentDescription` sur la racine ne masque pas l'activation par la touche : TalkBack lit un seul bloc, l'utilisateur n'accède plus aux sous-éléments, ce qui est voulu pour un widget en lecture seule. Le libellé inclut déjà « Toucher pour ouvrir SuiviBaby » (bon).
2. **Fil du jour absent du libellé** : les événements récents (`props.recent`) ne sont pas lus. Un utilisateur TalkBack perd l'information visible. Ajouter « Dernier événement : Couche · pipi à 11:57 » (le plus récent seulement, pour rester court).
3. **Chronos natifs** : un `ChronometerView` / `ElapsedClockView` n'annonce rien, et un libellé racine statique gèle la durée lue au dernier envoi de l'app. `sinceLabel` (« depuis 13:14 ») est une heure fixe, donc fiable. Ne jamais mettre dans le libellé une durée calculée. Actuellement c'est bien le cas.
4. **Lecture de l'heure** : « 15:45 » est lu « quinze heures quarante-cinq » ou « 15 deux-points 45 » selon le moteur. Préférer dans le libellé « 15 h 45 ». À corriger dans `clock()` pour le libellé uniquement.
5. **Rappel dépassé** : couleur rouge + mot « rappel ». Bien (1.4.1 respecté). Contrastes `#f87171` sur `#1f2937` environ 5,2:1, `#b91c1c` sur `#fff` environ 6,5:1 (estimation, non vérifié).
6. **Texte soft** : `#9ca3af` sur `#1f2937` environ 5,5:1 (ok) ; `#6b7280` sur `#fff` environ 4,8:1 (ok). À 12 sp, c'est la limite basse acceptable.
7. **Taille de cible** : le widget entier est une seule cible tactile (clic ouvre l'app), donc SC 2.5.8 est satisfait.
8. **Hauteurs fixes** : à 130 % / 200 % de taille de police, les lignes de 24 dp et `fixedLine(sp * 1.25)` risquent de couper. Tester (non vérifié) ; prévoir une règle : si `fontScale > 1.3`, passer en vue « petit » (une seule colonne).

## 3. Maquette ASCII en dp (4×2, W ≈ 420, H ≈ 222)

Au repos :

```
+--------------------------------------------------------------+
| (Samaye)                   | Aujourd'hui                    |  26
|  Dernier repas             | [rep] 3 repas                  |
|  15:45                     |       dernier 15:45            |  40
|  il y a 59 min             | [cou] 3 couches                |
|  Prochain sein : gauche    |       dernière 15:32           |
|                            | [lun] 9h12 de sommeil          |
|                            | Fil du jour                    |
|                            | [rep] 15:45 Repas solide       |  24
+--------------------------------------------------------------+
  [xxx] = icône 16 dp + mot ; le texte reste toujours présent
```

Avec une session en cours :

```
+--------------------------------------------------------------+
| (Samaye)                   | Aujourd'hui                    |
| +------------------------+ | [rep] 3 repas                  |
| | [lun] Sieste           | |       dernier 15:45            |
| |  depuis 13:14          | | [cou] 3 couches                |
| |  1h59                  | |       dernière 15:32           |
| +------------------------+ | [lun] 9h12 de sommeil          |
+--------------------------------------------------------------+
```

L'humeur, si elle est retenue, va dans la zone « Aujourd'hui » (ligne dédiée « Humeur · Content · 14:20 »), pas à côté du prénom, afin de ne pas devenir la première lecture. Le temps et les sessions restent en premier.

## 4. Spécification

**Icônes (si retenues, en complément du texte)**

| Catégorie | Source | Taille | Clair (icône) | Sombre (icône) |
|---|---|---|---|---|
| Repas | Material Symbols `restaurant` (vecteur) | 16 dp | `#A83F23` | `#E8785A` |
| Couche | dessin maison (forme de couche) ; non vérifié qu'un symbole Material convienne | 16 dp | `#2B6A6A` | `#5BA4A4` |
| Sommeil | Material Symbols `bedtime` | 16 dp | `#5B4A85` | `#A898D0` |
| Tétée | dessin maison (goutte de lait ou sein stylisé), à valider avec des parents | 16 dp | `#A63D62` | `#E88FAE` |
| Promenade | Material Symbols `directions_walk` | 16 dp | `#3F7A2A` | `#8BC46B` |
| Pipi | goutte (`water_drop`) | 16 dp | `#2B6A6A` | `#5BA4A4` |
| Selle | pas de symbole standard sûr : garder le texte seul | n/a | n/a | n/a |

- Contraste d'icône : minimum 3:1 contre le fond (1.4.11). Les verts et roses clairs `dot` ne conviennent pas sur fond blanc, d'où les teintes `text`.
- Icône décorative pour TalkBack : `contentDescription = null` (le libellé racine fait foi).
- Libellés : un mot simple, sans abréviation sauf contrainte de place. « Pipi », « Selle », « Biberon 100 ml », « Tétée », « Solide ». Remplacer « Prom. » par « Marche » ou l'icône + « Prom. ».
- Humeur (option) : texte « Humeur · Content · 14:20 », `C.soft` ou `C.strong`, 12 à 13 sp. Emoji facultatif devant le mot, retiré du libellé TalkBack. Masqué après 3 h, et pour 1 et 2 sauf décision produit contraire.
- Libellé racine : ajouter le dernier événement, passer les heures au format « 15 h 45 », ajouter l'humeur le cas échéant (« Humeur : Content, à 14 h 20 »).
- Seuils : texte ≥ 4,5:1, icônes ≥ 3:1, cible ≥ 24 dp (le widget entier).

## 5. Coût

- **JS seul (aucune recompilation)** : libellé racine enrichi (dernier événement, heures « 15 h 45 », humeur), mots plutôt qu'abréviations, phrase d'état, ligne d'humeur en texte avec règle de péremption (3 h) dans `utils/widgetSnapshot.ts` + `services/widgetSync.ts` (ajout d'un champ `mood: { level, label, atMs }`), règle `fontScale` pour passer en vue compacte (si `environment` l'expose, non vérifié).
- **Recompilation (2 à 3 min)** : drawables vectoriels (repas, couche, sommeil, tétée, promenade, pipi) et leur nœud `Image` dans le patch `expo-widgets` ; non vérifié que `Image` Glance supporte le teintage par thème sombre/clair (sinon deux jeux de drawables).
- **iOS** : SF Symbols disponibles (`fork.knife`, `moon.fill`, `figure.walk`, `drop.fill`) ; les symboles sont lus par VoiceOver avec leur nom, donc masquer (`accessibilityHidden`) et laisser le texte. Dynamic Type à tester. L'humeur reste en texte, et si emoji, décoratif (masqué).

## Résumé des risques à retenir

1. Icône seule : non. Couleur seule : non (1.4.1).
2. Humeur périmée ou négative affichée à tout le foyer : le vrai risque produit.
3. Hauteurs fixes et texte de 12 sp : à tester avec la taille de police système maximale.
