/**
 * Nom de l'app dans les textes de l'interface (un seul nom partout).
 * Le nom affiché sous l'icône (app.json « name ») est géré à part, côté
 * stores : les textes qui renvoient aux Réglages du système doivent citer ce
 * nom-là, pas celui-ci.
 */
export const APP_NAME = "SuiviBaby";

/**
 * Site public, ajouté en dernière ligne des partages de célébration quand
 * l'interrupteur distant `app_config/sharing.includeAppLink` est allumé.
 * Jamais d'identifiant (enfant, compte, parrainage) dans ce lien.
 */
export const SHARE_APP_URL = "https://suivibaby.com";
