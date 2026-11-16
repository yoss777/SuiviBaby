import ExpoModulesCore
import WidgetKit

/// iPhone : nombre de widgets SuiviBaby posés (écran d'accueil et écran
/// verrouillé). Le serveur n'envoie les données du widget qu'aux appareils
/// qui en ont un (minimisation des données de santé). Le reste du « widget
/// temps réel » iPhone est en JS (services/widgetPushIos.ts).
public class WidgetPushModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WidgetPush")

    AsyncFunction("installedWidgetCount") { (promise: Promise) in
      WidgetCenter.shared.getCurrentConfigurations { result in
        switch result {
        case .success(let infos):
          promise.resolve(infos.count)
        case .failure(let error):
          promise.reject("E_WIDGET_CONFIGURATIONS", error.localizedDescription)
        }
      }
    }
  }
}
