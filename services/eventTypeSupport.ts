import type { EventType } from "./eventsService";

// Modern product surfaces treat diaper tracking through `miction` and `selle`.
// The legacy `couche` event is still supported by backend/storage flows but is
// not considered a first-class event in the current UI contract.
export const LEGACY_BACKEND_EVENT_TYPES: EventType[] = ["couche"];

export const MODERN_UI_EVENT_TYPES: EventType[] = [
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

export const MODERN_UI_DIAPER_EVENT_TYPES: EventType[] = ["miction", "selle"];

// Some compatibility flows still need to consider the full diaper domain,
// including the legacy backend-only `couche` event.
export const DIAPER_DOMAIN_EVENT_TYPES: EventType[] = [
  ...MODERN_UI_DIAPER_EVENT_TYPES,
  ...LEGACY_BACKEND_EVENT_TYPES,
];
