#!/usr/bin/env node
// Test manuel du récepteur Android du widget (E4), sans déploiement ni
// Firestore : envoie un message « w1 » de démonstration à un jeton Expo.
//
//   node functions/scripts/sendWidgetTestPush.js 'ExponentPushToken[…]' <childId> [high|normal]
//
// Le widget doit afficher « Test temps réel » et une sieste commencée il y a
// 25 min, app fermée. childId : l'enfant affiché par le widget (garde).
const { Expo } = require("expo-server-sdk");
const widget = require("../shared/widget");

async function main() {
  const [token, childId, priority = "high"] = process.argv.slice(2);
  if (!Expo.isExpoPushToken(token) || !childId) {
    console.error("Usage : sendWidgetTestPush.js <jeton Expo> <childId> [high|normal]");
    process.exit(1);
  }
  const now = Date.now();
  const env = widget.zonedEnv("Europe/Paris");
  const input = widget.assembleNowWidgetInput(
    {
      childName: "Test temps réel",
      nursing: null,
      tetees: [],
      biberons: [{ ms: now - 90 * 60000, quantite: 150 }],
      solides: [],
      mictions: [{ ms: now - 40 * 60000 }],
      selles: [],
      others: [{ ms: now - 30 * 60000, type: "bain" }],
      sleepStartMs: now - 25 * 60000,
      sleepIsNap: true,
      sleepTotalMinutes: 25,
      isPremium: false,
      reminders: { enabled: false, repasHours: 0, changesHours: 0 },
      now,
    },
    env,
  );
  const p = widget.toNativeWidgetProps({ ...widget.buildNowWidgetProps(input, env), childId });
  const message = { to: token, data: { t: "w1", c: childId, s: now, p }, priority, ttl: 900 };
  const expo = new Expo();
  const tickets = await expo.sendPushNotificationsAsync([message]);
  console.log(JSON.stringify({ sentAt: new Date(now).toISOString(), seq: now, tickets }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
