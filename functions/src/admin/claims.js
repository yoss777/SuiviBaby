const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { writeAdminAudit } = require("./audit");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");

// ============================================
// ADMIN CLAIM MANAGEMENT (T0.3)
// ============================================

/**
 * setAdminClaim — Promeut ou rétrograde un utilisateur en admin.
 *
 * Source unique pour gérer le custom claim `admin`. Avant cette CF, le claim
 * était settable uniquement via Firebase Console (zéro audit, zéro restriction).
 *
 * Sécurité :
 *  - Le caller doit déjà être admin (`request.auth.token.admin === true`).
 *  - Bootstrap : un seed email est défini via la secret env INITIAL_ADMIN_EMAIL ;
 *    si zéro admin existe encore et que le caller a cet email, on autorise.
 *  - Toute action est loggée dans adminAuditLog avec type="setAdminClaim".
 *  - Refus de se dépromouvoir soi-même (sinon œuf-et-poule pour les corrections).
 *
 * Limites :
 *  - Le claim ne prend effet que sur le PROCHAIN token (refresh).
 *    Le client doit appeler `getIdToken(true)` pour le force-refresh.
 */
/** True when at least one Firebase Auth user carries the admin custom claim. */
async function anyAdminExists() {
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    if (page.users.some((user) => user.customClaims?.admin === true)) return true;
    pageToken = page.pageToken;
  } while (pageToken);
  return false;
}

const setAdminClaim = onCall(
  withAppCheck({ region: "europe-west1", secrets: ["INITIAL_ADMIN_EMAIL"] }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "setAdminClaim");

    // Un e-mail non vérifié ne prouve rien : ni l'adresse seed, ni un admin.
    if (request.auth.token.email_verified !== true) {
      throw new HttpsError(
        "permission-denied",
        "Adresse e-mail non vérifiée.",
        { reason: "email-not-verified" },
      );
    }

    const callerUid = request.auth.uid;
    const callerEmail = request.auth.token.email || "";
    const callerIsAdmin = request.auth.token.admin === true;
    const seedEmail = process.env.INITIAL_ADMIN_EMAIL || "";

    const { targetUid, value, reason } = request.data || {};

    if (typeof targetUid !== "string" || !targetUid) {
      throw new HttpsError("invalid-argument", "targetUid requis (string).");
    }
    if (typeof value !== "boolean") {
      throw new HttpsError("invalid-argument", "value requis (boolean).");
    }
    if (typeof reason !== "string" || reason.trim().length < 5 || reason.length > 500) {
      throw new HttpsError(
        "invalid-argument",
        "reason requis (string, 5-500 chars). Documente pourquoi tu promues/dépromues."
      );
    }
    if (callerUid === targetUid && value === false) {
      // Pas de self-demotion — évite de se retrouver sans aucun admin.
      throw new HttpsError(
        "failed-precondition",
        "Vous ne pouvez pas vous dépromouvoir vous-même. Demandez à un autre admin."
      );
    }

    // Bootstrap check : si le caller n'est pas admin, est-ce qu'on a une
    // raison d'accepter quand même ? Oui, seulement si :
    //   1. Le caller a l'email seed INITIAL_ADMIN_EMAIL
    //   2. AUCUN admin n'existe encore (sinon le seed est inutile/dangereux)
    if (!callerIsAdmin) {
      if (!seedEmail || callerEmail.toLowerCase() !== seedEmail.toLowerCase()) {
        throw new HttpsError(
          "permission-denied",
          "Seuls les admins existants peuvent gérer le claim admin."
        );
      }
      // Le bootstrap ne sert qu'une fois : il se ferme dès qu'un admin existe,
      // d'après Firebase Auth (source de vérité, même si le journal d'audit a
      // été purgé ou le claim posé à la main) ou d'après le journal d'audit.
      const db = admin.firestore();
      if (await anyAdminExists()) {
        throw new HttpsError(
          "permission-denied",
          "Le seed admin n'est utilisable qu'avant le premier admin promu."
        );
      }
      const adminCountSnap = await db
        .collection("adminAuditLog")
        .where("type", "==", "setAdminClaim")
        .where("value", "==", true)
        .limit(1)
        .get();
      if (!adminCountSnap.empty) {
        throw new HttpsError(
          "permission-denied",
          "Le seed admin n'est utilisable qu'avant le premier admin promu."
        );
      }
    }

    // Appliquer le claim. Lire les claims existants pour ne pas écraser
    // d'autres custom claims qu'on n'a pas en tête.
    let targetUser;
    try {
      targetUser = await admin.auth().getUser(targetUid);
    } catch (err) {
      if (err?.code === "auth/user-not-found") {
        throw new HttpsError("not-found", `Utilisateur ${targetUid} introuvable.`);
      }
      throw err;
    }
    const existingClaims = targetUser.customClaims || {};
    const newClaims = { ...existingClaims };
    if (value) {
      newClaims.admin = true;
    } else {
      delete newClaims.admin;
    }
    await admin.auth().setCustomUserClaims(targetUid, newClaims);

    // Audit log obligatoire, on ne fait pas best-effort ici : la trace est
    // la défense principale contre les abus admin.
    const db = admin.firestore();
    await writeAdminAudit(db,{
      type: "setAdminClaim",
      adminUid: callerUid,
      adminEmail: callerEmail,
      targetUid,
      targetEmail: targetUser.email || null,
      value,
      reason: reason.trim(),
      bootstrapMode: !callerIsAdmin,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(
      `setAdminClaim: ${callerUid} → ${targetUid} admin=${value} (reason="${reason.slice(0, 50)}")`
    );
    return {
      success: true,
      // Le client doit appeler firebase.auth().currentUser.getIdToken(true)
      // pour que le claim soit appliqué côté client.
      requiresTokenRefresh: true,
    };
  }
);

module.exports = {
  setAdminClaim,
};
