/**
 * One-shot script: enable a TTL policy on voice_transcribe_cache.expireAt
 * (T1.2 idempotency cache). Run with:
 *   GOOGLE_APPLICATION_CREDENTIALS=~/.config/firebase/...credentials.json \
 *   node functions/scripts/enable-voice-cache-ttl.js
 *
 * Or without env var if you've run `gcloud auth application-default login`.
 *
 * Safe to re-run — idempotent. Logs the resulting field state and exits.
 */
const { GoogleAuth } = require("google-auth-library");

const PROJECT_ID = "samaye-53723";
const COLLECTION_GROUP = "voice_transcribe_cache";
const FIELD = "expireAt";

async function main() {
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/datastore"],
  });
  const client = await auth.getClient();

  // Per Firestore Admin API docs, repeated query params must be passed with
  // the bracket notation when using google-auth-library's client.request.
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
    "Verify in console: https://console.cloud.google.com/firestore/databases/-default-/" +
    "ttl-policies?project=" + PROJECT_ID
  );
}

main().catch((err) => {
  console.error("Failed:", err?.response?.data || err.message || err);
  process.exit(1);
});
