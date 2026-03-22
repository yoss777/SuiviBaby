import { getNeutralColors } from "@/constants/dashboardColors";
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
import React, { memo, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";

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

const StaggeredRow = memo(function StaggeredRow({
  index,
  children,
}: {
  index: number;
  children: React.ReactNode;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 300,
      delay: index * 50,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [12, 0],
            }),
          },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
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
  const borderColor = nc.borderLightAlpha;
  const textColor = nc.textLight;

  const getDisplayLabel = (event: RecentEvent, config: EventConfigItem) => {
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
  };

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
        events.map((event, index) => {
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
          const isSolide = event.type === "solide";
          const details = buildDetails(event);
          const solideTypeLabels: Record<string, string> = {
            puree: "Purée", compote: "Compote", cereales: "Céréales",
            yaourt: "Yaourt", morceaux: "Morceaux", autre: "Autre",
          };
          const solideQtyLabels: Record<string, string> = {
            peu: "Un peu", moyen: "Moyen", beaucoup: "Beaucoup",
          };
          const solideMomentLabel = isSolide && event.momentRepas
            ? MOMENT_REPAS_LABELS[event.momentRepas] ?? null
            : null;
          const solideQtyLabel = isSolide && event.quantite
            ? `Qté : ${solideQtyLabels[event.quantite as string] ?? ""}`
            : null;
          const solideTypeLabel = isSolide && event.typeSolide
            ? solideTypeLabels[event.typeSolide] ?? null
            : null;
          const solideLine1Parts = [solideMomentLabel, solideTypeLabel, solideQtyLabel].filter(Boolean);
          const solideLine2 = solideLine1Parts.length > 0 ? solideLine1Parts.join(" · ") : null;

          const solideDishName = isSolide
            ? event.nomNouvelAliment || event.ingredients || ""
            : "";
          const solideLikeLabel = isSolide
            ? event.aime === undefined
              ? solideDishName || null
              : event.aime
                ? solideDishName
                  ? `A aimé ce plat : ${solideDishName}`
                  : "A aimé ce plat"
                : solideDishName
                  ? `N'a pas aimé ce plat : ${solideDishName}`
                  : "N'a pas aimé ce plat"
            : null;
          const solideLikeColor = isSolide
            ? event.aime === undefined
              ? nc.success
              : event.aime
                ? nc.success
                : nc.error
            : undefined;

          const isOngoingSleep = isSleep && !event.heureFin && event.heureDebut;
          const isOngoingPromenade = event.type === "activite" && event.typeActivite === "promenade" && !event.heureFin && event.heureDebut;
          const isOngoing = isOngoingSleep || isOngoingPromenade;
          const hasStartEnd = (isSleep || (event.type === "activite" && event.typeActivite === "promenade")) && !!event.heureDebut;
          const elapsedMinutes = isOngoing
            ? Math.max(
                0,
                Math.round(
                  (currentTime.getTime() - toDate(event.heureDebut).getTime()) /
                    60000,
                ),
              )
            : 0;

          const currentDayLabel = getDayLabel(date);
          const prevEvent = index > 0 ? events[index - 1] : null;
          const prevDayLabel = prevEvent
            ? getDayLabel(toDate(prevEvent.date))
            : null;
          const showDaySeparator =
            currentDayLabel !== "Aujourd'hui" &&
            (index === 0 || currentDayLabel !== prevDayLabel);

          const displayDetails = isOngoing
            ? details
              ? `${formatDuration(elapsedMinutes)} · ${details}`
              : formatDuration(elapsedMinutes)
            : isSolide
              ? [solideLine2, solideLikeLabel].filter(Boolean).join("\n")
              : details;

          return (
            <React.Fragment key={event.id ?? `${event.type}-${event.date}`}>
              {showDaySeparator && (
                <DaySeparator
                  label={currentDayLabel}
                  borderColor={borderColor}
                  textColor={textColor}
                />
              )}
              <StaggeredRow index={index}>
                <ReanimatedSwipeable
                  containerStyle={styles.swipeableContainer}
                  renderRightActions={
                    onEventDelete && event.id && !event.id?.startsWith?.('__optimistic_')
                      ? () => (
                          <DeleteAction onPress={() => onEventDelete(event)} backgroundColor={nc.error} />
                        )
                      : undefined
                  }
                  friction={2}
                  rightThreshold={40}
                  overshootRight={false}
                  enabled={!!onEventDelete && !!event.id && !event.id?.startsWith?.('__optimistic_')}
                >
                  <View style={[styles.recentRow, event.id?.startsWith?.('__optimistic_') && { opacity: 0.7 }]}>
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
                          index === events.length - 1 && styles.recentLineLast,
                        ]}
                      />
                    </View>
                    <View style={styles.recentTimeLeft}>
                      <TimeDisplay
                        isSleep={isSleep}
                        hasStartEnd={hasStartEnd}
                        hasEndTime={!!event.heureFin}
                        startTime={hasStartEnd && event.heureDebut ? formatTime(toDate(event.heureDebut)) : formatTime(date)}
                        endTime={
                          event.heureFin
                            ? formatTime(toDate(event.heureFin))
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
                      onPress={
                        onEventPress ? () => onEventPress(event) : undefined
                      }
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
                          <Image
                            source={{ uri: event.photos[0] }}
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
                      {isSolide && (solideLine2 || solideLikeLabel) && (
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
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>
                </ReanimatedSwipeable>
              </StaggeredRow>
            </React.Fragment>
          );
        })
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
