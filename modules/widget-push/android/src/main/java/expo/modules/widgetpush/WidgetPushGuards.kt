package expo.modules.widgetpush

/**
 * Décision pure (testée sur la JVM) : appliquer ou non un message serveur
 * « w1 » au widget. Gardes du plan temps réel, §2.2.
 */
enum class WidgetPushOutcome(val code: String) {
  APPLIED("ok"),
  FOREGROUND("fg"),
  OTHER_CHILD("child"),
  STALE_SEQ("seq"),
  OLDER_THAN_APP("app"),
  INVALID("invalid"),
}

object WidgetPushGuards {
  /**
   * @param childId enfant du message (`c`)
   * @param seq horodatage serveur de la lecture (`s`, ms)
   * @param propsVersion version des données (`p.v`)
   * @param shownChildId enfant affiché par le widget (écrit par l'app) ; null : aucun
   *   (jamais ouvert, ou déconnexion) et rien n'est appliqué
   * @param lastSeq dernier `s` appliqué (0 si aucun)
   * @param appWriteAtMs dernière écriture du widget par l'app (horloge du téléphone, 0 si aucune)
   * @param foreground app visible : ses écouteurs Firestore font foi
   * @param skewMs tolérance d'horloge entre le serveur et le téléphone
   */
  fun decide(
    childId: String?,
    seq: Long,
    propsVersion: Int,
    shownChildId: String?,
    lastSeq: Long,
    appWriteAtMs: Long,
    foreground: Boolean,
    skewMs: Long = 2_000L,
  ): WidgetPushOutcome {
    if (childId.isNullOrEmpty() || seq <= 0L || propsVersion != 1) return WidgetPushOutcome.INVALID
    if (foreground) return WidgetPushOutcome.FOREGROUND
    if (shownChildId.isNullOrEmpty() || shownChildId != childId) return WidgetPushOutcome.OTHER_CHILD
    if (seq <= lastSeq) return WidgetPushOutcome.STALE_SEQ
    // Lecture serveur antérieure à ce que l'app a déjà écrit : ne pas revenir en arrière.
    if (appWriteAtMs > 0L && seq + skewMs < appWriteAtMs) return WidgetPushOutcome.OLDER_THAN_APP
    return WidgetPushOutcome.APPLIED
  }
}
