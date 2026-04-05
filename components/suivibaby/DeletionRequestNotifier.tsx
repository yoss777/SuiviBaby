// components/suivibaby/DeletionRequestNotifier.tsx
// Shows a popup when the user has pending or refused deletion requests on app launch.

import { Ionicons } from "@expo/vector-icons";
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";

import { db } from "@/config/firebase";
import { getNeutralColors } from "@/constants/dashboardColors";
import { Colors } from "@/constants/theme";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { voteOnDeletionRequest } from "@/services/childDeletionService";

interface OwnerVote {
  vote: "pending" | "approved" | "refused";
  votedAt?: { seconds: number };
}

interface DeletionRequest {
  id: string;
  childName: string;
  requestedBy: string;
  requestedByEmail: string;
  status: "pending" | "refused";
  ownerVotes: Record<string, OwnerVote>;
  refusedBy?: string;
  refusedByEmail?: string;
  seenByUserIds: string[];
}

export function DeletionRequestNotifier() {
  const colorScheme = useColorScheme() ?? "light";
  const nc = getNeutralColors(colorScheme);
  const { user } = useAuth();
  const { showToast } = useToast();

  const [currentRequest, setCurrentRequest] = useState<DeletionRequest | null>(
    null
  );
  const [ownerNames, setOwnerNames] = useState<Record<string, string>>({});
  const [isVoting, setIsVoting] = useState(false);
  const hasChecked = useRef(false);

  // Check for unseen deletion requests on mount
  useEffect(() => {
    if (!user?.uid || hasChecked.current) return;
    hasChecked.current = true;

    const q = query(
      collection(db, "childDeletionRequests"),
      where("ownerIds", "array-contains", user.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const uid = user.uid;

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        // Only pending or refused
        if (data.status !== "pending" && data.status !== "refused") continue;
        if (!data.ownerVotes || !data.ownerVotes[uid]) continue;

        // Skip if already seen
        if (data.seenByUserIds?.includes(uid)) continue;

        // For pending: only show if user hasn't voted yet
        if (
          data.status === "pending" &&
          data.ownerVotes[uid].vote !== "pending"
        )
          continue;

        // For refused: show to everyone who hasn't seen it
        // Resolve owner names
        const names: Record<string, string> = {};
        for (const ownerId of Object.keys(data.ownerVotes)) {
          try {
            const publicDoc = await getDoc(doc(db, "users_public", ownerId));
            names[ownerId] = publicDoc.exists()
              ? publicDoc.data()?.displayName || ownerId.slice(0, 8) + "..."
              : ownerId.slice(0, 8) + "...";
          } catch {
            names[ownerId] = ownerId.slice(0, 8) + "...";
          }
        }

        setOwnerNames(names);
        setCurrentRequest({
          id: docSnap.id,
          childName: data.childName,
          requestedBy: data.requestedBy,
          requestedByEmail: data.requestedByEmail,
          status: data.status,
          ownerVotes: data.ownerVotes,
          refusedBy: data.refusedBy,
          refusedByEmail: data.refusedByEmail,
          seenByUserIds: data.seenByUserIds || [],
        });
        break; // Show one at a time
      }
    }, () => {
      // Silently ignore — collection may not exist yet
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const dismiss = async () => {
    if (currentRequest && user?.uid) {
      // Mark as seen
      try {
        await updateDoc(doc(db, "childDeletionRequests", currentRequest.id), {
          seenByUserIds: arrayUnion(user.uid),
        });
      } catch {
        // Ignore — CF-only write rule, this may fail
        // The popup just won't re-appear since we track locally
      }
    }
    setCurrentRequest(null);
  };

  const handleVote = async (vote: "approved" | "refused") => {
    if (!currentRequest) return;
    setIsVoting(true);

    try {
      const result = await voteOnDeletionRequest(currentRequest.id, vote);
      Haptics.notificationAsync(
        vote === "approved"
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning
      );

      if (result.status === "approved") {
        showToast(`${currentRequest.childName} sera supprime dans 30 jours`);
      } else if (result.status === "refused") {
        showToast("Suppression refusee");
      } else {
        showToast("Vote enregistre");
      }
    } catch {
      showToast("Erreur lors du vote");
    } finally {
      setIsVoting(false);
      setCurrentRequest(null);
    }
  };

  if (!currentRequest) return null;

  const isPending = currentRequest.status === "pending";
  const canVote =
    isPending &&
    currentRequest.ownerVotes[user?.uid || ""]?.vote === "pending";

  const getVoteIcon = (vote: string) => {
    switch (vote) {
      case "approved":
        return { name: "checkmark-circle" as const, color: nc.success };
      case "refused":
        return { name: "close-circle" as const, color: nc.error };
      default:
        return { name: "hourglass-outline" as const, color: nc.textMuted };
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismiss}>
      <Pressable style={styles.overlay} onPress={dismiss}>
        <Pressable
          style={[styles.content, { backgroundColor: nc.backgroundCard }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Ionicons
            name={isPending ? "alert-circle" : "close-circle"}
            size={40}
            color={isPending ? nc.todayAccent : nc.error}
            style={styles.icon}
          />
          <Text style={[styles.title, { color: nc.textStrong }]}>
            {isPending
              ? "Demande de suppression"
              : "Demande de suppression refusee"}
          </Text>
          <Text style={[styles.message, { color: nc.textLight }]}>
            {isPending
              ? `${ownerNames[currentRequest.requestedBy] || currentRequest.requestedByEmail} souhaite supprimer ${currentRequest.childName}.`
              : `${ownerNames[currentRequest.refusedBy || ""] || currentRequest.refusedByEmail || "Un proprietaire"} a refuse la suppression de ${currentRequest.childName}.`}
          </Text>

          {/* Votes */}
          <View style={styles.votesSection}>
            {Object.entries(currentRequest.ownerVotes).map(
              ([ownerId, vote]) => {
                const icon = getVoteIcon(vote.vote);
                const name =
                  ownerId === user?.uid
                    ? "Vous"
                    : ownerNames[ownerId] || ownerId.slice(0, 8) + "...";
                const suffix =
                  currentRequest.status === "refused" &&
                  vote.vote === "pending"
                    ? " (vote annule)"
                    : "";
                return (
                  <View key={ownerId} style={styles.voteRow}>
                    <Ionicons
                      name={icon.name}
                      size={18}
                      color={icon.color}
                    />
                    <Text style={[styles.voteName, { color: nc.textStrong }]}>
                      {name}
                      {suffix}
                    </Text>
                  </View>
                );
              }
            )}
          </View>

          {/* Actions */}
          {canVote ? (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.actionButton, { borderColor: nc.error }]}
                onPress={() => handleVote("refused")}
                disabled={isVoting}
              >
                <Text style={[styles.actionText, { color: nc.error }]}>
                  Refuser
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  {
                    backgroundColor: nc.success,
                    borderColor: nc.success,
                  },
                ]}
                onPress={() => handleVote("approved")}
                disabled={isVoting}
              >
                <Text style={[styles.actionText, { color: nc.white }]}>
                  Approuver
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.okButton,
                { backgroundColor: Colors[colorScheme].tint },
              ]}
              onPress={dismiss}
            >
              <Text style={[styles.okText, { color: nc.white }]}>OK</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    width: "85%",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  icon: {
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },
  votesSection: {
    alignSelf: "stretch",
    gap: 6,
    marginBottom: 20,
  },
  voteRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 3,
  },
  voteName: {
    fontSize: 14,
    fontWeight: "500",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    alignSelf: "stretch",
  },
  actionButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
  },
  actionText: {
    fontSize: 16,
    fontWeight: "700",
  },
  okButton: {
    alignSelf: "stretch",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  okText: {
    fontSize: 16,
    fontWeight: "700",
  },
});
