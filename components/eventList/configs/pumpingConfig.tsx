// Config de l'écran Pompages (tire-lait) : ligne gauche/droite en ml et
// résumé du jour.
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import type { PumpingEditData } from "@/components/forms/PumpingForm";
import { neutralColors } from "@/constants/dashboardColors";
import { eventColors } from "@/constants/eventColors";
import { toDate } from "@/utils/date";

import { eventListStyles as shared } from "../styles";
import type { EventListConfig } from "../types";

export interface Pompage {
  id: string;
  type?: string;
  quantiteGauche: number;
  quantiteDroite: number;
  date: { seconds: number };
  createdAt: { seconds: number };
}

export type PompageSummary = {
  totalQuantityLeft: number;
  totalQuantityRight: number;
  totalQuantity: number;
};

const accent = eventColors.pumping.dark;

function buildEditData(pompage: Pompage): PumpingEditData {
  return {
    id: pompage.id,
    date: toDate(pompage.date),
    quantiteGauche: pompage.quantiteGauche,
    quantiteDroite: pompage.quantiteDroite,
  };
}

export const pumpingConfig: EventListConfig<Pompage, PompageSummary> = {
  key: "pumping",
  eventTypes: ["pompage"],
  summarize: (pompages) => {
    const totalQuantityLeft = pompages.reduce((sum, p) => sum + (p.quantiteGauche || 0), 0);
    const totalQuantityRight = pompages.reduce((sum, p) => sum + (p.quantiteDroite || 0), 0);
    return {
      totalQuantityLeft,
      totalQuantityRight,
      totalQuantity: totalQuantityLeft + totalQuantityRight,
    };
  },

  sheet: {
    formType: "pumping",
    ownerId: "pumping",
    buildOpenProps: ({ editItem }) => ({
      editData: editItem ? buildEditData(editItem) : undefined,
    }),
    savedToast: (isEdit) => (isEdit ? "Pompage modifié" : "Pompage enregistré"),
  },

  renderRow: ({ item: pompage, isLatest, nc }) => {
    const totalQty = (pompage.quantiteGauche || 0) + (pompage.quantiteDroite || 0);
    const pompageTime = toDate(pompage.date);
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
            {pompageTime.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>

        {/* Quantities visualization */}
        <View style={styles.sessionContent}>
          {/* Visual bar */}
          <View style={styles.quantityBar}>
            <View style={[styles.quantityBarLeft, { flex: pompage.quantiteGauche || 1 }]} />
            <View style={[styles.quantityBarRight, { flex: pompage.quantiteDroite || 1 }]} />
          </View>

          {/* Labels */}
          <View style={styles.quantityLabels}>
            <View style={styles.quantityLabelItem}>
              <View style={[styles.quantityDot, styles.quantityDotLeft]} />
              <Text style={[styles.quantityLabelValue, { color: nc.textNormal }]}>
                {pompage.quantiteGauche} ml
              </Text>
            </View>
            <View style={styles.quantityLabelItem}>
              <View style={[styles.quantityDot, styles.quantityDotRight]} />
              <Text style={[styles.quantityLabelValue, { color: nc.textNormal }]}>
                {pompage.quantiteDroite} ml
              </Text>
            </View>
          </View>
        </View>

        {/* Total */}
        <View style={shared.sessionTotal}>
          <Text style={[shared.sessionTotalValue, { color: accent }]}>{totalQty}</Text>
          <Text style={[shared.sessionTotalUnit, { color: nc.textLight }]}>ml</Text>
        </View>
      </>
    );
  },

  renderDaySummary: ({ group, dayLabel, nc }) => (
    <>
      {/* Day Header with stats */}
      <View style={shared.dayHeader}>
        <Text style={[shared.dayLabel, { color: nc.textStrong }]}>{dayLabel}</Text>
        <View style={shared.dayStats}>
          <View style={shared.dayStatItem}>
            <Text style={[shared.dayStatValue, { color: nc.textNormal }]}>{group.items.length}</Text>
            <Text style={[shared.dayStatLabel, { color: nc.textLight }]}>
              session{group.items.length > 1 ? "s" : ""}
            </Text>
          </View>
          <View style={[styles.dayStatDivider, { backgroundColor: nc.border }]} />
          <View style={shared.dayStatItem}>
            <Text style={[shared.dayStatValue, { color: accent }]}>{group.totalQuantity}</Text>
            <Text style={[shared.dayStatLabel, { color: nc.textLight }]}>ml total</Text>
          </View>
        </View>
      </View>

      {/* Stats breakdown */}
      <View style={styles.statsBreakdown}>
        <View style={shared.statsBreakdownItem}>
          <View style={[shared.statsBreakdownDot, { backgroundColor: nc.success }]} />
          <Text style={[shared.statsBreakdownLabel, { color: nc.textLight }]}>Gauche</Text>
          <Text style={[shared.statsBreakdownValue, { color: nc.textNormal }]}>
            {group.totalQuantityLeft} ml
          </Text>
        </View>
        <View style={shared.statsBreakdownItem}>
          <View style={[shared.statsBreakdownDot, { backgroundColor: nc.todayAccent }]} />
          <Text style={[shared.statsBreakdownLabel, { color: nc.textLight }]}>Droite</Text>
          <Text style={[shared.statsBreakdownValue, { color: nc.textNormal }]}>
            {group.totalQuantityRight} ml
          </Text>
        </View>
      </View>
    </>
  ),

  jumpToLatestOnMount: true,
  loadMore: { jumpOnManual: true, jumpWindow: "extend" },
  filters: { resetToTodayOnFocus: false },
  navigation: { backUsesStashedReturn: false },
  permissions: "manage",

  accent,
  expandColors: () => ({ text: accent, chevron: accent }),
  skeleton: "bar",
  layout: { paddedFilterRow: false, calendarButtonInset: false, growList: true },

  empty: {
    renderIcon: (color) => <Ionicons name="water-outline" size={36} color={color} />,
    titleNone: "Aucune session enregistrée",
    titleFiltered: "Aucune session pour ce filtre",
    subtitle: "Suivez vos sessions de tire-lait",
    ctaLabel: "Ajouter une session",
    ctaA11y: "Ajouter une session de pompage",
  },
  a11y: {
    row: "Modifier ce pompage",
    deleteAction: "Supprimer ce pompage",
    expand: (expanded) => (expanded ? "Masquer les sessions" : "Voir toutes les sessions"),
  },
  texts: {
    expandMore: (extra) => `${extra} autre${extra > 1 ? "s" : ""} session${extra > 1 ? "s" : ""}`,
    deleteTitle: "Suppression",
    deleteMessage: "Voulez-vous vraiment supprimer ce pompage ?",
    batchDeleteMessage: (n) => `Voulez-vous vraiment supprimer ${n} élément${n > 1 ? "s" : ""} ?`,
    deleted: "Pompage supprimé",
    batchDeleted: (n) => `${n} élément${n > 1 ? "s" : ""} supprimé${n > 1 ? "s" : ""}`,
    batchDeleteHaptic: false,
    modalTone: "theme",
  },
};

const styles = StyleSheet.create({
  dayStatDivider: {
    width: 1,
    height: 24,
  },
  statsBreakdown: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sessionContent: {
    flex: 1,
    gap: 6,
  },
  quantityBar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  quantityBarLeft: {
    backgroundColor: neutralColors.success,
  },
  quantityBarRight: {
    backgroundColor: neutralColors.todayAccent,
  },
  quantityLabels: {
    flexDirection: "row",
    gap: 16,
  },
  quantityLabelItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  quantityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  quantityDotLeft: {
    backgroundColor: neutralColors.success,
  },
  quantityDotRight: {
    backgroundColor: neutralColors.todayAccent,
  },
  quantityLabelValue: {
    fontSize: 12,
    fontWeight: "600",
  },
});
