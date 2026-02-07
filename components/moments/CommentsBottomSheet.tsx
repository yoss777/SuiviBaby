import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import {
  ajouterCommentaire,
  ecouterCommentaires,
  supprimerCommentaire,
} from "@/services/socialService";
import { CommentInfo, EventComment } from "@/types/social";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Timestamp } from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.7;

type CommentsBottomSheetProps = {
  visible: boolean;
  eventId: string;
  childId: string;
  photoTitle?: string;
  onClose: () => void;
};

const formatCommentDate = (timestamp: Timestamp): string => {
  const date = timestamp.toDate();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "À l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;

  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
};

const CommentItem = ({
  comment,
  isOwnComment,
  onDelete,
}: {
  comment: EventComment;
  isOwnComment: boolean;
  onDelete: (id: string) => void;
}) => {
  const [showDelete, setShowDelete] = useState(false);
  // For own comments, show "M" for "Moi"
  const avatarLetter = isOwnComment
    ? "M"
    : comment.userName.charAt(0).toUpperCase();

  return (
    <Pressable
      onLongPress={() => isOwnComment && setShowDelete(true)}
      onPress={() => setShowDelete(false)}
      style={styles.commentItem}
    >
      <View
        style={[styles.commentAvatar, isOwnComment && styles.commentAvatarOwn]}
      >
        <Text style={styles.commentAvatarText}>{avatarLetter}</Text>
      </View>
      <View style={styles.commentContent}>
        <View style={styles.commentHeader}>
          <Text style={styles.commentUserName}>
            {isOwnComment ? "Moi" : comment.userName}
          </Text>
          <Text style={styles.commentTime}>
            {formatCommentDate(comment.createdAt)}
          </Text>
        </View>
        <Text style={styles.commentText}>{comment.content}</Text>
      </View>
      {showDelete && isOwnComment && (
        <Pressable
          style={styles.deleteButton}
          onPress={() => onDelete(comment.id!)}
        >
          <FontAwesome6 name="trash" size={14} color="#ef4444" />
        </Pressable>
      )}
    </Pressable>
  );
};

export const CommentsBottomSheet = ({
  visible,
  eventId,
  childId,
  photoTitle,
  onClose,
}: CommentsBottomSheetProps) => {
  const { user, userName } = useAuth();
  const currentUserId = user?.uid;
  const { showToast } = useToast();

  const [commentInfo, setCommentInfo] = useState<CommentInfo>({
    count: 0,
    comments: [],
  });
  const [newComment, setNewComment] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);

  // Pan responder for swipe to close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          handleClose();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        }
      },
    }),
  ).current;

  // Open/close animation
  useEffect(() => {
    if (visible) {
      translateY.setValue(SHEET_HEIGHT);
      backdropOpacity.setValue(0);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      translateY.setValue(SHEET_HEIGHT);
      backdropOpacity.setValue(0);
    }
  }, [visible, translateY, backdropOpacity]);

  // Listen to comments
  useEffect(() => {
    if (!visible || !eventId) return;

    setIsLoading(true);
    const unsubscribe = ecouterCommentaires(eventId, (info) => {
      setCommentInfo(info);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [visible, eventId]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: SHEET_HEIGHT,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onClose();
    });
  }, [translateY, backdropOpacity, onClose]);

  const handleSendComment = useCallback(async () => {
    const trimmedComment = newComment.trim();
    if (!trimmedComment || isSending) return;

    try {
      setIsSending(true);
      await ajouterCommentaire(
        eventId,
        childId,
        userName ?? "Moi",
        trimmedComment,
      );
      setNewComment("");
      Keyboard.dismiss();
    } catch {
      showToast("Impossible d'envoyer le commentaire");
    } finally {
      setIsSending(false);
    }
  }, [newComment, isSending, eventId, childId, userName, showToast]);

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      try {
        await supprimerCommentaire(commentId);
      } catch {
        showToast("Impossible de supprimer le commentaire");
      }
    },
    [showToast],
  );

  const renderComment = useCallback(
    ({ item }: { item: EventComment }) => (
      <CommentItem
        comment={item}
        isOwnComment={item.userId === currentUserId}
        onDelete={handleDeleteComment}
      />
    ),
    [currentUserId, handleDeleteComment],
  );

  const renderEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color="#9ca3af" />
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <FontAwesome6 name="comment" size={40} color="#d1d5db" />
        <Text style={styles.emptyText}>Aucun commentaire</Text>
        <Text style={styles.emptySubtext}>
          Soyez le premier à commenter ce moment !
        </Text>
      </View>
    );
  }, [isLoading]);

  return (
    <View style={styles.overlay} pointerEvents={visible ? "auto" : "none"}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            {
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Handle */}
          <View {...panResponder.panHandlers} style={styles.handleContainer}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              Commentaires
              {commentInfo.count > 0 && (
                <Text style={styles.headerCount}> ({commentInfo.count})</Text>
              )}
            </Text>
            {photoTitle && (
              <Text style={styles.headerSubtitle} numberOfLines={1}>
                {photoTitle}
              </Text>
            )}
          </View>

          {/* Comments list */}
          <FlatList
            data={commentInfo.comments}
            renderItem={renderComment}
            keyExtractor={(item) => item.id!}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmpty}
            keyboardShouldPersistTaps="handled"
          />

          {/* Input area */}
          <View style={styles.inputContainer}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Ajouter un commentaire..."
              placeholderTextColor="#9ca3af"
              value={newComment}
              onChangeText={setNewComment}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handleSendComment}
              blurOnSubmit={false}
            />
            <Pressable
              style={[
                styles.sendButton,
                (!newComment.trim() || isSending) && styles.sendButtonDisabled,
              ]}
              onPress={handleSendComment}
              disabled={!newComment.trim() || isSending}
            >
              {isSending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <FontAwesome6 name="paper-plane" size={16} color="#fff" solid />
              )}
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
  },
  container: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: SHEET_HEIGHT,
    minHeight: 300,
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "#d1d5db",
    borderRadius: 2,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1f2937",
  },
  headerCount: {
    fontWeight: "500",
    color: "#6b7280",
  },
  headerSubtitle: {
    fontSize: 13,
    color: "#9ca3af",
    marginTop: 2,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexGrow: 1,
  },
  commentItem: {
    flexDirection: "row",
    paddingVertical: 12,
    alignItems: "flex-start",
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#e5e7eb",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  commentAvatarOwn: {
    backgroundColor: "#dbeafe",
  },
  commentAvatarText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6b7280",
  },
  commentContent: {
    flex: 1,
  },
  commentHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  commentUserName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1f2937",
    marginRight: 8,
  },
  commentTime: {
    fontSize: 12,
    color: "#9ca3af",
  },
  commentText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },
  deleteButton: {
    padding: 8,
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6b7280",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9ca3af",
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    marginBottom: 20,
    borderTopColor: "#f3f4f6",
    backgroundColor: "#fff",
    paddingBottom: Platform.OS === "ios" ? 28 : 12,
  },
  input: {
    flex: 1,
    backgroundColor: "#f3f4f6",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: "#1f2937",
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#3b82f6",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "#d1d5db",
  },
});
