package expo.modules.widgetpush

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Côté app : ce que le récepteur doit savoir de l'écriture faite par l'app. */
class WidgetPushModule : Module() {
  private val prefs
    get() = requireNotNull(appContext.reactContext).getSharedPreferences(WidgetPushHandler.PREFS, Context.MODE_PRIVATE)

  override fun definition() = ModuleDefinition {
    Name("WidgetPush")

    // Appelé à chaque écriture du widget par l'app : enfant affiché et heure.
    Function("noteAppSnapshot") { childId: String ->
      prefs.edit()
        .putString(WidgetPushHandler.CHILD_KEY, childId)
        .putLong(WidgetPushHandler.APP_AT_KEY, System.currentTimeMillis())
        .apply()
    }

    // Déconnexion : le récepteur oublie l'enfant, la séquence et l'heure de
    // l'app ; il n'appliquera plus rien avant la prochaine écriture de l'app.
    Function("clear") {
      prefs.edit()
        .remove(WidgetPushHandler.CHILD_KEY)
        .remove(WidgetPushHandler.SEQ_KEY)
        .remove(WidgetPushHandler.APP_AT_KEY)
        .apply()
    }

    // Journal de réception (mesure E6) : [{ r, s, o }], sans donnée personnelle.
    Function("readReceiveLog") {
      prefs.getString(WidgetPushHandler.LOG_KEY, "[]") ?: "[]"
    }
  }
}
