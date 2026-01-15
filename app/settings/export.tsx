import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import FontAwesome from "@expo/vector-icons/FontAwesome6";
import * as FileSystem from "expo-file-system";
import { Stack } from "expo-router";
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

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { InfoModal } from "@/components/ui/InfoModal";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import type { Child } from "@/contexts/BabyContext";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { Event, EventType, obtenirEvenements } from "@/services/eventsService";

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
  selected: boolean;
}

interface ExportSummaryRow {
  type: EventType;
  label: string;
  selected: number;
  total: number;
}

interface ExportSummary {
  childName: string;
  rows: ExportSummaryRow[];
}

const EVENT_TYPES: {
  id: EventType;
  label: string;
  icon: keyof typeof FontAwesome.glyphMap;
}[] = [
  { id: "biberon", label: "Biberon", icon: "jar-wheat" },
  { id: "tetee", label: "Tetee", icon: "person-breastfeeding" },
  { id: "pompage", label: "Pompage", icon: "pump-medical" },
  { id: "couche", label: "Couche", icon: "baby-carriage" },
  { id: "miction", label: "Miction", icon: "water" },
  { id: "selle", label: "Selle", icon: "poop" },
  { id: "sommeil", label: "Sommeil", icon: "moon" },
  { id: "vaccin", label: "Vaccin", icon: "syringe" },
  { id: "vitamine", label: "Vitamine", icon: "pills" },
];

export default function ExportScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const { userName, email } = useAuth();
  const { children: visibleChildren, loading: childrenLoading } = useBaby();
  const [isExporting, setIsExporting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [children, setChildren] = useState<ExportChild[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<Set<EventType>>(
    () => new Set(EVENT_TYPES.map((item) => item.id))
  );
  const [modalConfig, setModalConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    mode: "text" | "summary";
  }>({
    visible: false,
    title: "",
    message: "",
    mode: "text",
  });
  const [exportSummary, setExportSummary] = useState<ExportSummary[]>([]);
  const [summaryIndex, setSummaryIndex] = useState(0);
  const summaryScrollRef = useRef<ScrollView | null>(null);

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
        const childrenWithEvents = await Promise.all(
          visibleChildren.map(async (child) => {
            const events = await obtenirEvenements(child.id);
            return { child, events, selected: true };
          })
        );

        if (isMounted) {
          setChildren((prev) => {
            const SélectionMap = new Map(
              prev.map((item) => [item.child.id, item.selected])
            );
            return childrenWithEvents.map((item) => ({
              ...item,
              selected: SélectionMap.get(item.child.id) ?? true,
            }));
          });
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
  }, [childrenLoading, visibleChildren]);

  const closeModal = () => {
    setModalConfig((prev) => ({
      ...prev,
      visible: false,
      mode: "text",
      message: "",
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

  const selectedTypesArray = useMemo(
    () => Array.from(selectedTypes),
    [selectedTypes]
  );

  const toggleChild = (childId: string) => {
    setChildren((prev) =>
      prev.map((item) =>
        item.child.id === childId ? { ...item, selected: !item.selected } : item
      )
    );
  };

  const toggleType = (type: EventType) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const toggleAllTypes = () => {
    setSelectedTypes((prev) => {
      if (prev.size === EVENT_TYPES.length) {
        return new Set();
      }
      return new Set(EVENT_TYPES.map((item) => item.id));
    });
  };

  const toggleAllChildren = () => {
    setChildren((prev) => {
      const hasUnselected = prev.some((item) => !item.selected);
      return prev.map((item) => ({ ...item, selected: hasUnselected }));
    });
  };

  const getCounts = (events: Event[]) => {
    const counts: Record<EventType, number> = {
      biberon: 0,
      tetee: 0,
      pompage: 0,
      couche: 0,
      miction: 0,
      selle: 0,
      sommeil: 0,
      vaccin: 0,
      vitamine: 0,
    };
    events.forEach((event) => {
      counts[event.type] += 1;
    });
    return counts;
  };

  const buildSummary = () => {
    return selectedChildren.map((item) => {
      const counts = getCounts(item.events);
      const rows = EVENT_TYPES.filter((type) => counts[type.id] > 0).map(
        (type) => ({
          type: type.id,
          label: type.label,
          total: counts[type.id],
          selected: selectedTypes.has(type.id) ? counts[type.id] : 0,
        })
      );

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
  const hasSelectedTypes = selectedTypesArray.length > 0;
  const isExportDisabled =
    isExporting || isLoading || !hasSelectedChildren || !hasSelectedTypes;

  const handleExport = async () => {
    if (Platform.OS === "web") {
      setModalConfig({
        visible: true,
        title: "Non disponible",
        message: "L'export est disponible uniquement sur mobile.",
        mode: "text",
      });
      return;
    }

    if (selectedChildren.length === 0) {
      setModalConfig({
        visible: true,
        title: "Sélection requise",
        message: "Sélectionnez au moins un enfant à exporter.",
        mode: "text",
      });
      return;
    }

    if (selectedTypesArray.length === 0) {
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

      const exportData = {
        exportDate: new Date().toISOString(),
        exportBy: {
          email: email ?? user.email ?? null,
          pseudo: userName ?? null,
        },
        format: "json",
        filters: {
          eventTypes: selectedTypesArray,
        },
        data: {
          children: selectedChildren.map((item) => {
            const filteredEvents = item.events.filter((event) =>
              selectedTypes.has(event.type)
            );
            return {
              childName: item.child.name,
              events: filteredEvents.map(serializeValue),
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

      setModalConfig({
        visible: true,
        title: "Export terminé",
        message: "",
        mode: "summary",
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
    const counts = getCounts(item.events);
    const totalEvents = item.events.length;
    const selectedEvents = EVENT_TYPES.reduce((sum, type) => {
      if (!selectedTypes.has(type.id)) return sum;
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
                  ? "Aucun evenement"
                  : `${selectedEvents}/${totalEvents} evenements`}
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

  const getTypeIcon = (type?: EventType) => {
    switch (type) {
      case "biberon":
        return {
          lib: "MaterialCommunityIcons",
          name: "baby-bottle",
        };
      case "tetee":
        return {
          lib: "FontAwesome",
          name: "person-breastfeeding",
        };
      default:
        return {
          lib: "FontAwesome",
          name: "utensils",
        };
    }
  };

  const renderTypeRow = (type: (typeof EVENT_TYPES)[number]) => {
    const isSelected = selectedTypes.has(type.id);
    const icon = getTypeIcon(type.id);

    return (
      <TouchableOpacity
        key={type.id}
        style={[
          styles.typeOption,
          { borderBottomColor: Colors[colorScheme].tabIconDefault + "20" },
        ]}
        onPress={() => toggleType(type.id)}
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
            {type.id === "biberon" ? (
            <MaterialCommunityIcons
              name="baby-bottle"
              size={20}
              color={Colors[colorScheme].tint}
            />
          ) : ( type.id === "couche" ? (
            <MaterialCommunityIcons
              name="human-baby-changing-table"
              size={20}
              color={Colors[colorScheme].tint}
            />
          ) :
            
            <FontAwesome
              name={type.icon}
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
        edges={["bottom"]}
      >
        <Stack.Screen
          options={{
            title: "Exporter les données",
            headerBackTitle: "Retour",
          }}
        />
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
                onPress={toggleAllTypes}
                disabled={isLoading || isExporting}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.toggleAllText,
                    { color: Colors[colorScheme].tint },
                  ]}
                >
                  {selectedTypes.size === EVENT_TYPES.length
                    ? "Tout décocher"
                    : "Tout cocher"}
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.typesContainer}>
              {EVENT_TYPES.map(renderTypeRow)}
            </View>
          </ThemedView>

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
        <InfoModal
          visible={modalConfig.visible}
          title={modalConfig.title}
          message={
            modalConfig.mode === "summary"
              ? renderSummarySlider(exportSummary)
              : modalConfig.message
          }
          backgroundColor={Colors[colorScheme].background}
          textColor={Colors[colorScheme].text}
          onClose={closeModal}
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
});
