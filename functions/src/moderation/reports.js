const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const reminderLib = require("../../lib/reminders");
const { writeAdminAudit } = require("../admin/audit");
const { checkChildAccess } = require("../shared/access");
const { monitorAppCheck, withAppCheck } = require("../shared/appCheck");
const { deleteDocsByFieldBatched } = require("../shared/batch");
const { deletePhotoEverywhere, photoRefToPath } = require("../shared/photos");
const { checkRateLimit } = require("../shared/rateLimit");
const { getExpoClient, newResend } = require("../shared/runtime");
const { isValidDocId } = require("../shared/validation");

/** Escapes text before it is interpolated into HTML (e-mails to the team or to users). */
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================
// CONTENT REPORT NOTIFICATION
// ============================================

/**
 * onReportCreated — Firestore trigger on reports/{reportId}
 * Sends an email notification to the SuiviBaby team when a user
 * submits a content report (e.g. sensitive child photo).
 */
async function handleReportCreated(snapshot, context) {
    const data = snapshot.data();
    const reportId = context.params.reportId;

    const reasonLabels = {
      intimate_child_nudity: "Nudité intime d'un enfant",
      sensitive_child_photo: "Photo sensible d'un enfant",
      privacy: "Problème de confidentialité",
      other: "Autre",
    };

    const reasonLabel = reasonLabels[data.reason] || data.reason;

    // Look up reporter email for context
    let reporterEmail = "inconnu";
    try {
      const userRecord = await admin.auth().getUser(data.reporterUserId);
      reporterEmail = userRecord.email || "inconnu";
    } catch {
      // User may have been deleted
    }

    const apiKey = process.env.RESEND_API_KEY;
    const db = admin.firestore();

    // 1. Send email to operator (best-effort — never blocks the
    // moderation effects below; if RESEND_API_KEY is missing we still
    // hide for the reporter and apply the auto-hide rules).
    if (apiKey) {
      const resend = newResend(apiKey);
      // Every field below comes from a client or from Auth: escape it all.
      const safe = Object.fromEntries(
        Object.entries({
          reportId, reason: reasonLabel, reporterEmail, reporterUserId: data.reporterUserId,
          childId: data.childId, eventId: data.eventId, photoPath: data.photoPath, message: data.message,
        }).map(([key, value]) => [key, escapeHtml(value)]),
      );
      const html = `
      <h2>Nouveau signalement de contenu</h2>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
        <tr><td style="padding:6px 12px;font-weight:bold;">Report ID</td><td style="padding:6px 12px;">${safe.reportId}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Motif</td><td style="padding:6px 12px;">${safe.reason}</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Reporter</td><td style="padding:6px 12px;">${safe.reporterEmail} (${safe.reporterUserId})</td></tr>
        <tr><td style="padding:6px 12px;font-weight:bold;">Enfant (childId)</td><td style="padding:6px 12px;">${safe.childId}</td></tr>
        ${data.eventId ? `<tr><td style="padding:6px 12px;font-weight:bold;">Event ID</td><td style="padding:6px 12px;">${safe.eventId}</td></tr>` : ""}
        ${data.photoPath ? `<tr><td style="padding:6px 12px;font-weight:bold;">Photo path</td><td style="padding:6px 12px;">${safe.photoPath}</td></tr>` : ""}
        ${data.message ? `<tr><td style="padding:6px 12px;font-weight:bold;">Message</td><td style="padding:6px 12px;">${safe.message}</td></tr>` : ""}
      </table>
      <p style="margin-top:16px;font-size:13px;color:#6b7280;">
        Consultez la collection <code>reports/${safe.reportId}</code> dans la console Firebase pour traiter ce signalement.
      </p>
      `;
      try {
        await resend.emails.send({
          from: "Suivi Baby <noreply@suivibaby.com>",
          to: "contact@suivibaby.com",
          subject: `[Signalement] ${String(reasonLabel).replace(/[\r\n<>]/g, " ")} — SuiviBaby`,
          html,
        });
        console.log(`onReportCreated: email sent for report ${reportId}`);
      } catch (error) {
        console.error("onReportCreated: failed to send email", error);
      }
    } else {
      console.warn(
        `onReportCreated: RESEND_API_KEY not configured — skipping ops email for report ${reportId} (moderation effects still applied)`
      );
    }

    // 2. Hide photo for reporter (add to user_hidden_photos)
    try {
      if (data.eventId) {
        await db.doc(`user_hidden_photos/${data.reporterUserId}`).set(
          { hiddenEventIds: admin.firestore.FieldValue.arrayUnion(data.eventId) },
          { merge: true },
        );
      }
    } catch (error) {
      console.error("onReportCreated: failed to hide for reporter", error);
    }

    // 3. Graduated global hide (T3):
    //    - immediate if reporter is an owner on the targeted child
    //    - otherwise wait for >= 2 distinct reporters on the same event,
    //      OR an explicit admin decision via resolveReport.
    //    Auto-hide on a single non-owner report was abusable (a coparent
    //    or viewer could mark a legitimate photo as nudity and have it
    //    hidden globally with no recourse).
    const isHidableReason =
      data.reason === "intimate_child_nudity" ||
      data.reason === "sensitive_child_photo";

    if (data.eventId && isHidableReason) {
      try {
        let shouldHide = false;
        let hideReason = "";

        if (data.childId) {
          const reporterAccessSnap = await db
            .doc(`children/${data.childId}/access/${data.reporterUserId}`)
            .get();
          const reporterRole = reporterAccessSnap.exists
            ? reporterAccessSnap.data()?.role
            : null;
          if (reporterRole === "owner") {
            shouldHide = true;
            hideReason = "owner-report";
          }
        }

        if (!shouldHide) {
          const peerReports = await db
            .collection("reports")
            .where("eventId", "==", data.eventId)
            .where("reason", "in", [
              "intimate_child_nudity",
              "sensitive_child_photo",
            ])
            .get();
          const distinctReporters = new Set(
            peerReports.docs
              .map((d) => d.data()?.reporterUserId)
              .filter(Boolean)
          );
          if (distinctReporters.size >= 2) {
            shouldHide = true;
            hideReason = "two-reporter-threshold";
          }
        }

        if (shouldHide) {
          await db.doc(`events/${data.eventId}`).update({ reported: true });
          console.log(
            `onReportCreated: event ${data.eventId} hidden globally (${hideReason})`
          );
        } else {
          console.log(
            `onReportCreated: event ${data.eventId} flagged but not hidden — awaiting moderation`
          );
        }
      } catch (error) {
        console.error("onReportCreated: failed to evaluate auto-hide", error);
      }
    }

    // 4. Notify photo author via push
    try {
      if (data.eventId) {
        const eventSnap = await db.doc(`events/${data.eventId}`).get();
        const eventData = eventSnap.exists ? eventSnap.data() : null;
        const authorId = eventData?.userId;

        if (authorId && authorId !== data.reporterUserId) {
          const tokenSnap = await db.collection("device_tokens")
            .where("userId", "==", authorId)
            .get();

          const tokens = tokenSnap.docs
            .map((d) => d.data().token)
            .filter(Boolean)
            .filter((t) => getExpoClient().isExpoPushToken(t));

          if (tokens.length > 0) {
            const messages = tokens.map((token) => ({
              to: token,
              sound: "default",
              title: "Photo signalée",
              body: "Une photo que vous avez ajoutée a été signalée et est en cours d'examen.",
              data: { type: "photo_reported", eventId: data.eventId },
            }));
            const chunks = getExpoClient().chunkPushNotifications(messages);
            for (const chunk of chunks) {
              await getExpoClient().sendPushNotificationsAsync(chunk).catch(() => {});
            }
            console.log(`onReportCreated: push sent to author ${authorId}`);
          }
        }
      }
    } catch (error) {
      console.error("onReportCreated: failed to notify author", error);
    }
  }
const onReportCreated = onDocumentCreated(
  {
    document: "reports/{reportId}",
    region: "europe-west1",
    secrets: ["RESEND_API_KEY"],
  },
  (event) => handleReportCreated(event.data, { params: event.params })
);

// ============================================
// REPORT SUBMISSION (B6.S1/S2/S3)
// ============================================

/**
 * submitContentReportCF — Crée un report avec validations serveur.
 *
 * Remplace l'ancienne création client directe (addDoc côté
 * services/contentReportService.ts). Apporte :
 *  - B6.S1 rate limit 5/min/uid (anti report flooding).
 *  - B6.S2 vérification existence childId + eventId (rejet si
 *    contenu reporté n'existe pas).
 *  - B6.S3 refus auto-report : un user ne peut pas signaler son
 *    propre event (évite le hack "hide my own photo from co-parents").
 *  - hasAccess(childId) vérifié (déjà fait par les rules avant,
 *    on garde la même contrainte).
 *
 * Le trigger onReportCreated reste en place et se déclenche aussi
 * pour les writes admin SDK (notifications, email opérateur, etc.).
 */
const REPORT_REASONS = new Set([
  "intimate_child_nudity",
  "sensitive_child_photo",
  "privacy",
  "other",
]);

const submitContentReportCF = onCall(
  withAppCheck({ region: "europe-west1" }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "submitContentReportCF");

    const uid = request.auth.uid;
    const db = admin.firestore();
    await checkRateLimit(db, uid, "report", 5);

    const { childId, eventId, photoPath, reason, message } = request.data || {};

    // Validation des champs.
    if (typeof childId !== "string" || childId.trim().length === 0) {
      throw new HttpsError("invalid-argument", "childId requis.");
    }
    if (!isValidDocId(childId)) {
      throw new HttpsError("invalid-argument", "childId invalide.");
    }
    if (!REPORT_REASONS.has(reason)) {
      throw new HttpsError("invalid-argument", `reason invalide. Attendu : ${[...REPORT_REASONS].join(", ")}.`);
    }
    if (eventId !== undefined && eventId !== null && typeof eventId !== "string") {
      throw new HttpsError("invalid-argument", "eventId doit être string ou null.");
    }
    if (eventId && !isValidDocId(eventId)) {
      throw new HttpsError("invalid-argument", "eventId invalide.");
    }
    if (photoPath !== undefined && photoPath !== null && typeof photoPath !== "string") {
      throw new HttpsError("invalid-argument", "photoPath doit être string ou null.");
    }
    // Le chemin signalé est supprimé tel quel par resolveReport : il doit être
    // dans le dossier de l'enfant et vérifiable contre les photos de l'événement.
    const reportedPhotoPath = photoPath ? photoRefToPath(photoPath, childId) : null;
    if (photoPath && !reportedPhotoPath) {
      throw new HttpsError("invalid-argument", "photoPath invalide pour cet enfant.");
    }
    if (photoPath && !eventId) {
      throw new HttpsError("invalid-argument", "photoPath exige un eventId.");
    }
    if (message !== undefined && message !== null) {
      if (typeof message !== "string") {
        throw new HttpsError("invalid-argument", "message doit être string.");
      }
      if (message.length > 1000) {
        throw new HttpsError("invalid-argument", "message trop long (max 1000 chars).");
      }
    }

    // B6 hasAccess(childId) — l'ancien rules le checkait, on garde.
    await checkChildAccess(db, uid, childId, ["owner", "admin", "contributor"]);

    // B6.S2 — vérifier que l'event reporté existe (si eventId fourni).
    if (eventId) {
      const eventDoc = await db.doc(`events/${eventId}`).get();
      if (!eventDoc.exists) {
        throw new HttpsError("not-found", "Le contenu signalé n'existe pas ou a été supprimé.");
      }
      const eventData = eventDoc.data();
      if (eventData.childId !== childId) {
        throw new HttpsError("invalid-argument", "Le contenu signalé n'appartient pas à cet enfant.");
      }
      if (reportedPhotoPath) {
        const eventPhotos = Array.isArray(eventData.photos) ? eventData.photos : [];
        if (!eventPhotos.some((ref) => photoRefToPath(ref, childId) === reportedPhotoPath)) {
          throw new HttpsError("invalid-argument", "Cette photo ne fait pas partie de l'événement signalé.");
        }
      }

      // B6.S3 — refuser l'auto-report. Un user ne doit pas pouvoir
      // signaler son propre event pour le hide de tous les co-parents.
      if (eventData.userId === uid) {
        throw new HttpsError(
          "failed-precondition",
          "Vous ne pouvez pas signaler votre propre contenu. Utilisez plutôt l'option modifier/supprimer."
        );
      }
    }

    // Write admin SDK — bypass rules (nécessaire car rules `allow create: if false`).
    const trimmedMessage = message?.trim?.() || null;
    const docRef = await db.collection("reports").add({
      reporterUserId: uid,
      childId,
      eventId: eventId ?? null,
      photoPath: reportedPhotoPath,
      reason,
      message: trimmedMessage,
      status: "open",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { reportId: docRef.id };
  }
);

// ============================================
// REPORT RESOLUTION (admin-only)
// ============================================

const resolveReport = onCall(
  withAppCheck({ region: "europe-west1", secrets: ["RESEND_API_KEY"] }),
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentification requise.");
    }
    monitorAppCheck(request, "resolveReport");

    const uid = request.auth.uid;
    const { reportId, action, adminNote } = request.data || {};
    const db = admin.firestore();

    // Verify admin custom claim
    const userRecord = await admin.auth().getUser(uid);
    if (!userRecord.customClaims?.admin) {
      throw new HttpsError("permission-denied", "Réservé aux administrateurs.");
    }

    if (!reportId || typeof reportId !== "string") {
      throw new HttpsError("invalid-argument", "reportId est requis.");
    }
    if (!["dismiss", "remove_photo", "remove_event"].includes(action)) {
      throw new HttpsError("invalid-argument", "Action invalide. Attendu: dismiss, remove_photo, remove_event.");
    }

    const reportRef = db.doc(`reports/${reportId}`);

    // B6.S7 — claim atomique : flip status open → resolving dans une
    // transaction. Si 2 admins lancent en parallèle, la 2e tx voit
    // status=resolving et throw already-exists. Évite la double-notif,
    // le double-audit, et la double-suppression de photo. La transition
    // finale resolving → resolved se fait à la fin (ligne ~1587).
    let reportData;
    try {
      reportData = await db.runTransaction(async (tx) => {
        const snap = await tx.get(reportRef);
        if (!snap.exists) {
          throw new HttpsError("not-found", "Signalement introuvable.");
        }
        const data = snap.data();
        if (data.status !== "open") {
          throw new HttpsError(
            "already-exists",
            data.status === "resolving"
              ? "Ce signalement est en cours de traitement par un autre admin."
              : "Ce signalement a déjà été traité."
          );
        }
        tx.update(reportRef, {
          status: "resolving",
          resolvingBy: uid,
          resolvingAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return data;
      });
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      console.error("resolveReport: claim transaction error", err);
      throw new HttpsError("internal", "Erreur lors de la prise en charge du signalement.");
    }

    // T0.4 — l'admin doit avoir accès à l'enfant ciblé. Sans ce check, un
    // admin global pouvait supprimer des events de n'importe quel enfant
    // (escalation B6-S4). On garde l'admin claim comme pré-requis mais on
    // ajoute la portée childId pour limiter le rayon d'action.
    if (reportData.childId) {
      const accessSnap = await db
        .doc(`children/${reportData.childId}/access/${uid}`)
        .get();
      const role = accessSnap.exists ? accessSnap.data()?.role : null;
      if (role !== "owner" && role !== "admin") {
        // Audit log AVANT de refuser, pour tracer les tentatives.
        try {
          await writeAdminAudit(db,{
            type: "resolveReport_denied",
            adminUid: uid,
            reportId,
            childId: reportData.childId,
            reason: "no_child_access",
            at: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (e) {
          console.error("resolveReport: failed to write denial audit", e.message);
        }
        throw new HttpsError(
          "permission-denied",
          "Vous devez être owner ou admin de cet enfant pour modérer ce signalement."
        );
      }
    }

    // Audit-log every admin action — the admin custom claim grants the
    // ability to act on any report, so the safeguard against rogue admins
    // is detection (this log) rather than prevention.
    try {
      await writeAdminAudit(db,{
        type: "resolveReport",
        adminUid: uid,
        reportId,
        childId: reportData.childId || null,
        eventId: reportData.eventId || null,
        action,
        adminNote: adminNote || null,
        at: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {
      // Audit log failure must not block the moderation action itself.
      console.error("resolveReport: failed to write audit log", e.message);
    }

    // Execute action
    // Même avec un rapport déjà stocké (créé avant 4.4), on ne supprime qu'un
    // fichier du dossier de l'enfant du rapport.
    const photoToRemove = photoRefToPath(reportData.photoPath, reportData.childId);
    if (action === "remove_photo" && reportData.photoPath && !photoToRemove) {
      console.warn(`resolveReport: refusing to delete photoPath outside child folder (report ${reportId})`);
    }
    if (action === "remove_photo" && photoToRemove) {
      try {
        await deletePhotoEverywhere(photoToRemove);
        console.log(`resolveReport: deleted photo ${photoToRemove}`);
      } catch (error) {
        console.warn(`resolveReport: could not delete photo ${photoToRemove}`, error.message);
      }
      // Remove photo from event
      if (reportData.eventId) {
        try {
          const eventRef = db.doc(`events/${reportData.eventId}`);
          const eventSnap = await eventRef.get();
          if (eventSnap.exists) {
            const photos = (eventSnap.data().photos || []).filter(
              (p) => p !== reportData.photoPath && photoRefToPath(p, reportData.childId) !== photoToRemove,
            );
            await eventRef.update({ photos, reported: admin.firestore.FieldValue.delete() });
          }
        } catch (error) {
          console.warn(`resolveReport: could not update event`, error.message);
        }
      }
    }

    if (action === "remove_event" && reportData.eventId) {
      try {
        // Use deleteEventCascade logic inline (delete event + likes + comments)
        await deleteDocsByFieldBatched(db, "eventLikes", "eventId", reportData.eventId);
        await deleteDocsByFieldBatched(db, "eventComments", "eventId", reportData.eventId);
        const removedSnap = await db.doc(`events/${reportData.eventId}`).get();
        await db.doc(`events/${reportData.eventId}`).delete();
        if (reportData.childId && removedSnap?.exists) {
          await reminderLib.safeRefreshLastEventAt(db, reportData.childId, [removedSnap.data()?.type]);
        }
        console.log(`resolveReport: deleted event ${reportData.eventId} + cascade`);
      } catch (error) {
        console.warn(`resolveReport: could not delete event cascade`, error.message);
      }
    }

    if (action === "dismiss" && reportData.eventId) {
      // Restore event if it was auto-hidden
      try {
        await db.doc(`events/${reportData.eventId}`).update({
          reported: admin.firestore.FieldValue.delete(),
        });
      } catch (error) {
        console.warn(`resolveReport: could not restore event`, error.message);
      }
    }

    // Mark report as resolved
    await reportRef.update({
      status: "resolved",
      resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
      resolvedBy: uid,
      action,
      adminNote: adminNote || null,
    });

    // Notify reporter
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      try {
        let reporterEmail = null;
        const reporterRecord = await admin.auth().getUser(reportData.reporterUserId);
        reporterEmail = reporterRecord.email;

        if (reporterEmail) {
          const resend = newResend(apiKey);
          const isRemoved = action === "remove_photo" || action === "remove_event";
          await resend.emails.send({
            from: "Suivi Baby <noreply@suivibaby.com>",
            to: reporterEmail,
            subject: isRemoved
              ? "Contenu retiré suite à votre signalement — SuiviBaby"
              : "Résultat de votre signalement — SuiviBaby",
            html: isRemoved
              ? `<p>Bonjour,</p><p>Le contenu que vous avez signalé a été examiné et retiré. Merci de contribuer à la sécurité des enfants sur SuiviBaby.</p><p>L'équipe SuiviBaby</p>`
              : `<p>Bonjour,</p><p>Merci pour votre signalement. Après examen, le contenu ne contrevient pas à nos règles d'utilisation.</p><p>L'équipe SuiviBaby</p>`,
          });
        }
      } catch (error) {
        console.warn("resolveReport: could not notify reporter", error.message);
      }
    }

    console.log(`resolveReport: report ${reportId} resolved with action=${action} by ${uid}`);
    return { success: true, action };
  }
);

module.exports = {
  handleReportCreated,
  onReportCreated,
  resolveReport,
  submitContentReportCF,
};
