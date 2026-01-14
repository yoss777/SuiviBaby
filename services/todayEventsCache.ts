import type { Event, EventType } from "@/services/eventsService";

export type TodayEventsData = {
  tetees: Event[];
  biberons: Event[];
  pompages: Event[];
  mictions: Event[];
  selles: Event[];
  vitamines: Event[];
  vaccins: Event[];
};

const TODAY_TYPES: EventType[] = [
  "biberon",
  "tetee",
  "pompage",
  "miction",
  "selle",
  "vaccin",
  "vitamine",
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
    pompages: [],
    mictions: [],
    selles: [],
    vitamines: [],
    vaccins: [],
  };

  events.forEach((event) => {
    switch (event.type) {
      case "tetee":
        data.tetees.push(event);
        break;
      case "biberon":
        data.biberons.push(event);
        break;
      case "pompage":
        data.pompages.push(event);
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
