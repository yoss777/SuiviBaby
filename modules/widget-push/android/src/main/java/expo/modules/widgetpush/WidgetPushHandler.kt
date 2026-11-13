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
  const val LOG_KEY = "__sb_widget_push_log"
  private const val LOG_MAX = 20

  /** Le message est-il destiné au widget ? (sans dépendre d'un JSON valide) */
  fun isWidgetMessage(data: Map<String, String>): Boolean {
    if (data["t"] == "w1") return true
    val body = data["body"] ?: return false
    return runCatching { JSONObject(body).optString("t") == "w1" }
      .getOrElse { Regex("\"t\"\\s*:\\s*\"w1\"").containsMatchIn(body) }
  }

  /** Message du widget, ou null : `body` JSON (Expo Push), sinon données à plat. */
  fun parse(data: Map<String, String>): JSONObject? {
    val body = data["body"]?.let { runCatching { JSONObject(it) }.getOrNull() }
    val msg = body ?: if (data["t"] != null) JSONObject().apply {
      data.forEach { (k, v) -> put(k, v) }
    } else null
    return msg?.takeIf { it.optString("t") == "w1" }
  }

  /** Données du widget dans le message (objet, ou chaîne JSON à plat). */
  fun props(msg: JSONObject): JSONObject? =
    msg.optJSONObject("p") ?: msg.optString("p").takeIf { it.isNotEmpty() }?.let { runCatching { JSONObject(it) }.getOrNull() }

  /** @return true si le message était destiné au widget (appliqué ou écarté). */
  fun handle(context: Context, data: Map<String, String>, receivedAtMs: Long): Boolean {
    val msg = parse(data) ?: return false
    val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val childId = msg.optString("c").ifEmpty { null }
    val seq = msg.optLong("s", 0L)
    val p = props(msg)
    val outcome = WidgetPushGuards.decide(
      childId = childId,
      seq = seq,
      propsVersion = p?.optInt("v", 0) ?: 0,
      shownChildId = prefs.getString(CHILD_KEY, null),
      lastSeq = prefs.getLong(SEQ_KEY, 0L),
      appWriteAtMs = prefs.getLong(APP_AT_KEY, 0L),
      foreground = isForeground(context),
    )
    if (outcome == WidgetPushOutcome.APPLIED && p != null) {
      if (!p.has("childId")) p.put("childId", childId)
      prefs.edit()
        .putString(PROPS_KEY, p.toString())
        .putLong(SEQ_KEY, seq)
        .putString(CHILD_KEY, childId)
        .commit()
      requestRedraw(context)
    }
    appendLog(prefs, receivedAtMs, seq, outcome)
    Log.i(TAG, "w1 s=$seq -> ${outcome.code}")
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
  fun logError(context: Context, receivedAtMs: Long) {
    val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    appendLog(prefs, receivedAtMs, 0L, WidgetPushOutcome.ERROR)
  }

  /** Journal circulaire (mesure de latence, E6) : aucune donnée personnelle. */
  private fun appendLog(prefs: android.content.SharedPreferences, receivedAtMs: Long, seq: Long, outcome: WidgetPushOutcome) {
    val log = runCatching { JSONArray(prefs.getString(LOG_KEY, "[]")) }.getOrDefault(JSONArray())
    log.put(JSONObject().put("r", receivedAtMs).put("s", seq).put("o", outcome.code))
    while (log.length() > LOG_MAX) log.remove(0)
    prefs.edit().putString(LOG_KEY, log.toString()).apply()
  }
}
