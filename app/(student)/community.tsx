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
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Shadows } from '@/constants/colors';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationStore } from '@/stores/useNotificationStore';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { sendPushNotification } from '@/lib/notifications';

type Reply = {
  author_id?: string;
  author: string;
  author_avatar?: string;
  text: string;
  timestamp: string;
};

type Comment = {
  id: string;
  author_id?: string;
  author: string;
  author_avatar?: string;
  text: string;
  timestamp: string;
  replies: Reply[];
};

type Post = {
  id: string;
  author_id?: string;
  author: string;
  category: 'announcement' | 'note' | 'schedule';
  text: string;
  timestamp: string;
  likes: number;
  comments: Comment[];
  liked: boolean;
  liked_by: string[];
  viewed_by_count: number;
  target_batches?: string[];
  media_url?: string;
  file_url?: string;
  file_name?: string;
  author_avatar?: string | null;
  is_edited?: boolean;
  is_new?: boolean;
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
  studentPhotoUrl: string | null;
  avatarMap: Record<string, string>;
  onLike: (postId: string) => void;
  onAddComment: (postId: string, text: string) => void;
  onAddReply: (postId: string, commentId: string, text: string) => void;
}

function PostCard({ item, studentName, studentPhotoUrl, onLike, onAddComment, onAddReply, avatarMap }: PostCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [showAllComments, setShowAllComments] = useState(false);
  const [expandedReplies, setExpandedReplies] = useState<Record<string, boolean>>({});
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const handleSendComment = () => {
    if (!commentText.trim()) return;
    onAddComment(item.id, commentText.trim());
    setCommentText('');
  };

  const handleSendReply = (commentId: string) => {
    if (!replyText.trim()) return;
    onAddReply(item.id, commentId, replyText.trim());
    setReplyText('');
    setReplyingCommentId(null);
  };

  const handleShare = async () => {
    try {
      const shareUrl = item.media_url || item.file_url;
      await Share.share({
        message: `${item.author} posted in PrestoID:\n\n"${item.text}"${shareUrl ? `\n\nAttachment: ${shareUrl}` : ''}\n\nShared via PrestoID App`,
      });
    } catch (err) {
      console.warn('Share error:', err);
    }
  };

  const cat = getCategoryStyle(item.category);
  const commentsToRender = showAllComments ? item.comments : item.comments.slice(0, 2);

  const authorAvatarUri = item.author_id ? (avatarMap[item.author_id] || item.author_avatar) : item.author_avatar;

  return (
    <View style={styles.postCard}>
      {/* Post Header */}
      <View style={styles.postHeader}>
        {authorAvatarUri ? (
          <Image source={{ uri: authorAvatarUri }} style={styles.postAuthorAvatarImage} />
        ) : (
          <View style={styles.postAuthorAvatar}>
            <Text style={styles.postAuthorInitial}>{item.author.charAt(0)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.postAuthorName}>{item.author}</Text>
            {item.is_new && (
              <View style={{ backgroundColor: Colors.status.danger, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>NEW</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={styles.postTimestamp}>{item.timestamp}</Text>
            {item.is_edited && (
              <Text style={styles.editedLabel}>• Edited</Text>
            )}
          </View>
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

        <View style={styles.engagementButton}>
          <Ionicons name="eye-outline" size={20} color={Colors.text.tertiary} />
          <Text style={styles.engagementCount}>{item.viewed_by_count}</Text>
        </View>

        <TouchableOpacity style={styles.engagementButton} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={18} color={Colors.text.tertiary} />
        </TouchableOpacity>

        {(item.file_url || item.media_url) && (
          <TouchableOpacity
            style={[styles.engagementButton, { marginLeft: 'auto' }]}
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
      {isExpanded && (
        <View style={styles.commentsSection}>
          {commentsToRender.map((comment, idx) => {
            const replies = comment.replies || [];
            const isRepliesExpanded = !!expandedReplies[comment.id];
            const repliesToRender = isRepliesExpanded ? replies : replies.slice(0, 1);
            const isReplying = replyingCommentId === comment.id;

            return (
              <View key={comment.id || idx.toString()} style={styles.commentItemContainer}>
                {/* Comment row */}
                <View style={styles.commentItem}>
                  {(() => {
                    const commentAvatarUri = comment.author_id ? (avatarMap[comment.author_id] || comment.author_avatar) : comment.author_avatar;
                    return commentAvatarUri ? (
                      <Image source={{ uri: commentAvatarUri }} style={styles.commentAvatarImage} />
                    ) : (
                      <View style={styles.commentAvatar}>
                        <Text style={styles.commentAvatarText}>
                          {comment.author.charAt(0)}
                        </Text>
                      </View>
                    );
                  })()}
                  <View style={styles.commentContent}>
                    <Text style={styles.commentAuthor}>{comment.author}</Text>
                    <Text style={styles.commentText}>{comment.text}</Text>
                    <TouchableOpacity 
                      style={styles.replyButton}
                      onPress={() => {
                        setReplyingCommentId(isReplying ? null : comment.id);
                        setReplyText('');
                      }}
                    >
                      <Text style={styles.replyButtonText}>Reply</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Nested Replies */}
                {replies.length > 0 && (
                  <View style={styles.repliesList}>
                    {repliesToRender.map((reply, rIdx) => {
                      const replyAvatarUri = reply.author_id ? (avatarMap[reply.author_id] || reply.author_avatar) : reply.author_avatar;
                      return (
                        <View key={rIdx} style={styles.replyItem}>
                          {replyAvatarUri ? (
                            <Image source={{ uri: replyAvatarUri }} style={styles.replyAvatarImage} />
                          ) : (
                            <View style={styles.replyAvatar}>
                              <Text style={styles.replyAvatarText}>
                                {reply.author.charAt(0)}
                              </Text>
                            </View>
                          )}
                          <View style={styles.replyContent}>
                            <Text style={styles.replyAuthor}>{reply.author}</Text>
                            <Text style={styles.replyText}>{reply.text}</Text>
                            <TouchableOpacity 
                              style={styles.replyButton}
                              onPress={() => {
                                setReplyingCommentId(comment.id);
                                setReplyText(`@${reply.author} `);
                              }}
                            >
                              <Text style={styles.replyButtonText}>Reply</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}

                    {/* View more replies */}
                    {replies.length > 1 && (
                      <TouchableOpacity
                        style={styles.viewMoreRepliesButton}
                        onPress={() => {
                          setExpandedReplies(prev => ({
                            ...prev,
                            [comment.id]: !isRepliesExpanded
                          }));
                        }}
                      >
                        <Text style={styles.viewMoreRepliesText}>
                          {isRepliesExpanded ? 'Hide replies' : `View replies (${replies.length})`}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Reply Input row */}
                {isReplying && (
                  <View style={styles.replyInputRow}>
                    <TextInput
                      style={styles.replyInput}
                      placeholder={`Reply to ${comment.author}...`}
                      placeholderTextColor={Colors.text.tertiary}
                      value={replyText}
                      onChangeText={setReplyText}
                      onSubmitEditing={() => handleSendReply(comment.id)}
                    />
                    <TouchableOpacity style={styles.replySendButton} onPress={() => handleSendReply(comment.id)}>
                      <Ionicons name="send" size={14} color={Colors.accent.primary} />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          {/* View more comments */}
          {item.comments.length > 2 && (
            <TouchableOpacity
              style={styles.viewCommentsButton}
              onPress={() => setShowAllComments(!showAllComments)}
            >
              <Text style={styles.viewCommentsText}>
                {showAllComments ? 'Collapse comments' : `View more comments (${item.comments.length - 2})`}
              </Text>
            </TouchableOpacity>
          )}
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
            onSubmitEditing={handleSendComment}
          />
          <TouchableOpacity style={styles.commentSendButton} onPress={handleSendComment}>
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
  const [studentProfile, setStudentProfile] = useState<{name: string, business_id: string, batch_name: string, id: string, photo_url?: string | null} | null>(null);
  const [avatarMap, setAvatarMap] = useState<Record<string, string>>({});

  const sendLikePushNotification = async (recipientId: string, likerName: string, postText: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', recipientId)
        .maybeSingle();

      if (profile?.push_token) {
        await sendPushNotification(
          [profile.push_token],
          'New Like',
          `${likerName} liked your post: "${postText.substring(0, 40)}${postText.length > 40 ? '...' : ''}"`,
          { screen: 'community' }
        );
      }
    } catch (err) {
      console.warn('Failed to send like push notification:', err);
    }
  };

  const sendCommentPushNotification = async (recipientId: string, commentAuthorName: string, text: string) => {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('push_token')
        .eq('id', recipientId)
        .maybeSingle();

      if (profile?.push_token) {
        await sendPushNotification(
          [profile.push_token],
          'New Comment',
          `${commentAuthorName} commented: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}" on your post`,
          { screen: 'community' }
        );
      }
    } catch (err) {
      console.warn('Failed to send comment push notification:', err);
    }
  };

  const sendReplyPushNotification = async (recipientIds: string[], replyAuthorName: string, text: string) => {
    try {
      const uniqueIds = Array.from(new Set(recipientIds));
      if (uniqueIds.length === 0) return;

      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, push_token')
        .in('id', uniqueIds);

      if (error || !profiles) return;

      const tokens = profiles.map(p => p.push_token).filter(t => t);
      if (tokens.length > 0) {
        await sendPushNotification(
          tokens,
          'New Reply on Post',
          `${replyAuthorName} replied: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`,
          { screen: 'community' }
        );
      }
    } catch (err) {
      console.warn('Failed to send reply push notification:', err);
    }
  };

  useEffect(() => {
    const resolveAvatars = async () => {
      if (posts.length === 0) return;
      try {
        const uniqueIds = new Set<string>();
        posts.forEach((p) => {
          if (p.author_id) uniqueIds.add(p.author_id);
          p.comments.forEach((c) => {
            if (c.author_id) uniqueIds.add(c.author_id);
            c.replies?.forEach((r) => {
              if (r.author_id) uniqueIds.add(r.author_id);
            });
          });
        });

        const idList = Array.from(uniqueIds);
        if (idList.length === 0) return;

        const newMap: Record<string, string> = {};

        // 1. Fetch from profiles
        const { data: profilesData } = await supabase
          .from('profiles')
          .select('id, avatar_url')
          .in('id', idList);

        profilesData?.forEach((p) => {
          if (p.avatar_url) newMap[p.id] = p.avatar_url;
        });

        // 2. Fetch from students
        const { data: studentsData } = await supabase
          .from('students')
          .select('user_id, photo_url')
          .in('user_id', idList);

        studentsData?.forEach((s) => {
          if (s.user_id && s.photo_url) newMap[s.user_id] = s.photo_url;
        });

        setAvatarMap((prev) => ({ ...prev, ...newMap }));
      } catch (err) {
        console.warn('Failed to resolve avatars map:', err);
      }
    };

    resolveAvatars();
  }, [posts]);

  const fetchStudentProfile = useCallback(async () => {
    if (!user) return null;
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, business_id, batch_name, photo_url')
        .eq('user_id', user.id)
        .single();

      console.log('[DEBUG] fetchStudentProfile result:', data);
      if (error) {
        console.log('[DEBUG] fetchStudentProfile error:', error);
      }

      // Debug check the profiles table for this user
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      console.log('[DEBUG] profiles row for student:', profileRow);

      if (!error && data) {
        setStudentProfile(data);
        return data;
      }
    } catch (err) {
      console.warn('Failed to fetch student profile for community:', err);
    }
    return null;
  }, [user]);

  const fetchPosts = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const profile = studentProfile || await fetchStudentProfile();
      console.log('[DEBUG] fetchPosts using profile:', profile);
      if (!profile) {
        setIsLoading(false);
        console.log('[DEBUG] fetchPosts aborted because profile is null');
        return;
      }

      const { data, error } = await supabase
        .from('community_posts')
        .select('*')
        .eq('business_id', profile.business_id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false });

      console.log('[DEBUG] fetchPosts query result count:', data?.length);
      if (error) {
        console.log('[DEBUG] fetchPosts query error:', error);
      }

      if (error) throw error;

      // Load read posts to determine if NEW
      const readPostsJSON = await AsyncStorage.getItem('@presto_student_read_posts');
      const readPosts: string[] = readPostsJSON ? JSON.parse(readPostsJSON) : [];

      const loadedPosts: Post[] = [];
      
      for (const p of (data || [])) {
        // Filter by batch
        const targetBatches = p.target_batches || [];
        console.log('[DEBUG] Post target_batches:', targetBatches, 'Student batch:', profile.batch_name);
        if (targetBatches.length > 0 && !targetBatches.includes(profile.batch_name)) {
          console.log('[DEBUG] Post skipped due to batch mismatch');
          continue; // Skip post intended for another batch
        }

        const isNewPost = !readPosts.includes(String(p.id));

        const createdDate = new Date(p.created_at);
        const timeLabel = createdDate.toLocaleDateString('en-US', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        });

        const likedByArray = Array.isArray(p.liked_by) ? p.liked_by : [];
        const isLiked = user ? likedByArray.includes(user.id) : false;

        // Track post views by updating viewed_by list in background
        const viewedByArray = Array.isArray(p.viewed_by) ? [...p.viewed_by] : [];
        if (user && !viewedByArray.includes(user.id)) {
          viewedByArray.push(user.id);
          supabase
            .from('community_posts')
            .update({ viewed_by: viewedByArray })
            .eq('id', p.id)
            .then(({ error }) => {
              if (error) console.log('Failed to update viewed_by in background:', error);
            });
        }

        loadedPosts.push({
          id: String(p.id),
          author_id: p.author_id,
          author: p.author_name || 'Upendra Sir',
          category: p.category,
          text: p.text,
          timestamp: timeLabel,
          likes: p.likes || 0,
          comments: p.comments || [],
          liked: isLiked,
          liked_by: likedByArray,
          viewed_by_count: viewedByArray.length,
          media_url: p.media_url,
          file_url: p.file_url,
          file_name: p.file_name,
          target_batches: Array.isArray(p.target_batches) ? p.target_batches : [],
          author_avatar: p.author_avatar,
          is_edited: p.is_edited,
          is_new: isNewPost,
        });
      }
      setPosts(loadedPosts);
      if (loadedPosts.length > 0) {
        const postIds = loadedPosts.map(p => p.id);
        AsyncStorage.setItem('@presto_student_read_posts', JSON.stringify(postIds)).then(() => {
          useNotificationStore.getState().setStudentCommunityUnreadCount(0);
        }).catch(err => console.warn('Failed to save read posts:', err));
      }
    } catch (err) {
      console.warn('Failed to fetch community posts:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user, fetchStudentProfile]);

  useEffect(() => {
    // Refresh user metadata in background exactly once on mount to get latest avatar
    const refreshUser = async () => {
      try {
        const { data: { user: freshUser } } = await supabase.auth.getUser();
        if (freshUser) {
          useAuthStore.getState().setUser(freshUser);
        }
      } catch (e) {
        console.warn('Failed to refresh user in community:', e);
      }
    };
    refreshUser();
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchStudentProfile();
      fetchPosts();
    }, [fetchStudentProfile, fetchPosts])
  );

  useEffect(() => {
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
                      viewed_by_count: Array.isArray(updated.viewed_by) ? updated.viewed_by.length : 0,
                      media_url: updated.media_url,
                      file_url: updated.file_url,
                      file_name: updated.file_name,
                      author_avatar: updated.author_avatar,
                      is_edited: updated.is_edited,
                      author_id: updated.author_id,
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
  }, [fetchPosts, user]);

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

      if (nextLiked && post.author_id && post.author_id !== user.id) {
        sendLikePushNotification(post.author_id, studentProfile?.name || 'A student', post.text);
      }
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

    const newComment: Comment = {
      id: Math.random().toString(36).substring(2, 9),
      author_id: user?.id,
      author: studentProfile?.name || 'Student',
      author_avatar: studentProfile?.photo_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined,
      text,
      timestamp: new Date().toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
      replies: [],
    };
    const newCommentList = [...post.comments, newComment];

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

      if (post.author_id && post.author_id !== user?.id) {
        sendCommentPushNotification(post.author_id, studentProfile?.name || 'A student', text);
      }
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

  const handleAddReply = async (postId: string, commentId: string, text: string) => {
    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    const newReply: Reply = {
      author_id: user?.id,
      author: studentProfile?.name || 'Student',
      author_avatar: studentProfile?.photo_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || undefined,
      text,
      timestamp: new Date().toLocaleDateString('en-US', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    const newCommentList = post.comments.map((comment, idx) => {
      const cId = comment.id || idx.toString();
      if (cId === commentId) {
        return {
          ...comment,
          replies: [...(comment.replies || []), newReply],
        };
      }
      return comment;
    });

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

      // Notify relevant users (post author, comment author, and mentioned reply author)
      const recipientIds: string[] = [];
      if (post.author_id && post.author_id !== user?.id) {
        recipientIds.push(post.author_id);
      }
      const comment = post.comments.find((c, idx) => (c.id || idx.toString()) === commentId);
      if (comment) {
        if (comment.author_id && comment.author_id !== user?.id) {
          recipientIds.push(comment.author_id);
        }
        if (text.startsWith('@')) {
          const firstSpace = text.indexOf(' ');
          if (firstSpace !== -1) {
            const mention = text.substring(1, firstSpace).toLowerCase().replace(/[^a-z0-9]/g, '');
            const matchedReply = comment.replies?.find(r => 
              r.author.toLowerCase().replace(/[^a-z0-9]/g, '').includes(mention) || 
              mention.includes(r.author.toLowerCase().replace(/[^a-z0-9]/g, ''))
            );
            if (matchedReply && matchedReply.author_id && matchedReply.author_id !== user?.id) {
              recipientIds.push(matchedReply.author_id);
            }
          }
        }
      }

      if (recipientIds.length > 0) {
        sendReplyPushNotification(recipientIds, studentProfile?.name || 'A student', text);
      }
    } catch (err) {
      // Revert on failure
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId ? { ...p, comments: post.comments } : p
        )
      );
      console.warn('Failed to add reply:', err);
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
              studentPhotoUrl={studentProfile?.photo_url || null}
              avatarMap={avatarMap}
              onLike={toggleLike}
              onAddComment={handleAddComment}
              onAddReply={handleAddReply}
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
  editedLabel: {
    fontSize: 10,
    color: Colors.text.tertiary,
    fontStyle: 'italic',
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
  commentItemContainer: {
    marginBottom: 10,
  },
  replyButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  replyButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent.primary,
  },
  repliesList: {
    marginLeft: 36,
    marginTop: 8,
    gap: 8,
  },
  replyItem: {
    flexDirection: 'row',
    gap: 8,
  },
  replyAvatar: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: Colors.bg.tertiary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  replyAvatarText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.text.secondary,
  },
  replyAvatarImage: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  commentAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 8,
  },
  replyContent: {
    flex: 1,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 8,
    padding: 8,
  },
  replyAuthor: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.text.primary,
    marginBottom: 2,
  },
  replyText: {
    fontSize: 11,
    color: Colors.text.secondary,
    fontWeight: '500',
    lineHeight: 15,
  },
  viewMoreRepliesButton: {
    marginTop: 2,
    alignSelf: 'flex-start',
  },
  viewMoreRepliesText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.text.tertiary,
  },
  replyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 36,
    marginTop: 8,
  },
  replyInput: {
    flex: 1,
    backgroundColor: Colors.bg.tertiary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '500',
    color: Colors.text.primary,
    borderWidth: 1,
    borderColor: Colors.card.border,
  },
  replySendButton: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.accent.primary + '12',
    justifyContent: 'center',
    alignItems: 'center',
  },
  postAuthorAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
});
