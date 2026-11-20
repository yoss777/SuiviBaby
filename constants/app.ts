/**
 * Nom de l'app dans les textes de l'interface (un seul nom partout).
 * Le nom affiché sous l'icône (app.json « name ») est géré à part, côté
 * stores : les textes qui renvoient aux Réglages du système doivent citer ce
 * nom-là, pas celui-ci.
 */
export const APP_NAME = "SuiviBaby";

/**
 * Site public, ajouté en dernière ligne des partages de célébration quand
 * SHARE_INCLUDE_APP_LINK vaut true. Jamais d'identifiant (enfant, compte,
 * parrainage) dans ce lien.
 */
export const SHARE_APP_URL = "https://suivibaby.com";

/**
 * À passer à true dans la version de mise en production (2/2/2027), une fois
 * les fiches App Store et Google Play publiques et la page d'accueil du site
 * corrigée (SUIVI_ACTIONS R19). Avant : un proche qui clique tomberait sur une
 * fiche fermée ou sur des promesses fausses.
 */
export const SHARE_INCLUDE_APP_LINK = false;
