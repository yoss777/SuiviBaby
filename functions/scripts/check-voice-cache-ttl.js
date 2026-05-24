/**
 * Read-only check of the TTL policy on voice_transcribe_cache.expireAt.
 *   GOOGLE_APPLICATION_CREDENTIALS=... node functions/scripts/check-voice-cache-ttl.js
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

  const url =
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
    `/databases/(default)/collectionGroups/${COLLECTION_GROUP}` +
    `/fields/${FIELD}`;

  const res = await client.request({ url, method: "GET" });
  console.log(JSON.stringify(res.data, null, 2));
}

main().catch((err) => {
  console.error("Failed:", err?.response?.data || err.message || err);
  process.exit(1);
});
