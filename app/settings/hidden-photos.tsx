import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Stack } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { PhotoImage } from "@/components/ui/PhotoImage";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import {
  onHiddenPhotosChange,
  unhidePhoto,
} from "@/services/hiddenPhotosService";
import { db } from "@/config/firebase";
import { doc, getDoc } from "firebase/firestore";

interface HiddenPhotoItem {
  eventId: string;
  photoRef: string | null;
  childName: string;
  date: string;
}

export default function HiddenPhotosScreen() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const tint = Colors[colorScheme].tint;
  const { user } = useAuth();
  const { children: allChildren } = useBaby();
  const { showToast } = useToast();
  const [items, setItems] = useState<HiddenPhotoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unhiding, setUnhiding] = useState<Set<string>>(new Set());

  const loadHiddenPhotos = useCallback(async (hiddenIds: string[]) => {
    try {
      if (hiddenIds.length === 0) {
        setItems([]);
        return;
      }

      const childMap = new Map(allChildren.map((c) => [c.id, c.name]));

      const results: HiddenPhotoItem[] = [];
      for (const eventId of hiddenIds) {
        try {
          const snap = await getDoc(doc(db, "events", eventId));
          if (!snap.exists()) {
            results.push({
              eventId,
              photoRef: null,
              childName: "Inconnu",
              date: "",
            });
            continue;
          }
          const data = snap.data();
          const photos = (data.photos as string[]) ?? [];
          const childName = childMap.get(data.childId) ?? "Inconnu";
          const rawDate = data.date?.seconds
            ? new Date(data.date.seconds * 1000)
            : data.date?.toDate?.()
              ? data.date.toDate()
              : null;
          results.push({
            eventId,
            photoRef: photos[0] ?? null,
            childName,
            date: rawDate
              ? rawDate.toLocaleDateString("fr-FR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
              : "",
          });
        } catch {
          results.push({
            eventId,
            photoRef: null,
            childName: "Inconnu",
            date: "",
          });
        }
      }

      setItems(results);
    } catch {
      showToast("Impossible de charger les photos masquées");
    }
  }, [allChildren, showToast]);

  useEffect(() => {
    if (!user?.uid) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const unsubscribe = onHiddenPhotosChange((hiddenIds) => {
      loadHiddenPhotos(hiddenIds)
        .finally(() => {
          setLoading(false);
        });
    });

    return () => unsubscribe();
  }, [user?.uid, loadHiddenPhotos]);

  const handleUnhide = useCallback(
    async (eventId: string) => {
      setUnhiding((prev) => new Set(prev).add(eventId));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      try {
        await unhidePhoto(eventId);
        showToast("Photo restaurée");
      } catch {
        showToast("Impossible de restaurer la photo");
      } finally {
        setUnhiding((prev) => {
          const next = new Set(prev);
          next.delete(eventId);
          return next;
        });
      }
    },
    [showToast],
  );

  const renderItem = useCallback(
    ({ item }: { item: HiddenPhotoItem }) => (
      <View
        style={[styles.card, { backgroundColor: nc.backgroundCard, borderColor: nc.borderLight }]}
      >
        <View
          style={styles.summaryContent}
          accessible={true}
          accessibilityRole="summary"
          accessibilityLabel={`Photo masquée${item.childName ? ` de ${item.childName}` : ""}${item.date ? `, ${item.date}` : ""}`}
        >
          <View style={styles.photoContainer}>
            {item.photoRef ? (
              <PhotoImage
                photoRef={item.photoRef}
                style={styles.thumbnail}
                resizeMode="cover"
                accessible={false}
              />
            ) : (
              <View
                style={[styles.thumbnail, styles.placeholder, { backgroundColor: nc.backgroundPressed }]}
                accessible={false}
              >
                <FontAwesome6 name="image" size={20} color={nc.textMuted} />
              </View>
            )}
          </View>
          <View style={styles.info}>
            <Text style={[styles.childName, { color: nc.textStrong }]} numberOfLines={1}>
              {item.childName}
            </Text>
            {item.date ? (
              <Text style={[styles.date, { color: nc.textMuted }]}>{item.date}</Text>
            ) : null}
          </View>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.unhideButton,
            { borderColor: tint },
            pressed && { backgroundColor: tint + "10" },
          ]}
          onPress={() => handleUnhide(item.eventId)}
          disabled={unhiding.has(item.eventId)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel={`Afficher à nouveau la photo${item.childName ? ` de ${item.childName}` : ""}${item.date ? `, ${item.date}` : ""}`}
          accessibilityHint="Restaure la photo dans la galerie"
          accessibilityState={{
            disabled: unhiding.has(item.eventId),
            busy: unhiding.has(item.eventId),
          }}
        >
          {unhiding.has(item.eventId) ? (
            <ActivityIndicator size="small" color={tint} />
          ) : (
            <FontAwesome6 name="eye" size={14} color={tint} />
          )}
        </Pressable>
      </View>
    ),
    [nc, tint, handleUnhide, unhiding],
  );

  return (
    <View style={[styles.screen, { backgroundColor: nc.background }]}>
      <SafeAreaView style={{ flex: 1 }} edges={["bottom"]}>
        <Stack.Screen
          options={{
            title: "Photos masquées",
            headerBackTitle: "Retour",
            headerStyle: { backgroundColor: nc.background },
            headerTintColor: nc.textStrong,
            headerTitleStyle: { color: nc.textStrong },
          }}
        />

        {loading ? (
          <View
            style={styles.center}
            accessible={true}
            accessibilityRole="progressbar"
            accessibilityLabel="Chargement des photos masquées"
          >
            <ActivityIndicator size="large" color={tint} />
          </View>
        ) : items.length === 0 ? (
          <View
            style={styles.center}
            accessible={true}
            accessibilityRole="summary"
            accessibilityLabel="Aucune photo masquée. Les photos que vous masquez dans la galerie apparaîtront ici."
          >
            <FontAwesome6 name="eye" size={40} color={nc.textMuted} />
            <Text style={[styles.emptyTitle, { color: nc.textStrong }]}>
              Aucune photo masquée
            </Text>
            <Text style={[styles.emptySubtitle, { color: nc.textMuted }]}>
              Les photos que vous masquez dans la galerie apparaîtront ici.
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.eventId}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
            accessibilityRole="list"
            accessibilityLabel={`${items.length} photo${items.length > 1 ? "s" : ""} masquée${items.length > 1 ? "s" : ""}`}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  list: {
    padding: 16,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  summaryContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  photoContainer: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: "hidden",
  },
  thumbnail: {
    width: 56,
    height: 56,
  },
  placeholder: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  childName: {
    fontSize: 15,
    fontWeight: "600",
  },
  date: {
    fontSize: 13,
  },
  unhideButton: {
    width: 44,
    height: 44,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
});
