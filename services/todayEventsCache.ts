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
  nettoyagesNez: Event[];
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
  "nettoyage_nez",
];

type CacheEntry = {
  dateKey: string;
  data: TodayEventsData;
};

// R8: Multi-child cache — supports switching between children without re-fetch
const cacheMap = new Map<string, CacheEntry>();

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
    nettoyagesNez: [],
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
      case "nettoyage_nez":
        data.nettoyagesNez.push(event);
        break;
      default:
        break;
    }
  });

  return data;
};

export const setTodayEventsCache = (childId: string, data: TodayEventsData) => {
  cacheMap.set(childId, {
    dateKey: getTodayKey(),
    data,
  });
};

export const getTodayEventsCache = (childId: string) => {
  const entry = cacheMap.get(childId);
  if (!entry) return null;
  if (entry.dateKey !== getTodayKey()) {
    cacheMap.delete(childId);
    return null;
  }
  return entry.data;
};

export const clearTodayEventsCache = () => {
  cacheMap.clear();
};

export const getTodayTypes = () => TODAY_TYPES.slice();
