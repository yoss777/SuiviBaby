/**
 * One-shot: enable TTL policy on revenuecat_webhook_events.expireAt
 * (T0.2 idempotence anti-replay). Auto-purge 30j après réception.
 *   GOOGLE_APPLICATION_CREDENTIALS=... node functions/scripts/enable-rc-webhook-ttl.js
 *
 * Idempotent — safe to re-run.
 */
const { GoogleAuth } = require("google-auth-library");

const PROJECT_ID = "samaye-53723";
const COLLECTION_GROUP = "revenuecat_webhook_events";
const FIELD = "expireAt";

async function main() {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  const client = await auth.getClient();

  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/(default)/collectionGroups/${COLLECTION_GROUP}` +
    `/fields/${FIELD}`;

  const body = {
    name:
      `projects/${PROJECT_ID}/databases/(default)/collectionGroups/` +
      `${COLLECTION_GROUP}/fields/${FIELD}`,
    ttlConfig: {},
  };

  console.log("PATCH", url);
  const res = await client.request({
    url,
    method: "PATCH",
    params: { updateMask: "ttlConfig" },
    data: body,
  });

  console.log("Operation started:", res.data.name || res.data);
  console.log(
    "TTL provisioning takes a few minutes server-side. " +
    "Verify via console: https://console.cloud.google.com/firestore/databases/-default-/" +
    "ttl-policies?project=" + PROJECT_ID
  );
}

main().catch((err) => {
  console.error("Failed:", err?.response?.data || err.message || err);
  process.exit(1);
});
