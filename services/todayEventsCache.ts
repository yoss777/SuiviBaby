import type { Event, EventType } from "@/services/eventsService";

export type TodayEventsData = {
  tetees: Event[];
  biberons: Event[];
  solides: Event[];
  pompages: Event[];
  croissances: Event[];
  mictions: Event[];
  selles: Event[];
  sommeils: Event[];
  bains: Event[];
  temperatures: Event[];
  medicaments: Event[];
  symptomes: Event[];
  vitamines: Event[];
  vaccins: Event[];
  activites: Event[];
  jalons: Event[];
};

const TODAY_TYPES: EventType[] = [
  "biberon",
  "tetee",
  "solide",
  "pompage",
  "croissance",
  "miction",
  "selle",
  "sommeil",
  "bain",
  "temperature",
  "medicament",
  "symptome",
  "vaccin",
  "vitamine",
  "activite",
  "jalon",
];

type CacheEntry = {
  childId: string;
  dateKey: string;
  data: TodayEventsData;
};

let cache: CacheEntry | null = null;

const getTodayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
};

export const buildTodayEventsData = (events: Event[]): TodayEventsData => {
  const data: TodayEventsData = {
    tetees: [],
    biberons: [],
    solides: [],
    pompages: [],
    croissances: [],
    mictions: [],
    selles: [],
    sommeils: [],
    bains: [],
    temperatures: [],
    medicaments: [],
    symptomes: [],
    vitamines: [],
    vaccins: [],
    activites: [],
    jalons: [],
  };

  events.forEach((event) => {
    switch (event.type) {
      case "tetee":
        data.tetees.push(event);
        break;
      case "biberon":
        data.biberons.push(event);
        break;
      case "solide":
        data.solides.push(event);
        break;
      case "pompage":
        data.pompages.push(event);
        break;
      case "croissance":
        data.croissances.push(event);
        break;
      case "miction":
        data.mictions.push(event);
        break;
      case "selle":
        data.selles.push(event);
        break;
      case "vitamine":
        data.vitamines.push(event);
        break;
      case "vaccin":
        data.vaccins.push(event);
        break;
      case "sommeil":
        data.sommeils.push(event);
        break;
      case "bain":
        data.bains.push(event);
        break;
      case "temperature":
        data.temperatures.push(event);
        break;
      case "medicament":
        data.medicaments.push(event);
        break;
      case "symptome":
        data.symptomes.push(event);
        break;
      case "activite":
        data.activites.push(event);
        break;
      case "jalon":
        data.jalons.push(event);
        break;
      default:
        break;
    }
  });

  return data;
};

export const setTodayEventsCache = (childId: string, data: TodayEventsData) => {
  cache = {
    childId,
    dateKey: getTodayKey(),
    data,
  };
};

export const getTodayEventsCache = (childId: string) => {
  if (!cache) return null;
  if (cache.childId !== childId) return null;
  if (cache.dateKey !== getTodayKey()) return null;
  return cache.data;
};

export const getTodayTypes = () => TODAY_TYPES.slice();
