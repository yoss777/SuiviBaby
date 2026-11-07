// Écran Repas : liste générique pilotée par sa config.
import { EventListScreen } from "@/components/eventList/EventListScreen";
import { mealsConfig } from "@/components/eventList/configs/mealsConfig";

export default function MealsScreen() {
  return <EventListScreen config={mealsConfig} />;
}
