// Config de l'écran Couches (mictions + selles) : deux écouteurs, ligne avec
// icône/couleur par type et compteurs du jour.
import { space } from "@/constants/tokens";
import FontAwesome from "@expo/vector-icons/FontAwesome5";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type {
  DiapersEditData,
  DiapersType,
  MictionCouleur,
  SelleConsistance,
  SelleQuantite,
} from "@/components/forms/DiapersForm";
import { Colors } from "@/constants/theme";
import { eventColors } from "@/constants/eventColors";
import { getDateTime, toDate } from "@/utils/date";

import { eventListStyles as shared } from "../styles";
import type { EventListConfig } from "../types";

export interface Excretion {
  id: string;
  type?: DiapersType;
  date: { seconds: number };
  createdAt: { seconds: number };
  // Attributs miction
  couleur?: MictionCouleur;
  volume?: number;
  // Attributs selle
  consistance?: SelleConsistance;
  couleurSelle?: string;
  quantite?: SelleQuantite;
}

export type ExcretionSummary = { mictionsCount: number; sellesCount: number };

const accent = eventColors.miction.dark;

function getExcretionTypeLabel(type?: DiapersType): string {
  if (!type) return "Inconnu";
  return type === "miction" ? "Miction" : "Selle";
}

function getExcretionIcon(type?: DiapersType): string {
  if (type === "miction") return "water";
  if (type === "selle") return "poop";
  return "question";
}

function getExcretionColor(type?: DiapersType): string {
  if (type === "miction") return eventColors.miction.dark;
  if (type === "selle") return eventColors.selle.dark;
  return eventColors.default.dark;
}

const COULEUR_LABELS: Record<string, string> = { claire: "Claire", jaune: "Jaune", foncee: "Foncée" };
const CONSISTANCE_LABELS: Record<string, string> = {
  liquide: "Liquide",
  molle: "Molle",
  normale: "Normale",
};
const QUANTITE_LABELS: Record<string, string> = { peu: "Peu", moyen: "Moyen" };

function getDetailsText(excretion: Excretion): string {
  const parts: string[] = [];
  if (excretion.type === "miction" && excretion.couleur) {
    parts.push(COULEUR_LABELS[excretion.couleur] ?? "Autre");
  }
  if (excretion.type === "selle") {
    if (excretion.consistance) parts.push(CONSISTANCE_LABELS[excretion.consistance] ?? "Dure");
    if (excretion.quantite) parts.push(QUANTITE_LABELS[excretion.quantite] ?? "Beaucoup");
  }
  return parts.join(" · ");
}

function buildEditData(excretion: Excretion): DiapersEditData {
  return {
    id: excretion.id,
    type: excretion.type || "miction",
    date: toDate(excretion.date),
    couleur: excretion.couleur,
    consistance: excretion.consistance,
    quantite: excretion.quantite,
  };
}

export const diapersConfig: EventListConfig<Excretion, ExcretionSummary> = {
  key: "diapers",
  eventTypes: ["miction", "selle"],
  // Chaque écouteur réimpose son type sur les documents reçus.
  normalizeSnapshot: (events, type) =>
    events.map((event) => ({ ...event, type: type as DiapersType })),
  sortMerged: (merged) =>
    [...(merged as Excretion[])].sort((a, b) => getDateTime(b.date) - getDateTime(a.date)),
  summarize: (items) => ({
    mictionsCount: items.filter((e) => e.type === "miction").length,
    sellesCount: items.filter((e) => e.type === "selle").length,
  }),

  sheet: {
    formType: "diapers",
    ownerId: "diapers",
    buildOpenProps: ({ editItem, addPreset }) => ({
      diapersType: editItem ? editItem.type || "miction" : ((addPreset as DiapersType) ?? "miction"),
      editData: editItem ? buildEditData(editItem) : undefined,
    }),
    savedToast: (isEdit) => (isEdit ? "Couche modifiée" : "Couche enregistrée"),
  },
  parseTabParam: (tab) => (tab === "selles" ? "selle" : "miction"),

  renderRow: ({ item: excretion, isLatest, nc }) => {
    const color = getExcretionColor(excretion.type);
    const detailsText = getDetailsText(excretion);
    return (
      <>
        {/* Time badge */}
        <View style={shared.sessionTime}>
          <Text
            style={[
              shared.sessionTimeText,
              { color: nc.textLight },
              isLatest && { color: nc.textStrong, fontWeight: "600" },
            ]}
          >
            {toDate(excretion.date).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>

        {/* Content */}
        <View style={styles.sessionContent}>
          <View style={[shared.sessionIconWrapper, { backgroundColor: color + "20" }]}>
            <FontAwesome name={getExcretionIcon(excretion.type)} size={14} color={color} />
          </View>
          <View style={styles.sessionDetails}>
            <Text style={[shared.sessionType, { color: nc.textStrong }]}>
              {getExcretionTypeLabel(excretion.type)}
            </Text>
            {detailsText.length > 0 && (
              <Text style={[styles.sessionDetailText, { color: nc.textLight }]}>{detailsText}</Text>
            )}
          </View>
        </View>
      </>
    );
  },

  renderDaySummary: ({ group, dayLabel, nc }) => {
    const total = group.mictionsCount + group.sellesCount;
    return (
      <>
        {/* Day Header with stats */}
        <View style={shared.dayHeader}>
          <Text style={[shared.dayLabel, { color: nc.textStrong }]}>{dayLabel}</Text>
          <View style={shared.dayStats}>
            <View style={shared.dayStatItem}>
              <Text style={[shared.dayStatValue, { color: nc.textNormal }]}>{total}</Text>
              <Text style={[shared.dayStatLabel, { color: nc.textLight }]}>
                excretion{total > 1 ? "s" : ""}
              </Text>
            </View>
          </View>
        </View>

        {/* Stats breakdown */}
        <View style={styles.statsBreakdown}>
          {group.mictionsCount > 0 && (
            <View style={shared.statsBreakdownItem}>
              <View style={[shared.statsBreakdownDot, { backgroundColor: eventColors.miction.dark }]} />
              <Text style={[shared.statsBreakdownLabel, { color: nc.textLight }]}>
                Miction{group.mictionsCount > 1 ? "s" : ""}
              </Text>
              <Text style={[shared.statsBreakdownValue, { color: nc.textNormal }]}>
                {group.mictionsCount}
              </Text>
            </View>
          )}
          {group.sellesCount > 0 && (
            <View style={shared.statsBreakdownItem}>
              <View style={[shared.statsBreakdownDot, { backgroundColor: eventColors.selle.dark }]} />
              <Text style={[shared.statsBreakdownLabel, { color: nc.textLight }]}>
                Selle{group.sellesCount > 1 ? "s" : ""}
              </Text>
              <Text style={[shared.statsBreakdownValue, { color: nc.textNormal }]}>
                {group.sellesCount}
              </Text>
            </View>
          )}
        </View>
      </>
    );
  },

  jumpToLatestOnMount: false,
  filters: { resetToTodayOnFocus: true },
  navigation: { backUsesStashedReturn: true },
  permissions: "manage",

  accent,
  expandColors: (nc, colorScheme) => ({ text: Colors[colorScheme].tint, chevron: nc.textMuted }),
  skeleton: "icon",
  layout: { paddedFilterRow: true, calendarButtonInset: true, growList: true },

  empty: {
    renderIcon: (color) => <FontAwesome name="tint" size={36} color={color} />,
    titleNone: "Aucune couche enregistrée",
    titleFiltered: "Aucune couche pour ce filtre",
    subtitle: "Suivez les changes de bébé",
    ctaLabel: "Ajouter une couche",
    ctaA11y: "Ajouter une couche",
  },
  a11y: {
    row: "Modifier cette excrétion",
    deleteAction: "Supprimer cette excrétion",
    expand: (expanded) => (expanded ? "Masquer les excrétions" : "Voir toutes les excrétions"),
  },
  texts: {
    expandMore: (extra) => `${extra} autre${extra > 1 ? "s" : ""} excrétion${extra > 1 ? "s" : ""}`,
    batchDeleteMessage: (n) => `Voulez-vous vraiment supprimer ${n} élément${n > 1 ? "s" : ""} ?`,
    deleted: "Couche supprimée",
    batchDeleted: (n) => `${n} élément${n > 1 ? "s" : ""} supprimé${n > 1 ? "s" : ""}`,
    batchDeleteHaptic: false,
    modalTone: "theme",
  },
};

const styles = StyleSheet.create({
  statsBreakdown: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.sm,
    marginBottom: space.sm,
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
  },
  sessionDetailText: {
    fontSize: 12,
    marginTop: 2,
  },
});
