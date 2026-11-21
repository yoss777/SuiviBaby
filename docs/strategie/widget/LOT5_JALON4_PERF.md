# Lot 5 — jalon 4 : performance du widget

Plan établi le 18/11/2026 avec l'agent ECC de planification (`ecc:planner`), à partir de la revue du jalon 4 et des choix de Yoss :

- regroupement des envois côté serveur : **oui, 2 s** ;
- timeline iPhone : **option D**.

Branche : `perf/widget-lot5-jalon4`.

## Avancement

| # | Point | État |
|---|---|---|
| 1 | Tétée en direct : tout changement urgent + rattrapage iPhone (décision du 18/11) | ✅ fait, testé |
| 2 | Lectures serveur groupées et en parallèle | ✅ fait, testé, mesuré dans les journaux |
| 3 | Regroupement serveur des envois non urgents (2 s) | ✅ fait, testé, interrupteur `coalesceMs` |
| 4 | iPhone : pas de réécriture au retour dans l'app si la timeline a moins de 30 min | ✅ fait, testé |
| 5 | Accueil : moins de recalculs et d'écritures | 🟡 partiel (voir plus bas) |
| 6 | Timeline iPhone option D | ✅ fait, testé |

## Déploiement

| Partie | Arrive avec |
|---|---|
| Serveur (points 1 à 3) | la fusion de la PR : déploiement automatique des fonctions |
| App (points 4 et 5) | la 1.0.22 |
| Timeline iPhone (point 6) | la 1.0.22 : le fichier du widget est dans l'extension iOS, il faut un build |

---

## 1. Tétée en direct : seuls le début et la fin sont urgents

**Problème.** Chaque écriture de la tétée partagée (`children/{c}/live/nursing`) partait en urgent : un changement de côté consommait le plafond iPhone de 2 min et pouvait retarder l'envoi de la fin de tétée.

**Piège relevé par la revue ECC.** Le document n'est **jamais supprimé** : la fin d'une tétée écrit un état vide (`EMPTY_NURSING_TIMER`, `components/forms/nursingTimer.ts`). La première version (« urgent si le document apparaît ou disparaît ») classait donc la fin et presque tous les débuts en non urgent, l'inverse du but.

**Changement.** `liveChange(before, after, nowMs)` (`functions/src/widget/fanout.js`) compare « une tétée utilisable est en cours » avant et après (`widget.usableNursing`, le même code que l'app) :

| Avant | Après | Urgent |
|---|---|---|
| état vide | côté en cours | oui (début) |
| côté en cours | état vide | oui (fin) |
| brouillon expiré | côté en cours | oui (nouveau départ) |
| gauche | droite | non (bascule) |
| en cours | en pause | non |
| en pause | en cours | non |

**Risque accepté.** Sur iPhone, une bascule non urgente tombe sous le plafond de 20 min : les **autres** téléphones du foyer peuvent montrer l'ancien côté jusqu'à 20 min. Le téléphone qui agit réécrit lui-même son widget.

**Tests.** `functions/__tests__/widgetFanout.test.js`, avec de vrais états de tétée.

## 2. Lectures serveur groupées et en parallèle

**Changement** (`fanOutWidget`) :

- lectures de départ en parallèle : fiche de l'enfant, membres, événements, tétée partagée, appareils ;
- **une seule requête** `device_tokens where widgetChildId == childId` (avant : une par membre), filtrée ensuite sur les membres. Un appareil d'un ancien membre n'est donc pas servi ;
- préférences et abonnements de tous les membres **en un aller-retour** (`db.getAll`) ;
- dernier repas, dernier change et comptes en cours de suppression lus en parallèle.

Les filtres de sûreté ne changent pas : consentement santé (version exigée), comptes en suppression, liste de bêta `allowUids`, `widgetCap`, plafond iPhone.

**Index.** La requête sur le seul champ `widgetChildId` utilise l'index automatique.

**Mesure.** Le journal `widgetFanout` contient maintenant :

- `readMs` : durée des lectures ;
- `sendMs` : durée de l'envoi à Expo ;
- `members` : nombre de membres servis.

Dans Cloud Logging, filtrer `jsonPayload.job="widgetFanout" AND jsonPayload.reason="sent"`, puis comparer `durationMs` p50/p95 sur 48 h avant et après. Cible : 300 à 600 ms de moins.

## 3. Regroupement des envois non urgents (2 s)

**Changement** (`coalescedFanOut`) :

1. L'interrupteur `app_config/widgetPush` est lu d'abord. Widget désactivé : ni marqueur, ni attente.
2. Chaque déclenchement pose un jeton dans `widget_fanout/{childId}`, attend 2 s, et n'envoie que s'il est toujours le dernier. Plusieurs saisies coup sur coup donnent un seul envoi, qui relit l'état complet.
3. **Urgent** (début ou fin de session) : envoyé tout de suite. Il rend caducs les envois non urgents en attente, puisqu'il lit l'état le plus récent.
4. Marqueur impossible à écrire : envoi direct, plutôt que de perdre l'envoi.

**Interrupteur sans redéploiement :** `app_config/widgetPush.coalesceMs`. `0` coupe le regroupement, au plus 10 000 ms.

**Données.**

- La collection est réservée au serveur : la règle par défaut refuse tout accès client.
- Le marqueur ne contient qu'un jeton et une heure, ni prénom ni donnée de santé.
- Il est effacé à la suppression de l'enfant (`functions/src/deletion/childData.js`).

**Ordre des messages.** La séquence est le `readTime` de la lecture du gagnant : elle ne fait que croître. Les gardes iOS et Android écartent toujours un message plus ancien.

**Coût.** Une écriture et une lecture de plus par déclenchement non urgent, et 2 s d'instance. En échange, environ 75 % de lectures en moins sur les rafales et moins de réveils de l'iPhone.

**Journal.** `reason: "coalesced"`, avec `waitedMs`.

## 4. iPhone : pas de réécriture au retour dans l'app si la timeline a moins de 30 min

**Problème.** Au retour dans l'app, `invalidateWidgetKey` oubliait le dernier contenu : la timeline complète était réécrite même sans changement, soit 15 à 30 écritures lourdes par jour pour rien.

**Changement** (`services/widgetSync.ts`). Sur iPhone, au retour, l'app ne réécrit pas si toutes ces conditions sont vraies :

- le contenu est identique à celui qu'elle avait écrit ;
- la dernière timeline complète a moins de 30 min (`WIDGET_IOS_FRESH_TIMELINE_MS`) ;
- c'est toujours le même jour ;
- aucune timeline complète n'est encore due ;
- aucun envoi du serveur n'a remplacé le contenu entre-temps.

Android n'est pas concerné : le récepteur natif peut avoir réécrit le widget, et l'instantané est peu coûteux.

**Pourquoi c'est sûr.** Une timeline complète couvre 4 h de comptage. À moins de 30 min, il en reste au moins 3 h 30. « màj HH:MM » ne grise qu'après 2 h.

## 5. Accueil : moins de recalculs et d'écritures

**Fait :**

- **Une seule écriture immédiate par saisie** (`takeWidgetUserAction`). L'affichage optimiste puis la confirmation du serveur déclenchaient deux timelines courtes en 3 s ; la deuxième passe maintenant par l'anti-rebond de 2 s.
- **Dépendances en valeurs simples** dans `widgetParams` (home.tsx) : `sleepIsNap`, `sleepChildId`, `walkChildId` au lieu des objets session. Un nouvel objet à contenu égal ne relance plus le calcul.

**Reporté** (gain faible, risque de régression sur l'Accueil, à reprendre si les mesures le justifient) :

- partage structurel des listes du jour (garder le tableau précédent si identique), qui demanderait un utilitaire `utils/stableLists.ts` ;
- `useMemo` par catégorie dans `hooks/useNowWidgetSync.ts`.

## 6. Timeline iPhone : option D

**Avant :** environ 123 entrées, avec une par minute pendant 1 h quoi qu'il arrive.

**Changement** (`widgetTimelinePlan`, `minutePrecisionUntil`) :

- **une entrée par minute** seulement tant que c'est utile, au plus 1 h :
  - une session en cours (chrono) ;
  - ou un repas ou un change de moins d'une heure, jusqu'à ce qu'il atteigne 1 h ;
- sinon **toutes les 5 min de la pendule** (hh:00, hh:05…) jusqu'à 4 h. Cette grille est désormais alignée sur la pendule ; avant, elle partait de l'heure d'écriture ;
- au-delà, comme avant : une entrée par heure jusqu'à 24 h et les entrées exactes (rappel au rouge, minuit, 8 h et 19 h, « màj », expiration).

**Libellé « il y a »** (`widgets/BebeMaintenant.ios.tsx`, `agoMinutes`) : à la minute pendant la première heure, puis arrondi à 5 min vers le bas (« il y a 2h05 »). VoiceOver dit aussi « 2 heures et 5 minutes ». Les chronos de session restent à la minute : l'alignement entre l'Accueil et le widget est conservé.

**Résultat :** environ 70 entrées quand rien ne bouge, environ 120 avec une session en cours.

**Écart accepté :** au-delà d'une heure, l'iPhone peut afficher « 2h05 » quand l'Accueil et le Samsung affichent « 2h07 ».

---

## Revue ECC du 18/11 (un relecteur par sujet)

| Relecteur | Sujet | Note | Verdict |
|---|---|---|---|
| `ecc:code-reviewer` | serveur | 15/20 | approuvé, aucun défaut critique ni important ; courses vérifiées, aucune mise à jour perdue |
| `ecc:typescript-reviewer` | app iPhone | 14/20 | à corriger avant fusion (point bloquant ci-dessous) |
| `ecc:performance-optimizer` | gains et coûts | 13,5/20 | gains serveur réels, gain iPhone modeste (-40 % au repos, ≈0 avec une session) |

**Corrigé après la revue :**

- **Point bloquant (app).** L'arrondi « il y a » à 5 min n'était pas calé sur les entrées de la timeline : « 1h00 » pouvait rester affiché 7 min. Le temps est maintenant compté jusqu'au dernier multiple de 5 min de la pendule ; le libellé change pile à chaque entrée, avec 0 à 4 min de retard sur l'Accueil.
- **Police « moins d'une heure ».** Comptée en minutes de la pendule, comme le libellé.
- **Une écriture immédiate par saisie.** Un compteur de génération remplace la comparaison d'heures : deux saisies à la même milliseconde restent deux saisies.
- **Fraîcheur de la timeline.** Remise à zéro après une écriture sans timeline (chargement).
- **Précision à la minute.** Seulement pour les sessions qui avancent : pas une tétée en pause, pas une session « oubliée ? ».
- **Marqueur `widget_fanout`.**
  - Il porte une date d'expiration `expireAt`, à associer à une politique TTL Firestore, pour ne jamais rester orphelin après la suppression d'un enfant.
  - Un échec d'effacement est journalisé.
  - Le journal ne contient pas d'identifiant d'enfant.
- **`coalesceMs`.** Seul un vrai nombre est accepté : `null` ou `""` ne coupent plus le regroupement.
- **Urgence de la tétée.** Le calcul ne s'applique qu'au document `nursing` ; un autre type de session partagée reste urgent.
- **Tests ajoutés.**
  - Serveur : replis (écriture et lecture du marqueur), urgent puis non urgent, compte en suppression isolé, aucun appareil.
  - App : libellé calé sur la grille, tétée en pause, saisies simultanées, bornes plus serrées.

**À faire au moment de la fusion :**

- [x] Politique TTL Firestore sur `widget_fanout.expireAt` : **ACTIVE** (vérifié le 20/11, `gcloud firestore fields ttls list`). Elle est déclarée dans `firestore.indexes.json`. Vérifier après la fusion qu'elle est active ; sinon, la poser avec :
  `gcloud firestore fields ttls update expireAt --collection-group=widget_fanout --enable-ttl --project=samaye-53723`

**Pistes relevées, non retenues pour ce jalon** (gain/risque, à mesurer d'abord) :

1. Réduire la fenêtre de 48 h des événements lus par envoi. C'est le premier poste de lectures ; vérifier d'abord ce dont `splitEvents` a besoin.
2. `maxInstances` sur les déclencheurs et délai maximum du regroupement (6 s depuis le premier marqueur), contre une rafale de démarrages à froid. Avec `retry: false`, un plafond d'instances peut faire perdre des envois : à étudier avant.
3. Alléger encore la timeline iPhone (environ 40 entrées : 5 min jusqu'à 2 h, puis horaire). Il faut un build et une validation sur appareil.

## Deuxième revue ECC du 18/11 (version corrigée)

| Relecteur | Sujet | Note | Verdict |
|---|---|---|---|
| `ecc:code-reviewer` | serveur | 13/20 | avertissement : code sain, mais tests de repli vides |
| `ecc:typescript-reviewer` | app iPhone | 16,5/20 | approuvé avec réserves (tests, précisions) |
| `ecc:performance-optimizer` | gains et coûts | 15/20 | rien ne se dégrade ; latence de lecture divisée par 3 à 5 |

**Corrigé après la deuxième revue :**

- **Tests de repli** (point important). Ils passent désormais réellement par le marqueur : regroupement actif, écriture ou lecture tentée et vérifiée, journal contrôlé. Avant, le regroupement était coupé pour toute la suite de tests, et ces tests auraient passé même sans le code de repli.
- **Une lecture en erreur ne bloque plus l'envoi.**
  - Préférences et abonnements : repli sur des lectures une à une. Des préférences illisibles écartent le membre, faute de preuve du consentement. Un abonnement illisible vaut version gratuite.
  - Dernier repas ou change : « inconnu ».
  - Seule la liste des comptes en suppression reste indispensable, par sûreté.
- **Coût.** Une lecture légère vérifie qu'un appareil affiche l'enfant avant de poser le marqueur. Sans widget, ni marqueur ni attente de 2 s : c'est le cas de la plupart des familles.
- **Tétée.** Une nouvelle tétée qui remplace une tétée en pause ou oubliée (encore utilisable) est urgente (`startedAt` différent).
- **TTL.** Déclaré dans `firestore.indexes.json` (`fieldOverrides`), comme les autres politiques TTL du dépôt.
- **Journaux.** Code d'erreur seulement : le message peut contenir le chemin, donc l'identifiant de l'enfant.
- **Tests de concurrence.** Ordre des jetons fixé (plus de dépendance à l'ordre des promesses).
- **Tests app ajoutés.**
  - Retour dans l'app : pas de saut après minuit, avec une timeline complète due, ni sur Android.
  - **Test de propriété** sur toute la timeline (3 décalages de secondes) : « il y a » ne recule jamais, ne repasse jamais sous 1 h, reste à 0-4 min de l'Accueil, et deux entrées ne sont jamais à plus de 5 min d'écart.
- Code mort retiré (`isWidgetUserActionRecent`).

**Précisions assumées (non corrigées) :**

- **Chronos de session au-delà d'une heure.** Sur iPhone, le chrono d'une sieste ou d'une balade et le total « de sommeil » avancent par pas de 5 min après la première heure (0 à 4 min de retard sur l'Accueil). C'était déjà le cas avant ce jalon.
- **Retour dans l'app sans réécriture.** L'heure de génération (« màj ») peut dater de 30 min de plus. C'est sans effet visible avant le grisé à 2 h.
- **Instance arrêtée après avoir pris le jeton** (délai dépassé, mémoire, préemption, sans nouvel essai). La saisie d'avant attend la saisie suivante ou le retour dans l'app. Le cas est rare, et chaque nouvelle écriture relit l'état complet. Une file Cloud Tasks éviterait ce cas, au prix d'une infrastructure de plus : à revoir si les mesures montrent des envois manquants.
- **Une saisie, une écriture immédiate.** Elle peut être prise par un autre changement survenu dans la même fenêtre de 3 s ; la saisie part alors après l'anti-rebond de 2 s.

## Revue ECC en profondeur du 18/11 (6 relecteurs, un par sujet)

| Relecteur | Sujet | Note | Verdict |
|---|---|---|---|
| `ecc:code-reviewer` | serveur, tous les enchaînements, recul par rapport à `main` | 16/20 | approuvé |
| `ecc:pr-test-analyzer` | efficacité des tests (46 mutations) | 13/20 | tests creux relevés |
| `ecc:silent-failure-hunter` | échecs silencieux | 13/20 | catch muets, envoi remplacé perdu |
| `ecc:security-reviewer` | sécurité et vie privée | 17/20 | aucun élargissement d'accès |
| `ecc:typescript-reviewer` | app iPhone, transitions d'état | 15,5/20 | approuvé avec réserves |
| `ecc:performance-optimizer` | coût par scénario | 14/20 | pré-contrôle inefficace |

**Corrigé :**

- **Pré-contrôle « aucun widget ».** Il filtre maintenant sur `widgetPush == true`. `widgetChildId` est inscrit dès l'ouverture de l'Accueil, widget ou pas : sans ce filtre, presque toutes les familles payaient le marqueur et 2 s d'attente.
- **Envoi gagnant en échec passager.** Il est réessayé une fois, 1 s plus tard (`sendOnce`), puisque les déclenchements qu'il a rendus caducs comptent sur lui.
- **Abonnement illisible.** Le membre est écarté, comme sur `main`, au lieu d'être rétrogradé en version gratuite.
- **Plus de `catch` muet.** Pré-contrôle, relecture du marqueur, lecture groupée et dernier repas ou change : avertissement avec le code d'erreur. Compteurs ajoutés : `prefsUnreadable`, `subUnreadable`, `lastEventUnreadable`, `badDeviceDoc`.
- **Raisons du journal distinctes.** `throttled` (plafond iPhone) et `no-consent` ne passent plus pour `no-device`.
- **Journaux sans identifiant.** Deux anciens journaux (`member failed`, `message too big`) ne contiennent plus d'identifiant d'enfant ni de message d'erreur.
- **Registre RGPD.** Le traitement 5 décrit le marqueur de regroupement, `coalesceMs` et des journaux sans identifiant. La collection est aussi inventoriée dans le test de couverture des purges.
- **App :**
  - une session « oubliée ? » reste comptée à la minute, puisque son chrono avance toujours (c'était une erreur de la version précédente) ;
  - garde contre une horloge qui recule ;
  - la branche de production qui n'existait que pour les tests est retirée.
- **Tests rendus discriminants.**
  - Le regroupement est actif (20 ms) dans toute la suite serveur.
  - Nouveaux tests :
    - serveur : widget désactivé, `coalesceMs` à 0 ou invalide, urgent sans attente, marqueur illisible, préférences ou abonnement illisibles, dernier repas illisible, nouvel essai, déclencheur de la tétée, pré-contrôle `widgetPush`, effacement avec l'enfant ;
    - app : minuit isolé, change récent, fenêtre de 3 s, déconnexion, horloge qui recule.
  - Chaque garde a été vérifiée par mutation : le test échoue si on retire le code (11 mutants, tous détectés).

**Décision de Yoss du 18/11 : la tétée doit suivre en direct sur tous les appareils.** « On ne peut pas se permettre 20 min de retard entre les appareils. »

- **Tout changement visible d'une tétée est urgent** : début, fin, pause, reprise, changement de côté. Cela remplace le point 1 d'origine (« seuls le début et la fin »).
- **Rattrapage iPhone** (`iosCatchUp`). Apple limite les notifications silencieuses ; le serveur s'impose un écart de 2 min par iPhone pour un envoi urgent. Avant, un envoi bloqué par cet écart était **abandonné** : par exemple, un changement de côté 1 min après le début n'arrivait jamais sur les autres iPhone, jusqu'à la saisie suivante. Désormais, le serveur le renvoie aux iPhone concernés dès la fin de l'écart, avec l'état le plus récent. Android n'est pas servi deux fois.
- **Retard maximal entre appareils pour la tétée :** quelques secondes sur Android, **2 min au plus sur iPhone**, jamais perdu. Apple peut en outre différer une notification silencieuse, téléphone en économie d'énergie par exemple.
- **Délai maximal des deux déclencheurs :** 60 s → 180 s, pour couvrir l'attente du rattrapage.
- **Le vrai temps réel à la seconde sur un autre iPhone passe par une Live Activity** (écran verrouillé, Dynamic Island), qu'Apple autorise à mettre à jour à distance en temps réel. C'est un chantier à part, proposé après ce jalon.
- **Les autres saisies non urgentes** (repas, change, notes…) gardent l'écart de 20 min sur les autres iPhone.

**Assumé :**

- **Envoi perdu si l'instance gagnante meurt** (délai dépassé, mémoire, préemption) malgré le nouvel essai. Le widget se rattrape à la saisie suivante ou au retour dans l'app. Une file Cloud Tasks éviterait ce cas.

## Vérifications

- [x] Tests des fonctions : 715 au total, au vert.
- [x] Tests de l'app : `widgetSync` (option D, retour dans l'app, une écriture par saisie), toute la suite au vert.
- [x] Lint et vérification des types.
- [ ] iPhone (widget posé, `ios: true`), avec un second téléphone du foyer :
  - [ ] début et fin de tétée visibles en moins de 2 min ;
  - [ ] bascule de côté non urgente ;
  - [ ] retour dans l'app à moins de 30 min : aucune réécriture (console) ;
  - [ ] à plus de 30 min, ou après minuit : réécriture ;
  - [ ] « il y a 2h05 » correct et lu par VoiceOver ;
  - [ ] appui visible rapidement.
- [ ] Samsung :
  - [ ] messages reçus (journal `WidgetPushHandler`), pas de recul de séquence ;
  - [ ] bascule de côté reçue ;
  - [ ] Accueil fluide lors d'une saisie.
- [ ] **Le 20/11 vers 11 h** — Production, 48 h après la fusion (PR #113 fusionnée le 18/11 vers 11 h ; TTL `widget_fanout` encore « CREATING » au moment de la fusion) : `durationMs` p50/p95, `readMs`, part de `coalesced`, `iosThrottled`, `errors`, coût des fonctions.

## Retour arrière

- **Serveur :**
  - mettre `app_config/widgetPush.coalesceMs = 0` pour couper le regroupement sans déploiement ;
  - sinon, revenir au commit précédent. Les documents `widget_fanout` sont inertes.
- **App :** revenir à la version précédente. Aucune migration de données.
- **Timeline iPhone :** le build précédent reste sur TestFlight.

## Bilan 48 h en production (20/11/2026)

Journaux Cloud Logging `jsonPayload.job="widgetFanout"`, projet `samaye-53723`, lecture seule. PR #113 fusionnée le 18/11 vers 11 h ; premier journal au nouveau format (avec `readMs`) le 18/11 à 11:48 UTC.

- **Avant** : 16/11 10:00 → 18/11 10:00 UTC, 198 journaux.
- **Après** : 18/11 10:00 → 20/11 10:00 UTC, 89 journaux.

L'usage n'est pas le même sur les deux périodes (142 envois avant, 63 après) : les comparaisons portent sur des médianes et des p95, pas sur des volumes.

### 1. Temps de traitement des envois (`reason="sent"`)

| | Avant | Après | Écart |
|---|---|---|---|
| `durationMs` p50 | 530 ms | 293 ms | −237 ms (−45 %) |
| `durationMs` p95 | 1 844 ms | 932 ms | −912 ms (−49 %) |
| Urgents p50 / p95 | 504 / 1 869 ms (108) | 297 / 957 ms (29) | −207 / −912 ms |
| Non urgents p50 / p95 | 586 / 1 829 ms (34) | 290 / 688 ms (34) | −296 / −1 141 ms |
| `readMs` p50 / p95 | non mesuré | 109 / 156 ms | — |
| `sendMs` p50 / p95 | non mesuré | 189 / 544 ms | — |

Gain attendu de 300 à 600 ms : atteint sur le p95 (largement dépassé, −0,9 s) ; sur le p50, −237 ms, un peu sous la cible, car le temps restant est surtout l'envoi à Expo (`sendMs` 189 ms) et non plus les lectures (`readMs` 109 ms). Le `durationMs` des envois non urgents n'inclut pas l'attente de 2 s du regroupement.

### 2. Regroupement (`reason="coalesced"`)

- 5 envois regroupés sur 68 déclenchements qui auraient envoyé (sent + coalesced), soit **7 %** ; 5,6 % de tous les journaux après.
- Attente `waitedMs` = 2 000 ms à chaque fois, comme prévu.
- Part des envois urgents : 66 % avant (130/198), 37 % après (33/89), cohérent avec le point 1 (les bascules de côté de la tétée ne sont plus urgentes).

### 3. iPhone

- 1 rattrapage iPhone (`iosOnly: true`), le 19/11 à 05:56:49 UTC, 22 s après un envoi où 2 iPhone avaient été retenus par le plafond (`iosThrottled: 2`) : le mécanisme a fonctionné.
- Aucun autre plafonnement sur 48 h.

### 4. Erreurs

- Aucune raison `failed`, `throttled` ou `no-consent` ; aucun journal avec `errors > 0`, `failed > 0` ou `deadTokens > 0`.
- Aucun avertissement « pre-check failed », « coalesce marker » ou « send failed, retrying once », et aucun journal de niveau WARNING ou plus pour les fonctions du widget depuis le 16/11.
- `no-device` : 56 avant, 21 après (enfants sans widget posé : normal).
- `skipped` : 322 appareils écartés avant, 0 après : la requête unique `widgetChildId == childId` ne ramène plus les appareils d'autres enfants.

### Conclusion

Jalon 4 validé en production : temps de traitement divisé par deux au p95, regroupement et rattrapage iPhone actifs, aucune erreur, TTL active. Piste suivante si l'on veut gagner encore sur le p50 : l'envoi à Expo (`sendMs`), plus les lectures.

## R14 : débit des envois urgents (1.0.25, serveur)

Depuis la décision du 18/11, tout changement visible d'une tétée part en urgent, comme le début et la fin d'un sommeil ou d'une promenade. Sans limite, des changements de côté rapides ou un téléphone qui écrit en boucle donnaient autant d'envois que d'écritures. Changement (`coalescedFanOut`, `claimUrgentSlot`, `sendUrgent`, `functions/src/widget/fanout.js`), après trois tours de revue ECC approfondie (21/11) :

- **Écart minimal par enfant : 5 s** entre deux envois urgents, tétée, sommeil et promenade confondus (`app_config/widgetPush.urgentGapMs`, 15 s au plus, 0 coupe). Un urgent qui arrive plus tôt part en urgent à la fin de l'écart, avec l'état le plus récent ; une rafale donne un seul envoi. Le changement de côté arrive donc chez les autres téléphones avec jusqu'à 5 s de retard dans une rafale.
- **Urgence héritée** : un urgent qui attend pose `urgentPending`. Si une saisie non urgente prend la main (l'enregistrement de la tétée dans l'historique, par exemple), elle envoie en urgent, avec la même limite. Sans cela, la fin d'une tétée pouvait partir en priorité normale et rester « en cours » jusqu'à 20 min sur iPhone. Un drapeau plus vieux que 3 min est ignoré (déclenchement disparu) ; l'envoi part alors en normal, signalé `stalePending`. Si l'envoi urgent échoue après la prise du créneau, le drapeau est remis pour qu'une saisie suivante le reprenne.
- **Plafond : 60 urgents par fenêtre d'une heure** (ouverte au premier urgent ; `urgentPerHour`, 0 coupe). Au-delà, **mode plafonné** : regroupé, priorité normale sur Android, mais l'iPhone garde l'écart urgent et son rattrapage ; l'urgence est aussi transmise à celui qui prend la main.
- **Erreurs** : réservation impossible → envoi en mode plafonné (`urgentSlot: "failopen"`) ; marqueur illisible ou écriture incertaine chez une saisie normale → passage par la réservation (au pire un urgent de plus, jamais un urgent rétrogradé).
- Attente par tranches de 1 s (arrêt dès qu'un urgent plus récent a la main) ; une heure enregistrée dans le futur est ignorée ; au plus 2 nouvelles réservations après l'attente (elles n'écrivent rien si un autre a pris la main), puis mode plafonné.
- Rattrapage iPhone sauté et signalé (`ios-catchup-skipped`) s'il finirait après 160 s (délai de la fonction : 180 s).
- `coalesceMs = 0` coupe aussi la limite (interrupteur d'urgence ; le journal perd alors `trig`). Pas de plafond d'instances : il serait commun à toutes les familles (une seule qui écrirait en boucle bloquerait les autres) ; le coût des écritures en boucle relève de R23.

Journal `widgetFanout` : chaque ligne porte `trig` (identifiant court et aléatoire du déclenchement, sans donnée personnelle) ; plus `urgentRequested`, `urgentSlot` (`send`, `deferred`, `failopen`), `waitedMs`, `waitReadFailures`, `rateLimited` et `supersededBy` (`urgent` ou `normal`) sur un urgent écarté, `inheritedUrgent` et `inheritedFrom` (le `trig` de l'urgent hérité), `markerUncertain`, `stalePending`, `reason: "failed"` avec `errorCode` (envoi en échec), `reason: "urgent-capped"` puis `urgentCapped` sur l'envoi plafonné (deux lignes, même `trig`). Bilan : chaque `trig` avec `urgentRequested` finit par un envoi (`sent`, ou `no-device` / `no-child` légitimes), un `coalesced` avec `supersededBy` (si `normal`, une ligne `inheritedFrom` portant ce `trig` doit suivre), un `urgent-capped` suivi d'un envoi `urgentCapped` ou d'un `coalesced`, ou un `failed` (à examiner).
