import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { DotsLoader } from "@/components/ui/DotsLoader";
import { IconPulseDots } from "@/components/ui/IconPulseDtos";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useBaby } from "@/contexts/BabyContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { obtenirEvenementsDuJourHybrid } from "@/migration/eventsHybridService";
import {
  acceptInvitation,
  cleanupAlreadyLinkedInvitations,
  cleanupDuplicatePendingInvitations,
  listenToPendingInvitations,
  rejectInvitation,
  type ShareInvitation,
} from "@/services/childSharingService";
import { buildTodayEventsData, setTodayEventsCache } from "@/services/todayEventsCache";
import { InvitationModal } from "@/components/ui/InvitationModal";

export function InvitationListener() {
  const colorScheme = useColorScheme() ?? "light";
  const colors = Colors[colorScheme];
  const { user } = useAuth();
  const {
    activeChild,
    children,
    childrenLoaded,
    loading: babyLoading,
    setActiveChild,
  } = useBaby();
  const router = useRouter();
  const pathname = usePathname();
  const [incomingInvitation, setIncomingInvitation] = useState<ShareInvitation | null>(null);
  const [incomingVisible, setIncomingVisible] = useState(false);
  const [pendingChildId, setPendingChildId] = useState<string | null>(null);
  const [isPreparingChild, setIsPreparingChild] = useState(false);
  const seenInvitationIdsRef = useRef<Set<string>>(new Set());
  const seenChildIdsRef = useRef<Set<string>>(new Set());
  const isHandlingInviteRef = useRef(false);
  const cleanupDoneRef = useRef(false);

  useEffect(() => {
    if (!user?.email) return;
    if (pathname.includes("/join-child")) return;

    if (!cleanupDoneRef.current) {
      cleanupDoneRef.current = true;
      cleanupDuplicatePendingInvitations().catch((error) => {
        console.warn("[InvitationListener] cleanup failed:", error);
      });
      cleanupAlreadyLinkedInvitations().catch((error) => {
        console.warn("[InvitationListener] cleanup linked failed:", error);
      });
    }

    const unsubscribe = listenToPendingInvitations((invites) => {
      const linkedChildIds = new Set(children.map((child) => child.id));
      const seen = seenInvitationIdsRef.current;
      const seenChildren = seenChildIdsRef.current;
      const newInvites = invites.filter((invite) => {
        if (!invite.id) return false;
        if (invite.childId && linkedChildIds.has(invite.childId)) return false;
        if (seen.has(invite.id)) return false;
        if (invite.childId && seenChildren.has(invite.childId)) return false;
        return true;
      });
      newInvites.forEach((invite) => {
        if (invite.id) seen.add(invite.id);
        if (invite.childId) seenChildren.add(invite.childId);
      });

      if (!incomingVisible && newInvites.length > 0) {
        setIncomingInvitation(newInvites[0]);
        setIncomingVisible(true);
      }
    });

    return () => unsubscribe();
  }, [children, incomingVisible, pathname, user?.email]);

  useEffect(() => {
    if (!pendingChildId) return;
    if (babyLoading || !childrenLoaded) return;
    const matchedChild = children.find((child) => child.id === pendingChildId);
    if (!matchedChild) return;
    const hasVisibleActiveChild =
      !!activeChild && children.some((child) => child.id === activeChild.id);

    const run = async () => {
      try {
        if (!hasVisibleActiveChild) {
          setActiveChild(matchedChild);
        }
        const preloadTimeout = new Promise((resolve) => setTimeout(resolve, 2000));
        await Promise.race([
          obtenirEvenementsDuJourHybrid(matchedChild.id).then((events) => {
            setTodayEventsCache(matchedChild.id, buildTodayEventsData(events));
          }),
          preloadTimeout,
        ]);
        router.replace("/(drawer)/baby");
      } finally {
        setPendingChildId(null);
        setIsPreparingChild(false);
      }
    };

    run();
  }, [
    activeChild,
    babyLoading,
    children,
    childrenLoaded,
    pendingChildId,
    router,
    setActiveChild,
  ]);

  return (
    <>
      <InvitationModal
        visible={incomingVisible && !!incomingInvitation}
        childName={incomingInvitation?.childName ?? "cet enfant"}
        backgroundColor={colors.background}
        textColor={colors.text}
        accentColor={colors.tint}
        onAccept={async () => {
          if (!incomingInvitation?.id || isHandlingInviteRef.current) return;
          isHandlingInviteRef.current = true;
          try {
            setIsPreparingChild(true);
            await acceptInvitation(incomingInvitation.id);
            if (incomingInvitation.childId) {
              setPendingChildId(incomingInvitation.childId);
            }
          } finally {
            isHandlingInviteRef.current = false;
            setIncomingVisible(false);
            setIncomingInvitation(null);
          }
        }}
        onReject={async () => {
          if (!incomingInvitation?.id || isHandlingInviteRef.current) return;
          isHandlingInviteRef.current = true;
          try {
            await rejectInvitation(incomingInvitation.id);
          } finally {
            isHandlingInviteRef.current = false;
            setIncomingVisible(false);
            setIncomingInvitation(null);
            setIsPreparingChild(false);
          }
        }}
        onTimeout={() => {
          if (isHandlingInviteRef.current) return;
          setIncomingVisible(false);
          setIncomingInvitation(null);
          setIsPreparingChild(false);
        }}
      />
      {isPreparingChild && (
        <View style={styles.prepOverlay} pointerEvents="auto">
          <View style={[styles.prepCard, { backgroundColor: colors.background }]}>
            <View style={styles.prepLoaderStack}>
              <DotsLoader color={colors.tint} />
              <IconPulseDots size={24} color={colors.tint} gap={20} />
            </View>
            <Text style={[styles.prepText, { color: colors.text }]}>
              Chargement du profil...
            </Text>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  prepOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  prepCard: {
    width: "100%",
    maxWidth: 320,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderRadius: 14,
    alignItems: "center",
    gap: 12,
  },
  prepLoaderStack: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  prepText: {
    fontSize: 14,
    fontWeight: "600",
  },
});
