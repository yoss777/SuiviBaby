import {
  ConfettiBurst,
  // FloatingActionButton, // Commented - keeping animation for later use
  HeroMoodCard,
  MomentsSkeletonLoader,
  PolaroidGallery,
  SwipeGallery,
  VerticalMoodTimeline,
  WeekMoodOverview,
} from "@/components/moments";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useSheet } from "@/contexts/SheetContext";
import { useMomentsNotification } from "@/contexts/MomentsNotificationContext";
import { useToast } from "@/contexts/ToastContext";
import { useChildPermissions } from "@/hooks/useChildPermissions";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { useMomentsData, formatTime } from "@/hooks/useMomentsData";
import { useHiddenPhotos } from "@/hooks/useHiddenPhotos";
import { useMomentsActions } from "@/hooks/useMomentsActions";
import { Ionicons } from "@expo/vector-icons";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useCallback, useRef } from "react";
import {
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { useHeaderRight } from "../../_layout";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

// ============================================
// MAIN COMPONENT
// ============================================

export default function MomentsScreen() {
  const { activeChild } = useBaby();
  const { userName, firebaseUser } = useAuth();
  const { setHeaderRight } = useHeaderRight();
  const { showToast } = useToast();
  const { openSheet } = useSheet();
  const { newEventIds, newEventTypes, markEventAsSeen, markMomentsAsSeen } = useMomentsNotification();
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const insets = useSafeAreaInsets();
  const headerOwnerId = useRef("moments-header");
  const permissions = useChildPermissions(activeChild?.id, firebaseUser?.uid);
  const canManageContent =
    permissions.role === "owner" || permissions.role === "admin";

  const hiddenPhotoIds = useHiddenPhotos();

  // Data hook
  const {
    events,
    loaded,
    loadError,
    isRefreshing,
    moods,
    todayMood,
    allPhotoMilestones,
    displayedPhotoMilestones,
    likesInfo,
    commentCounts,
    authorNames,
    refreshToday,
    handleRefresh,
    refocus,
  } = useMomentsData(activeChild?.id, firebaseUser?.uid, hiddenPhotoIds);

  const handleSheetSuccess = useCallback(() => {
    refreshToday();
    showToast("Souvenir enregistré");
  }, [refreshToday, showToast]);

  // Actions hook
  const {
    confettiTrigger,
    galleryVisible,
    galleryInitialIndex,
    handleAddMilestone,
    handleAddMood,
    handleAddPhoto,
    handlePhotoPress,
    handleSeeAll,
    handleEditPhoto,
    handleLike,
    handleDownload,
    handleCloseGallery,
  } = useMomentsActions({
    childId: activeChild?.id,
    userName,
    events,
    openSheet,
    showToast,
    onSuccess: handleSheetSuccess,
    canManageContent,
  });

  // Re-merge on tab focus — frozen tabs miss state updates
  useFocusEffect(
    useCallback(() => {
      refocus();
    }, [refocus]),
  );

  // Ne PAS appeler markMomentsAsSeen ici — les badges restent visibles
  // jusqu'à ce que l'utilisateur tape sur chaque photo (markEventAsSeen)
  // ou ouvre la galerie complète (gallery.tsx marque à la sortie)

  // Header setup
  const hasNotifications = newEventIds.size > 0;

  const handleMarkAllRead = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markMomentsAsSeen();
  }, [markMomentsAsSeen]);

  useFocusEffect(
    useCallback(() => {
      const headerButtons = (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingRight: 16,
            gap: 0,
          }}
        >
          {hasNotifications && (
            <Pressable
              onPress={handleMarkAllRead}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel="Tout marquer comme lu"
              accessibilityHint="Supprime tous les badges de notification"
            >
              <Ionicons name="checkmark-done" size={22} color={Colors[colorScheme].tint} />
            </Pressable>
          )}
          {canManageContent && (
            <Pressable
              onPress={handleAddMilestone}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.headerButton}
              accessibilityRole="button"
              accessibilityLabel="Ajouter un souvenir"
            >
              <Ionicons name="add" size={24} color={Colors[colorScheme].tint} />
            </Pressable>
          )}
        </View>
      );
      setHeaderRight(headerButtons, headerOwnerId.current);

      return () => {
        setHeaderRight(null, headerOwnerId.current);
      };
    }, [canManageContent, hasNotifications, colorScheme, setHeaderRight, handleAddMilestone, handleMarkAllRead]),
  );

  // Bound photo press handler
  const onPhotoPress = useCallback(
    (photo: { id: string }) => handlePhotoPress(photo, allPhotoMilestones),
    [handlePhotoPress, allPhotoMilestones],
  );

  // Loading state
  if (!loaded) {
    return <MomentsSkeletonLoader colorScheme={colorScheme} />;
  }

  // Empty state — first contact with the Moments tab
  const hasNoContent = events.length === 0 && !loadError;

  return (
    <View style={[styles.container, { backgroundColor: nc.backgroundWarm }]}>
      <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 20) },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={Colors[colorScheme].tint}
            />
          }
        >
          {/* Error banner */}
          {loadError && (
            <Animated.View entering={FadeIn.duration(300)}>
              <Pressable
                onPress={handleRefresh}
                style={[styles.errorBanner, { backgroundColor: nc.error + "15" }]}
                accessibilityRole="button"
                accessibilityLabel="Erreur de chargement, appuyez pour réessayer"
              >
                <FontAwesome6
                  name="triangle-exclamation"
                  size={14}
                  color={nc.error}
                />
                <Text style={[styles.errorText, { color: nc.error }]}>
                  Impossible de charger les données. Appuyez pour réessayer.
                </Text>
              </Pressable>
            </Animated.View>
          )}

          {/* Hero Mood Card */}
          <Animated.View
            entering={FadeIn.duration(400)}
            accessibilityRole="summary"
            accessibilityLabel={
              todayMood
                ? `Humeur du jour enregistrée à ${formatTime(todayMood.date)}`
                : "Aucune humeur enregistrée aujourd'hui"
            }
          >
            <View style={styles.heroCardWrapper}>
              <HeroMoodCard
                mood={todayMood?.humeur ?? null}
                babyName={"Bébé"}
                time={todayMood ? formatTime(todayMood.date) : undefined}
                onAddMood={handleAddMood}
                canEditMood={canManageContent}
                colorScheme={colorScheme}
              />
              <View
                style={[
                  styles.confettiContainer,
                  { left: SCREEN_WIDTH / 2 - 100 },
                ]}
              >
                <ConfettiBurst trigger={confettiTrigger} />
              </View>
            </View>
          </Animated.View>

          {hasNoContent ? (
            // Empty state for new users
            <Animated.View entering={FadeInUp.delay(100).springify()}>
              <View
                style={[
                  styles.emptyState,
                  { backgroundColor: nc.backgroundCard },
                ]}
                accessibilityRole="text"
                accessibilityLabel="Aucun souvenir enregistré. Commencez par ajouter une humeur ou une photo."
              >
                <Text style={styles.emptyEmoji}>📸</Text>
                <Text style={[styles.emptyTitle, { color: nc.textStrong }]}>
                  Pas encore de souvenirs
                </Text>
                <Text style={[styles.emptySubtitle, { color: nc.textLight }]}>
                  Enregistrez une humeur ci-dessus ou ajoutez votre première
                  photo pour commencer à capturer les moments de Bébé.
                </Text>
                {canManageContent && (
                  <Pressable
                    onPress={handleAddPhoto}
                    style={({ pressed }) => [
                      styles.emptyButton,
                      pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Ajouter un premier souvenir"
                  >
                    <FontAwesome6 name="camera" size={16} color="#fff" />
                    <Text style={styles.emptyButtonText}>
                      Capturer un souvenir
                    </Text>
                  </Pressable>
                )}
              </View>
            </Animated.View>
          ) : (
            <>
              {/* Vertical Timeline */}
              <Animated.View
                entering={FadeInUp.delay(50).springify()}
                accessibilityRole="list"
                accessibilityLabel="Fil des humeurs du jour"
              >
                <VerticalMoodTimeline moods={moods} colorScheme={colorScheme} />
              </Animated.View>

              {/* Week Overview */}
              <Animated.View
                entering={FadeInUp.delay(100).springify()}
                accessibilityRole="summary"
                accessibilityLabel="Résumé des humeurs de la semaine"
              >
                <WeekMoodOverview moods={moods} colorScheme={colorScheme} />
              </Animated.View>

              {/* Polaroid Gallery */}
              <Animated.View
                entering={FadeInUp.delay(150).springify()}
                accessibilityRole="list"
                accessibilityLabel="Galerie de photos souvenirs"
              >
                <PolaroidGallery
                  photos={
                    canManageContent
                      ? displayedPhotoMilestones
                      : allPhotoMilestones.slice(0, 4)
                  }
                  onPhotoPress={onPhotoPress}
                  onAddPhoto={canManageContent ? handleAddPhoto : undefined}
                  onSeeAll={handleSeeAll}
                  likesInfo={likesInfo}
                  commentCounts={commentCounts}
                  newEventIds={newEventIds}
                  newEventTypes={newEventTypes}
                  colorScheme={colorScheme}
                />
              </Animated.View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Floating Action Button - commented for now, keeping animation for later use
      <FloatingActionButton
        onMoodPress={handleAddMood}
        onPhotoPress={handleAddPhoto}
        onMilestonePress={handleAddMilestone}
      />
      */}

      {/* Swipe Gallery */}
      <SwipeGallery
        photos={allPhotoMilestones.map((p) => ({
          id: p.id,
          uri: p.photo,
          date: p.date,
          titre: p.titre,
          userId: p.userId,
        }))}
        initialIndex={galleryInitialIndex}
        visible={galleryVisible}
        childId={activeChild?.id ?? ""}
        backgroundColor="rgba(60, 50, 40, 0.97)"
        onClose={handleCloseGallery}
        onAddPhoto={canManageContent ? handleAddPhoto : undefined}
        onEdit={canManageContent ? handleEditPhoto : undefined}
        onLike={handleLike}
        onDownload={handleDownload}
        onMarkSeen={markEventAsSeen}
        newEventIds={newEventIds}
        likesInfo={likesInfo}
        commentCounts={commentCounts}
        currentUserName={userName ?? "Moi"}
        authorNames={authorNames}
        currentUserId={firebaseUser?.uid}
      />
    </View>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
  },
  heroCardWrapper: {
    position: "relative",
    overflow: "visible",
  },
  confettiContainer: {
    position: "absolute",
    top: -20,
    zIndex: 1000,
    pointerEvents: "none",
  },
  headerButton: {
    paddingVertical: 8,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },
  emptyState: {
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
    marginBottom: 24,
  },
  emptyButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#E8A85A",
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 50,
  },
  emptyButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
});
