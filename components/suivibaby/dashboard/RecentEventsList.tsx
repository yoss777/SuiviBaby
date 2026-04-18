import { getNeutralColors } from "@/constants/dashboardColors";
import { PhotoImage } from "@/components/ui/PhotoImage";
import {
  ACTIVITY_TYPE_LABELS,
  EVENT_CONFIG,
  EventConfigItem,
  JALON_TYPE_LABELS,
  MOMENT_REPAS_LABELS,
} from "@/constants/dashboardConfig";
import { eventColors } from "@/constants/eventColors";
import { Colors } from "@/constants/theme";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import React, { memo, useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { isValidDate } from "@/utils/date";

// ============================================
// TYPES
// ============================================

export interface RecentEvent {
  id?: string;
  type: string;
  date: any;
  isNap?: boolean;
  typeActivite?: string;
  typeJalon?: string;
  titre?: string;
  heureFin?: any;
  heureDebut?: any;
  photos?: string[];
  [key: string]: any;
}

export interface RecentEventsListProps {
  events: RecentEvent[];
  loading: boolean;
  showHint: boolean;
  colorScheme: "light" | "dark";
  currentTime: Date;
  onEventPress?: (event: RecentEvent) => void;
  onEventDelete?: (event: RecentEvent) => void;
  onViewAllPress: () => void;
  toDate: (value: any) => Date;
  formatTime: (date: Date) => string;
  formatDuration: (minutes?: number) => string;
  buildDetails: (event: RecentEvent) => string | undefined;
  getDayLabel: (date: Date) => string;
}

function getEventTimestamp(value: any): number {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getFallbackEventKey(event: RecentEvent): string {
  return [
    event.type,
    event.typeActivite ?? "",
    event.typeJalon ?? "",
    event.titre ?? "",
    getEventTimestamp(event.heureDebut ?? event.date),
  ].join(":");
}

// ============================================
// HELPER COMPONENTS
// ============================================

const EventIcon = memo(function EventIcon({
  config,
  isSleep,
  sleepIconName,
}: {
  config: EventConfigItem;
  isSleep: boolean;
  sleepIconName: string | null;
}) {
  if (isSleep && sleepIconName) {
    return (
      <FontAwesome name={sleepIconName as any} size={12} color={config.color} />
    );
  }

  if (config.icon.lib === "mci") {
    return (
      <MaterialCommunityIcons
        name={config.icon.name as any}
        size={14}
        color={config.color}
      />
    );
  }

  return (
    <FontAwesome
      name={config.icon.name as any}
      size={14}
      color={config.color}
    />
  );
});

const DaySeparator = memo(function DaySeparator({
  label,
  borderColor,
  textColor,
}: {
  label: string;
  borderColor: string;
  textColor: string;
}) {
  return (
    <View style={styles.daySeparator} accessibilityRole="header">
      <View
        style={[styles.daySeparatorLine, { backgroundColor: borderColor }]}
      />
      <Text style={[styles.daySeparatorText, { color: textColor }]}>
        {label}
      </Text>
      <View
        style={[styles.daySeparatorLine, { backgroundColor: borderColor }]}
      />
    </View>
  );
});

const TimeDisplay = memo(function TimeDisplay({
  isSleep,
  hasStartEnd,
  hasEndTime,
  startTime,
  endTime,
  ongoingColor,
  textColor,
}: {
  isSleep: boolean;
  hasStartEnd: boolean;
  hasEndTime: boolean;
  startTime: string;
  endTime?: string;
  ongoingColor?: string;
  textColor: string;
}) {
  // Events with heureDebut/heureFin (sommeil, promenade)
  if (hasStartEnd && hasEndTime && endTime) {
    return (
      <>
        <Text style={[styles.recentTimeText, { color: textColor }]}>
          {startTime}
        </Text>
        <Text style={[styles.recentTimeArrow, { color: textColor }]}>↓</Text>
        <Text style={[styles.recentTimeTextSecondary, { color: textColor }]}>
          {endTime}
        </Text>
      </>
    );
  }

  if (hasStartEnd && !hasEndTime) {
    return (
      <>
        <Text style={[styles.recentTimeText, { color: textColor }]}>
          {startTime}
        </Text>
        <Text style={[styles.recentTimeArrow, { color: textColor }]}>↓</Text>
        <Text
          style={[
            styles.recentTimeOngoing,
            { color: ongoingColor ?? eventColors.sommeil.dark },
          ]}
          accessibilityLiveRegion="polite"
        >
          en cours
        </Text>
      </>
    );
  }

  return (
    <Text style={[styles.recentTimeText, { color: textColor }]}>
      {startTime}
    </Text>
  );
});

// Instant render — no stagger animation
const StaggeredRow = memo(function StaggeredRow({
  children,
}: {
  animate?: boolean;
  delay?: number;
  children: React.ReactNode;
}) {
  return <>{children}</>;
});

const DeleteAction = memo(function DeleteAction({
  onPress,
  backgroundColor,
}: {
  onPress: () => void;
  backgroundColor: string;
}) {
  return (
    <Pressable
      style={[styles.deleteAction, { backgroundColor }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Supprimer cet événement"
    >
      <Ionicons name="trash-outline" size={20} color="white" />
      <Text style={styles.deleteActionText}>Supprimer</Text>
    </Pressable>
  );
});

const EmptyState = memo(function EmptyState({
  titleColor,
  subtitleColor,
}: {
  titleColor: string;
  subtitleColor: string;
}) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyStateEmoji}>{"\uD83C\uDF1F"}</Text>
      <Text style={[styles.emptyStateTitle, { color: titleColor }]}>
        Rien pour l&apos;instant
      </Text>
      <Text style={[styles.emptyStateSubtitle, { color: subtitleColor }]}>
        Appuyez sur + pour enregistrer le premier événement
      </Text>
    </View>
  );
});

// ============================================
// EVENT ROW (memoized to prevent re-render of unchanged items)
// ============================================

interface EventRowProps {
  event: RecentEvent;
  index: number;
  isLast: boolean;
  prevEvent: RecentEvent | null;
  colorScheme: "light" | "dark";
  currentTime: Date;
  animate: boolean;
  onEventPress?: (event: RecentEvent) => void;
  onEventDelete?: (event: RecentEvent) => void;
  toDate: (value: any) => Date;
  formatTime: (date: Date) => string;
  formatDuration: (minutes?: number) => string;
  buildDetails: (event: RecentEvent) => string | undefined;
  getDayLabel: (date: Date) => string;
}

function getDisplayLabel(event: RecentEvent, config: EventConfigItem): string {
  const isSleep = event.type === "sommeil";
  const isActivity = event.type === "activite";
  const isJalon = event.type === "jalon";

  if (isSleep && typeof event.isNap === "boolean") {
    return event.isNap ? "Sieste" : "Nuit de sommeil";
  }
  if (isActivity && event.typeActivite) {
    if (event.typeActivite === "autre") {
      const customLabel =
        typeof event.description === "string"
          ? event.description.trim()
          : typeof event.note === "string"
            ? event.note.trim()
            : "";
      if (customLabel) {
        return `Activité : ${customLabel}`;
      }
    }
    return ACTIVITY_TYPE_LABELS[event.typeActivite] || config.label;
  }
  if (isJalon && event.typeJalon) {
    if (event.typeJalon === "autre") {
      return event.titre || JALON_TYPE_LABELS.autre || config.label;
    }
    return JALON_TYPE_LABELS[event.typeJalon] || config.label;
  }
  return config.label;
}

const SOLIDE_TYPE_LABELS: Record<string, string> = {
  puree: "Purée", compote: "Compote", cereales: "Céréales",
  yaourt: "Yaourt", morceaux: "Morceaux", autre: "Autre",
};
const SOLIDE_QTY_LABELS: Record<string, string> = {
  peu: "Un peu", moyen: "Moyen", beaucoup: "Beaucoup",
};

function getTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const EventRow = memo(function EventRow({
  event,
  index,
  isLast,
  prevEvent,
  colorScheme,
  currentTime,
  animate,
  onEventPress,
  onEventDelete,
  toDate,
  formatTime,
  formatDuration,
  buildDetails,
  getDayLabel,
}: EventRowProps) {
  const nc = getNeutralColors(colorScheme);
  const borderColor = nc.borderLightAlpha;
  const textColor = nc.textLight;

  const config = EVENT_CONFIG[event.type] || {
    label: event.type,
    icon: { lib: "fa6" as const, name: "circle" },
    color: Colors[colorScheme].tint,
  };

  const isSleep = event.type === "sommeil";
  const isJalon = event.type === "jalon";
  const displayLabel = getDisplayLabel(event, config);
  const sleepIconName =
    isSleep && typeof event.isNap === "boolean"
      ? event.isNap
        ? "bed"
        : "moon"
      : null;

  const date = toDate(event.date);
  const startDate = event.heureDebut ? toDate(event.heureDebut) : null;
  const endDate = event.heureFin ? toDate(event.heureFin) : null;
  const hasValidDate = isValidDate(date);
  const hasValidStartDate = isValidDate(startDate);
  const hasValidEndDate = isValidDate(endDate);
  const isSolide = event.type === "solide";
  const details = buildDetails(event);

  const solideMomentLabel = isSolide && event.momentRepas
    ? MOMENT_REPAS_LABELS[event.momentRepas] ?? null
    : null;
  const solideQtyLabel = isSolide && event.quantite
    ? `Qté : ${SOLIDE_QTY_LABELS[event.quantite as string] ?? ""}`
    : null;
  const solideTypeLabel = isSolide && event.typeSolide
    ? SOLIDE_TYPE_LABELS[event.typeSolide] ?? null
    : null;
  const solideLine1Parts = [solideMomentLabel, solideTypeLabel, solideQtyLabel].filter(Boolean);
  const solideLine2 = solideLine1Parts.length > 0 ? solideLine1Parts.join(" · ") : null;

  const solideIngredients = isSolide ? getTrimmedString(event.ingredients) : "";
  const solideNewFood =
    isSolide && event.nouveauAliment
      ? getTrimmedString(event.nomNouvelAliment)
      : "";
  const hasSolideLike = isSolide && typeof event.aime === "boolean";
  const solideIngredientsLabel = solideIngredients
    ? `Ingrédients : ${solideIngredients}`
    : null;
  const solideNewFoodLabel = solideNewFood
    ? `Nouvel aliment : ${solideNewFood}`
    : null;
  const solideLikeTarget = solideIngredients || solideNewFood;
  const solideLikeSubject =
    !solideIngredients && solideNewFood ? "ce nouveau plat" : "ce plat";
  const solideLikeLabel = hasSolideLike
    ? `${event.aime ? "A aimé" : "N'a pas aimé"} ${solideLikeSubject}${
        solideLikeTarget ? ` : ${solideLikeTarget}` : ""
      }`
    : null;
  const solideLikeColor = hasSolideLike
    ? event.aime
      ? nc.success
      : nc.error
    : undefined;
  const visibleSolideIngredientsLabel =
    solideIngredientsLabel &&
    (!hasSolideLike || solideLikeTarget !== solideIngredients)
      ? solideIngredientsLabel
      : null;
  const visibleSolideNewFoodLabel =
    solideNewFoodLabel &&
    (!hasSolideLike || solideLikeTarget !== solideNewFood)
      ? solideNewFoodLabel
      : null;

  const isOngoingSleep = isSleep && !event.heureFin && hasValidStartDate;
  const isOngoingPromenade = event.type === "activite" && event.typeActivite === "promenade" && !event.heureFin && hasValidStartDate;
  const isOngoing = isOngoingSleep || isOngoingPromenade;
  const hasStartEnd = (isSleep || (event.type === "activite" && event.typeActivite === "promenade")) && hasValidStartDate;
  const elapsedMinutes = isOngoing
    ? Math.max(
        0,
        Math.round(
          (currentTime.getTime() - startDate.getTime()) /
            60000,
        ),
      )
    : 0;

  const currentDayLabel = hasValidDate ? getDayLabel(date) : "Date inconnue";
  const prevDayLabel = prevEvent
    ? (() => {
        const prevDate = toDate(prevEvent.date);
        return isValidDate(prevDate) ? getDayLabel(prevDate) : "Date inconnue";
      })()
    : null;
  const showDaySeparator =
    currentDayLabel !== "Aujourd'hui" &&
    (index === 0 || currentDayLabel !== prevDayLabel);

  const displayDetails = isOngoing
    ? details
      ? `${formatDuration(elapsedMinutes)} · ${details}`
      : formatDuration(elapsedMinutes)
    : isSolide
      ? [
          solideLine2,
          solideLikeLabel,
          visibleSolideIngredientsLabel,
          visibleSolideNewFoodLabel,
        ]
          .filter(Boolean)
          .join("\n")
      : details;

  const canDelete = !!onEventDelete && !!event.id && !event.id?.startsWith?.('__optimistic_');

  const handleDelete = useCallback(() => {
    onEventDelete?.(event);
  }, [onEventDelete, event]);

  const handlePress = useCallback(() => {
    onEventPress?.(event);
  }, [onEventPress, event]);

  const renderDeleteAction = useCallback(
    () => <DeleteAction onPress={handleDelete} backgroundColor={nc.error} />,
    [handleDelete, nc.error],
  );

  return (
    <>
      {showDaySeparator && (
        <DaySeparator
          label={currentDayLabel}
          borderColor={borderColor}
          textColor={textColor}
        />
      )}
      <StaggeredRow
        animate={animate}
        delay={animate ? index * 50 : 0}
      >
        <ReanimatedSwipeable
          containerStyle={styles.swipeableContainer}
          renderRightActions={canDelete ? renderDeleteAction : undefined}
          friction={2}
          rightThreshold={40}
          overshootRight={false}
          enabled={canDelete}
        >
          <View style={styles.recentRow}>
            <View style={styles.recentTimelineColumn}>
              <View
                style={[
                  styles.recentDot,
                  { backgroundColor: config.color },
                ]}
              />
              <View
                style={[
                  styles.recentLine,
                  { backgroundColor: borderColor },
                  isLast && styles.recentLineLast,
                ]}
              />
            </View>
            <View style={styles.recentTimeLeft}>
              <TimeDisplay
                isSleep={isSleep}
                hasStartEnd={hasStartEnd}
                hasEndTime={hasValidEndDate}
                startTime={
                  hasValidStartDate
                    ? formatTime(startDate)
                    : hasValidDate
                      ? formatTime(date)
                      : "--:--"
                }
                endTime={
                  hasValidEndDate
                    ? formatTime(endDate)
                    : undefined
                }
                ongoingColor={isOngoingPromenade ? eventColors.activite.dark : eventColors.sommeil.dark}
                textColor={textColor}
              />
            </View>
            <TouchableOpacity
              style={[
                styles.recentCard,
                {
                  borderColor,
                  backgroundColor: nc.backgroundCard,
                },
              ]}
              activeOpacity={0.85}
              onPress={onEventPress ? handlePress : undefined}
              disabled={!onEventPress}
              accessibilityRole="button"
              accessibilityLabel={`${displayLabel}${displayDetails ? `, ${displayDetails}` : ""}`}
              accessibilityHint={
                onEventPress ? "Appuyez pour modifier" : undefined
              }
            >
              <View style={styles.recentTitleRow}>
                <EventIcon
                  config={config}
                  isSleep={isSleep}
                  sleepIconName={sleepIconName}
                />
                <Text
                  style={[
                    styles.recentTitle,
                    { color: nc.textStrong },
                  ]}
                >
                  {displayLabel}
                </Text>
                {isJalon && event.photos?.[0] && (
                  <PhotoImage
                    photoRef={event.photos[0]}
                    style={[
                      styles.recentThumb,
                      { backgroundColor: nc.backgroundPressed },
                    ]}
                    accessibilityLabel="Photo de l'événement"
                  />
                )}
              </View>
              {!isSolide && displayDetails && (
                <Text
                  style={[styles.recentDetails, { color: textColor }]}
                  accessibilityLiveRegion={
                    isOngoingSleep ? "polite" : "none"
                  }
                >
                  {displayDetails}
                </Text>
              )}
              {isSolide &&
                (solideLine2 ||
                  visibleSolideIngredientsLabel ||
                  visibleSolideNewFoodLabel ||
                  solideLikeLabel) && (
                <View style={styles.solideDetails}>
                  {solideLine2 && (
                    <Text
                      style={[
                        styles.solideDetailsText,
                        { color: textColor },
                      ]}
                    >
                      {solideLine2}
                    </Text>
                  )}
                  {solideLikeLabel && (
                    <Text
                      style={[
                        styles.solideDetailsText,
                        { color: solideLikeColor ?? textColor },
                      ]}
                    >
                      {solideLikeLabel}
                    </Text>
                  )}
                  {visibleSolideIngredientsLabel && (
                    <Text
                      style={[
                        styles.solideDetailsText,
                        { color: textColor },
                      ]}
                    >
                      {visibleSolideIngredientsLabel}
                    </Text>
                  )}
                  {visibleSolideNewFoodLabel && (
                    <Text
                      style={[
                        styles.solideDetailsText,
                        { color: textColor },
                      ]}
                    >
                      {visibleSolideNewFoodLabel}
                    </Text>
                  )}
                </View>
              )}
            </TouchableOpacity>
          </View>
        </ReanimatedSwipeable>
      </StaggeredRow>
    </>
  );
});

// ============================================
// MAIN COMPONENT
// ============================================

function RecentEventsListComponent({
  events,
  loading,
  showHint,
  colorScheme,
  currentTime,
  onEventPress,
  onEventDelete,
  onViewAllPress,
  toDate,
  formatTime,
  formatDuration,
  buildDetails,
  getDayLabel,
}: RecentEventsListProps) {
  const nc = getNeutralColors(colorScheme);
  const hasPlayedEntranceRef = useRef(false);

  const shouldAnimateRows = !loading && !hasPlayedEntranceRef.current;

  useEffect(() => {
    if (!loading && events.length > 0 && !hasPlayedEntranceRef.current) {
      hasPlayedEntranceRef.current = true;
    }
  }, [events.length, loading]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeaderRow}>
        <Text
          style={[
            styles.sectionTitle,
            styles.sectionTitleInline,
            { color: nc.textStrong },
          ]}
        >
          Évènements récents
        </Text>
        <TouchableOpacity
          onPress={onViewAllPress}
          activeOpacity={0.8}
          accessibilityRole="link"
          accessibilityLabel="Voir tous les événements"
        >
          <Text
            style={[styles.sectionLink, { color: Colors[colorScheme].tint }]}
          >
            Voir tout
          </Text>
        </TouchableOpacity>
      </View>

      {showHint && events.length > 0 && (
        <Text style={[styles.recentHint, { color: nc.textMuted }]}>
          Appuyez sur un événement pour le modifier
        </Text>
      )}

      {loading ? (
        <View style={styles.recentLoading}>
          <ActivityIndicator size="small" color={Colors[colorScheme].tint} />
          <Text style={[styles.recentLoadingText, { color: nc.textLight }]}>
            Chargement...
          </Text>
        </View>
      ) : events.length === 0 ? (
        <EmptyState titleColor={nc.textStrong} subtitleColor={nc.textMuted} />
      ) : (
        events.map((event, index) => (
          <EventRow
            key={event.id ?? getFallbackEventKey(event)}
            event={event}
            index={index}
            isLast={index === events.length - 1}
            prevEvent={index > 0 ? events[index - 1] : null}
            colorScheme={colorScheme}
            currentTime={currentTime}
            animate={shouldAnimateRows}
            onEventPress={onEventPress}
            onEventDelete={onEventDelete}
            toDate={toDate}
            formatTime={formatTime}
            formatDuration={formatDuration}
            buildDetails={buildDetails}
            getDayLabel={getDayLabel}
          />
        ))
      )}
    </View>
  );
}

export const RecentEventsList = memo(RecentEventsListComponent);

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  section: {
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
  },
  sectionTitleInline: {
    marginHorizontal: 0,
    marginBottom: 0,
  },
  sectionLink: {
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  recentLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
  },
  recentLoadingText: {
    fontSize: 13,
  },
  recentHint: {
    marginTop: -2,
    marginBottom: 8,
    marginHorizontal: 20,
    fontSize: 12,
    fontWeight: "500",
  },
  swipeableContainer: {
    marginHorizontal: 20,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 14,
  },
  recentTimelineColumn: {
    width: 20,
    alignItems: "center",
  },
  recentDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 6,
  },
  recentLine: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  recentLineLast: {
    backgroundColor: "transparent",
  },
  recentTimeLeft: {
    width: 42,
    marginTop: 6,
  },
  recentTimeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  recentTimeArrow: {
    fontSize: 10,
    lineHeight: 10,
    fontWeight: "600",
  },
  recentTimeTextSecondary: {
    fontSize: 11,
    fontWeight: "600",
  },
  recentTimeOngoing: {
    fontSize: 10,
    fontWeight: "700",
  },
  recentCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  recentTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  recentTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  recentThumb: {
    width: 34,
    height: 34,
    borderRadius: 8,
    marginLeft: "auto",
  },
  recentDetails: {
    marginTop: 6,
    fontSize: 12,
  },
  solideDetails: {
    marginTop: 6,
  },
  solideDetailsText: {
    fontSize: 12,
  },
  daySeparator: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 20,
    marginBottom: 14,
    gap: 12,
  },
  daySeparatorLine: {
    flex: 1,
    height: 1,
  },
  daySeparatorText: {
    fontSize: 13,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 32,
    paddingHorizontal: 40,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  emptyStateEmoji: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptyStateSubtitle: {
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },
  deleteAction: {
    justifyContent: "center",
    alignItems: "center",
    width: 80,
    marginBottom: 15,
    borderRadius: 14,
    marginHorizontal: 4,
    marginVertical: 1,
    gap: 4,
  },
  deleteActionText: {
    color: "white",
    fontSize: 11,
    fontWeight: "700",
  },
});
