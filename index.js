// Point d'entrée de l'app. La tâche d'arrière-plan du widget iPhone est
// déclarée ici, avant tout le reste : quand iOS réveille l'app pour une
// notification silencieuse, elle doit exister dès le chargement du code.
import "./services/widgetPushIos";
import "expo-router/entry";
