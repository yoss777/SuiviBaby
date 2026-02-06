import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as FileSystem from "expo-file-system";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { InfoModal } from "@/components/ui/InfoModal";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import type { Child } from "@/contexts/BabyContext";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { db } from "@/config/firebase";
import { Event, EventType } from "@/services/eventsService";
import { obtenirPreferences } from "@/services/userPreferencesService";
import type { ChildRole } from "@/types/permissions";
import type { EventComment, EventLike } from "@/types/social";

interface ExportFormat {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  extension: string;
}

interface ExportChild {
  child: Child;
  events: Event[];
  likes: EventLike[];
  comments: EventComment[];
  role: ChildRole | null;
  selected: boolean;
}

interface ExportSummaryRow {
  type: EventType | InteractionType;
  label: string;
  selected: number;
  total: number;
}

interface ExportSummary {
  childName: string;
  rows: ExportSummaryRow[];
}

type InteractionType = "likes" | "comments";

type ExportTypeItem = {
  id: EventType | InteractionType;
  label: string;
  icon: {
    lib: "FontAwesome" | "MaterialCommunityIcons" | "Ionicons";
    name: string;
  };
};

const BASE_EVENT_TYPES: ExportTypeItem[] = [
  { id: "biberon", label: "Biberon", icon: { lib: "MaterialCommunityIcons", name: "baby-bottle" } },
  { id: "tetee", label: "Tetee", icon: { lib: "FontAwesome", name: "person-breastfeeding" } },
  { id: "pompage", label: "Pompage", icon: { lib: "FontAwesome", name: "pump-medical" } },
  { id: "couche", label: "Couche", icon: { lib: "MaterialCommunityIcons", name: "human-baby-changing-table" } },
  { id: "miction", label: "Miction", icon: { lib: "FontAwesome", name: "water" } },
  { id: "selle", label: "Selle", icon: { lib: "FontAwesome", name: "poop" } },
  { id: "sommeil", label: "Sommeil", icon: { lib: "FontAwesome", name: "moon" } },
  { id: "vaccin", label: "Vaccin", icon: { lib: "FontAwesome", name: "syringe" } },
  { id: "vitamine", label: "Vitamine", icon: { lib: "FontAwesome", name: "pills" } },
];

const EXTRA_EVENT_TYPES: ExportTypeItem[] = [
  { id: "solide", label: "Solide", icon: { lib: "FontAwesome", name: "utensils" } },
  { id: "bain", label: "Bain", icon: { lib: "MaterialCommunityIcons", name: "bathtub" } },
  { id: "temperature", label: "Temperature", icon: { lib: "MaterialCommunityIcons", name: "thermometer" } },
  { id: "medicament", label: "Medicament", icon: { lib: "MaterialCommunityIcons", name: "pill" } },
  { id: "symptome", label: "Symptome", icon: { lib: "MaterialCommunityIcons", name: "alert-circle-outline" } },
  { id: "croissance", label: "Croissance", icon: { lib: "MaterialCommunityIcons", name: "chart-line" } },
  { id: "activite", label: "Activite", icon: { lib: "MaterialCommunityIcons", name: "run-fast" } },
  { id: "jalon", label: "Jalon", icon: { lib: "MaterialCommunityIcons", name: "star-outline" } },
];

const INTERACTION_TYPES: ExportTypeItem[] = [
  { id: "likes", label: "Likes", icon: { lib: "Ionicons", name: "heart" } },
  { id: "comments", label: "Commentaires", icon: { lib: "Ionicons", name: "chatbubble" } },
];

const ALL_EVENT_TYPE_IDS = new Set<EventType>(
  [...BASE_EVENT_TYPES, ...EXTRA_EVENT_TYPES].map((item) => item.id as EventType)
);

const getEventTypes = (hideExtra: boolean) => [
  ...BASE_EVENT_TYPES,
  ...(hideExtra ? [] : EXTRA_EVENT_TYPES),
];

export default function ExportScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const { userName, email, user } = useAuth();
  const { afterDelete } = useLocalSearchParams();
  const router = useRouter();
  const isAutoDeleteFlow = afterDelete === "1";
  const { children: visibleChildren, loading: childrenLoading } = useBaby();
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [children, setChildren] = useState<ExportChild[]>([]);
  const [isContributorOnly, setIsContributorOnly] = useState(false);
  const eventTypes = useMemo(
    () => getEventTypes(isContributorOnly),
    [isContributorOnly]
  );
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<EventType>>(
    () => new Set(getEventTypes(false).map((item) => item.id as EventType))
  );
  const [selectedInteractionTypes, setSelectedInteractionTypes] = useState<
    Set<InteractionType>
  >(() => new Set(INTERACTION_TYPES.map((item) => item.id as InteractionType)));
  const [modalConfig, setModalConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    mode: "text" | "summary";
    confirmText?: string;
    onConfirm?: () => void;
  }>({
    visible: false,
    title: "",
    message: "",
    mode: "text",
  });
  const [exportSummary, setExportSummary] = useState<ExportSummary[]>([]);
  const [summaryIndex, setSummaryIndex] = useState(0);
  const summaryScrollRef = useRef<ScrollView | null>(null);
  const autoExportTriggered = useRef(false);
  const [preferences, setPreferences] = useState<{
    notifications?: any;
    theme?: string;
    language?: string;
  }>({});

  const exportFormats: ExportFormat[] = [
    {
      id: "json",
      name: "JSON",
      description: "Format structure pour une sauvegarde complete",
      icon: "code-slash",
      extension: ".json",
    },
  ];

  useEffect(() => {
    let isMounted = true;
    const loadExportData = async () => {
      if (childrenLoading) {
        if (isMounted) setIsLoading(true);
        return;
      }
      try {
        const [prefs, childrenWithEvents] = await Promise.all([
          obtenirPreferences().catch(() => null),
          Promise.all(
            visibleChildren.map(async (child) => {
              const [eventsSnapshot, likesSnapshot, commentsSnapshot, accessDoc] = await Promise.all([
                user?.uid
                  ? getDocs(
                      query(
                        collection(db, "events"),
                        where("childId", "==", child.id),
                        where("userId", "==", user.uid),
                        limit(10000)
                      )
                    )
                  : Promise.resolve({ docs: [] } as any),
                user?.uid
                  ? getDocs(
                      query(
                        collection(db, "eventLikes"),
                        where("childId", "==", child.id),
                        where("userId", "==", user.uid),
                        limit(10000)
                      )
                    )
                  : Promise.resolve({ docs: [] } as any),
                user?.uid
                  ? getDocs(
                      query(
                        collection(db, "eventComments"),
                        where("childId", "==", child.id),
                        where("userId", "==", user.uid),
                        limit(10000)
                      )
                    )
                  : Promise.resolve({ docs: [] } as any),
                user?.uid
                  ? getDoc(doc(db, "children", child.id, "access", user.uid))
                  : Promise.resolve(null),
              ]);

              const events = eventsSnapshot.docs.map(
                (d) => ({ id: d.id, ...d.data() }) as Event
              );

              const role = accessDoc && accessDoc.exists()
                ? ((accessDoc.data()?.role ?? null) as ChildRole | null)
                : null;

              return {
                child,
                events,
                likes: likesSnapshot.docs.map(
                  (d) => ({ id: d.id, ...d.data() }) as EventLike
                ),
                comments: commentsSnapshot.docs.map(
                  (d) => ({ id: d.id, ...d.data() }) as EventComment
                ),
                role,
                selected: true,
              };
            })
          ),
        ]);

        if (prefs) {
          setPreferences({
            notifications: prefs.notifications,
            theme: prefs.theme,
            language: prefs.language,
          });
        }

        if (isMounted) {
          const roles = childrenWithEvents.map((item) => item.role).filter(Boolean);
          const hasElevatedRole = roles.some(
            (role) => role === "owner" || role === "admin"
          );
          const hasContributorRole = roles.some((role) => role === "contributor");
          const contributorOnly =
            !hasElevatedRole && (hasContributorRole || roles.length === 0);

          setIsContributorOnly(contributorOnly);
          setChildren((prev) => {
            const selectionMap = new Map(
              prev.map((item) => [item.child.id, item.selected])
            );
            return childrenWithEvents.map((item) => ({
              ...item,
              selected: isAutoDeleteFlow ? true : selectionMap.get(item.child.id) ?? true,
            }));
          });

          if (isAutoDeleteFlow) {
            setSelectedEventTypes(
              contributorOnly
                ? new Set()
                : new Set(getEventTypes(contributorOnly).map((item) => item.id as EventType))
            );
            setSelectedInteractionTypes(
              new Set(INTERACTION_TYPES.map((item) => item.id as InteractionType))
            );
          }
        }
      } catch (error) {
        if (isMounted) {
          setModalConfig({
            visible: true,
            title: "Erreur",
            message: "Impossible de charger les donnees à exporter.",
            mode: "text",
          });
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadExportData();
    return () => {
      isMounted = false;
    };
  }, [childrenLoading, visibleChildren, isAutoDeleteFlow, user?.uid]);

  useEffect(() => {
    if (isContributorOnly) {
      setSelectedEventTypes(new Set());
      return;
    }
    setSelectedEventTypes(new Set(eventTypes.map((item) => item.id as EventType)));
  }, [eventTypes, isContributorOnly]);

  const closeModal = () => {
    setModalConfig((prev) => ({
      ...prev,
      visible: false,
      mode: "text",
      message: "",
      confirmText: undefined,
      onConfirm: undefined,
    }));
  };

  const serializeValue = (value: any): any => {
    if (value === null || value === undefined) return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === "object") {
      if (typeof value.toDate === "function") {
        return value.toDate().toISOString();
      }
      if (Array.isArray(value)) {
        return value.map(serializeValue);
      }
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, serializeValue(item)])
      );
    }
    return value;
  };

  const selectedChildren = useMemo(
    () => children.filter((item) => item.selected),
    [children]
  );

  const selectedEventsCount = useMemo(
    () => selectedChildren.reduce((sum, item) => sum + item.events.length, 0),
    [selectedChildren]
  );

  const selectedInteractionsCount = useMemo(
    () =>
      selectedChildren.reduce(
        (sum, item) => sum + item.likes.length + item.comments.length,
        0
      ),
    [selectedChildren]
  );

  const selectedCanExportEvents = useMemo(
    () =>
      selectedChildren.some(
        (child) =>
          child.role === "owner" ||
          child.role === "admin" ||
          child.events.length > 0
      ),
    [selectedChildren]
  );

  const selectedEventTypesArray = useMemo(
    () => Array.from(selectedEventTypes),
    [selectedEventTypes]
  );
  const selectedInteractionTypesArray = useMemo(
    () => Array.from(selectedInteractionTypes),
    [selectedInteractionTypes]
  );

  useEffect(() => {
    if (!isAutoDeleteFlow) return;
    if (autoExportTriggered.current) return;
    if (childrenLoading || isLoading || isExporting) return;
    autoExportTriggered.current = true;
    handleExport(true);
  }, [isAutoDeleteFlow, childrenLoading, isLoading, isExporting]);

  useEffect(() => {
    if (!selectedCanExportEvents) {
      setSelectedEventTypes(new Set());
    }
  }, [selectedCanExportEvents]);

  const toggleChild = (childId: string) => {
    setChildren((prev) =>
      prev.map((item) =>
        item.child.id === childId ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const toggleEventType = (type: EventType) => {
    if (!selectedCanExportEvents) return;
    setSelectedEventTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleAllEventTypes = () => {
    if (!selectedCanExportEvents) return;
    setSelectedEventTypes((prev) => {
      if (prev.size === eventTypes.length) {
        return new Set();
      }
      return new Set(eventTypes.map((item) => item.id as EventType));
    });
  };

  const toggleInteractionType = (type: InteractionType) => {
    setSelectedInteractionTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleAllInteractionTypes = () => {
    setSelectedInteractionTypes((prev) => {
      if (prev.size === INTERACTION_TYPES.length) {
        return new Set();
      }
      return new Set(INTERACTION_TYPES.map((item) => item.id as InteractionType));
    });
  };

  const toggleAllChildren = () => {
    setChildren((prev) => {
      const hasUnselected = prev.some((item) => !item.selected);
      return prev.map((item) => ({ ...item, selected: hasUnselected }));
    });
  };

  const getCounts = (item: ExportChild) => {
    const counts: Record<EventType | InteractionType, number> = {
      likes: item.likes.length,
      comments: item.comments.length,
    } as Record<EventType | InteractionType, number>;

    ALL_EVENT_TYPE_IDS.forEach((type) => {
      counts[type] = 0;
    });

    item.events.forEach((event) => {
      if (!ALL_EVENT_TYPE_IDS.has(event.type)) return;
      counts[event.type] += 1;
    });

    return counts;
  };

  const buildSummary = () => {
    return selectedChildren.map((item) => {
      const counts = getCounts(item);
      const rows = [...eventTypes, ...INTERACTION_TYPES]
        .filter((type) => counts[type.id] > 0)
        .map((type) => ({
          type: type.id,
          label: type.label,
          total: counts[type.id],
          selected:
            type.id === "likes" || type.id === "comments"
              ? selectedInteractionTypes.has(type.id as InteractionType)
                ? counts[type.id]
                : 0
              : selectedEventTypes.has(type.id as EventType)
                ? counts[type.id]
                : 0,
        }));

      return {
        childName: item.child.name,
        rows,
      };
    });
  };

  const renderSummarySlider = (summary: ExportSummary[]) => {
    const sliderWidth = Dimensions.get("window").width * 0.85 - 48;
    const canNavigate = summary.length > 1;

    const goToIndex = (index: number) => {
      if (!summaryScrollRef.current) return;
      summaryScrollRef.current.scrollTo({
        x: index * sliderWidth,
        animated: true,
      });
      setSummaryIndex(index);
    };

    return (
      <View>
        <ScrollView
          ref={summaryScrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          style={{ width: sliderWidth }}
          onMomentumScrollEnd={(event) => {
            const offsetX = event.nativeEvent.contentOffset.x;
            const nextIndex = Math.round(offsetX / sliderWidth);
            if (nextIndex !== summaryIndex) {
              setSummaryIndex(nextIndex);
            }
          }}
        >
          {summary.map((item) => (
            <View
              key={item.childName}
              style={[styles.summarySlide, { width: sliderWidth }]}
            >
              <Text
                style={[
                  styles.summaryTitle,
                  { color: Colors[colorScheme].text },
                ]}
              >
                {item.childName}
              </Text>
              {item.rows.length === 0 ? (
                <Text
                  style={[
                    styles.summaryEmpty,
                    { color: Colors[colorScheme].tabIconDefault },
                  ]}
                >
                  Aucun evenement à exporter
                </Text>
              ) : (
                item.rows.map((row) => (
                  <View key={row.type} style={styles.summaryRow}>
                    <Text
                      style={[
                        styles.summaryLabel,
                        { color: Colors[colorScheme].tabIconDefault },
                      ]}
                    >
                      {row.label}
                    </Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        { color: Colors[colorScheme].text },
                      ]}
                    >
                      {row.selected}/{row.total}
                    </Text>
                  </View>
                ))
              )}
            </View>
          ))}
        </ScrollView>
        {summary.length > 1 && (
          <View style={styles.summaryControls}>
            <TouchableOpacity
              style={[
                styles.summaryChevron,
                summaryIndex === 0 && styles.summaryChevronDisabled,
              ]}
              onPress={() => goToIndex(Math.max(0, summaryIndex - 1))}
              activeOpacity={0.7}
              disabled={summaryIndex === 0}
              pointerEvents={summaryIndex === 0 ? "none" : "auto"}
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={Colors[colorScheme].text}
              />
            </TouchableOpacity>
            <Text
              style={[
                styles.summaryHint,
                { color: Colors[colorScheme].tabIconDefault },
              ]}
            >
              {summaryIndex + 1}/{summary.length}
            </Text>
            <TouchableOpacity
              style={[
                styles.summaryChevron,
                summaryIndex === summary.length - 1 &&
                  styles.summaryChevronDisabled,
              ]}
              onPress={() =>
                goToIndex(Math.min(summary.length - 1, summaryIndex + 1))
              }
              activeOpacity={0.7}
              disabled={summaryIndex === summary.length - 1}
              pointerEvents={
                summaryIndex === summary.length - 1 ? "none" : "auto"
              }
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={Colors[colorScheme].text}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const hasSelectedChildren = selectedChildren.length > 0;
  const hasSelectedTypes =
    selectedEventTypesArray.length > 0 || selectedInteractionTypesArray.length > 0;
  const hasSelectedData =
    (selectedEventsCount > 0 && selectedEventTypesArray.length > 0) ||
    (selectedInteractionsCount > 0 && selectedInteractionTypesArray.length > 0);
  const isExportDisabled =
    isExporting ||
    isLoading ||
    !hasSelectedChildren ||
    !hasSelectedTypes ||
    !hasSelectedData;

  const handleExport = async (force = false) => {
    if (Platform.OS === "web") {
      setModalConfig({
        visible: true,
        title: "Non disponible",
        message: "L'export est disponible uniquement sur mobile.",
        mode: "text",
      });
      return;
    }

    if (!force && selectedChildren.length === 0) {
      setModalConfig({
        visible: true,
        title: "Sélection requise",
        message: "Sélectionnez au moins un enfant à exporter.",
        mode: "text",
      });
      return;
    }

    if (!force && !hasSelectedTypes) {
      setModalConfig({
        visible: true,
        title: "Sélection requise",
        message: "Sélectionnez au moins un type à exporter.",
        mode: "text",
      });
      return;
    }

    try {
      setIsExporting(true);
      const effectiveEventTypes = force
        ? eventTypes.map((item) => item.id as EventType)
        : selectedEventTypesArray;
      const effectiveInteractionTypes = force
        ? INTERACTION_TYPES.map((item) => item.id as InteractionType)
        : selectedInteractionTypesArray;
      const effectiveChildren = force ? children : selectedChildren;
      const includeLikes = effectiveInteractionTypes.includes("likes");
      const includeComments = effectiveInteractionTypes.includes("comments");

      const exportData = {
        exportDate: new Date().toISOString(),
        exportBy: {
          email: email ?? user?.email ?? null,
          pseudo: userName ?? null,
        },
        format: "json",
        filters: {
          eventTypes: effectiveEventTypes,
          interactionTypes: effectiveInteractionTypes,
        },
        data: {
          account: {
            email: email ?? user?.email ?? null,
            pseudo: userName ?? null,
          },
          preferences,
          children: effectiveChildren.map((item) => {
            const canExportEventsForChild =
              item.role === "owner" || item.role === "admin" || item.events.length > 0;
            const filteredEvents = canExportEventsForChild
              ? item.events.filter((event) =>
                  effectiveEventTypes.includes(event.type)
                )
              : [];
            return {
              childName: item.child.name,
              birthDate: item.child.birthDate ?? null,
              gender: item.child.gender ?? null,
              photoUri: item.child.photoUri ?? null,
              events: filteredEvents.map(serializeValue),
              likes: includeLikes ? item.likes.map(serializeValue) : [],
              comments: includeComments ? item.comments.map(serializeValue) : [],
            };
          }),
        },
      };

      const fileName = `suivibaby_export_${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`;
      const baseDirectory = FileSystem.documentDirectory;
      if (!baseDirectory) {
        throw new Error("Répertoire de stockage indisponible");
      }
      const fileUri = `${baseDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(
        fileUri,
        JSON.stringify(exportData, null, 2),
        {
          encoding: FileSystem.EncodingType.UTF8,
        }
      );

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri);
      }

      const summary = buildSummary();
      setSummaryIndex(0);
      setExportSummary(summary);

      const shouldReturnToDelete = isAutoDeleteFlow;
      setModalConfig({
        visible: true,
        title: "Export terminé",
        message: "",
        mode: "summary",
        confirmText: shouldReturnToDelete ? "Continuer la suppression de votre compte" : undefined,
        onConfirm: shouldReturnToDelete
          ? () => {
              router.replace("/(drawer)/settings?delete=1");
            }
          : undefined,
      });
    } catch (error) {
      setModalConfig({
        visible: true,
        title: "Erreur",
        message: "Impossible d'exporter vos donnees. Réessayez.",
        mode: "text",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const renderFormatOption = (format: ExportFormat) => (
    <View
      key={format.id}
      style={[
        styles.formatOption,
        {
          borderBottomColor: Colors[colorScheme].tabIconDefault + "20",
          backgroundColor: Colors[colorScheme].tint + "10",
        },
      ]}
    >
      <View style={styles.formatLeft}>
        <View
          style={[
            styles.formatIcon,
            { backgroundColor: Colors[colorScheme].tint + "20" },
          ]}
        >
          <Ionicons
            name={format.icon}
            size={22}
            color={Colors[colorScheme].tint}
          />
        </View>
        <View style={styles.formatContent}>
          <ThemedText
            style={[styles.formatName, { color: Colors[colorScheme].tint }]}
          >
            {format.name}
          </ThemedText>
          <Text
            style={[
              styles.formatDescription,
              { color: Colors[colorScheme].tabIconDefault },
            ]}
          >
            {format.description}
          </Text>
        </View>
      </View>
      <Ionicons
        name="checkmark-circle"
        size={24}
        color={Colors[colorScheme].tint}
      />
    </View>
  );

  const renderChildRow = (item: ExportChild) => {
    const counts = getCounts(item);
    const totalEvents = item.events.length;
    const totalInteractions = item.likes.length + item.comments.length;
    const canExportEventsForChild =
      item.role === "owner" || item.role === "admin" || item.events.length > 0;
    const selectedEvents = eventTypes.reduce((sum, type) => {
      if (!canExportEventsForChild) return sum;
      if (!selectedEventTypes.has(type.id as EventType)) return sum;
      return sum + counts[type.id];
    }, 0);

    return (
      <View
        key={item.child.id}
        style={[
          styles.childOption,
          { borderBottomColor: Colors[colorScheme].tabIconDefault + "20" },
        ]}
      >
        <TouchableOpacity
          style={styles.childHeader}
          onPress={() => toggleChild(item.child.id)}
          activeOpacity={0.7}
          disabled={isLoading || isExporting}
        >
          <View style={styles.childLeft}>
            <View
              style={[
                styles.childIcon,
                { backgroundColor: Colors[colorScheme].tint + "15" },
              ]}
            >
              <FontAwesome
                name="baby"
                size={22}
                color={Colors[colorScheme].tint}
              />
            </View>
            <View style={styles.childContent}>
              <ThemedText style={styles.childName}>
                {item.child.name}
              </ThemedText>
              <Text
                style={[
                  styles.childSubtitle,
                  { color: Colors[colorScheme].tabIconDefault },
                ]}
              >
                {totalEvents === 0
                  ? "Aucun evenement (mes donnees)"
                  : `${selectedEvents}/${totalEvents} evenements (mes donnees)`}
              </Text>
              <Text
                style={[
                  styles.childSubtitle,
                  { color: Colors[colorScheme].tabIconDefault },
                ]}
              >
                {totalInteractions === 0
                  ? "Aucune interaction (mes donnees)"
                  : `${totalInteractions} interactions (mes donnees)`}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.checkbox,
              {
                borderColor: item.selected
                  ? Colors[colorScheme].tint
                  : Colors[colorScheme].tabIconDefault + "50",
                backgroundColor: item.selected
                  ? Colors[colorScheme].tint
                  : "transparent",
              },
            ]}
          >
            {item.selected && (
              <Ionicons name="checkmark" size={18} color="#fff" />
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTypeRow = (
    type: ExportTypeItem,
    isSelected: boolean,
    onToggle: () => void
  ) => {

    return (
      <TouchableOpacity
        key={type.id}
        style={[
          styles.typeOption,
          { borderBottomColor: Colors[colorScheme].tabIconDefault + "20" },
        ]}
        onPress={onToggle}
        activeOpacity={0.7}
        disabled={isLoading || isExporting}
      >
        <View style={styles.typeLeft}>
          <View
            style={[
              styles.typeIcon,
              { backgroundColor: Colors[colorScheme].tint + "15" },
            ]}
          >
            {type.icon.lib === "MaterialCommunityIcons" ? (
              <MaterialCommunityIcons
                name={type.icon.name as any}
                size={20}
                color={Colors[colorScheme].tint}
              />
            ) : type.icon.lib === "Ionicons" ? (
              <Ionicons
                name={type.icon.name as any}
                size={20}
                color={Colors[colorScheme].tint}
              />
            ) : (
              <FontAwesome
                name={type.icon.name as any}
                size={20}
                color={Colors[colorScheme].tint}
              />
            )}
          </View>
          <ThemedText style={styles.typeName}>{type.label}</ThemedText>
        </View>
        <View
          style={[
            styles.checkbox,
            {
              borderColor: isSelected
                ? Colors[colorScheme].tint
                : Colors[colorScheme].tabIconDefault + "50",
              backgroundColor: isSelected
                ? Colors[colorScheme].tint
                : "transparent",
            },
          ]}
        >
          {isSelected && <Ionicons name="checkmark" size={18} color="#fff" />}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: Colors[colorScheme].background },
        ]}
        edges={["top", "bottom"]}
      >
        <Stack.Screen
          options={{
            title: "Exporter les données",
            headerBackTitle: "Retour",
          }}
        />
        {isAutoDeleteFlow ? (
          <View style={styles.autoExportLoader}>
            <IconPulseDots color={Colors[colorScheme].tint} />
            <Text style={[styles.autoExportText, { color: Colors[colorScheme].text }]}>
              {isExporting || isLoading ? "Preparation de l'export..." : "Export termine."}
            </Text>
            {(isExporting || isLoading) && (
              <View style={[styles.autoDeleteButton, { backgroundColor: "#dc3545" }]}>
                <Text style={styles.autoDeleteButtonText}>
                  Export en cours...
                </Text>
              </View>
            )}
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
          <ThemedView style={styles.section}>
            <ThemedText
              style={[
                styles.sectionTitle,
                { color: Colors[colorScheme].tabIconDefault },
              ]}
            >
              Format d&apos;export
            </ThemedText>
            <View style={styles.formatsContainer}>
              {exportFormats.map(renderFormatOption)}
            </View>
          </ThemedView>

          <ThemedView style={styles.section}>
            <View style={styles.sectionHeader}>
              <ThemedText
                style={[
                  styles.sectionTitle,
                  { color: Colors[colorScheme].tabIconDefault },
                ]}
              >
                Enfants à exporter
              </ThemedText>
              {children.length > 1 && (
                <TouchableOpacity
                  onPress={toggleAllChildren}
                  disabled={isLoading || isExporting}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.toggleAllText,
                      { color: Colors[colorScheme].tint },
                    ]}
                  >
                    {children.every((item) => item.selected)
                      ? "Tout décocher"
                      : "Tout cocher"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.childrenContainer}>
              {isLoading ? (
                <View style={styles.childrenLoading}>
                  <IconPulseDots color={Colors[colorScheme].tint} />
                  <Text
                    style={[
                      styles.childSubtitle,
                      { color: Colors[colorScheme].tabIconDefault },
                    ]}
                  >
                    Chargement des enfants...
                  </Text>
                </View>
              ) : children.length === 0 ? (
                <Text
                  style={[
                    styles.childSubtitle,
                    { color: Colors[colorScheme].tabIconDefault },
                  ]}
                >
                  Aucun enfant disponible.
                </Text>
              ) : (
                children.map(renderChildRow)
              )}
            </View>
          </ThemedView>

          {selectedEventsCount > 0 && (
            <ThemedView style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText
                  style={[
                    styles.sectionTitle,
                    { color: Colors[colorScheme].tabIconDefault },
                  ]}
                >
                  Types d'evenements
                </ThemedText>
                <TouchableOpacity
                  onPress={toggleAllEventTypes}
                  disabled={isLoading || isExporting || !selectedCanExportEvents}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.toggleAllText,
                      { color: Colors[colorScheme].tint },
                    ]}
                  >
                    {selectedEventTypes.size === eventTypes.length
                      ? "Tout décocher"
                      : "Tout cocher"}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.typesContainer}>
                {eventTypes.map((type) =>
                  renderTypeRow(
                    type,
                    selectedEventTypes.has(type.id as EventType),
                    () => toggleEventType(type.id as EventType)
                  )
                )}
              </View>
            </ThemedView>
          )}

          {selectedInteractionsCount > 0 && (
            <ThemedView style={styles.section}>
              <View style={styles.sectionHeader}>
                <ThemedText
                  style={[
                    styles.sectionTitle,
                    { color: Colors[colorScheme].tabIconDefault },
                  ]}
                >
                  Types d'interactions
                </ThemedText>
                <TouchableOpacity
                  onPress={toggleAllInteractionTypes}
                  disabled={isLoading || isExporting}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.toggleAllText,
                      { color: Colors[colorScheme].tint },
                    ]}
                  >
                    {selectedInteractionTypes.size === INTERACTION_TYPES.length
                      ? "Tout décocher"
                      : "Tout cocher"}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.typesContainer}>
                {INTERACTION_TYPES.map((type) =>
                  renderTypeRow(
                    type,
                    selectedInteractionTypes.has(type.id as InteractionType),
                    () => toggleInteractionType(type.id as InteractionType)
                  )
                )}
              </View>
            </ThemedView>
          )}

          {selectedEventsCount === 0 && selectedInteractionsCount === 0 && (
            <ThemedView style={styles.section}>
              <Text
                style={[
                  styles.childSubtitle,
                  { color: Colors[colorScheme].tabIconDefault },
                ]}
              >
                Aucune donnee à exporter.
              </Text>
            </ThemedView>
          )}

          <ThemedView style={styles.infoBox}>
            <Ionicons
              name="shield-checkmark"
              size={24}
              color={Colors[colorScheme].tint}
            />
            <ThemedText style={styles.infoText}>
              Vos donnees sont exportées localement. Stockez le fichier dans un
              endroit sûr.
            </ThemedText>
          </ThemedView>

          <TouchableOpacity
            style={[
              styles.exportButton,
              {
                backgroundColor: Colors[colorScheme].tint,
                opacity: isExportDisabled ? 0.6 : 1,
              },
            ]}
            onPress={handleExport}
            disabled={isExportDisabled}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-download" size={20} color="#fff" />
            <Text style={styles.exportButtonText}>
              {isExporting ? "Export en cours..." : "Exporter les donnees"}
            </Text>
          </TouchableOpacity>
          </ScrollView>
        )}
        <InfoModal
          visible={modalConfig.visible}
          title={modalConfig.title}
          message={
            modalConfig.mode === "summary"
              ? renderSummarySlider(exportSummary)
              : modalConfig.message
          }
          confirmText={modalConfig.confirmText}
          backgroundColor={Colors[colorScheme].background}
          textColor={Colors[colorScheme].text}
          onClose={closeModal}
          onConfirm={modalConfig.onConfirm}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  formatsContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  formatOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  formatLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  formatIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  formatContent: {
    flex: 1,
  },
  formatName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  formatDescription: {
    fontSize: 13,
  },
  childrenContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  childrenLoading: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 12,
  },
  childOption: {
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  childHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 4,
  },
  childLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  childIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  childContent: {
    flex: 1,
  },
  childName: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 2,
  },
  childSubtitle: {
    fontSize: 13,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginHorizontal: 34,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  summaryEmpty: {
    fontSize: 13,
  },
  summaryControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 12,
  },
  summaryChevron: {
    padding: 6,
    borderRadius: 999,
    width: 32,
    alignItems: "center",
  },
  summaryChevronDisabled: {
    opacity: 0,
  },
  summaryHint: {
    fontSize: 12,
  },
  summaryLabel: {
    fontSize: 12,
  },
  summaryValue: {
    fontSize: 12,
    fontWeight: "600",
  },
  typesContainer: {
    borderRadius: 12,
    overflow: "hidden",
  },
  typeOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
  },
  typeLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  typeIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  typeName: {
    fontSize: 15,
    fontWeight: "500",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
  },
  toggleAllText: {
    fontSize: 13,
    fontWeight: "600",
  },
  infoBox: {
    flexDirection: "row",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  exportButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 8,
  },
  exportButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  autoExportLoader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  autoExportText: {
    fontSize: 14,
    fontWeight: "600",
  },
  autoDeleteButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    opacity: 0.6,
  },
  autoDeleteButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
});
