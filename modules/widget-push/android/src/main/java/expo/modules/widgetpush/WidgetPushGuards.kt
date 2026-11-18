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
  WIPED("wipe"),
  ERROR("err"),
}

object WidgetPushGuards {
  /**
   * Message « w0 » (effacement à distance : membre retiré, consentement ou
   * compte supprimé) : appliqué seulement si le widget affiche cet enfant.
   * Jamais refusé au premier plan ni pour une séquence : l'effacement prime.
   */
  fun decideWipe(childId: String?, shownChildId: String?): WidgetPushOutcome {
    if (childId.isNullOrEmpty()) return WidgetPushOutcome.INVALID
    if (shownChildId.isNullOrEmpty() || shownChildId != childId) return WidgetPushOutcome.OTHER_CHILD
    return WidgetPushOutcome.WIPED
  }

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
   * @param clockOffsetMs écart d'horloge téléphone − serveur estimé ([clockOffsetMs]) ; 0 si inconnu
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
    clockOffsetMs: Long = 0L,
    receivedAtMs: Long? = null,
  ): WidgetPushOutcome {
    if (childId.isNullOrEmpty() || seq <= 0L || seq > MAX_SEQ || propsVersion != 1) return WidgetPushOutcome.INVALID
    if (foreground) return WidgetPushOutcome.FOREGROUND
    if (shownChildId.isNullOrEmpty() || shownChildId != childId) return WidgetPushOutcome.OTHER_CHILD
    if (seq <= lastSeq) return WidgetPushOutcome.STALE_SEQ
    // Lecture serveur antérieure à ce que l'app a déjà écrit : ne pas revenir en
    // arrière. Heure serveur ramenée à l'horloge du téléphone (écart estimé) :
    // un téléphone en avance ne refuse plus les messages frais.
    // Seulement dans les 10 min qui suivent l'écriture de l'app (la course à
    // couvrir) : une estimation faussée par un changement d'heure ne bloque
    // jamais le widget durablement. Une écriture « dans le futur » (heure du
    // téléphone reculée depuis) n'est pas récente non plus : sans cela, tous
    // les messages étaient refusés jusqu'à ce que l'horloge la rattrape.
    val sinceAppWrite = if (receivedAtMs == null) 0L else receivedAtMs - appWriteAtMs
    val recentAppWrite = sinceAppWrite >= -skewMs && sinceAppWrite <= APP_GUARD_WINDOW_MS
    if (appWriteAtMs > 0L && recentAppWrite && seq + clockOffsetMs + skewMs < appWriteAtMs) return WidgetPushOutcome.OLDER_THAN_APP
    return WidgetPushOutcome.APPLIED
  }

  /** Séquence plausible (au-delà de l'an 2100 : message invalide, jamais retenu ; pas de débordement). */
  const val MAX_SEQ = 4_102_444_800_000L
  /** La garde « plus ancien que l'app » ne joue que juste après une écriture de l'app. */
  const val APP_GUARD_WINDOW_MS = 10 * 60_000L
  /** Échantillons gardés pour estimer l'écart d'horloge téléphone − serveur. */
  const val OFFSET_SAMPLES = 10
  /** Échantillons plus vieux (heure de réception) : oubliés. */
  const val OFFSET_MAX_AGE_MS = 24 * 3_600_000L

  /** Échantillon : (réception − heure serveur du message, heure de réception). */
  private fun fresh(samples: List<Pair<Long, Long>>, nowMs: Long) =
    samples.filter { (_, at) -> at <= nowMs + 60_000L && nowMs - at <= OFFSET_MAX_AGE_MS }

  /**
   * Écart d'horloge téléphone − serveur : plus petit échantillon des dernières
   * 24 h, sans celui du message en cours. Sans historique : 0 (tolérance fixe
   * seule). Même calcul que services/widgetPushIosState.ts.
   */
  fun clockOffsetMs(samples: List<Pair<Long, Long>>, nowMs: Long): Long =
    fresh(samples, nowMs).minOfOrNull { it.first } ?: 0L

  /** Ajoute l'échantillon d'un message bien formé (10 au plus, dernières 24 h). */
  fun nextOffsetSamples(samples: List<Pair<Long, Long>>, sample: Long, nowMs: Long): List<Pair<Long, Long>> =
    (fresh(samples, nowMs) + (sample to nowMs)).takeLast(OFFSET_SAMPLES)

  /** « échantillon:réception,… » ; entrées illisibles ignorées. */
  fun parseOffsets(raw: String?): List<Pair<Long, Long>> =
    raw.orEmpty().split(',').mapNotNull { e ->
      val parts = e.split(':')
      val x = parts.getOrNull(0)?.toLongOrNull()
      val at = parts.getOrNull(1)?.toLongOrNull()
      if (parts.size == 2 && x != null && at != null) x to at else null
    }

  fun formatOffsets(samples: List<Pair<Long, Long>>): String =
    samples.joinToString(",") { "${it.first}:${it.second}" }
}
