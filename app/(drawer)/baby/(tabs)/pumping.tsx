// Écran Pompages : liste générique pilotée par sa config.
import { EventListScreen } from "@/components/eventList/EventListScreen";
import { pumpingConfig } from "@/components/eventList/configs/pumpingConfig";

export default function PumpingScreen() {
  return <EventListScreen config={pumpingConfig} />;
}
