package expo.modules.widgetpush

import android.app.ActivityManager
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Process
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject

/**
 * Applique un message « w1 » : écrit les données du widget (même stockage
 * qu'expo-widgets) et demande son redessin, sans démarrer React Native.
 */
object WidgetPushHandler {
  private const val TAG = "WidgetPush"
  const val WIDGET_NAME = "BebeMaintenant"
  const val PREFS = "expo.modules.widgets"
  const val PROPS_KEY = "__expo_widgets_${WIDGET_NAME}_props"
  const val SEQ_KEY = "__sb_widget_seq"
  const val CHILD_KEY = "__sb_widget_child"
  const val APP_AT_KEY = "__sb_widget_app_at"
  const val OFFSETS_KEY = "__sb_widget_clock_offsets"
  const val LOG_KEY = "__sb_widget_push_log"
  private const val LOG_MAX = 20

  /** Types de messages du widget : « w1 » (données), « w0 » (effacement). */
  private val TYPES = setOf("w1", "w0")

  /** Le message est-il destiné au widget ? (sans dépendre d'un JSON valide) */
  fun isWidgetMessage(data: Map<String, String>): Boolean {
    if (data["t"] in TYPES) return true
    val body = data["body"] ?: return false
    return runCatching { JSONObject(body).optString("t") in TYPES }
      .getOrElse { Regex("\"t\"\\s*:\\s*\"w[01]\"").containsMatchIn(body) }
  }

  /** Message du widget, ou null : `body` JSON (Expo Push), sinon données à plat. */
  fun parse(data: Map<String, String>): JSONObject? {
    val body = data["body"]?.let { runCatching { JSONObject(it) }.getOrNull() }
    val msg = body ?: if (data["t"] != null) JSONObject().apply {
      data.forEach { (k, v) -> put(k, v) }
    } else null
    return msg?.takeIf { it.optString("t") in TYPES }
  }

  /** Données du widget dans le message (objet, ou chaîne JSON à plat). */
  fun props(msg: JSONObject): JSONObject? =
    msg.optJSONObject("p") ?: msg.optString("p").takeIf { it.isNotEmpty() }?.let { runCatching { JSONObject(it) }.getOrNull() }

  /** @return true si le message était destiné au widget (appliqué ou écarté). */
  @Synchronized
  fun handle(context: Context, data: Map<String, String>, receivedAtMs: Long): Boolean {
    val msg = parse(data) ?: return false
    val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val childId = msg.optString("c").ifEmpty { null }
    val seq = msg.optLong("s", 0L)
    val p = props(msg)
    if (msg.optString("t") == "w0") {
      // Effacement : données vides à la place, enfant oublié (plus rien ne
      // s'applique pour lui avant la prochaine écriture de l'app).
      var outcome = WidgetPushGuards.decideWipe(childId, prefs.getString(CHILD_KEY, null))
      if (outcome == WidgetPushOutcome.WIPED) {
        // Données jointes seulement si bien formées et pour cet enfant (ou
        // vides) : le widget lit `alerts`, `lives`… sans garde.
        val wipeProps = p?.takeIf { it.optInt("v", 0) == 1 && it.optString("childId").let { c -> c.isEmpty() || c == childId } && it.has("lives") && it.has("alerts") }
        val written = prefs.edit()
          .putString(PROPS_KEY, (wipeProps ?: emptyProps(receivedAtMs)).toString())
          .remove(CHILD_KEY)
          .remove(SEQ_KEY)
          .commit()
        // Disque plein ou erreur d'E/S : jamais annoncé comme effacé.
        if (written) requestRedraw(context) else outcome = WidgetPushOutcome.ERROR
      }
      appendLog(prefs, receivedAtMs, seq, outcome)
      Log.i(TAG, "w0 -> ${outcome.code}")
      return true
    }
    // Données d'un autre enfant que celui annoncé (ou d'enfant inconnu) : jamais écrites.
    val propsChild = p?.optString("childId")?.ifEmpty { null }
    if (p != null && propsChild != childId) {
      appendLog(prefs, receivedAtMs, seq, WidgetPushOutcome.INVALID)
      Log.i(TAG, "w1 s=$seq -> ${WidgetPushOutcome.INVALID.code} (child)")
      return true
    }
    // Écart d'horloge téléphone − serveur estimé sur les messages des dernières 24 h.
    val samples = WidgetPushGuards.parseOffsets(prefs.getString(OFFSETS_KEY, null))
    val clockOffset = WidgetPushGuards.clockOffsetMs(samples, receivedAtMs)
    val outcome = WidgetPushGuards.decide(
      childId = childId,
      seq = seq,
      propsVersion = p?.optInt("v", 0) ?: 0,
      shownChildId = prefs.getString(CHILD_KEY, null),
      lastSeq = prefs.getLong(SEQ_KEY, 0L),
      appWriteAtMs = prefs.getLong(APP_AT_KEY, 0L),
      foreground = isForeground(context),
      clockOffsetMs = clockOffset,
      receivedAtMs = receivedAtMs,
    )
    // Échantillon d'horloge des seuls messages bien formés (appliqués ou non).
    if (outcome != WidgetPushOutcome.INVALID && p != null) {
      prefs.edit()
        .putString(OFFSETS_KEY, WidgetPushGuards.formatOffsets(WidgetPushGuards.nextOffsetSamples(samples, receivedAtMs - seq, receivedAtMs)))
        .apply()
    }
    var finalOutcome = outcome
    if (outcome == WidgetPushOutcome.APPLIED && p != null) {
      val written = prefs.edit()
        .putString(PROPS_KEY, p.toString())
        .putLong(SEQ_KEY, seq)
        .putString(CHILD_KEY, childId)
        .commit()
      if (written) requestRedraw(context) else finalOutcome = WidgetPushOutcome.ERROR
    }
    appendLog(prefs, receivedAtMs, seq, finalOutcome)
    Log.i(TAG, "w1 s=$seq -> ${finalOutcome.code}")
    return true
  }

  private fun isForeground(context: Context): Boolean {
    val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return false
    val pid = Process.myPid()
    // VISIBLE aussi : écran partagé ou fenêtre, les écouteurs de l'app tournent.
    return am.runningAppProcesses?.any {
      it.pid == pid && it.importance <= ActivityManager.RunningAppProcessInfo.IMPORTANCE_VISIBLE
    } == true
  }

  private fun requestRedraw(context: Context) {
    val component = ComponentName(context.packageName, "${context.packageName}.${WIDGET_NAME}Provider")
    val ids = AppWidgetManager.getInstance(context).getAppWidgetIds(component)
    if (ids.isEmpty()) return
    context.sendBroadcast(
      Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
        .setComponent(component)
        .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
    )
  }

  /** Échec de traitement d'un message du widget : visible dans le journal de réception. */
  @Synchronized
  fun logError(context: Context, receivedAtMs: Long) {
    val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    appendLog(prefs, receivedAtMs, 0L, WidgetPushOutcome.ERROR)
  }

  /** Journal circulaire (mesure de latence, E6) : aucune donnée personnelle. */
  /**
   * Données vides mais valides (le widget lit `alerts`, `lives`, `recent` sans
   * garde) : repli si un « w0 » arrivait sans données. Même forme que
   * EMPTY_NOW_WIDGET (functions/shared/widget).
   */
  private fun emptyProps(nowMs: Long): JSONObject = JSONObject()
    .put("v", 1)
    .put("childName", "")
    .put("lives", JSONArray())
    .put("recent", JSONArray())
    .put("alerts", JSONObject())
    .put("canWrite", true)
    .put("isPremium", false)
    .put("dayStartMs", 0)
    .put("generatedAtMs", nowMs)

  private fun appendLog(prefs: android.content.SharedPreferences, receivedAtMs: Long, seq: Long, outcome: WidgetPushOutcome) {
    val log = runCatching { JSONArray(prefs.getString(LOG_KEY, "[]")) }.getOrElse {
      // Journal illisible : on repart de zéro, mais pas sans trace.
      Log.w(TAG, "receive log unreadable, reset (${it.javaClass.simpleName})")
      JSONArray()
    }
    log.put(JSONObject().put("r", receivedAtMs).put("s", seq).put("o", outcome.code))
    while (log.length() > LOG_MAX) log.remove(0)
    prefs.edit().putString(LOG_KEY, log.toString()).apply()
  }
}
