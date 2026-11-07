
// SDK lourds (expo-server-sdk ~130-260 ms, resend ~30-45 ms, @anthropic-ai/sdk
// ~180-320 ms au require) chargés à la première utilisation, pas au démarrage à
// froid : toutes les fonctions partagent ce module, donc validateAndCreateEvent
// payait le chargement de SDK qu'elle n'appelle jamais (SUIVI_ACTIONS S7.9).
let expoModule = null;
/** Module expo-server-sdk, chargé à la demande. */
function getExpoModule() {
  if (!expoModule) expoModule = require("expo-server-sdk");
  return expoModule;
}
let expoClient = null;
/** Client Expo partagé (une instance par instance de fonction), créé à la demande. */
function getExpoClient() {
  if (!expoClient) expoClient = new (getExpoModule().Expo)();
  return expoClient;
}
/** Nouveau client Resend, SDK chargé à la demande. */
function newResend(apiKey) {
  const { Resend } = require("resend");
  return new Resend(apiKey);
}

module.exports = {
  getExpoClient,
  getExpoModule,
  newResend,
};
