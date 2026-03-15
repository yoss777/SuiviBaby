import { getNeutralColors } from "@/constants/dashboardColors";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/contexts/ToastContext";
import { useChildAccesses } from "@/hooks/useChildPermissions";
import {
  ajouterCommentaire,
  ecouterCommentaires,
  getUserNames,
  supprimerCommentaire,
} from "@/services/socialService";
import { CommentInfo, EventComment, Mention } from "@/types/social";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import { Timestamp } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const { height: SCREEN_HEIGHT } = Dimensions.get("window");
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.7;
const MENTION_COLOR = "#E8A85A";

type CommentsBottomSheetProps = {
  visible: boolean;
  eventId: string;
  childId: string;
  photoTitle?: string;
  onClose: () => void;
  colorScheme?: "light" | "dark";
};

type MentionableUser = {
  userId: string;
  userName: string;
};

const formatCommentDate = (timestamp: Timestamp): string => {
  const date = timestamp.toDate();
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "A l'instant";
  if (diffMins < 60) return `Il y a ${diffMins} min`;
  if (diffHours < 24) return `Il y a ${diffHours}h`;
  if (diffDays < 7) return `Il y a ${diffDays}j`;

  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });
};

// Render comment content with @mentions highlighted
const CommentContentText = ({
  content,
  mentions,
  textColor,
}: {
  content: string;
  mentions?: Mention[];
  textColor: string;
}) => {
  if (!mentions || mentions.length === 0) {
    return (
      <Text style={[styles.commentText, { color: textColor }]}>{content}</Text>
    );
  }

  // Build regex from mention names
  const mentionNames = mentions.map((m) => m.userName);
  const regex = new RegExp(
    `(@(?:${mentionNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")}))`,
    "g",
  );

  const parts = content.split(regex);

  return (
    <Text style={[styles.commentText, { color: textColor }]}>
      {parts.map((part, i) => {
        if (
          part.startsWith("@") &&
          mentionNames.some((n) => part === `@${n}`)
        ) {
          return (
            <Text key={i} style={{ color: MENTION_COLOR, fontWeight: "600" }}>
              {part}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
};

const CommentItem = ({
  comment,
  isOwnComment,
  isReply,
  onDelete,
  onReply,
  nc,
}: {
  comment: EventComment;
  isOwnComment: boolean;
  isReply: boolean;
  onDelete: (id: string) => void;
  onReply: (comment: EventComment) => void;
  nc: ReturnType<typeof getNeutralColors>;
}) => {
  const [showDelete, setShowDelete] = useState(false);
  const avatarLetter = isOwnComment
    ? "M"
    : comment.userName.charAt(0).toUpperCase();

  return (
    <Pressable
      onLongPress={() => isOwnComment && setShowDelete(true)}
      onPress={() => setShowDelete(false)}
      style={[styles.commentItem, isReply && styles.replyItem]}
    >
      <View
        style={[
          styles.commentAvatar,
          isReply && styles.replyAvatar,
          { backgroundColor: nc.borderLight },
          isOwnComment && { backgroundColor: nc.todayAccent + "30" },
        ]}
      >
        <Text
          style={[
            styles.commentAvatarText,
            isReply && styles.replyAvatarText,
            { color: nc.textMuted },
          ]}
        >
          {avatarLetter}
        </Text>
      </View>
      <View style={styles.commentContent}>
        <View style={styles.commentHeader}>
          <Text style={[styles.commentUserName, { color: nc.textStrong }]}>
            {isOwnComment ? "Moi" : comment.userName}
          </Text>
          <Text style={[styles.commentTime, { color: nc.textMuted }]}>
            {formatCommentDate(comment.createdAt)}
          </Text>
        </View>
        {/* Reply citation */}
        {comment.replyToUserName && (
          <View
            style={[
              styles.replyCitation,
              { backgroundColor: nc.borderLight + "80" },
            ]}
          >
            <FontAwesome6 name="reply" size={9} color={nc.textMuted} />
            <Text
              style={[styles.replyCitationText, { color: nc.textMuted }]}
              numberOfLines={1}
            >
              {comment.replyToUserName}
            </Text>
          </View>
        )}
        <CommentContentText
          content={comment.content}
          mentions={comment.mentions}
          textColor={nc.textNormal}
        />
        {/* Reply button */}
        <Pressable
          onPress={() => onReply(comment)}
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          style={styles.replyButton}
        >
          <Text style={[styles.replyButtonText, { color: nc.textMuted }]}>
            Repondre
          </Text>
        </Pressable>
      </View>
      {showDelete && isOwnComment && (
        <Pressable
          style={styles.deleteButton}
          onPress={() => onDelete(comment.id!)}
          accessibilityRole="button"
          accessibilityLabel="Supprimer ce commentaire"
        >
          <FontAwesome6 name="trash" size={14} color="#ef4444" />
        </Pressable>
      )}
    </Pressable>
  );
};

// Build threaded comment list: parent comments with their replies grouped below
const buildThreadedComments = (
  comments: EventComment[],
): { comment: EventComment; isReply: boolean }[] => {
  const result: { comment: EventComment; isReply: boolean }[] = [];
  const parentComments = comments.filter((c) => !c.replyToId);
  const repliesByParent = new Map<string, EventComment[]>();

  comments.forEach((c) => {
    if (c.replyToId) {
      const list = repliesByParent.get(c.replyToId) || [];
      list.push(c);
      repliesByParent.set(c.replyToId, list);
    }
  });

  parentComments.forEach((parent) => {
    result.push({ comment: parent, isReply: false });
    const replies = repliesByParent.get(parent.id!) || [];
    replies.forEach((reply) => {
      result.push({ comment: reply, isReply: true });
    });
  });

  return result;
};

// Mention picker row
const MentionPickerItem = ({
  user,
  onSelect,
  nc,
}: {
  user: MentionableUser;
  onSelect: (user: MentionableUser) => void;
  nc: ReturnType<typeof getNeutralColors>;
}) => (
  <Pressable style={styles.mentionItem} onPress={() => onSelect(user)}>
    <View style={[styles.mentionAvatar, { backgroundColor: nc.borderLight }]}>
      <Text style={[styles.mentionAvatarText, { color: nc.textMuted }]}>
        {user.userName.charAt(0).toUpperCase()}
      </Text>
    </View>
    <Text style={[styles.mentionName, { color: nc.textStrong }]}>
      {user.userName}
    </Text>
  </Pressable>
);

export const CommentsBottomSheet = ({
  visible,
  eventId,
  childId,
  photoTitle,
  onClose,
  colorScheme = "light",
}: CommentsBottomSheetProps) => {
  const nc = getNeutralColors(colorScheme);
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

  // Reply state
  const [replyTo, setReplyTo] = useState<EventComment | null>(null);

  // Mention state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [selectedMentions, setSelectedMentions] = useState<Mention[]>([]);
  const [mentionableUsers, setMentionableUsers] = useState<MentionableUser[]>(
    [],
  );

  const translateY = useRef(new Animated.Value(SHEET_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const inputRef = useRef<TextInput>(null);
  const flatListRef = useRef<FlatList>(null);

  // Load mentionable users from child access list
  const { accesses } = useChildAccesses(childId);

  useEffect(() => {
    if (!accesses || !currentUserId) return;
    const userIds = Object.keys(accesses).filter((id) => id !== currentUserId);
    if (userIds.length === 0) {
      setMentionableUsers([]);
      return;
    }
    let cancelled = false;
    getUserNames(userIds).then((namesMap) => {
      if (cancelled) return;
      const users: MentionableUser[] = [];
      namesMap.forEach((name, uid) => {
        users.push({ userId: uid, userName: name });
      });
      setMentionableUsers(users);
    });
    return () => {
      cancelled = true;
    };
  }, [accesses, currentUserId]);

  // Filter mentionable users by query
  const filteredMentions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionableUsers.filter((u) =>
      u.userName.toLowerCase().startsWith(q),
    );
  }, [mentionQuery, mentionableUsers]);

  // Detect @ trigger in text input
  const handleTextChange = useCallback((text: string) => {
    setNewComment(text);

    // Check if user is typing a mention
    const cursorPos = text.length; // Approximate: end of text
    const lastAtIndex = text.lastIndexOf("@", cursorPos);
    if (lastAtIndex >= 0) {
      const charBefore = lastAtIndex > 0 ? text[lastAtIndex - 1] : " ";
      if (charBefore === " " || charBefore === "\n" || lastAtIndex === 0) {
        const afterAt = text.substring(lastAtIndex + 1);
        // Only show picker if no space after @ (still typing the name)
        if (!afterAt.includes(" ") && !afterAt.includes("\n")) {
          setMentionQuery(afterAt);
          return;
        }
      }
    }
    setMentionQuery(null);
  }, []);

  // Handle mention selection
  const handleSelectMention = useCallback(
    (mentionUser: MentionableUser) => {
      const lastAtIndex = newComment.lastIndexOf("@");
      if (lastAtIndex >= 0) {
        const before = newComment.substring(0, lastAtIndex);
        const after = `@${mentionUser.userName} `;
        setNewComment(before + after);
        setSelectedMentions((prev) => {
          if (prev.some((m) => m.userId === mentionUser.userId)) return prev;
          return [
            ...prev,
            { userId: mentionUser.userId, userName: mentionUser.userName },
          ];
        });
      }
      setMentionQuery(null);
      inputRef.current?.focus();
    },
    [newComment],
  );

  // Pan responder for swipe to close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
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
      setReplyTo(null);
      setMentionQuery(null);
      setSelectedMentions([]);
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

  // Handle reply
  const handleReply = useCallback(
    (comment: EventComment) => {
      const displayName =
        comment.userId === user?.uid ? "Moi" : comment.userName;
      setReplyTo(comment);
      setNewComment(`@${displayName} `);
      setSelectedMentions([
        { userId: comment.userId, userName: comment.userName },
      ]);
      inputRef.current?.focus();
    },
    [user?.uid],
  );

  const handleCancelReply = useCallback(() => {
    setReplyTo(null);
    setNewComment("");
    setSelectedMentions([]);
  }, []);

  const handleSendComment = useCallback(async () => {
    const trimmedComment = newComment.trim();
    if (!trimmedComment || isSending) return;

    // Filter mentions to only those actually present in the text
    const actualMentions = selectedMentions.filter((m) =>
      trimmedComment.includes(`@${m.userName}`),
    );

    try {
      setIsSending(true);
      await ajouterCommentaire(
        eventId,
        childId,
        userName ?? "Moi",
        trimmedComment,
        {
          replyToId: replyTo?.id,
          replyToUserName: replyTo
            ? replyTo.userId === user?.uid
              ? "Moi"
              : replyTo.userName
            : undefined,
          mentions: actualMentions.length > 0 ? actualMentions : undefined,
        },
      );
      setNewComment("");
      setReplyTo(null);
      setSelectedMentions([]);
      setMentionQuery(null);
      Keyboard.dismiss();
    } catch {
      showToast("Impossible d'envoyer le commentaire");
    } finally {
      setIsSending(false);
    }
  }, [
    newComment,
    isSending,
    eventId,
    childId,
    userName,
    showToast,
    replyTo,
    selectedMentions,
    user?.uid,
  ]);

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

  // Build threaded list
  const threadedComments = useMemo(
    () => buildThreadedComments(commentInfo.comments),
    [commentInfo.comments],
  );

  const renderComment = useCallback(
    ({ item }: { item: { comment: EventComment; isReply: boolean } }) => (
      <CommentItem
        comment={item.comment}
        isOwnComment={item.comment.userId === currentUserId}
        isReply={item.isReply}
        onDelete={handleDeleteComment}
        onReply={handleReply}
        nc={nc}
      />
    ),
    [currentUserId, handleDeleteComment, handleReply, nc],
  );

  const renderEmpty = useCallback(() => {
    if (isLoading) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="small" color={nc.textMuted} />
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <FontAwesome6 name="comment" size={40} color={nc.borderLight} />
        <Text style={[styles.emptyText, { color: nc.textMuted }]}>
          Aucun commentaire
        </Text>
        <Text style={[styles.emptySubtext, { color: nc.textLight }]}>
          Soyez le premier a commenter ce moment !
        </Text>
      </View>
    );
  }, [isLoading, nc]);

  return (
    <View style={styles.overlay} pointerEvents={visible ? "auto" : "none"}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel="Fermer les commentaires"
          />
        </Animated.View>

        {/* Sheet */}
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: nc.backgroundCard,
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Handle */}
          <View {...panResponder.panHandlers} style={styles.handleContainer}>
            <View
              style={[styles.handle, { backgroundColor: nc.borderLight }]}
            />
          </View>

          {/* Header */}
          <View style={[styles.header, { borderBottomColor: nc.borderLight }]}>
            <Text style={[styles.headerTitle, { color: nc.textStrong }]}>
              Commentaires
              {commentInfo.count > 0 && (
                <Text style={[styles.headerCount, { color: nc.textMuted }]}>
                  {" "}
                  ({commentInfo.count})
                </Text>
              )}
            </Text>
            {photoTitle && (
              <Text
                style={[styles.headerSubtitle, { color: nc.textLight }]}
                numberOfLines={1}
              >
                {photoTitle}
              </Text>
            )}
          </View>

          {/* Comments list */}
          <FlatList
            ref={flatListRef}
            data={threadedComments}
            renderItem={renderComment}
            keyExtractor={(item) => item.comment.id!}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmpty}
            keyboardShouldPersistTaps="handled"
          />

          {/* Mention picker */}
          {mentionQuery !== null && filteredMentions.length > 0 && (
            <View
              style={[
                styles.mentionPicker,
                {
                  backgroundColor: nc.backgroundCard,
                  borderTopColor: nc.borderLight,
                },
              ]}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {filteredMentions.map((u) => (
                  <MentionPickerItem
                    key={u.userId}
                    user={u}
                    onSelect={handleSelectMention}
                    nc={nc}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Reply banner */}
          {replyTo && (
            <View
              style={[
                styles.replyBanner,
                {
                  backgroundColor: nc.background,
                  borderTopColor: nc.borderLight,
                },
              ]}
            >
              <FontAwesome6 name="reply" size={12} color={MENTION_COLOR} />
              <Text
                style={[styles.replyBannerText, { color: nc.textMuted }]}
                numberOfLines={1}
              >
                Réponse à{" "}
                <Text style={{ fontWeight: "600", color: nc.textStrong }}>
                  {replyTo.userId === currentUserId ? "Moi" : replyTo.userName}
                </Text>
              </Text>
              <Pressable onPress={handleCancelReply} hitSlop={8}>
                <FontAwesome6 name="xmark" size={14} color={nc.textMuted} />
              </Pressable>
            </View>
          )}

          {/* Input area */}
          <View
            style={[
              styles.inputContainer,
              {
                borderTopColor: nc.borderLight,
                backgroundColor: nc.backgroundCard,
              },
            ]}
          >
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                {
                  backgroundColor: nc.background,
                  color: nc.textStrong,
                },
              ]}
              placeholder="Ajouter un commentaire..."
              placeholderTextColor={nc.textLight}
              value={newComment}
              onChangeText={handleTextChange}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={handleSendComment}
              blurOnSubmit={false}
              accessibilityLabel="Ecrire un commentaire"
            />
            <Pressable
              style={[
                styles.sendButton,
                (!newComment.trim() || isSending) && {
                  backgroundColor: nc.borderLight,
                },
              ]}
              onPress={handleSendComment}
              disabled={!newComment.trim() || isSending}
              accessibilityRole="button"
              accessibilityLabel="Envoyer le commentaire"
              accessibilityState={{ disabled: !newComment.trim() || isSending }}
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
    borderRadius: 2,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  headerCount: {
    fontWeight: "500",
  },
  headerSubtitle: {
    fontSize: 13,
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
  replyItem: {
    paddingLeft: 32,
    paddingVertical: 8,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  replyAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  commentAvatarText: {
    fontSize: 14,
    fontWeight: "600",
  },
  replyAvatarText: {
    fontSize: 11,
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
    marginRight: 8,
  },
  commentTime: {
    fontSize: 12,
  },
  commentText: {
    fontSize: 14,
    lineHeight: 20,
  },
  replyCitation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
    alignSelf: "flex-start",
  },
  replyCitationText: {
    fontSize: 11,
    fontWeight: "500",
  },
  replyButton: {
    marginTop: 4,
    alignSelf: "flex-start",
  },
  replyButtonText: {
    fontSize: 12,
    fontWeight: "500",
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
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 4,
  },
  // Reply banner (above input)
  replyBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  replyBannerText: {
    flex: 1,
    fontSize: 13,
  },
  // Mention picker
  mentionPicker: {
    borderTopWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  mentionItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: "rgba(232, 168, 90, 0.12)",
  },
  mentionAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  mentionAvatarText: {
    fontSize: 11,
    fontWeight: "600",
  },
  mentionName: {
    fontSize: 14,
    fontWeight: "500",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    marginBottom: 20,
    paddingBottom: Platform.OS === "ios" ? 28 : 12,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
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
});
