import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';

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
      <View style={styles.postHeader}>
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

      {/* Engagement Row */}
      <View style={styles.engagementRow}>
        <TouchableOpacity
          style={styles.engagementButton}
          onPress={() => onLike(item.id)}
        >
          <Ionicons
            name={item.liked ? 'heart' : 'heart-outline'}
            size={20}
            color={item.liked ? Colors.status.danger : Colors.text.tertiary}
          />
          <Text
            style={[
              styles.engagementCount,
              item.liked && { color: Colors.status.danger },
            ]}
          >
            {item.likes}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.engagementButton}
          onPress={() => setIsExpanded(!isExpanded)}
        >
          <Ionicons
            name="chatbubble-outline"
            size={18}
            color={Colors.text.tertiary}
          />
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

      {/* Comments Section */}
      {item.comments.length > 0 && !isExpanded && (
        <TouchableOpacity
          style={styles.viewCommentsButton}
          onPress={() => setIsExpanded(true)}
        >
          <Text style={styles.viewCommentsText}>
            View {item.comments.length} comment{item.comments.length > 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      )}

      {isExpanded && (
        <View style={styles.commentsSection}>
          {item.comments.map((comment, idx) => (
            <View key={idx} style={styles.commentItem}>
              <View style={styles.commentAvatar}>
                <Text style={styles.commentAvatarText}>
                  {comment.author.charAt(0)}
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
            <Ionicons name="send" size={18} color={Colors.accent.primary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

export default function StudentCommunityScreen() {
  const { user } = useAuthStore();
  const activeStudentId = user?.id;
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [studentProfile, setStudentProfile] = useState<{name: string, business_id: string, batch_name: string, id: string} | null>(null);

  const fetchStudentProfile = useCallback(async () => {
    if (!user || !activeStudentId) return null;
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, business_id, batch_name')
        .eq('id', activeStudentId)
        .single();

      if (!error && data) {
        setStudentProfile(data);
        return data;
      }
    } catch (err) {
      console.warn('Failed to fetch student profile for community:', err);
    }
    return null;
  }, [user, activeStudentId]);

  const markPostAsViewed = async (postId: string, studentId: string) => {
    try {
      const { data: post } = await supabase
        .from('community_posts')
        .select('viewed_by')
        .eq('id', Number(postId))
        .single();
        
      if (post) {
        const viewedBy = Array.isArray(post.viewed_by) ? post.viewed_by : [];
        if (!viewedBy.includes(studentId)) {
          viewedBy.push(studentId);
          await supabase
            .from('community_posts')
            .update({ viewed_by: viewedBy })
            .eq('id', Number(postId));
        }
      }
    } catch (e) {
      // Ignore background error
    }
  };

  const fetchPosts = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const profile = studentProfile || await fetchStudentProfile();
      if (!profile) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('business_id', profile.business_id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const loadedPosts: Post[] = [];
      
      for (const p of (data || [])) {
        // Filter by batch
        const targetBatches = p.target_batches || [];
        if (targetBatches.length > 0 && !targetBatches.includes(profile.batch_name)) {
          continue; // Skip post intended for another batch
        }
        
        // Mark as viewed
        if (!p.viewed_by?.includes(profile.id)) {
          markPostAsViewed(p.id, profile.id);
        }

        const createdDate = new Date(p.created_at);
        const timeLabel = createdDate.toLocaleDateString('en-US', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });

        const likedByArray = Array.isArray(p.liked_by) ? p.liked_by : [];
        const isLiked = user ? likedByArray.includes(user.id) : false;

        loadedPosts.push({
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
        });
      }
      setPosts(loadedPosts);
    } catch (err) {
      console.warn('Failed to fetch community posts:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, activeStudentId, studentProfile, fetchStudentProfile]);

  useEffect(() => {
    fetchStudentProfile();
    fetchPosts();

    // Set up postgres realtime subscription for auto-syncing updates
    const channel = supabase
      .channel('student-community-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'community_posts',
        },
        (payload) => {
          console.log('Realtime community change detected:', payload);
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
            fetchPosts(true);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPosts]);

  const onRefresh = async () => {
    setIsRefreshing(true);
    await fetchPosts(true);
    setIsRefreshing(false);
  };

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

    // Optimistic Update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, liked: nextLiked, likes: nextLikes, liked_by: likedByArray } : p
      )
    );

    try {
      const { error } = await supabase
        .from('community_posts')
        .update({
          likes: nextLikes,
          liked_by: likedByArray,
        })
        .eq('id', Number(postId));

      if (error) throw error;
    } catch (err) {
      // Revert on failure
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, liked: post.liked, likes: post.likes, liked_by: post.liked_by } : p
        )
      );
      console.warn('Failed to update like status:', err);
    }
  };

  const handleAddComment = async (postId: string, text: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const newCommentList = [...post.comments, { author: studentProfile?.name || 'Student', text }];

    // Optimistic Update
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, comments: newCommentList } : p
      )
    );

    try {
      const { error } = await supabase
        .from('community_posts')
        .update({ comments: newCommentList })
        .eq('id', Number(postId));

      if (error) throw error;
    } catch (err) {
      // Revert on failure
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments: post.comments } : p
        )
      );
      console.warn('Failed to add comment:', err);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>Community</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          data={posts}
          renderItem={({ item }) => (
            <PostCard
              item={item}
              studentName={studentProfile?.name || 'Student'}
              onLike={toggleLike}
              onAddComment={handleAddComment}
            />
          )}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={renderHeader()}
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.emptyContainer}>
                <ActivityIndicator size="large" color={Colors.accent.primary} />
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="megaphone-outline"
                  size={40}
                  color={Colors.text.tertiary}
                />
                <Text style={styles.emptyText}>
                  No announcements from your organization yet.
                </Text>
              </View>
            )
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.primary,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },

  // Header
  header: {
    paddingTop: 12,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.text.primary,
  },

  // Post Card
  postCard: {
    backgroundColor: Colors.bg.secondary,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.card.border,
    padding: 16,
    marginBottom: 14,
    ...Shadows.sm,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  postAuthorAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: Colors.stitch.primaryFixed,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postAuthorInitial: {
    fontSize: 16,
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

  // Engagement Row
  engagementRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.card.border + '60',
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

  // Comments
  viewCommentsButton: {
    marginTop: 8,
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
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  commentContent: {
    flex: 1,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 10,
    padding: 10,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  commentText: {
    fontSize: 12,
    color: Colors.text.secondary,
    fontWeight: '500',
    lineHeight: 17,
  },
  viewAllCommentsText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.accent.primary,
    marginTop: 4,
  },

  // Comment Input
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
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
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.accent.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.text.secondary,
    fontWeight: '500',
    textAlign: 'center',
  },
  postImage: {
    width: '100%',
    height: 200,
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
