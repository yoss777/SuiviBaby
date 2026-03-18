// types/content.ts
// Types for the Smart Content System

import type { Timestamp } from "firebase/firestore";
import type { AgeTier } from "@/utils/ageUtils";
import type { EventType } from "@/services/eventsService";

// ============================================
// TIP CATEGORIES
// ============================================

export type TipCategory =
  | "alimentation"
  | "sommeil"
  | "sante"
  | "developpement"
  | "bien_etre";

export const TIP_CATEGORY_LABELS: Record<TipCategory, string> = {
  alimentation: "Alimentation",
  sommeil: "Sommeil",
  sante: "Santé",
  developpement: "Développement",
  bien_etre: "Bien-être",
};

export const TIP_CATEGORY_ICONS: Record<TipCategory, string> = {
  alimentation: "utensils",
  sommeil: "bed",
  sante: "heart-pulse",
  developpement: "seedling",
  bien_etre: "spa",
};

export const TIP_CATEGORY_COLORS: Record<TipCategory, string> = {
  alimentation: "#E89A5A",
  sommeil: "#7C6BA4",
  sante: "#E07E7E",
  developpement: "#7EE0A8",
  bien_etre: "#5B9BD5",
};

// ============================================
// TIP TRIGGER CONDITIONS
// ============================================

export type TipTriggerType =
  | "event_absence" // No event of this type in X hours
  | "event_frequency" // Frequency drop/increase
  | "event_anomaly" // Quality/value anomaly
  | "time_of_day" // Morning, afternoon, evening, night
  | "age_range" // Baby is in specific age range
  | "first_event"; // First time this event type is recorded

export interface TipTrigger {
  type: TipTriggerType;
  eventType?: EventType;
  condition: string;
  params?: Record<string, number | string>;
}

// ============================================
// TIP (editorial content)
// ============================================

export interface Tip {
  id: string;
  title: string;
  summary: string;
  body: string; // Markdown content
  category: TipCategory;
  subcategory?: string;
  ageMinMonths: number;
  ageMaxMonths: number;
  ageTiers?: AgeTier[];
  icon: string;
  accentColor: string;
  source?: string;
  sourceUrl?: string;
  priority: number; // 1=highest, 5=lowest
  tags: string[];
  triggerConditions?: TipTrigger[];
  readTimeMinutes: number;
  publishedAt: Timestamp | Date;
  active: boolean;
}

// ============================================
// MILESTONE REFERENCE (expected milestones by age)
// ============================================

export type MilestoneCategory =
  | "moteur"
  | "cognitif"
  | "social"
  | "langage"
  | "sensoriel";

export const MILESTONE_CATEGORY_LABELS: Record<MilestoneCategory, string> = {
  moteur: "Motricité",
  cognitif: "Cognitif",
  social: "Social",
  langage: "Langage",
  sensoriel: "Sensoriel",
};

export const MILESTONE_CATEGORY_ICONS: Record<MilestoneCategory, string> = {
  moteur: "person-running",
  cognitif: "brain",
  social: "face-smile",
  langage: "comments",
  sensoriel: "hand",
};

export const MILESTONE_CATEGORY_COLORS: Record<MilestoneCategory, string> = {
  moteur: "#4CAF50",
  cognitif: "#FF9800",
  social: "#E91E63",
  langage: "#2196F3",
  sensoriel: "#9C27B0",
};

export interface MilestoneRef {
  id: string;
  title: string;
  description: string;
  category: MilestoneCategory;
  ageMinWeeks: number;
  ageMaxWeeks: number;
  ageTypicalWeeks: number;
  icon: string;
  tips: string; // Advice to stimulate this milestone
  source: string;
  relatedJalonType?: string; // Link to existing JalonType
  order: number;
}

// ============================================
// USER CONTENT STATE
// ============================================

export type TipFrequency = "daily" | "few_per_week" | "weekly";

export interface UserContent {
  dismissedTips: string[];
  bookmarks: string[];
  seenChangelog: string[];
  lastTipShownAt?: Timestamp | Date;
  tipFrequency: TipFrequency;
  preferredCategories: TipCategory[];
  tipFeedback?: Record<string, "up" | "down">; // tipId → thumbs up/down
}

export const DEFAULT_USER_CONTENT: UserContent = {
  dismissedTips: [],
  bookmarks: [],
  seenChangelog: [],
  tipFrequency: "daily",
  preferredCategories: [
    "alimentation",
    "sommeil",
    "sante",
    "developpement",
    "bien_etre",
  ],
};

// ============================================
// INSIGHT (data-driven, generated client-side)
// ============================================

export type InsightType = "positive" | "warning" | "info" | "milestone";

export interface Insight {
  id: string;
  type: InsightType;
  icon: string;
  title: string;
  message: string;
  accentColor: string;
  relatedTipId?: string;
  priority: number;
  category: TipCategory;
}

// ============================================
// CHANGELOG
// ============================================

export interface ChangelogEntry {
  version: string;
  date: string; // ISO date
  title: string;
  features: { icon: string; text: string }[];
}
