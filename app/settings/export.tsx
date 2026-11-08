import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { deleteTempFile, prepareExportFile, shareTempFile } from "@/services/tempShareService";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

import { ThemedText } from "@/components/themed-text";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { InfoModal } from "@/components/ui/InfoModal";
import { getBackgroundTint, getNeutralColors } from "@/constants/dashboardColors";
import { useAuth } from "@/contexts/AuthContext";
import type { Child } from "@/contexts/BabyContext";
import { useBaby } from "@/contexts/BabyContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import type { EventType } from "@/services/eventsService";
import { getExportEventTypes } from "@/services/eventTypeSupport";
import {
  buildPreExportWarnings,
  collectChildExportData,
  EXPORT_OFFLINE_MESSAGE,
  ExportOfflineError,
  loadChildExportCounts,
  seesWholeTracking,
} from "@/services/exportCollector";
import type { ChildExportCounts, CollectedChild } from "@/services/exportCollector";
import {
  collectEventPhotoPaths,
  EXPORT_PHOTO_NOTE,
  EXPORT_TRUNCATED_NOTE,
} from "@/services/exportDataHelpers";
import { getPendingChildIds } from "@/services/offlineQueueService";
import { obtenirPreferences } from "@/services/userPreferencesService";
import { runAfterInteractions } from "@/utils/afterInteractions";
import type { ScrollViewInstance } from "react-native";

interface ExportFormat {
  id: string;
  name: string;
  description: string;
  icon: keyof typeof Ionicons.glyphMap;
  extension: string;
}

interface ExportChild {
  child: Child;
  /** Rôle et décomptes serveur (null : indisponibles, affichés « — »). */
  counts: ChildExportCounts | null;
  selected: boolean;
}

interface ExportSummaryRow {
  type: EventType | InteractionType;
  label: string;
  /** Nombre réellement exporté. */
  count: number;
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
  {
    id: "biberon",
    label: "Biberon",
    icon: { lib: "MaterialCommunityIcons", name: "baby-bottle" },
  },
  {
    id: "tetee",
    label: "Tétée",
    icon: { lib: "FontAwesome", name: "person-breastfeeding" },
  },
  {
    id: "pompage",
    label: "Pompage",
    icon: { lib: "FontAwesome", name: "pump-medical" },
  },
  {
    id: "couche",
    // Kept for raw/historical export compatibility. The modern diaper domain in
    // the product is otherwise represented through `miction` / `selle`.
    label: "Couche",
    icon: { lib: "MaterialCommunityIcons", name: "human-baby-changing-table" },
  },
  {
    id: "miction",
    label: "Miction",
    icon: { lib: "FontAwesome", name: "water" },
  },
  { id: "selle", label: "Selle", icon: { lib: "FontAwesome", name: "poop" } },
  {
    id: "sommeil",
    label: "Sommeil",
    icon: { lib: "FontAwesome", name: "moon" },
  },
  {
    id: "vaccin",
    label: "Vaccin",
    icon: { lib: "FontAwesome", name: "syringe" },
  },
  {
    id: "vitamine",
    label: "Vitamine",
    icon: { lib: "FontAwesome", name: "pills" },
  },
];

const EXTRA_EVENT_TYPES: ExportTypeItem[] = [
  {
    id: "solide",
    label: "Solide",
    icon: { lib: "FontAwesome", name: "utensils" },
  },
  {
    id: "bain",
    label: "Bain",
    icon: { lib: "MaterialCommunityIcons", name: "bathtub" },
  },
  {
    id: "temperature",
    label: "Température",
    icon: { lib: "MaterialCommunityIcons", name: "thermometer" },
  },
  {
    id: "medicament",
    label: "Médicament",
    icon: { lib: "MaterialCommunityIcons", name: "pill" },
  },
  {
    id: "symptome",
    label: "Symptôme",
    icon: { lib: "MaterialCommunityIcons", name: "alert-circle-outline" },
  },
  {
    id: "croissance",
    label: "Croissance",
    icon: { lib: "MaterialCommunityIcons", name: "chart-line" },
  },
  {
    id: "activite",
    label: "Activité",
    icon: { lib: "MaterialCommunityIcons", name: "run-fast" },
  },
  {
    id: "jalon",
    label: "Jalon",
    icon: { lib: "MaterialCommunityIcons", name: "star-outline" },
  },
];

EXTRA_EVENT_TYPES.push({
  id: "nettoyage_nez",
  label: "Nettoyage du nez",
  icon: { lib: "MaterialCommunityIcons", name: "water-outline" },
});

const INTERACTION_TYPES: ExportTypeItem[] = [
  { id: "likes", label: "Likes", icon: { lib: "Ionicons", name: "heart" } },
  {
    id: "comments",
    label: "Commentaires",
    icon: { lib: "Ionicons", name: "chatbubble" },
  },
];

// Single source of truth: the list of exported types is derived from
// services/eventTypeSupport.ts; the arrays above only provide labels and icons.
const TYPE_META = new Map<string, ExportTypeItem>(
  [...BASE_EVENT_TYPES, ...EXTRA_EVENT_TYPES].map((item) => [item.id, item]),
);
const EXPORT_TYPE_ITEMS: ExportTypeItem[] = getExportEventTypes().map(
  (type) =>
    TYPE_META.get(type) ?? {
      id: type,
      label: type,
      icon: { lib: "Ionicons", name: "ellipse-outline" },
    },
);

const ALL_EVENT_TYPE_IDS = getExportEventTypes();
const eventTypes = EXPORT_TYPE_ITEMS;

export default function ExportScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { showToast, showActionToast } = useToast();
  const { userName, email, user } = useAuth();
  const { afterDelete, childId: preSelectChildId } = useLocalSearchParams<{ afterDelete?: string; childId?: string }>();
  const router = useRouter();
  const isAutoDeleteFlow = afterDelete === "1";
  const { children: visibleChildren, loading: childrenLoading } = useBaby();
  const uid = user?.uid;
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  // Rôle + décomptes serveur par enfant (null : lecture impossible, « — »).
  const [countsByChild, setCountsByChild] = useState<
    Record<string, ChildExportCounts | null>
  >({});
  const [countsError, setCountsError] = useState(false);
  // Sélection des enfants (absent = valeur par défaut).
  const [selection, setSelection] = useState<Record<string, boolean>>({});
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<EventType>>(
    () => new Set(eventTypes.map((item) => item.id as EventType)),
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
    dismissText?: string;
    onConfirm?: () => void;
    /** Appelé si la fenêtre est fermée sans confirmer. */
    onCancel?: () => void;
  }>({
    visible: false,
    title: "",
    message: "",
    mode: "text",
  });
  const [exportSummary, setExportSummary] = useState<ExportSummary[]>([]);
  const [summaryIndex, setSummaryIndex] = useState(0);
  const summaryScrollRef = useRef<ScrollViewInstance | null>(null);
  const autoExportTriggered = useRef(false);
  // Le premier focus coïncide avec l'ouverture (déjà chargée) : seuls les
  // retours sur l'écran relancent le chargement des décomptes.
  const hasFocusedOnce = useRef(false);
  const [focusTick, setFocusTick] = useState(0);
  useFocusEffect(
    useCallback(() => {
      autoExportTriggered.current = false;
      if (hasFocusedOnce.current) setFocusTick((tick) => tick + 1);
      hasFocusedOnce.current = true;
    }, []),
  );
  const [preferences, setPreferences] = useState<{
    notifications?: any;
    theme?: string;
    language?: string;
  }>({});

  const exportFormats: ExportFormat[] = [
    {
      id: "json",
      name: "JSON",
      description: "Format structuré pour une sauvegarde complète",
      icon: "code-slash",
      extension: ".json",
    },
  ];

  // Clé stable : seuls les identifiants des enfants et l'utilisateur comptent.
  // Une mise à jour du document d'un enfant (nom, photo...) ne relit rien.
  const childIdsKey = useMemo(
    () => visibleChildren.map((child) => child.id).sort().join(","),
    [visibleChildren],
  );
  const childIdsRef = useRef<string[]>([]);
  childIdsRef.current = visibleChildren.map((child) => child.id);

  useEffect(() => {
    let isMounted = true;
    // Ouverture légère : rôle relu sur le serveur + décomptes par agrégation
    // (aucun document transféré), après la transition d'écran. Les données
    // complètes ne sont lues qu'au clic sur « Exporter ».
    const loadOpening = async () => {
      if (childrenLoading) {
        if (isMounted) setIsLoading(true);
        return;
      }
      if (isMounted) setIsLoading(true);
      try {
        const prefs = await obtenirPreferences().catch(() => null);
        if (!isMounted) return;
        if (prefs) {
          setPreferences({
            notifications: prefs.notifications,
            theme: prefs.theme,
            language: prefs.language,
          });
        }
        // Suppression de compte : aucun écran à décompter, l'export est
        // lancé tout de suite et relit tout (rôle compris) sur le serveur.
        if (isAutoDeleteFlow || !uid) {
          setCountsByChild({});
          setCountsError(false);
          return;
        }
        const ids = childIdsRef.current;
        const results = await Promise.allSettled(
          ids.map((id) => loadChildExportCounts(id, uid)),
        );
        if (!isMounted) return;
        setCountsByChild(
          Object.fromEntries(
            ids.map((id, i) => {
              const result = results[i];
              return [id, result.status === "fulfilled" ? result.value : null];
            }),
          ),
        );
        setCountsError(results.some((result) => result.status === "rejected"));
      } catch {
        if (isMounted) {
          setModalConfig({
            visible: true,
            title: "Erreur",
            message: "Impossible de charger les données à exporter.",
            mode: "text",
          });
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    const interaction = runAfterInteractions(() => {
      if (isMounted) void loadOpening();
    });
    return () => {
      isMounted = false;
      interaction.cancel();
    };
  }, [childrenLoading, childIdsKey, isAutoDeleteFlow, uid, focusTick]);

  const children = useMemo<ExportChild[]>(
    () =>
      visibleChildren.map((child) => ({
        child,
        counts: countsByChild[child.id] ?? null,
        selected:
          selection[child.id] ??
          (preSelectChildId ? child.id === preSelectChildId : true),
      })),
    [visibleChildren, countsByChild, selection, preSelectChildId],
  );

  // InfoModal appelle onConfirm puis onClose : on distingue « confirmé » de « fermé ».
  const confirmedRef = useRef(false);
  const closeModal = () => {
    const confirmed = confirmedRef.current;
    confirmedRef.current = false;
    const onCancel = modalConfig.onCancel;
    const wasDeleteFlow = isAutoDeleteFlow && modalConfig.onConfirm && !onCancel;
    setModalConfig((prev) => ({
      ...prev,
      visible: false,
      mode: "text",
      message: "",
      confirmText: undefined,
      dismissText: undefined,
      onConfirm: undefined,
      onCancel: undefined,
    }));
    if (onCancel && !confirmed) {
      onCancel();
      return;
    }
    if (wasDeleteFlow) {
      autoExportTriggered.current = false;
      // Une seule navigation : déjà faite par onConfirm si l'utilisateur a confirmé.
      if (confirmed) return;
      router.replace("/(drawer)/settings");
    }
  };

  const serializeValue = useCallback((value: any): any => {
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
        Object.entries(value).map(([key, item]) => [key, serializeValue(item)]),
      );
    }
    return value;
  }, []);

  const selectedChildren = useMemo(
    () => children.filter((item) => item.selected),
    [children],
  );

  // Total par type pour les enfants sélectionnés (null : décomptes indisponibles).
  const selectedTotals = useMemo(() => {
    const totals: Record<string, number> = { likes: 0, comments: 0 };
    ALL_EVENT_TYPE_IDS.forEach((type) => {
      totals[type] = 0;
    });
    selectedChildren.forEach((item) => {
      if (!item.counts) return;
      ALL_EVENT_TYPE_IDS.forEach((type) => {
        totals[type] += item.counts?.events[type] ?? 0;
      });
      totals.likes += item.counts.likes;
      totals.comments += item.counts.comments;
    });
    return totals;
  }, [selectedChildren]);

  const selectedEventsCount = useMemo(
    () => ALL_EVENT_TYPE_IDS.reduce((sum, type) => sum + selectedTotals[type], 0),
    [selectedTotals],
  );

  const selectedInteractionsCount = selectedTotals.likes + selectedTotals.comments;

  const selectedEventTypesArray = useMemo(
    () => Array.from(selectedEventTypes),
    [selectedEventTypes],
  );
  const selectedInteractionTypesArray = useMemo(
    () => Array.from(selectedInteractionTypes),
    [selectedInteractionTypes],
  );

  const toggleChild = (childId: string) => {
    setSelection((prev) => {
      const current = children.find((item) => item.child.id === childId)?.selected ?? true;
      return { ...prev, [childId]: !current };
    });
  };

  const toggleEventType = (type: EventType) => {
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
      return new Set(
        INTERACTION_TYPES.map((item) => item.id as InteractionType),
      );
    });
  };

  const toggleAllChildren = () => {
    const hasUnselected = children.some((item) => !item.selected);
    setSelection(Object.fromEntries(children.map((item) => [item.child.id, hasUnselected])));
  };

  /** Récapitulatif d'après les données RÉELLEMENT exportées. */
  const buildSummary = (exported: Array<{ name: string; data: CollectedChild }>, types: EventType[]) =>
    exported.map(({ name, data }) => {
      const counts: Record<string, number> = {
        likes: data.likes.length,
        comments: data.comments.length,
      };
      data.events.forEach((event) => {
        const type = String(event.type);
        counts[type] = (counts[type] ?? 0) + 1;
      });
      const rows = [...eventTypes, ...INTERACTION_TYPES]
        .filter((type) =>
          type.id === "likes" || type.id === "comments" || types.includes(type.id as EventType),
        )
        .filter((type) => (counts[type.id] ?? 0) > 0)
        .map((type) => ({ type: type.id, label: type.label, count: counts[type.id] }));
      return { childName: name, rows };
    });

  const renderSummarySlider = (summary: ExportSummary[]) => {
    const sliderWidth = Dimensions.get("window").width * 0.85 - 48;

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
                  { color: nc.textStrong },
                ]}
              >
                {item.childName}
              </Text>
              {item.rows.length === 0 ? (
                <Text
                  style={[
                    styles.summaryEmpty,
                    { color: nc.textLight },
                  ]}
                >
                  Aucun événement à exporter
                </Text>
              ) : (
                item.rows.map((row) => (
                  <View key={row.type} style={styles.summaryRow}>
                    <Text
                      style={[
                        styles.summaryLabel,
                        { color: nc.textLight },
                      ]}
                    >
                      {row.label}
                    </Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        { color: nc.textStrong },
                      ]}
                    >
                      {row.count}
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
            >
              <Ionicons
                name="chevron-back"
                size={20}
                color={nc.textStrong}
              />
            </TouchableOpacity>
            <Text
              style={[
                styles.summaryHint,
                { color: nc.textLight },
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
            >
              <Ionicons
                name="chevron-forward"
                size={20}
                color={nc.textStrong}
              />
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  const hasSelectedChildren = selectedChildren.length > 0;
  const hasSelectedTypes =
    selectedEventTypesArray.length > 0 ||
    selectedInteractionTypesArray.length > 0;
  const hasSelectedData =
    selectedEventTypesArray.some((type) => selectedTotals[type] > 0) ||
    selectedInteractionTypesArray.some((type) => selectedTotals[type] > 0);
  // Décomptes indisponibles (hors ligne) : on n'exporte pas à l'aveugle.
  const isExportDisabled =
    isExporting ||
    isLoading ||
    countsError ||
    !hasSelectedChildren ||
    !hasSelectedTypes ||
    !hasSelectedData;

  // Synchronous guard against double taps (isExporting state updates async).
  const exportInFlightRef = useRef(false);

  const handleExportRef = useRef<((force?: boolean) => Promise<void>) | null>(null);
  const [exportFailed, setExportFailed] = useState(false);

  const showExportError = useCallback(
    (error: unknown) => {
      setExportFailed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const offline = error instanceof ExportOfflineError;
      const message = offline
        ? EXPORT_OFFLINE_MESSAGE
        : "Impossible d'exporter vos données. Réessayez.";
      if (!offline) {
        showActionToast("Impossible d'exporter vos données.", "Réessayer", () => {
          void handleExportRef.current?.();
        });
      }
      setModalConfig({
        visible: true,
        title: offline ? "Connexion requise" : "Erreur",
        message,
        mode: "text",
        // Suppression de compte : sans export, on revient aux réglages.
        onCancel: isAutoDeleteFlow
          ? () => router.replace("/(drawer)/settings")
          : undefined,
      });
    },
    [isAutoDeleteFlow, router, showActionToast],
  );
  /** Lecture complète (serveur) puis écriture du fichier ; aucun fichier si une lecture échoue. */
  const runExport = useCallback(
    async (effectiveChildren: ExportChild[], effectiveEventTypes: EventType[], effectiveInteractionTypes: InteractionType[]) => {
      if (!uid) throw new Error("Utilisateur non connecté");
      const includeLikes = effectiveInteractionTypes.includes("likes");
      const includeComments = effectiveInteractionTypes.includes("comments");

      // Tout est lu AVANT de créer le fichier : un échec (hors ligne...) ne
      // laisse ni fichier partiel ni fichier temporaire. Enfant par enfant
      // pour limiter la mémoire ; rien n'est conservé après l'export.
      const exported: Array<{ item: ExportChild; data: CollectedChild }> = [];
      for (const item of effectiveChildren) {
        const data = await collectChildExportData(item.child.id, uid, {
          eventTypes: effectiveEventTypes,
          includeLikes,
          includeComments,
        });
        exported.push({ item, data });
      }
      const truncated = exported.some(({ data }) => data.truncated);

      const exportData = {
        exportDate: new Date().toISOString(),
        exportBy: {
          email: email ?? user?.email ?? null,
          pseudo: userName ?? null,
        },
        format: "json",
        notes: {
          photos: EXPORT_PHOTO_NOTE,
          ...(truncated ? { truncated: EXPORT_TRUNCATED_NOTE } : {}),
        },
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
          children: exported.map(({ item, data }) => ({
            childName: item.child.name,
            birthDate: item.child.birthDate ?? null,
            gender: item.child.gender ?? null,
            photoUri: item.child.photoUri ?? null,
            // Full child document (allergies, notes, ...), technical fields removed.
            profile: serializeValue(data.profile),
            events: data.events.map((event) => {
              const photoPaths = collectEventPhotoPaths(event as any);
              return {
                ...serializeValue(event),
                ...(photoPaths.length > 0 ? { photoStoragePaths: photoPaths } : {}),
              };
            }),
            likes: data.likes.map(serializeValue),
            comments: data.comments.map(serializeValue),
          })),
        },
      };

      const fileName = `suivibaby_export_${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.json`;
      // Cache exports folder, purged after ~1h: health data must not stay
      // in the app's persistent (and backed-up) storage.
      const fileUri = await prepareExportFile(fileName);
      try {
        await FileSystem.writeAsStringAsync(
          fileUri,
          JSON.stringify(exportData, null, 2),
          {
            encoding: FileSystem.EncodingType.UTF8,
          },
        );
        await shareTempFile(fileUri);
      } catch (error) {
        // A failed write leaves a partial file; a share error does not need it either.
        await deleteTempFile(fileUri);
        throw error;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast("Export terminé avec succès");

      setSummaryIndex(0);
      setExportSummary(
        buildSummary(
          exported.map(({ item, data }) => ({ name: item.child.name, data })),
          effectiveEventTypes,
        ),
      );

      const shouldReturnToDelete = isAutoDeleteFlow;
      setModalConfig({
        visible: true,
        title: "Export terminé",
        message: "",
        mode: "summary",
        confirmText: shouldReturnToDelete ? "Supprimer le compte" : undefined,
        onConfirm: shouldReturnToDelete
          ? () => {
              // Confirmé : closeModal (appelé juste après) ne doit pas re-naviguer.
              confirmedRef.current = true;
              router.replace("/(drawer)/settings?delete=1");
            }
          : undefined,
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- buildSummary ne dépend que de constantes
    [email, isAutoDeleteFlow, preferences, router, serializeValue, showToast, uid, user?.email, userName],
  );

  const handleExport = useCallback(async (force = false) => {
    if (exportInFlightRef.current) return;
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

    const effectiveEventTypes = force
      ? eventTypes.map((item) => item.id as EventType)
      : selectedEventTypesArray;
    const effectiveInteractionTypes = force
      ? INTERACTION_TYPES.map((item) => item.id as InteractionType)
      : selectedInteractionTypesArray;
    const effectiveChildren = force ? children : selectedChildren;

    const doExport = async () => {
      try {
        exportInFlightRef.current = true;
        setIsExporting(true);
        setExportFailed(false);
        await runExport(effectiveChildren, effectiveEventTypes, effectiveInteractionTypes);
      } catch (error) {
        showExportError(error);
      } finally {
        exportInFlightRef.current = false;
        setIsExporting(false);
      }
    };

    // Saisies hors ligne pas encore envoyées / volume au-delà du plafond :
    // l'export serait incomplet, l'utilisateur choisit en connaissance de cause.
    exportInFlightRef.current = true;
    let warnings: string[] = [];
    try {
      const pendingChildIds = await getPendingChildIds().catch(() => new Set<string>());
      warnings = buildPreExportWarnings({
        selectedChildIds: effectiveChildren.map((item) => item.child.id),
        pendingChildIds,
        countsByChild,
      });
    } finally {
      exportInFlightRef.current = false;
    }
    if (warnings.length > 0) {
      setModalConfig({
        visible: true,
        title: "Export incomplet",
        message: warnings.join("\n\n"),
        mode: "text",
        confirmText: "Exporter quand même",
        dismissText: "Annuler",
        onConfirm: () => {
          confirmedRef.current = true;
          void doExport();
        },
        // Suppression de compte : annuler = retour aux réglages.
        onCancel: () => {
          if (isAutoDeleteFlow) router.replace("/(drawer)/settings");
        },
      });
      return;
    }
    await doExport();
  }, [
    children,
    countsByChild,
    hasSelectedTypes,
    isAutoDeleteFlow,
    router,
    runExport,
    selectedChildren,
    selectedEventTypesArray,
    selectedInteractionTypesArray,
    showExportError,
  ]);
  handleExportRef.current = handleExport;

  useEffect(() => {
    if (!isAutoDeleteFlow) return;
    if (autoExportTriggered.current) return;
    if (childrenLoading || isLoading || isExporting) return;
    autoExportTriggered.current = true;
    handleExport(true);
  }, [isAutoDeleteFlow, childrenLoading, isLoading, isExporting, handleExport]);

  const renderFormatOption = (format: ExportFormat) => (
    <View
      key={format.id}
      style={[
        styles.formatOption,
        {
          borderBottomColor: nc.borderLightAlpha,
          backgroundColor: getBackgroundTint(nc.todayAccent, 0.06),
        },
      ]}
    >
      <View style={styles.formatLeft}>
        <View
          style={[
            styles.formatIcon,
            { backgroundColor: getBackgroundTint(nc.todayAccent, 0.12) },
          ]}
        >
          <Ionicons
            name={format.icon}
            size={22}
            color={nc.todayAccent}
          />
        </View>
        <View style={styles.formatContent}>
          <ThemedText
            style={[styles.formatName, { color: nc.todayAccent }]}
          >
            {format.name}
          </ThemedText>
          <Text
            style={[
              styles.formatDescription,
              { color: nc.textLight },
            ]}
          >
            {format.description}
          </Text>
        </View>
      </View>
      <Ionicons
        name="checkmark-circle"
        size={24}
        color={nc.todayAccent}
      />
    </View>
  );

  // Proche (contributor/viewer) : export limité à ses saisies, likes et commentaires.
  const hasProcheChild = children.some(
    (item) => item.counts && !seesWholeTracking(item.counts.role),
  );

  const renderChildRow = (item: ExportChild) => {
    const counts = item.counts;
    const eventsScope = seesWholeTracking(counts?.role) ? "tout le suivi" : "vos saisies";
    const totalEvents = counts
      ? ALL_EVENT_TYPE_IDS.reduce((sum, type) => sum + (counts.events[type] ?? 0), 0)
      : 0;
    const totalInteractions = counts ? counts.likes + counts.comments : 0;
    const selectedEvents = counts
      ? eventTypes.reduce(
          (sum, type) =>
            selectedEventTypes.has(type.id as EventType)
              ? sum + (counts.events[type.id] ?? 0)
              : sum,
          0,
        )
      : 0;

    return (
      <View
        key={item.child.id}
        style={[
          styles.childOption,
          { borderBottomColor: nc.borderLightAlpha },
        ]}
      >
        <TouchableOpacity
          style={styles.childHeader}
          onPress={() => toggleChild(item.child.id)}
          activeOpacity={0.7}
          disabled={isLoading || isExporting}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.selected }}
          accessibilityLabel={`Sélectionner ${item.child.name}`}
        >
          <View style={styles.childLeft}>
            <View
              style={[
                styles.childIcon,
                { backgroundColor: getBackgroundTint(nc.todayAccent, 0.08) },
              ]}
            >
              <FontAwesome
                name="baby"
                size={22}
                color={nc.todayAccent}
              />
            </View>
            <View style={styles.childContent}>
              <ThemedText style={styles.childName}>
                {item.child.name}
              </ThemedText>
              <Text
                style={[
                  styles.childSubtitle,
                  { color: nc.textLight },
                ]}
              >
                {!counts
                  ? `— événements (${eventsScope})`
                  : totalEvents === 0
                    ? `Aucun événement (${eventsScope})`
                    : `${selectedEvents}/${totalEvents} événements (${eventsScope})`}
              </Text>
              <Text
                style={[
                  styles.childSubtitle,
                  { color: nc.textLight },
                ]}
              >
                {!counts
                  ? "— interactions (vos likes et commentaires)"
                  : totalInteractions === 0
                    ? "Aucune interaction (vos likes et commentaires)"
                    : `${totalInteractions} interactions (vos likes et commentaires)`}
              </Text>
            </View>
          </View>
          <View
            style={[
              styles.checkbox,
              {
                borderColor: item.selected
                  ? nc.todayAccent
                  : nc.borderLight,
                backgroundColor: item.selected
                  ? nc.todayAccent
                  : "transparent",
              },
            ]}
          >
            {item.selected && (
              <Ionicons name="checkmark" size={18} color={nc.backgroundCard} />
            )}
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderTypeRow = (
    type: ExportTypeItem,
    isSelected: boolean,
    onToggle: () => void,
  ) => {
    // Total des enfants sélectionnés ; « — » si les décomptes sont indisponibles.
    const total = countsError ? "—" : String(selectedTotals[type.id] ?? 0);
    return (
      <TouchableOpacity
        key={type.id}
        style={[
          styles.typeOption,
          { borderBottomColor: nc.borderLightAlpha },
        ]}
        onPress={onToggle}
        activeOpacity={0.7}
        disabled={isLoading || isExporting}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isSelected }}
        accessibilityLabel={`Sélectionner ${type.label}`}
      >
        <View style={styles.typeLeft}>
          <View
            style={[
              styles.typeIcon,
              { backgroundColor: getBackgroundTint(nc.todayAccent, 0.08) },
            ]}
          >
            {type.icon.lib === "MaterialCommunityIcons" ? (
              <MaterialCommunityIcons
                name={type.icon.name as any}
                size={20}
                color={nc.todayAccent}
              />
            ) : type.icon.lib === "Ionicons" ? (
              <Ionicons
                name={type.icon.name as any}
                size={20}
                color={nc.todayAccent}
              />
            ) : (
              <FontAwesome
                name={type.icon.name as any}
                size={20}
                color={nc.todayAccent}
              />
            )}
          </View>
          <ThemedText style={styles.typeName}>{type.label}</ThemedText>
        </View>
        <Text
          style={[styles.typeCount, { color: nc.textLight }]}
          accessibilityLabel={`${total} éléments`}
        >
          {total}
        </Text>
        <View
          style={[
            styles.checkbox,
            {
              borderColor: isSelected
                ? nc.todayAccent
                : nc.borderLight,
              backgroundColor: isSelected
                ? nc.todayAccent
                : "transparent",
            },
          ]}
        >
          {isSelected && (
            <Ionicons name="checkmark" size={18} color={nc.backgroundCard} />
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView
        style={[
          styles.container,
          { backgroundColor: nc.background },
        ]}
        edges={["bottom"]}
      >
        <Stack.Screen
          options={{
            title: "Exporter les données",
            headerBackTitle: "Retour",
          }}
        />
        {isAutoDeleteFlow ? (
          <View style={styles.autoExportLoader}>
            <IconPulseDots color={nc.todayAccent} />
            <Text
              style={[
                styles.autoExportText,
                { color: nc.textStrong },
              ]}
            >
              {isExporting || isLoading
                ? "Préparation de l'export..."
                : exportFailed
                  ? "Export interrompu."
                  : "Export terminé."}
            </Text>
            {(isExporting || isLoading) && (
              <View
                style={[styles.autoDeleteButton, { backgroundColor: nc.error }]}
              >
                <Text
                  style={[
                    styles.autoDeleteButtonText,
                    {
                      color:
                        colorScheme === "dark" ? nc.white : nc.backgroundCard,
                    },
                  ]}
                >
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
            <View
              style={[styles.section, { backgroundColor: nc.backgroundCard }]}
            >
              <ThemedText
                style={[
                  styles.sectionTitle,
                  { color: nc.textStrong },
                ]}
              >
                Format d&apos;export
              </ThemedText>
              <View style={styles.formatsContainer}>
                {exportFormats.map(renderFormatOption)}
              </View>
            </View>

            <View
              style={[styles.section, { backgroundColor: nc.backgroundCard }]}
            >
              <View style={styles.sectionHeader}>
                <ThemedText
                  style={[
                    styles.sectionTitle,
                    { color: nc.textStrong },
                  ]}
                >
                  Enfants à exporter
                </ThemedText>
                {children.length > 1 && (
                  <TouchableOpacity
                    onPress={toggleAllChildren}
                    disabled={isLoading || isExporting}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Tout sélectionner ou désélectionner les enfants"
                  >
                    <Text
                      style={[
                        styles.toggleAllText,
                        { color: nc.todayAccent },
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
                    <IconPulseDots color={nc.todayAccent} />
                    <Text
                      style={[
                        styles.childSubtitle,
                        { color: nc.textLight },
                      ]}
                    >
                      Chargement des enfants...
                    </Text>
                  </View>
                ) : children.length === 0 ? (
                  <Text
                    style={[
                      styles.childSubtitle,
                      { color: nc.textLight },
                    ]}
                  >
                    Aucun enfant disponible.
                  </Text>
                ) : (
                  children.map(renderChildRow)
                )}
              </View>
            </View>

            {countsError && !isLoading && (
              <View
                style={[styles.infoBox, { backgroundColor: nc.backgroundCard }]}
                accessibilityRole="alert"
              >
                <Ionicons name="cloud-offline" size={24} color={nc.error} />
                <ThemedText style={[styles.infoText, { color: nc.errorText }]}>
                  {EXPORT_OFFLINE_MESSAGE}
                </ThemedText>
              </View>
            )}

            {hasProcheChild && (
              <View
                style={[styles.infoBox, { backgroundColor: nc.backgroundCard }]}
                accessibilityRole="text"
              >
                <Ionicons
                  name="information-circle"
                  size={24}
                  color={nc.todayAccent}
                />
                <ThemedText style={styles.infoText}>
                  Pour un enfant dont vous êtes proche, l&apos;export contient vos
                  likes, vos commentaires et les événements que vous avez
                  saisis. Le reste du suivi peut être exporté par un parent de
                  l&apos;enfant.
                </ThemedText>
              </View>
            )}

            {(selectedEventsCount > 0 || countsError) && (
              <View
                style={[styles.section, { backgroundColor: nc.backgroundCard }]}
              >
                <View style={styles.sectionHeader}>
                  <ThemedText
                    style={[
                      styles.sectionTitle,
                      { color: nc.textStrong },
                    ]}
                  >
                    Types d&apos;evenements
                  </ThemedText>
                  <TouchableOpacity
                    onPress={toggleAllEventTypes}
                    disabled={isLoading || isExporting}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Tout sélectionner ou désélectionner les types d'événements"
                  >
                    <Text
                      style={[
                        styles.toggleAllText,
                        { color: nc.todayAccent },
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
                      () => toggleEventType(type.id as EventType),
                    ),
                  )}
                </View>
              </View>
            )}

            {(selectedInteractionsCount > 0 || countsError) && (
              <View
                style={[styles.section, { backgroundColor: nc.backgroundCard }]}
              >
                <View style={styles.sectionHeader}>
                  <ThemedText
                    style={[
                      styles.sectionTitle,
                      { color: nc.textStrong },
                    ]}
                  >
                    Types d&apos;interactions
                  </ThemedText>
                  <TouchableOpacity
                    onPress={toggleAllInteractionTypes}
                    disabled={isLoading || isExporting}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Tout sélectionner ou désélectionner les types d'interactions"
                  >
                    <Text
                      style={[
                        styles.toggleAllText,
                        { color: nc.todayAccent },
                      ]}
                    >
                      {selectedInteractionTypes.size ===
                      INTERACTION_TYPES.length
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
                      () => toggleInteractionType(type.id as InteractionType),
                    ),
                  )}
                </View>
              </View>
            )}

            {!countsError && !isLoading && selectedEventsCount === 0 && selectedInteractionsCount === 0 && (
              <View
                style={[styles.section, { backgroundColor: nc.backgroundCard }]}
              >
                <Text
                  style={[
                    styles.childSubtitle,
                    { color: nc.textLight },
                  ]}
                >
                  Aucune donnée à exporter.
                </Text>
              </View>
            )}

            <View
              style={[styles.infoBox, { backgroundColor: nc.backgroundCard }]}
            >
              <Ionicons
                name="shield-checkmark"
                size={24}
                color={nc.todayAccent}
              />
              <ThemedText style={styles.infoText}>
                Vos données sont exportées localement. Stockez le fichier dans
                un endroit sûr.
              </ThemedText>
            </View>

            <TouchableOpacity
              style={[
                styles.exportButton,
                {
                  backgroundColor: nc.todayAccent,
                  shadowColor: nc.todayAccent,
                  opacity: isExportDisabled ? 0.6 : 1,
                },
              ]}
              onPress={() => handleExport()}
              disabled={isExportDisabled}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Exporter les données"
            >
              <Ionicons
                name="cloud-download"
                size={20}
                color={colorScheme === "dark" ? nc.white : nc.backgroundCard}
              />
              <Text
                style={[
                  styles.exportButtonText,
                  {
                    color: colorScheme === "dark" ? nc.white : nc.backgroundCard,
                  },
                ]}
              >
                {isExporting ? "Export en cours..." : "Exporter les données"}
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
          confirmButtonColor={modalConfig.onConfirm ? nc.error : undefined}
          backgroundColor={nc.backgroundCard}
          textColor={nc.textStrong}
          dismissText={
            modalConfig.dismissText ??
            (modalConfig.onConfirm
              ? "Fermer et revenir aux paramètres"
              : undefined)
          }
          allowBackdropDismiss={!!modalConfig.onConfirm}
          onClose={closeModal}
          onConfirm={modalConfig.onConfirm}
        />
      </SafeAreaView>
    </View>
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
  summarySlide: {
    paddingHorizontal: 16,
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
  typeCount: {
    marginLeft: 'auto',
    marginRight: 12,
    fontSize: 14,
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
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 24,
    gap: 12,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  exportButtonText: {
    fontSize: 18,
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
    fontSize: 14,
    fontWeight: "700",
  },
});
