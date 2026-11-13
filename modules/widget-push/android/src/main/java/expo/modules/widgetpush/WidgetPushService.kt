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
    val consumed = runCatching {
      WidgetPushHandler.handle(applicationContext, remoteMessage.data, System.currentTimeMillis())
    }.getOrElse { error ->
      Log.w("WidgetPush", "message du widget non appliqué", error)
      // Un message du widget mal formé ne doit jamais devenir une notification.
      remoteMessage.data["body"]?.contains("\"t\":\"w1\"") == true
    }
    if (!consumed) super.onMessageReceived(remoteMessage)
  }
}
