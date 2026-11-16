package expo.modules.widgetpush

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import expo.modules.kotlin.functions.Queues
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

    // Après une action lancée depuis un bouton du widget : l'app repasse en
    // arrière-plan, le parent retombe sur l'écran d'accueil (vrai si fait).
    AsyncFunction("moveTaskToBack") {
      appContext.currentActivity?.moveTaskToBack(true) ?: false
    }.runOnQueue(Queues.MAIN)

    // Nombre de widgets SuiviBaby posés : le serveur n'envoie les données du
    // widget qu'aux appareils qui en ont un (minimisation des données de santé).
    Function("installedWidgetCount") {
      val ctx = appContext.reactContext ?: return@Function 0
      val component = ComponentName(ctx.packageName, "${ctx.packageName}.${WidgetPushHandler.WIDGET_NAME}Provider")
      AppWidgetManager.getInstance(ctx).getAppWidgetIds(component).size
    }

    // Journal de réception (mesure E6) : [{ r, s, o }], sans donnée personnelle.
    Function("readReceiveLog") {
      prefs.getString(WidgetPushHandler.LOG_KEY, "[]") ?: "[]"
    }
  }
}
