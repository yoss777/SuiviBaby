// Configuration d'un écran de liste d'événements (repas, pompages, couches).
// Les configs sont des constantes de module : chaque écran ne fournit que ce
// qui lui est propre (lignes, résumé du jour, textes, réglages historiques).
//
// Réglages historiques (différences héritées des anciens écrans, conservées pour
// ne pas changer le comportement). À trancher avec le produit AVANT de migrer
// d'autres écrans ; ne pas ajouter de nouveau drapeau sans cette décision :
// (« Voir plus » saute toujours au prochain événement : [E − 14 j, fin de fenêtre],
//   plus aucun réglage par écran.)
// - jumpToLatestOnMount : fenêtre ancrée au dernier événement (pompages seuls)
//   ou à aujourd'hui (repas, couches) ;
// - filters.resetToTodayOnFocus : retour au filtre « aujourd'hui » (couches seules) ;
// - navigation.backUsesStashedReturn : cible de retour mémorisée (couches seules) ;
// - permissions : les trois écrans sont en "manage" (écritures propriétaire/admin) ;
// - texts.batchDeleteHaptic et texts.modalTone : retour haptique et style de la
//   confirmation de suppression groupée (repas seuls : haptique + style carte) ;
// - layout.paddedFilterRow, calendarButtonInset, growList et skeleton : mise en
//   page propre à chaque écran d'origine.
import type React from "react";

import type { getNeutralColors } from "@/constants/dashboardColors";
import type { EventType } from "@/services/eventsService";
import type { DayFilter, EventGroup } from "@/utils/eventListGrouping";

export type NeutralColors = ReturnType<typeof getNeutralColors>;
export type ColorSchemeName = "light" | "dark";

export type BaseEvent = { id: string; date: unknown; type?: string };

export type RowCtx<T> = {
  item: T;
  /** Ligne en tête du jour (événement le plus récent). */
  isLatest: boolean;
  nc: NeutralColors;
  colorScheme: ColorSchemeName;
};

export type DaySummaryCtx<G> = {
  group: G;
  /** « Aujourd'hui », « Hier » ou « sam. 7 nov. ». */
  dayLabel: string;
  nc: NeutralColors;
  colorScheme: ColorSchemeName;
};

export type EventListKey = "meals" | "pumping" | "diapers";

export interface EventListConfig<T extends BaseEvent, S extends object = object> {
  key: EventListKey;
  /** Un écouteur Firestore par type, dans cet ordre (le premier est le type principal). */
  eventTypes: readonly EventType[];
  /** Normalise le snapshot d'un type (ex. couches : réimpose `type`). */
  normalizeSnapshot?: (events: any[], type: EventType) => T[];
  /** Tri appliqué après fusion avec les saisies optimistes. */
  sortMerged?: (merged: any[]) => T[];
  /** Totaux du jour ajoutés à chaque groupe. */
  summarize?: (items: T[]) => S;

  sheet: {
    formType: EventListKey;
    ownerId: string;
    /** Props propres au formulaire (editData, mealType, diapersType…). */
    buildOpenProps: (args: { editItem?: T; addPreset?: string }) => Record<string, unknown>;
    /** Toast après enregistrement (absent = pas de toast). */
    savedToast?: (isEdit: boolean) => string;
  };
  /** Paramètre `tab` de l'URL → préréglage du formulaire d'ajout. */
  parseTabParam?: (tab?: string) => string | undefined;

  renderRow: (ctx: RowCtx<T>) => React.ReactNode;
  renderDaySummary: (ctx: DaySummaryCtx<EventGroup<T> & S>) => React.ReactNode;

  /** Va chercher le dernier événement au montage (sinon fenêtre se terminant aujourd'hui). */
  jumpToLatestOnMount: boolean;
  filters: {
    /** Au retour sur l'écran, revenir à « aujourd'hui » même depuis « passé ». */
    resetToTodayOnFocus: boolean;
  };
  navigation: {
    /** Le retour utilise aussi la cible mémorisée (returnToRef), pas seulement le paramètre. */
    backUsesStashedReturn: boolean;
  };
  /**
   * "manage" : modifier, sélectionner et supprimer réservés au propriétaire/admin
   * (règles Firestore) ; "all" : sans restriction côté app (plus utilisé).
   */
  permissions: "all" | "manage";

  accent: string;
  /** Couleurs du bouton « N autres… » (texte, chevron). */
  expandColors: (nc: NeutralColors, colorScheme: ColorSchemeName) => { text: string; chevron: string };
  skeleton: "bar" | "icon";
  layout: {
    /** Rangée de filtres en ligne avec marge droite (repas, couches). */
    paddedFilterRow: boolean;
    /** Marge gauche du bouton calendrier dans l'en-tête. */
    calendarButtonInset: boolean;
    /** contentContainerStyle flexGrow: 1 sur la liste. */
    growList: boolean;
  };

  empty: {
    renderIcon: (color: string) => React.ReactNode;
    titleNone: string;
    titleFiltered: string;
    subtitle: string;
    ctaLabel: string;
    ctaA11y: string;
  };
  a11y: {
    row: string;
    deleteAction: string;
    expand: (expanded: boolean, extra: number) => string;
  };
  texts: {
    expandMore: (extra: number) => string;
    deleteTitle: string;
    deleteMessage: string;
    batchDeleteMessage: (count: number) => string;
    deleted: string;
    batchDeleted: (count: number) => string;
    /** Retour haptique (Medium) en ouvrant la confirmation de suppression groupée. */
    batchDeleteHaptic: boolean;
    /** "theme" : fond/texte du thème ; "card" : fond carte + bouton rouge. */
    modalTone: "theme" | "card";
  };
}

export type { DayFilter, EventGroup };
