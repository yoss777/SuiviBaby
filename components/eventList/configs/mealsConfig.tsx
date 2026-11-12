// Config de l'écran Repas (tétées, biberons, solides) : trois écouteurs,
// suppression réservée aux propriétaires/admins, « Voir plus » par pas de
// 14 jours.
import { space } from "@/constants/tokens";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { MealType } from "@/components/forms/MealsForm";
import {
  BIBERON_TYPE_LABELS,
  MOMENT_REPAS_LABELS,
  SOLIDE_TYPE_LABELS,
} from "@/constants/dashboardConfig";
import { itemColors } from "@/constants/dashboardColors";
import { eventColors } from "@/constants/eventColors";
import type { BiberonEvent, SolideEvent } from "@/services/eventsService";
import { getDateTime, toDate } from "@/utils/date";

import { eventListStyles as shared } from "../styles";
import type { EventListConfig, NeutralColors } from "../types";

export interface Meal {
  id: string;
  type?: MealType;
  quantite?: number | null;
  coteGauche?: boolean;
  coteDroit?: boolean;
  dureeGauche?: number;
  dureeDroite?: number;
  date: { seconds: number };
  createdAt: { seconds: number };
  // Champs spécifiques aux biberons
  typeBiberon?: BiberonEvent["typeBiberon"];
  // Champs spécifiques aux solides
  typeSolide?: SolideEvent["typeSolide"];
  momentRepas?: SolideEvent["momentRepas"];
  ingredients?: string;
  nouveauAliment?: boolean;
  nomNouvelAliment?: string;
  allergenes?: string[];
  reaction?: SolideEvent["reaction"];
  aime?: boolean;
}

export type MealSummary = { totalQuantity: number };

const accent = eventColors.meal.dark;

// Helper pour construire editData depuis un Meal
export function buildMealEditData(meal: Meal) {
  return {
    id: meal.id,
    type: meal.type || ("tetee" as MealType),
    date: toDate(meal.date),
    dureeGauche: meal.dureeGauche,
    dureeDroite: meal.dureeDroite,
    quantite: typeof meal.quantite === "number" ? meal.quantite : undefined,
    typeBiberon: meal.typeBiberon,
    typeSolide: meal.typeSolide,
    momentRepas: meal.momentRepas,
    ingredients: meal.ingredients,
    quantiteSolide: meal.quantite as SolideEvent["quantite"],
    nouveauAliment: meal.nouveauAliment,
    nomNouvelAliment: meal.nomNouvelAliment,
    allergenes: meal.allergenes,
    reaction: meal.reaction,
    aime: meal.aime,
  };
}

function MealIcon({ meal }: { meal: Meal }) {
  if (meal.type === "tetee") {
    return <FontAwesome name="person-breastfeeding" size={14} color={eventColors.meal.dark} />;
  }
  if (meal.type === "biberon") {
    return <MaterialCommunityIcons name="baby-bottle" size={16} color={eventColors.meal.dark} />;
  }
  return <FontAwesome name="bowl-food" size={14} color={itemColors.solide} />;
}

function getTypeLabel(meal: Meal): string {
  if (meal.type === "tetee") return "Tétée";
  if (meal.type === "biberon") return "Biberon";
  if (meal.type === "solide" && meal.typeSolide) {
    return SOLIDE_TYPE_LABELS[meal.typeSolide] || "Solide";
  }
  return "Solide";
}

function SolideDetails({ meal, nc }: { meal: Meal; nc: NeutralColors }) {
  const ingredients = typeof meal.ingredients === "string" ? meal.ingredients.trim() : "";
  const newFood =
    meal.nouveauAliment && typeof meal.nomNouvelAliment === "string"
      ? meal.nomNouvelAliment.trim()
      : "";
  const hasLike = typeof meal.aime === "boolean";
  const likeTarget = ingredients || newFood;
  const likeSubject = !ingredients && newFood ? "ce nouveau plat" : "ce plat";

  return (
    <View style={styles.solideDetailsRow}>
      {meal.momentRepas && (
        <Text style={[styles.sessionDetailText, { color: nc.textLight }]}>
          {MOMENT_REPAS_LABELS[meal.momentRepas]}
          {" · "}
          {(meal as any).quantiteSolide ?? meal.quantite ?? ""}
        </Text>
      )}
      {(ingredients || newFood || hasLike) && (
        <View style={styles.solideTags}>
          {hasLike && (
            <Text
              style={[styles.sessionDetailText, { color: meal.aime ? nc.successText : nc.errorText }]}
            >
              {`${meal.aime ? "A aimé" : "N'a pas aimé"} ${likeSubject}${
                likeTarget ? ` : ${likeTarget}` : ""
              }`}
            </Text>
          )}
          {ingredients && (!hasLike || likeTarget !== ingredients) && (
            <Text style={[styles.sessionDetailText, { color: nc.textLight }]}>
              Ingrédients : {ingredients}
            </Text>
          )}
          {newFood && (!hasLike || likeTarget !== newFood) && (
            <Text style={[styles.sessionDetailText, { color: nc.textLight }]}>
              Nouvel aliment : {newFood}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function BreastDetails({ meal, nc }: { meal: Meal; nc: NeutralColors }) {
  const leftDuration = meal.dureeGauche ?? 0;
  const rightDuration = meal.dureeDroite ?? 0;
  if (leftDuration <= 0 && rightDuration <= 0) {
    return (
      <Text style={[styles.sessionDetailText, { color: nc.textLight }]}>
        {meal.coteGauche && meal.coteDroit
          ? "Sein gauche · Sein droit"
          : meal.coteGauche
            ? "Sein gauche"
            : meal.coteDroit
              ? "Sein droit"
              : "Durée non renseignée"}
      </Text>
    );
  }
  return (
    <>
      <View style={styles.durationBar}>
        <View style={{ flex: leftDuration || 1, backgroundColor: nc.success }} />
        <View style={{ flex: rightDuration || 1, backgroundColor: nc.todayAccent }} />
      </View>
      <View style={styles.durationLabels}>
        <View style={styles.durationLabelItem}>
          <View style={[styles.durationDot, { backgroundColor: nc.success }]} />
          <Text style={[styles.durationLabelText, { color: nc.textLight }]}>G</Text>
          <Text style={[styles.durationLabelValue, { color: nc.textNormal }]}>{leftDuration} min</Text>
        </View>
        <View style={styles.durationLabelItem}>
          <View style={[styles.durationDot, { backgroundColor: nc.todayAccent }]} />
          <Text style={[styles.durationLabelText, { color: nc.textLight }]}>D</Text>
          <Text style={[styles.durationLabelValue, { color: nc.textNormal }]}>{rightDuration} min</Text>
        </View>
      </View>
    </>
  );
}

export const mealsConfig: EventListConfig<Meal, MealSummary> = {
  key: "meals",
  eventTypes: ["tetee", "biberon", "solide"],
  sortMerged: (merged) =>
    [...(merged as Meal[])].sort((a, b) => getDateTime(b.date) - getDateTime(a.date)),
  summarize: (meals) => ({
    totalQuantity: meals.reduce((sum, meal) => {
      const q = meal.quantite;
      return sum + (typeof q === "number" ? q : 0);
    }, 0),
  }),

  sheet: {
    formType: "meals",
    ownerId: "meals",
    buildOpenProps: ({ editItem, addPreset }) => ({
      mealType: editItem?.type || ((addPreset as MealType | undefined) ?? "tetee"),
      editData: editItem ? buildMealEditData(editItem) : undefined,
    }),
  },
  parseTabParam: (tab) => (tab === "seins" ? "tetee" : tab === "biberons" ? "biberon" : "tetee"),

  renderRow: ({ item: meal, isLatest, nc }) => {
    const isTetee = meal.type === "tetee";
    const isSolide = meal.type === "solide";
    const totalDuration = (meal.dureeGauche ?? 0) + (meal.dureeDroite ?? 0);
    const hasDuration = (meal.dureeGauche ?? 0) > 0 || (meal.dureeDroite ?? 0) > 0;

    return (
      <>
        {/* Time badge */}
        <View style={shared.sessionTime}>
          <Text
            style={[
              shared.sessionTimeText,
              { color: nc.textLight },
              isLatest && { color: nc.textNormal, fontWeight: "600" },
            ]}
          >
            {toDate(meal.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>

        {/* Content */}
        <View style={styles.sessionContent}>
          <View
            style={[
              shared.sessionIconWrapper,
              { backgroundColor: isSolide ? `${itemColors.solide}1A` : `${eventColors.meal.dark}1A` },
            ]}
          >
            <MealIcon meal={meal} />
          </View>
          <View style={styles.sessionDetails}>
            <Text style={[shared.sessionType, { color: nc.textStrong }]}>{getTypeLabel(meal)}</Text>
            {isTetee && <BreastDetails meal={meal} nc={nc} />}
            {meal.type === "biberon" && (
              <Text style={[styles.sessionDetailText, { color: nc.textLight }]}>
                {meal.typeBiberon && BIBERON_TYPE_LABELS[meal.typeBiberon]
                  ? BIBERON_TYPE_LABELS[meal.typeBiberon]
                  : "lait infantile"}
                {meal.quantite ? ` · ${meal.quantite} ml` : ""}
              </Text>
            )}
            {isSolide && <SolideDetails meal={meal} nc={nc} />}
          </View>
        </View>

        {isTetee && hasDuration && (
          <View style={shared.sessionTotal}>
            <Text style={[shared.sessionTotalValue, { color: accent }]}>{totalDuration}</Text>
            <Text style={[shared.sessionTotalUnit, { color: nc.textLight }]}>min</Text>
          </View>
        )}
      </>
    );
  },

  renderDaySummary: ({ group, dayLabel, nc }) => {
    const teteesCount = group.items.filter((m) => m.type === "tetee").length;
    const biberonsCount = group.items.filter((m) => m.type === "biberon").length;
    const solidesCount = group.items.filter((m) => m.type === "solide").length;
    return (
      <>
        {/* Day Header with stats */}
        <View style={shared.dayHeader}>
          <Text style={[shared.dayLabel, { color: nc.textStrong }]}>{dayLabel}</Text>
          <View style={shared.dayStats}>
            <View style={shared.dayStatItem}>
              <Text style={[shared.dayStatValue, { color: nc.textStrong }]}>{group.items.length}</Text>
              <Text style={[shared.dayStatLabel, { color: nc.textLight }]}>repas</Text>
            </View>
          </View>
        </View>

        {/* Stats breakdown */}
        <View style={styles.statsBreakdown}>
          {teteesCount > 0 && (
            <View style={shared.statsBreakdownItem}>
              <View style={[shared.statsBreakdownDot, { backgroundColor: eventColors.meal.dark }]} />
              <Text style={[shared.statsBreakdownLabel, { color: nc.textLight }]}>
                Tétée{teteesCount > 1 ? "s" : ""}
              </Text>
              <Text style={[shared.statsBreakdownValue, { color: nc.textNormal }]}>{teteesCount}</Text>
            </View>
          )}
          {biberonsCount > 0 && (
            <View style={shared.statsBreakdownItem}>
              <View style={[shared.statsBreakdownDot, { backgroundColor: nc.todayAccent }]} />
              <Text style={[shared.statsBreakdownLabel, { color: nc.textLight }]}>
                Biberon{biberonsCount > 1 ? "s" : ""}
              </Text>
              <Text style={[shared.statsBreakdownValue, { color: nc.textNormal }]}>{biberonsCount}</Text>
              <Text style={[shared.statsBreakdownLabel, { color: nc.textLight }]}>·</Text>
              <Text
                style={[shared.statsBreakdownLabel, { color: eventColors.meal.dark, fontWeight: "600" }]}
              >
                {group.totalQuantity} ml
              </Text>
            </View>
          )}
          {solidesCount > 0 && (
            <View style={shared.statsBreakdownItem}>
              <View style={[shared.statsBreakdownDot, { backgroundColor: itemColors.solide }]} />
              <Text style={[shared.statsBreakdownLabel, { color: nc.textLight }]}>
                Solide{solidesCount > 1 ? "s" : ""}
              </Text>
              <Text style={[shared.statsBreakdownValue, { color: nc.textNormal }]}>{solidesCount}</Text>
            </View>
          )}
        </View>
      </>
    );
  },

  jumpToLatestOnMount: false,
  filters: { resetToTodayOnFocus: false },
  navigation: { backUsesStashedReturn: false },
  permissions: "manage",

  accent,
  expandColors: () => ({ text: accent, chevron: accent }),
  skeleton: "icon",
  layout: { paddedFilterRow: true, calendarButtonInset: true, growList: false },

  empty: {
    renderIcon: (color) => <Ionicons name="restaurant-outline" size={36} color={color} />,
    titleNone: "Aucun repas enregistré",
    titleFiltered: "Aucun repas pour ce filtre",
    subtitle: "Suivez les repas et biberons",
    ctaLabel: "Ajouter un repas",
    ctaA11y: "Ajouter un repas",
  },
  a11y: {
    row: "Modifier ce repas",
    deleteAction: "Supprimer ce repas",
    expand: (expanded, extra) =>
      expanded ? "Masquer les repas" : `Voir ${extra} autre${extra > 1 ? "s" : ""} repas`,
  },
  texts: {
    expandMore: (extra) => `${extra} autre${extra > 1 ? "s" : ""} repas`,
    batchDeleteMessage: (n) => `Supprimer ${n} repas sélectionné${n > 1 ? "s" : ""} ?`,
    deleted: "Repas supprimé",
    batchDeleted: (n) => `${n} repas supprimé${n > 1 ? "s" : ""}`,
    batchDeleteHaptic: true,
    modalTone: "card",
  },
};

const styles = StyleSheet.create({
  statsBreakdown: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
    marginBottom: 10,
    paddingHorizontal: space.xxs,
  },
  sessionContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sessionDetails: {
    flex: 1,
    gap: 2,
  },
  sessionDetailText: {
    fontSize: 12,
  },
  durationBar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  durationLabels: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  durationLabelItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xxs,
  },
  durationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  durationLabelText: {
    fontSize: 12,
    fontWeight: "500",
  },
  durationLabelValue: {
    fontSize: 12,
    fontWeight: "600",
  },
  // Solide list item
  solideDetailsRow: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 2,
  },
  solideTags: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
});
