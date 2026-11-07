// Écran Couches : liste générique pilotée par sa config.
import { EventListScreen } from "@/components/eventList/EventListScreen";
import { diapersConfig } from "@/components/eventList/configs/diapersConfig";

export default function DiapersScreen() {
  return <EventListScreen config={diapersConfig} />;
}
