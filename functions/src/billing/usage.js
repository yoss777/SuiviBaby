const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { hasChildRole } = require("../../accessControl");
const { FREE_TOTAL_PDF_EXPORTS, getExportQuotaStatus, getSharingQuotaStatus, getVoiceQuotaStatus, reserveVoiceQuota } = require("./quotas");
const { getSubscriptionState, hasUnlimitedFeature } = require("./subscription");
const { checkChildAccess } = require("../shared/access");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");

const getUsageQuotaStatus = onCall(
  withAppCheck({ region: "europe-west1", concurrency: 50 }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "getUsageQuotaStatus");

    const uid = request.auth.uid;
    const { feature, childId } = request.data || {};
    const db = admin.firestore();

    if (!["voice", "export", "sharing"].includes(feature)) {
      throw new HttpsError("invalid-argument", "Feature invalide.");
    }

    if (feature === "voice") {
      return await getVoiceQuotaStatus(db, uid);
    }

    if (feature === "export") {
      return await getExportQuotaStatus(db, uid);
    }

    if (!childId || typeof childId !== "string") {
      throw new HttpsError("invalid-argument", "childId est requis.");
    }

    const accessDoc = await db.doc(`children/${childId}/access/${uid}`).get();
    if (!accessDoc.exists || !hasChildRole(accessDoc.data(), ["owner", "admin"])) {
      throw new HttpsError("permission-denied", "Accès insuffisant à cet enfant.");
    }

    return await getSharingQuotaStatus(db, uid, childId);
  }
);

const consumeUsageQuota = onCall(
  withAppCheck({ region: "europe-west1", concurrency: 50 }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "consumeUsageQuota");

    const uid = request.auth.uid;
    const { feature, childIds } = request.data || {};
    const db = admin.firestore();

    if (!["voice", "export"].includes(feature)) {
      throw new HttpsError("invalid-argument", "Feature invalide.");
    }

    // B5.S1 — pour les features scopées par enfant (export PDF), exiger
    // que l'appelant ait accès à TOUS les enfants exportés. Quota reste
    // GLOBAL (1 export free, peu importe le nombre d'enfants) mais on
    // bloque l'exploit "consommer le quota pour un childId random qu'on
    // ne possède pas". Voice = user-level, pas de scope childId.
    if (feature === "export") {
      if (!Array.isArray(childIds) || childIds.length === 0) {
        throw new HttpsError("invalid-argument", "childIds (array non vide) requis pour les exports.");
      }
      if (childIds.length > 20) {
        // Garde-fou : 20 enfants en un export, c'est déjà énorme. Au-delà,
        // soit c'est un bug client, soit une tentative d'abus.
        throw new HttpsError("invalid-argument", "Trop d'enfants dans un seul export (max 20).");
      }
      for (const id of childIds) {
        if (typeof id !== "string" || id.trim().length === 0) {
          throw new HttpsError("invalid-argument", "childId invalide dans childIds.");
        }
        await checkChildAccess(db, uid, id, ["owner", "admin", "contributor"]);
      }
    }

    if (feature === "voice") {
      return await reserveVoiceQuota(db, uid);
    }

    const subscriptionState = await getSubscriptionState(db, uid);
    if (hasUnlimitedFeature(subscriptionState, feature)) {
      return {
        feature,
        allowed: true,
        isUnlimited: true,
        used: 0,
        limit: null,
        remaining: null,
        resetDate: null,
      };
    }

    const usageRef = db.doc(`usage_limits/${uid}`);
    return await db.runTransaction(async (tx) => {
      const usageDoc = await tx.get(usageRef);
      const usageData = usageDoc.exists ? usageDoc.data() : {};

      const used = usageData.pdfExportCount || 0;
      if (used >= FREE_TOTAL_PDF_EXPORTS) {
        throw new HttpsError(
          "resource-exhausted",
          "Votre export gratuit a déjà été utilisé. Passez en Premium pour des exports illimités."
        );
      }

      tx.set(
        usageRef,
        {
          pdfExportCount: used + 1,
          lastPdfExportAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      return {
        feature: "export",
        allowed: true,
        isUnlimited: false,
        used: used + 1,
        limit: FREE_TOTAL_PDF_EXPORTS,
        remaining: Math.max(0, FREE_TOTAL_PDF_EXPORTS - (used + 1)),
        resetDate: null,
      };
    });
  }
);

module.exports = {
  consumeUsageQuota,
  getUsageQuotaStatus,
};
