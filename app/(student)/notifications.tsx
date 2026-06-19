import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

type NotificationType = 'absent' | 'fee' | 'announcement' | 'general' | 'attendance' | 'schedule';

interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  read: boolean;
}

type Comment = {
  author: string;
  text: string;
};

type Post = {
  id: string;
  author: string;
  category: 'announcement' | 'note' | 'schedule';
  text: string;
  timestamp: string;
  likes: number;
  comments: Comment[];
  liked: boolean;
  liked_by: string[];
  media_url?: string;
  file_url?: string;
  file_name?: string;
};

const typeConfig: Record<NotificationType, { icon: keyof typeof Ionicons.glyphMap; color: string; label: string }> = {
  absent: { icon: 'close-circle-outline', color: Colors.status.danger, label: 'Absent Alert' },
  fee: { icon: 'wallet-outline', color: Colors.status.warning, label: 'Fee Reminder' },
  announcement: { icon: 'megaphone-outline', color: Colors.accent.primary, label: 'Announcement' },
  general: { icon: 'information-circle-outline', color: Colors.stitch.tertiaryNeutral, label: 'General' },
  attendance: { icon: 'checkmark-circle-outline', color: Colors.status.success, label: 'Attendance' },
  schedule: { icon: 'calendar-outline', color: Colors.status.info, label: 'Schedule' },
};

const getCategoryStyle = (category: Post['category']) => {
  switch (category) {
    case 'announcement':
      return { bg: Colors.accent.primary, label: 'Announcement' };
    case 'note':
      return { bg: Colors.status.info, label: 'Note' };
    case 'schedule':
      return { bg: Colors.status.warning, label: 'Schedule' };
  }
};

interface PostCardProps {
  item: Post;
  studentName: string;
  onLike: (postId: string) => void;
  onAddComment: (postId: string, text: string) => void;
}

function PostCard({ item, studentName, onLike, onAddComment }: PostCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');

  const handleSend = () => {
    if (!commentText.trim()) return;
    onAddComment(item.id, commentText.trim());
    setCommentText('');
  };

  const cat = getCategoryStyle(item.category);

  return (
    <View style={styles.postCard}>
      {/* Post Header */}
      <View style={styles.postCardHeader}>
        <View style={styles.postAuthorAvatar}>
          <Text style={styles.postAuthorInitial}>{item.author.charAt(0)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.postAuthorName}>{item.author}</Text>
          <Text style={styles.postTimestamp}>{item.timestamp}</Text>
        </View>
        <View style={[styles.categoryBadge, { backgroundColor: cat.bg }]}>
          <Text style={styles.categoryBadgeText}>{cat.label}</Text>
        </View>
      </View>

      {/* Post Content */}
      <Text style={styles.postText}>{item.text}</Text>

      {item.media_url && (
        <Image source={{ uri: item.media_url }} style={styles.postImage} resizeMode="cover" />
      )}

      {item.file_url && (
        <TouchableOpacity
          style={styles.fileAttachmentCard}
          onPress={() => {
            if (item.file_url) Linking.openURL(item.file_url);
          }}
          activeOpacity={0.7}
        >
          <Ionicons name="document-text-outline" size={22} color={Colors.accent.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.fileNameText} numberOfLines={1}>
              {item.file_name || 'Document Attachment'}
            </Text>
          </View>
          <Ionicons name="open-outline" size={16} color={Colors.text.tertiary} />
        </TouchableOpacity>
      )}

      {/* Engagement row */}
      <View style={styles.engagementRow}>
        <TouchableOpacity style={styles.engagementButton} onPress={() => onLike(item.id)}>
          <Ionicons
            name={item.liked ? 'heart' : 'heart-outline'}
            size={20}
            color={item.liked ? Colors.status.danger : Colors.text.tertiary}
          />
          <Text style={[styles.engagementCount, item.liked && { color: Colors.status.danger }]}>
            {item.likes}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.engagementButton} onPress={() => setIsExpanded(!isExpanded)}>
          <Ionicons name="chatbubble-outline" size={18} color={Colors.text.tertiary} />
          <Text style={styles.engagementCount}>{item.comments.length}</Text>
        </TouchableOpacity>

        {(item.file_url || item.media_url) && (
          <TouchableOpacity
            style={styles.engagementButton}
            onPress={() => {
              const url = item.file_url || item.media_url;
              if (url) Linking.openURL(url);
            }}
          >
            <Ionicons name="download-outline" size={20} color={Colors.accent.primary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Comments Preview Link */}
      {item.comments.length > 0 && !isExpanded && (
        <TouchableOpacity style={styles.viewCommentsButton} onPress={() => setIsExpanded(true)}>
          <Text style={styles.viewCommentsText}>
            View {item.comments.length} comment{item.comments.length > 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      )}

      {/* Expandable Comments List */}
      {isExpanded && (
        <View style={styles.commentsSection}>
          {item.comments.map((comment, idx) => (
            <View key={idx} style={styles.commentItem}>
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>
                  {comment.author.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.commentContent}>
                <Text style={styles.commentAuthor}>{comment.author}</Text>
                <Text style={styles.commentText}>{comment.text}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Comment Input */}
      {isExpanded && (
        <View style={styles.commentInputRow}>
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment..."
            placeholderTextColor={Colors.text.tertiary}
            value={commentText}
            onChangeText={setCommentText}
            onSubmitEditing={handleSend}
          />
          <TouchableOpacity style={styles.commentSendButton} onPress={handleSend}>
            <Ionicons name="send" size={16} color={Colors.accent.primary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function StudentNotificationsScreen() {
  const { user } = useAuthStore();
  const activeStudentId = user?.id;
  const [activeTab, setActiveTab] = useState<'alerts' | 'community'>('alerts');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [studentName, setStudentName] = useState('You');
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async (silent = false) => {
    if (!user) return;
    if (!silent) setIsLoading(true);
    try {
      // 1. Fetch Student Profile
      let student = null;
      try {
        const targetStudentId = activeStudentId || (user ? (await supabase
          .from('students')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle())?.data?.id : null);

        if (targetStudentId) {
          const { data, error } = await supabase
            .from('students')
            .select('*')
            .eq('id', targetStudentId)
            .maybeSingle();

          if (!error && data) {
            student = data;
            setStudentName(data.name);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch student record:', err);
      }

      // 2. Fetch Dynamic System Alerts
      const alerts: Notification[] = [];
      if (student) {
        // Fetch recent attendance logs
        const { data: att, error: attError } = await supabase
          .from('attendance')
          .select('*')
          .eq('student_id', student.id)
          .order('date', { ascending: false })
          .limit(8);

        if (!attError && att) {
          att.forEach((a: any, idx: number) => {
            const isAbsent = a.status === 'absent';
            alerts.push({
              id: `att-${a.id}`,
              type: isAbsent ? 'absent' : 'attendance',
              title: isAbsent ? 'Absent Alert' : 'Attendance Marked',
              message: isAbsent
                ? `You were marked absent today. Please connect with your faculty if this is an error.`
                : `Your attendance was marked present on ${a.date}. Keep it up!`,
              time: a.date,
              read: idx > 0,
            });
          });
        }

        // Fetch recent payments
        const { data: paymentsList, error: payError } = await supabase
          .from('payments')
          .select('*')
          .eq('student_id', student.id)
          .order('paid_date', { ascending: false })
          .limit(5);

        if (!payError && paymentsList) {
          paymentsList.forEach((p: any) => {
            alerts.push({
              id: `pay-${p.id}`,
              type: 'fee',
              title: 'Payment Received',
              message: `Your payment of ₹${Number(p.amount).toLocaleString()} for ${p.month} has been verified. Receipt No: ${p.receipt_no}`,
              time: p.paid_date ? new Date(p.paid_date).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }) : 'Recent',
              read: true,
            });
          });
        }
      }

      // 3. Fetch Recent Community Posts for Alerts (Visible only to students of this institute)
      if (student?.institute_id) {
        const { data: commAlerts, error: commAlertsError } = await supabase
          .from('community_posts')
          .select('*')
          .eq('institute_id', student.institute_id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (!commAlertsError && commAlerts) {
          commAlerts.forEach((p: any, idx: number) => {
            const isSchedule = p.category === 'schedule';
            alerts.push({
              id: `comm-${p.id}`,
              type: isSchedule ? 'schedule' : 'announcement',
              title: isSchedule ? 'New Schedule Update' : `Announcement from ${p.author_name}`,
              message: p.text,
              time: new Date(p.created_at).toLocaleDateString('en-US', { day: '2-digit', month: 'short' }),
              read: idx > 0, // Mark only the latest post as unread
            });
          });
        }
      }

      // Fallback welcome message if absolutely empty
      if (alerts.length === 0) {
        alerts.push({
          id: 'sys-welcome',
          type: 'general',
          title: 'Welcome to PrestoID',
          message: 'Your account is now linked. Show your digital ID card at the center to mark attendance!',
          time: 'Just now',
          read: false,
        });
      }
      setNotifications(alerts);

      // 4. Fetch Community Posts for Community tab segment (Visible only to students of this institute)
      if (student?.institute_id) {
        const { data: communityData, error: communityError } = await supabase
          .from('community_posts')
          .select('*')
          .eq('institute_id', student.institute_id)
          .order('created_at', { ascending: false });

        if (!communityError && communityData) {
          // Filter by batch
          const filteredCommData = communityData.filter((p: any) => {
            const targetBatches = p.target_batches || [];
            return targetBatches.length === 0 || targetBatches.includes(student.batch_name);
          });

          setPosts(
            filteredCommData.map((p: any) => {
              const createdDate = new Date(p.created_at);
              const timeLabel = createdDate.toLocaleDateString('en-US', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              });

              const likedByArray = Array.isArray(p.liked_by) ? p.liked_by : [];
              const isLiked = user ? likedByArray.includes(user.id) : false;

              return {
                id: String(p.id),
                author: p.author_name || 'Upendra Sir',
                category: p.category,
                text: p.text,
                timestamp: timeLabel,
                likes: p.likes || 0,
                comments: p.comments || [],
                liked: isLiked,
                liked_by: likedByArray,
                media_url: p.media_url,
                file_url: p.file_url,
                file_name: p.file_name,
              };
            })
          );
        } else {
          setPosts([]);
        }
      } else {
        setPosts([]);
      }
    } catch (err) {
      console.warn('Failed to load student notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Set up postgres realtime subscription for auto-syncing alerts and community feed segment
    const channel = supabase
      .channel('student-alerts-screen-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_posts',
        },
        (payload) => {
          console.log('Realtime community changes received in Alerts screen:', payload);
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new;
            setPosts((prev) =>
              prev.map((p) =>
                p.id === String(updated.id)
                  ? {
                      ...p,
                      likes: updated.likes ?? 0,
                      comments: updated.comments ?? [],
                      liked_by: updated.liked_by ?? [],
                      liked: user ? (updated.liked_by ?? []).includes(user.id) : false,
                      media_url: updated.media_url,
                      file_url: updated.file_url,
                      file_name: updated.file_name,
                    }
                  : p
              )
            );
          } else {
            loadData(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const toggleLike = async (postId: string) => {
    if (!user) return;
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const likedByArray = [...(post.liked_by || [])];
    const userIndex = likedByArray.indexOf(user.id);
    const nextLiked = userIndex === -1;

    if (nextLiked) {
      likedByArray.push(user.id);
    } else {
      likedByArray.splice(userIndex, 1);
    }

    const nextLikes = likedByArray.length;

    // Update local state instantly
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, liked: nextLiked, likes: nextLikes, liked_by: likedByArray } : p
      )
    );

    try {
      await supabase
        .from('community_posts')
        .update({
          likes: nextLikes,
          liked_by: likedByArray,
        })
        .eq('id', Number(postId));
    } catch (err) {
      // Revert if error
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, liked: post.liked, likes: post.likes, liked_by: post.liked_by } : p
        )
      );
      console.warn('Failed to toggle like on server:', err);
    }
  };

  const handleAddComment = async (postId: string, text: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const newCommentList = [...post.comments, { author: studentName, text }];

    // Update local state
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, comments: newCommentList } : p
      )
    );

    try {
      await supabase
        .from('community_posts')
        .update({ comments: newCommentList })
        .eq('id', Number(postId));
    } catch (err) {
      // Revert on error
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments: post.comments } : p
        )
      );
      console.warn('Failed to add comment on server:', err);
    }
  };

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filteredNotifications =
    filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Notifications</Text>
            <Text style={styles.subtitle}>Stay updated with alerts and community posts</Text>
          </View>

          {/* Segmented Control */}
          <View style={styles.segmentContainer}>
            <TouchableOpacity
              style={[styles.segmentBtn, activeTab === 'alerts' && styles.segmentBtnActive]}
              onPress={() => setActiveTab('alerts')}
            >
              <Text style={[styles.segmentText, activeTab === 'alerts' && styles.segmentTextActive]}>
                Alerts {unreadCount > 0 && `(${unreadCount})`}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentBtn, activeTab === 'community' && styles.segmentBtnActive]}
              onPress={() => setActiveTab('community')}
            >
              <Text style={[styles.segmentText, activeTab === 'community' && styles.segmentTextActive]}>
                Community Feed
              </Text>
            </TouchableOpacity>
          </View>

          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.accent.primary} />
            </View>
          ) : activeTab === 'alerts' ? (
            <View>
              {/* Filter Row */}
              <View style={styles.filterRow}>
                <TouchableOpacity
                  style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
                  onPress={() => setFilter('all')}
                >
                  <Text style={[styles.filterTabText, filter === 'all' && styles.filterTabTextActive]}>
                    All ({notifications.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.filterTab, filter === 'unread' && styles.filterTabActive]}
                  onPress={() => setFilter('unread')}
                >
                  <Text style={[styles.filterTabText, filter === 'unread' && styles.filterTabTextActive]}>
                    Unread ({unreadCount})
                  </Text>
                </TouchableOpacity>

                {unreadCount > 0 && (
                  <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
                    <Text style={styles.markAllText}>Mark all read</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Alerts List */}
              <View style={styles.notificationList}>
                {filteredNotifications.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Ionicons name="checkmark-done-circle-outline" size={48} color={Colors.status.success} style={{ marginBottom: 16 }} />
                    <Text style={styles.emptyTitle}>All caught up!</Text>
                    <Text style={styles.emptySubtitle}>No unread notifications. Check back later.</Text>
                  </View>
                ) : (
                  filteredNotifications.map((notification) => {
                    const config = typeConfig[notification.type];
                    return (
                      <TouchableOpacity
                        key={notification.id}
                        style={[styles.notificationItem, !notification.read && styles.notificationUnread]}
                        onPress={() => markAsRead(notification.id)}
                        activeOpacity={0.8}
                      >
                        {!notification.read && <View style={styles.unreadDot} />}
                        <View style={styles.notifContent}>
                          <View style={styles.notifHeader}>
                            <View style={styles.notifLeft}>
                              <View style={[styles.notifIconBox, { backgroundColor: config.color + '10' }]}>
                                <Ionicons name={config.icon} size={18} color={config.color} />
                              </View>
                              <View style={styles.notifTitleRow}>
                                <Text style={[styles.notifTitle, !notification.read && styles.notifTitleUnread]} numberOfLines={1}>
                                  {notification.title}
                                </Text>
                                <View style={[styles.typeBadge, { backgroundColor: config.color + '10' }]}>
                                  <Text style={[styles.typeBadgeText, { color: config.color }]}>
                                    {config.label}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          </View>
                          <Text style={styles.notifMessage}>{notification.message}</Text>
                          <Text style={styles.notifTime}>{notification.time}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </View>
          ) : (
            /* Community Feed Tab Segment */
            <View style={styles.notificationList}>
              {posts.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="megaphone-outline" size={48} color={Colors.text.tertiary} style={{ marginBottom: 16 }} />
                  <Text style={styles.emptyTitle}>Bulletin Board Empty</Text>
                  <Text style={styles.emptySubtitle}>No updates have been posted by the administration yet.</Text>
                </View>
              ) : (
                posts.map((item) => (
                  <PostCard
                    key={item.id}
                    item={item}
                    studentName={studentName}
                    onLike={toggleLike}
                    onAddComment={handleAddComment}
                  />
                ))
              )}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  scrollContent: {
    paddingTop: 40,
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 20,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text.primary,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.text.secondary,
    marginTop: 4,
    fontWeight: '500',
  },
  loadingContainer: {
    paddingVertical: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  segmentContainer: {
    flexDirection: 'row',
    marginHorizontal: 24,
    backgroundColor: Colors.bg.secondary,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.card.border,
    marginBottom: 20,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  segmentBtnActive: {
    backgroundColor: Colors.accent.primary,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  segmentTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  filterTab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: Colors.bg.secondary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  filterTabActive: {
    backgroundColor: Colors.accent.primary + '10',
    borderColor: Colors.accent.primary + '30',
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.secondary,
  },
  filterTabTextActive: {
    color: Colors.accent.primary,
  },
  markAllBtn: {
    marginLeft: 'auto',
    backgroundColor: Colors.accent.primary + '10',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  markAllText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  notificationList: {
    paddingHorizontal: 24,
  },
  notificationItem: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.card.border,
    position: 'relative',
    overflow: 'hidden',
  },
  notificationUnread: {
    backgroundColor: 'rgba(175, 40, 0, 0.03)',
    borderColor: 'rgba(175, 40, 0, 0.12)',
  },
  unreadDot: {
    position: 'absolute',
    top: 18,
    left: 8,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.accent.primary,
  },
  notifContent: {
    paddingLeft: 4,
  },
  notifHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  notifLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  notifIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  notifTitleRow: {
    flex: 1,
    gap: 4,
  },
  notifTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text.primary,
  },
  notifTitleUnread: {
    fontWeight: '800',
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  notifMessage: {
    fontSize: 12,
    color: Colors.text.secondary,
    lineHeight: 18,
    marginBottom: 8,
    fontWeight: '500',
  },
  notifTime: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: Colors.text.secondary,
    textAlign: 'center',
    fontWeight: '500',
    paddingHorizontal: 20,
  },

  // Community Feed Card styles
  postCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 16,
    marginBottom: 12,
    ...Shadows.sm,
  },
  postCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  postAuthorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: Colors.stitch.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postAuthorInitial: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.accent.primary,
  },
  postAuthorName: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text.primary,
  },
  postTimestamp: {
    fontSize: 11,
    color: Colors.text.tertiary,
    fontWeight: '500',
    marginTop: 1,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  postText: {
    fontSize: 14,
    color: Colors.text.primary,
    lineHeight: 21,
    fontWeight: '500',
    marginBottom: 12,
  },
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border + '40',
  },
  engagementButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 4,
  },
  engagementCount: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
  viewCommentsButton: {
    marginTop: 10,
  },
  viewCommentsText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
  commentsSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border + '40',
    gap: 10,
  },
  commentItem: {
    flexDirection: 'row',
    gap: 8,
  },
  commentAvatar: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  commentContent: {
    flex: 1,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 10,
    padding: 8,
  },
  commentAuthor: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  commentText: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '500',
    lineHeight: 16,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border + '40',
  },
  commentInput: {
    flex: 1,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '500',
    color: Colors.text.primary,
  },
  commentSendButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.accent.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 12,
  },
  fileAttachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.card.border,
    marginBottom: 12,
    gap: 10,
  },
  fileNameText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text.primary,
  },
});
