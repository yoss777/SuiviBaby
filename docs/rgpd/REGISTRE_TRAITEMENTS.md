# Registre des activités de traitement — SuiviBaby

Registre tenu au titre de l'article 30.1 du RGPD par le responsable du traitement.
Document interne : il n'est pas publié, mais doit pouvoir être présenté à la CNIL
sur demande. Il reprend la politique de confidentialité publiée
(`public/privacy.html`, version 2.3) ; en cas d'écart, corriger le plus ancien
des deux.

- **Responsable du traitement :** TESFA, SAS au capital de 500 €, RCS Paris
  900 913 476, 78 avenue des Champs-Élysées, 75008 Paris.
- **Contact :** privacy@suivibaby.com.
- **Délégué à la protection des données :** non désigné à ce jour ; désignation
  réévaluée chaque année au regard du nombre d'utilisateurs (art. 37.1.c).
- **Dernière mise à jour :** 17 novembre 2026 (ajout du widget, traitement 5).

## Personnes concernées (tous traitements)

- Utilisateurs adultes : parents titulaires de l'autorité parentale, ou personnes
  agissant avec leur accord, et personnes qu'ils invitent (co-parents, proches,
  nounous).
- Enfants suivis (mineurs), qui n'utilisent pas l'application eux-mêmes.
- Visiteurs du site suivibaby.com (traitement 13 seulement).

## Sous-traitants et transferts hors UE

| Sous-traitant | Rôle | Localisation | Garantie de transfert |
|---|---|---|---|
| Google Ireland / Google LLC (Firebase, dont Firebase Cloud Messaging) | Hébergement (Firestore eur3, fonctions europe-west1, photos europe-west1), authentification, App Check, remise des notifications sur Android | UE ; FCM et quelques photos héritées : États-Unis | EU-US Data Privacy Framework (à confirmer) |
| Apple Inc. (Apple Push Notification service) | Remise des notifications et des mises à jour du widget sur iPhone | États-Unis | EU-US Data Privacy Framework (à confirmer) |
| Expo (650 Industries, Inc.) | Acheminement des notifications push et des mises à jour du widget | États-Unis | DPF ou clauses contractuelles types — à vérifier |
| AssemblyAI, Inc. | Transcription de la commande vocale | États-Unis | DPF ou clauses contractuelles types — à vérifier |
| Anthropic, PBC | Interprétation du texte dicté | États-Unis | DPF ou clauses contractuelles types — à vérifier |
| RevenueCat, Inc. | Gestion des abonnements | États-Unis | DPF ou clauses contractuelles types — à vérifier |
| Resend (Plus Five Five, Inc.) | Envoi des e-mails | États-Unis | DPF ou clauses contractuelles types — à vérifier |
| Functional Software, Inc. (Sentry) | Diagnostic des erreurs | UE (Allemagne) | — |

Apple et Google sont aussi responsables distincts pour la connexion avec leur
compte et le paiement dans leurs stores.

**Contrats art. 28 pour la remise des messages :** Google — Firebase Data
Processing and Security Terms (couvrent FCM, projet Firebase de TESFA) ; Apple —
Apple Developer Program License Agreement (APNs, usage limité à la remise ;
conditions non négociables, compensées par la minimisation du contenu). Vérifier
la certification DPF d'Apple Inc. et de Google LLC sur dataprivacyframework.gov,
puis retirer « à confirmer ». Expo : garantie de transfert et durée réelle de
conservation des messages à confirmer dans son contrat (alternative : envoyer
directement à FCM et APNs, sans ce prestataire).

> À vérifier avec chaque contrat : la garantie retenue (certification DPF ou
> clauses contractuelles types) pour Expo, AssemblyAI, Anthropic, RevenueCat et
> Resend. La politique publiée dit « DPF lorsque le prestataire y est certifié,
> à défaut clauses contractuelles types » ; ce tableau doit dire laquelle
> s'applique, prestataire par prestataire.

## Traitements

### 1. Compte et synchronisation

- **Finalité :** créer et gérer le compte, synchroniser les données entre appareils.
- **Base légale :** exécution du contrat (art. 6.1.b).
- **Données :** adresse e-mail, pseudonyme, méthode de connexion, date de dernière connexion.
- **Destinataires :** Google (Firebase).
- **Durée :** tant que le compte est actif ; après une demande de suppression, 30 jours (annulable) puis effacement définitif.

### 2. Suivi de santé de l'enfant

- **Finalité :** enregistrer et afficher le suivi (repas, sommeil, couches, température, médicaments, symptômes, vaccins, croissance, notes, photos), statistiques et courbes.
- **Base légale :** consentement explicite (art. 9.2.a), recueilli à l'inscription ou à la première connexion, retirable dans les Réglages ; preuve horodatée côté serveur (traitement 12).
- **Données :** profil de l'enfant (prénom, date de naissance, sexe, allergies) ; données de santé et de suivi (données sensibles) ; photos.
- **Destinataires :** Google (Firebase) ; personnes invitées selon leurs droits ; personnes habilitées de TESFA en cas de besoin (support, signalement, sécurité).
- **Durée :** tant que le compte est actif ; profil d'enfant supprimé : 30 jours puis effacement, photos comprises ; sauvegardes : 7 jours (quotidiennes) et 30 jours (hebdomadaires).

### 3. Partage avec les personnes invitées

- **Finalité :** partager le suivi d'un enfant avec les personnes invitées.
- **Base légale :** exécution du contrat et consentement (art. 6.1.b et 9.2.a).
- **Données :** invitations, codes de partage (7 jours), droits d'accès, commentaires et réactions.
- **Destinataires :** personnes invitées ; Google (Firebase) ; Resend (e-mail d'invitation).
- **Durée :** tant que le partage existe ; codes d'invitation : 7 jours.

### 4. Commande vocale (facultative)

- **Finalité :** créer des événements à partir de la voix.
- **Base légale :** consentement explicite (art. 9.2.a) ; information sur les prestataires présentée avant la première utilisation.
- **Données :** enregistrement audio, texte transcrit (peut contenir un prénom), heure locale.
- **Destinataires :** AssemblyAI (audio), Anthropic (texte).
- **Durée :** audio supprimé du téléphone après la transcription, jamais stocké sur nos serveurs ; transcription supprimée chez AssemblyAI après traitement (5 essais, puis suppression manuelle) ; cache technique de 5 minutes, purgé sous 24 heures.

### 5. Widget de l'écran d'accueil (facultatif)

- **Finalité :** afficher un résumé du suivi sur le widget « Bébé maintenant » (écran d'accueil, écran verrouillé de l'iPhone) et le tenir à jour en temps réel quand un membre du foyer enregistre un événement.
- **Base légale :** consentement explicite aux données de santé (art. 9.2.a). La politique 2.3 décrit le widget ; le serveur n'envoie le résumé qu'aux comptes dont le consentement atteint la version réglée dans `app_config/widgetPush.minConsentVersion` (« 2.2 » tant que l'app 1.0.22, qui recueille la version 2.3, n'est pas publiée, puis « 2.3 »). Fonction facultative : rien n'est envoyé tant qu'aucun widget n'est posé (détection sur l'appareil).
- **Données :** résumé calculé à partir du traitement 2 : prénom, heure et type du dernier repas et du dernier change, compteurs du jour (dont quantité de lait), sommeil, sessions en cours (dont tétée et côté du sein), rappels, fil des dernières 24 heures (7 événements au plus : tétée, biberon, tire-lait, bain, soin du nez, mesures, activités, jalons, humeur ; libellés génériques pour médicament, vaccin, symptôme et vitamine saisie librement ; valeur de la température, choix produit du 16/11/2026), transmis quelle que soit la taille du widget ; données techniques : jeton de l'appareil, présence d'un widget, identifiant de l'enfant affiché, clé de lien propre à l'appareil, fuseau horaire, capacité du récepteur, statut Premium et droit de saisie (pour l'affichage). Donnée technique serveur (lot 5, jalon 4) : un marqueur de regroupement des envois par enfant (`widget_fanout/{identifiant de l'enfant}` : jeton aléatoire, heure, date d'expiration), sans donnée de santé ni nom, illisible par l'app (accès refusé par les règles).
- **Destinataires :** Expo, puis Apple (APNs) ou Google (FCM), le temps de remettre le message ; les appareils des membres du foyer qui ont posé un widget pour l'enfant, chacun selon le consentement de son titulaire ; toute personne qui voit l'écran du téléphone (masqué sur l'iPhone verrouillé par un code, pas sur Android).
- **Durée :** messages non remis : expiration demandée au bout de 15 minutes (effacement à distance : 24 heures) ; sur le téléphone : vidé à la déconnexion, au retrait du consentement (toute version) et à la suppression du compte ; effacement à distance (message « w0 », livraison au mieux, appareils `widgetCap` ≥ 2) quand l'accès à l'enfant est retiré, le profil supprimé, le consentement redescendu sous la version exigée, ou la version exigée relevée au-dessus de celle du consentement (effacement au premier envoi qui suit, une fois par appareil, lot 5 jalon 6) ; à défaut, masqué au plus tard 24 heures après la dernière mise à jour (données conservées dans l'espace de l'app jusqu'à la mise à jour suivante ou la déconnexion). Marqueur de regroupement : effacé avec l'enfant, et en tout cas 24 heures après le dernier envoi (politique TTL Firestore ; la suppression effective peut prendre jusqu'à un jour de plus).
- **Mesures propres :** pas de nom de médicament ou de vaccin ni de texte libre dans les messages ; envoi limité aux appareils qui affichent l'enfant ; plafond d'envois iPhone ; interrupteurs `app_config/widgetPush` (`enabled`, `ios`, `wipe`, `allowUids`, `coalesceMs` : délai de regroupement des envois, 0 = coupé), illisibles par l'app depuis le jalon 6 (liste des testeurs comprise) ; journaux d'envoi sans prénom, sans identifiant et sans contenu (compteurs et durées seulement).

### 6. Mesure de l'usage du widget

- **Finalité :** compter, de façon globale, l'usage du widget (sessions démarrées ou arrêtées depuis le widget).
- **Base légale :** consentement explicite aux données de santé (art. 9.2.a), version 2.3 (« compter, de façon globale, l'usage de fonctions comme le widget ») : l'indication est portée par l'événement, une donnée de santé ; l'intérêt légitime seul ne suffirait pas.
- **Données :** champs `source: "widget"` et `endSource: "widget"` sur l'événement.
- **Destinataires :** Google (Firebase) ; comptages agrégés par requête serveur, sans lecture du contenu des événements.
- **Alternative envisagée :** compteur anonyme côté serveur (sans uid, enfant ni type), qui relèverait de l'intérêt légitime.
- **Durée :** celle de l'événement (traitement 2).

### 7. Rappels et notifications push

- **Finalité :** rappels (repas, changes…) et notifications d'activité du foyer.
- **Base légale :** consentement explicite aux données de santé (art. 9.2.a), les notifications en contenant, et autorisation du système (révocable).
- **Données :** jeton de l'appareil, plateforme ; texte : prénom de l'enfant, type d'événement, horaires.
- **Destinataires :** Expo, Apple (APNs), Google (FCM).
- **Durée :** jeton conservé tant que l'appareil est enregistré ; supprimé à la déconnexion et à la suppression du compte.

### 8. Récapitulatif hebdomadaire par e-mail

- **Finalité :** résumé de la semaine, si l'utilisateur l'active.
- **Base légale :** consentement explicite aux données de santé (art. 9.2.a) et activation dans les réglages.
- **Données :** adresse e-mail, résumé du suivi.
- **Destinataires :** Resend.
- **Durée :** envoi ponctuel ; arrêt dès la désactivation.

### 9. E-mails de service

- **Finalité :** invitation, sécurité du compte, suppression.
- **Base légale :** exécution du contrat.
- **Données :** adresse e-mail, contenu de l'e-mail.
- **Destinataires :** Resend.
- **Durée :** envoi ponctuel.

### 10. Abonnement Premium

- **Finalité :** gérer l'abonnement.
- **Base légale :** exécution du contrat ; obligations comptables.
- **Données :** identifiant de compte pseudonyme, offre, statut et dates (jamais de coordonnées bancaires).
- **Destinataires :** RevenueCat ; Apple et Google (responsables distincts).
- **Durée :** données de facturation : 10 ans, conservées par les stores et RevenueCat.

### 11. Sécurité, prévention des abus, diagnostic

- **Finalité :** limites d'usage, vérification de l'intégrité de l'application (App Check), diagnostic des erreurs.
- **Base légale :** intérêt légitime (art. 6.1.f).
- **Données :** données techniques de l'appareil et des erreurs (sans identifiant de compte chez Sentry), journaux techniques.
- **Destinataires :** Google (Firebase), Sentry.
- **Durée :** journaux techniques et de sécurité : 90 jours au plus.

### 12. Preuve des consentements

- **Finalité :** prouver le consentement aux données de santé (art. 7.1) et son retrait.
- **Base légale :** obligation de preuve ; conservation après suppression du compte : intérêt légitime (art. 6.1.f, prescription de 5 ans, art. 2224 du Code civil).
- **Données :** version de la politique acceptée, horodatage serveur, plateforme ; retraits.
- **Destinataires :** Google (Firebase), collection `consent_records` lisible par le serveur seul.
- **Durée :** 5 ans après la suppression du compte.

### 13. Signalements de contenu

- **Finalité :** traiter les signalements et protéger les enfants.
- **Base légale :** intérêt légitime et obligations légales.
- **Données :** contenu signalé, motif, date, compte à l'origine du signalement.
- **Destinataires :** équipe TESFA habilitée.
- **Durée :** à préciser (la politique publiée ne la fixe pas) ; au plus tard, effacement avec l'enfant ou le compte concerné (`functions/src/deletion/childData.js`).

### 14. Site web suivibaby.com

- **Finalité :** faire fonctionner et sécuriser le site.
- **Base légale :** intérêt légitime.
- **Données :** journaux techniques de connexion (adresse IP, date, page) chez l'hébergeur ; aucun cookie ni outil de mesure d'audience.
- **Destinataires :** Google (Firebase Hosting).
- **Durée :** à fixer (journaux Firebase Hosting dans Cloud Logging, par exemple 30 jours).

## Mesures de sécurité (art. 32), communes

- Chiffrement en transit (TLS) et au repos (hébergeur). Pas de chiffrement de bout en bout.
- Règles d'accès Firestore par enfant, testées (`firestore.rules`, tests sur l'émulateur).
- App Check (intégrité de l'application), limites d'usage côté serveur.
- Verrouillage biométrique facultatif dans l'app.
- Accès TESFA limité aux personnes habilitées, uniquement en cas de besoin.
- Procédure de notification à la CNIL en cas de violation (art. 33).

## Points ouverts

- **Analyse d'impact (AIPD, art. 35) : requise** (données de santé + personnes vulnérables, deux critères des lignes directrices WP248). À réaliser avant la mise en production du 2/2/2027 ; inclure le widget (affichage sur l'écran d'accueil, envoi via Expo, APNs et FCM) et la valeur de température affichée.
- **Mise en balance de l'intérêt légitime** à consigner pour les traitements 11 et 12.
- **Information à la pose du widget** (comme la commande vocale) : message affiché une fois par appareil, à la première détection d'un widget (ce qu'il montre, qui peut le voir, passage par Expo puis Apple ou Google, comment l'arrêter ; lien vers la politique). **Fait le 18/11/2026** (`services/widgetInfoNotice.ts`), livré avec la 1.0.22 ; rendu à vérifier sur téléphone pendant ses tests (test 16, `docs/strategie/widget/TESTS_APPAREIL.md`).
- **Garanties de transfert** prestataire par prestataire (voir l'encadré plus haut).
- **Widget d'un invité (nounou, proche) :** pas de réglage du parent pour le couper (décision de Yoss, 18/11/2026). Il dépend du seul consentement de l'invité ; le parent garde le retrait de l'accès, qui efface le widget à distance. Justification à reprendre dans l'AIPD.
- **Version exigée pour le widget :** passer `app_config/widgetPush.minConsentVersion` à « 2.3 » dès la publication de l'app 1.0.22 sur les pistes de test, **et au plus tard avant l'ouverture en production** ; d'ici là, les envois du widget aux consentements 2.2 ne concernent que des testeurs. Les widgets restés en 2.2 ne reçoivent alors plus de données : le premier envoi qui suit leur adresse un effacement à distance (« w0 », une fois par appareil ; à défaut, masqués sous 24 heures). Un réglage mal saisi ne peut plus abaisser la version exigée (repli sur 2.3) ; l'app 1.0.21 peut continuer à les remplir localement, sans tiers. Procédure : `docs/RUNBOOK.md` §8.
