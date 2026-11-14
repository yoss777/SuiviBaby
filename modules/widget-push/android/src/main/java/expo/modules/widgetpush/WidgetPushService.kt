package expo.modules.widgetpush

import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

/**
 * Reçoit tous les messages FCM de l'app. Les messages du widget (« w1 ») sont
 * appliqués ici, en quelques millisecondes ; tous les autres (rappels,
 * notifications) passent au service d'expo-notifications, comme avant.
 */
class WidgetPushService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    // Reconnu d'abord : un message du widget, même mal formé, ne doit jamais
    // repartir vers Expo (notification ou événement JS).
    if (!WidgetPushHandler.isWidgetMessage(remoteMessage.data)) {
      super.onMessageReceived(remoteMessage)
      return
    }
    runCatching {
      WidgetPushHandler.handle(applicationContext, remoteMessage.data, System.currentTimeMillis())
    }.onFailure { error ->
      Log.w("WidgetPush", "message du widget non appliqué", error)
      runCatching { WidgetPushHandler.logError(applicationContext, System.currentTimeMillis()) }
    }
  }
}
